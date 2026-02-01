use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;
use tokio::sync::OnceCell;
use std::borrow::Cow;
use std::error::Error;

// Shared database pool - initialized once, reused for all queries
static DB_POOL: OnceCell<SqlitePool> = OnceCell::const_new();

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
    let pool_ref = DB_POOL
        .get_or_try_init(|| async {
            let db_path = find_db_path().ok_or_else(|| "Database not found. Run 'npm run scrape:requirements --popular' first.".to_string())?;
            let db_url = format!("sqlite:{}", db_path);
            SqlitePool::connect(&db_url)
                .await
                .map_err(|e| format!("Failed to connect to database: {}", e))
        })
        .await?;

    // Ensure schema/migrations are applied after we have a pool. This keeps the
    // initialization simple (the closure above only creates the connection) and
    // avoids complex type inference inside the OnceCell initializer.
    let pool = pool_ref.clone();
    ensure_schema(&pool).await.map_err(|e| format!("Failed to initialize DB schema: {}", e))?;

    Ok(pool_ref.clone())
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
    DB_POOL.take();
    assert!(DB_POOL.set(pool).is_ok(), "database pool was already set");
}

#[cfg(test)]
pub async fn reset_db_pool() {
    DB_POOL.take();
}
