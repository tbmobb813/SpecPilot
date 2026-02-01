use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;
use std::borrow::Cow;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use std::collections::HashMap;
// Shared database pools keyed by thread id. Tests may run in parallel and
// set their own per-thread pool via `set_db_pool_for_tests`. Using a map
// prevents races between concurrently running tests that would otherwise
// overwrite a single global pool.
static DB_POOLS: Lazy<Mutex<HashMap<u64, SqlitePool>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn current_thread_key() -> u64 {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    let tid = std::thread::current().id();
    let mut hasher = DefaultHasher::new();
    tid.hash(&mut hasher);
    hasher.finish()
}

fn find_db_path() -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // Check directory of the running executable (handles packaged app layouts)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("intelligence.db"));
            candidates.push(parent.join("resources").join("intelligence.db"));
            candidates.push(parent.join("..").join("share").join("specpilot").join("intelligence.db"));
        }

    }

    // Fallbacks for development layouts
    candidates.push(PathBuf::from("intelligence.db"));
    candidates.push(PathBuf::from("../intelligence.db"));
    candidates.push(PathBuf::from("src-tauri/intelligence.db"));
    candidates.push(PathBuf::from("data/intelligence.db"));

    for p in candidates {
        if p.exists() {
            if let Some(s) = p.to_str() {
                return Some(s.to_string());
            }
        }
    }

    None
}

pub async fn get_db_pool() -> Result<SqlitePool, String> {
    // Try to return a thread-local pool first (set during tests). Fall back
    // to the global pool stored under key 0 if present, otherwise create one.
    let mut guard = DB_POOLS.lock().await;
    let tid = current_thread_key();
    if let Some(pool) = guard.get(&tid) {
        return Ok(pool.clone());
    }
    // Check global pool under key 0
    if let Some(pool) = guard.get(&0u64) {
        return Ok(pool.clone());
    }

    // Not initialized yet — create a new pool and apply schema.
    let db_path = find_db_path().ok_or_else(|| "Database not found. Run 'npm run scrape:requirements --popular' first.".to_string())?;
    let db_url = format!("sqlite:{}", db_path);
    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    ensure_schema(&pool).await.map_err(|e| format!("Failed to initialize DB schema: {}", e))?;

    // Store as the global pool under key 0
    guard.insert(0u64, pool.clone());
    Ok(pool)
}

/// Ensure the bundled SQL schema is applied to the database.
/// This runs each statement from `database/schema.sql` in order and ignores
/// empty statements. It's safe to run multiple times because the schema
/// file uses `CREATE TABLE IF NOT EXISTS` and idempotent statements.
async fn ensure_schema(pool: &SqlitePool) -> Result<(), String> {
    // Include the schema at compile time so it is available in packaged apps.
    // Path is relative to this file: `src/database/schema.sql`.
    let sql: Cow<'static, str> = Cow::from(include_str!("database/schema.sql"));

    // Parse bundled schema version (INSERT in the schema.sql uses the meta table)
    let bundled_version = parse_bundled_schema_version(&sql).unwrap_or(1);

    // Check current DB schema version. If meta table or entry doesn't exist,
    // treat current version as 0 to force applying the schema.
    let current_version: i32 = match sqlx::query_scalar::<_, String>("SELECT value FROM meta WHERE key = 'schema_version'")
        .fetch_optional(pool)
        .await
    {
        Ok(Some(v)) => v.parse().unwrap_or(0),
        Ok(None) => 0,
        Err(_) => 0,
    };

    if current_version >= bundled_version {
        // Nothing to do
        return Ok(());
    }

    // Apply statements (idempotent schema). Wrap in a transaction for safety.
    if let Err(e) = sqlx::query("BEGIN").execute(pool).await {
        return Err(format!("Failed to begin transaction for schema migration: {}", e));
    }

    for stmt in sql.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let statement = stmt.to_string();
        if statement.is_empty() {
            continue;
        }

        if let Err(e) = sqlx::query(&statement).execute(pool).await {
            // Attempt to rollback
            let _ = sqlx::query("ROLLBACK").execute(pool).await;
            return Err(format!("Failed to apply DB schema statement: {}: {}", statement, e));
        }
    }

    // Update schema_version in meta table to bundled_version.
    if let Err(e) = sqlx::query("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)")
        .bind(bundled_version.to_string())
        .execute(pool)
        .await
    {
        let _ = sqlx::query("ROLLBACK").execute(pool).await;
        return Err(format!("Failed to update schema_version: {}", e));
    }

    if let Err(e) = sqlx::query("COMMIT").execute(pool).await {
        return Err(format!("Failed to commit schema migration: {}", e));
    }

    Ok(())
}

fn parse_bundled_schema_version(sql: &str) -> Option<i32> {
    // Look for the line that inserts schema_version, e.g.
    // INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version','2');
    let pattern = "VALUES ('schema_version','";
    if let Some(pos) = sql.find(pattern) {
        let start = pos + pattern.len();
        if let Some(end) = sql[start..].find("')") {
            let ver_str = &sql[start..start + end];
            return ver_str.parse().ok();
        }
        if let Some(end) = sql[start..].find("');") {
            let ver_str = &sql[start..start + end];
            return ver_str.parse().ok();
        }
    }
    None
}

/// Test helper: set the global DB pool to a provided `SqlitePool`.
/// This is used by unit tests to ensure the shared pool points at the
/// temporary database created during tests.
#[cfg(test)]
pub async fn set_db_pool_for_tests(pool: SqlitePool) {
    let mut guard = DB_POOLS.lock().await;
    let tid = current_thread_key();
    guard.insert(tid, pool);
}

#[cfg(test)]
pub async fn reset_db_pool() {
    let mut guard = DB_POOLS.lock().await;
    let tid = current_thread_key();
    guard.remove(&tid);
}
