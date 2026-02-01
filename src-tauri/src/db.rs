use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;
use std::borrow::Cow;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
// Test helpers below use an unsafe primitive to reset the global OnceCell
// during tests where a fresh SqlitePool is needed per-test.

// Shared database pool - initialized once, reused for all queries.
// Use a mutex-wrapped Option so tests can set/reset the pool safely.
static DB_POOL: Lazy<Mutex<Option<SqlitePool>>> = Lazy::new(|| Mutex::new(None));

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
    // Lock the mutex and check if a pool has already been initialized.
    let mut guard: tokio::sync::MutexGuard<'_, Option<SqlitePool>> = DB_POOL.lock().await;
    if let Some(pool) = guard.as_ref() {
        return Ok(pool.clone());
    }

    // Not initialized yet — create a new pool and apply schema.
    let db_path = find_db_path().ok_or_else(|| "Database not found. Run 'npm run scrape:requirements --popular' first.".to_string())?;
    let db_url = format!("sqlite:{}", db_path);
    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    ensure_schema(&pool).await.map_err(|e| format!("Failed to initialize DB schema: {}", e))?;

    *guard = Some(pool.clone());
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

    // Split on semicolons and run statements individually. This avoids problems
    // running multiple statements in a single `query` call.
    for stmt in sql.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        // Some statements may contain only PRAGMA or comments - skip empty after trim.
        let statement = stmt.to_string();
        if statement.is_empty() {
            continue;
        }

        // Execute each statement. If a statement fails, return an error so callers
        // can surface a helpful message.
        if let Err(e) = sqlx::query(&statement).execute(pool).await {
            return Err(format!("Failed to apply DB schema statement: {}: {}", statement, e));
        }
    }

    Ok(())
}

/// Test helper: set the global DB pool to a provided `SqlitePool`.
/// This is used by unit tests to ensure the shared pool points at the
/// temporary database created during tests.
#[cfg(test)]
pub async fn set_db_pool_for_tests(pool: SqlitePool) {
    let mut guard = DB_POOL.lock().await;
    *guard = Some(pool);
}

#[cfg(test)]
pub async fn reset_db_pool() {
    let mut guard = DB_POOL.lock().await;
    *guard = None;
}
