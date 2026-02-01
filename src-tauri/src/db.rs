use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;
use std::sync::OnceLock;
use tokio::sync::Mutex;

// Shared database pool - initialized once, reused for all queries
static DB_POOL: OnceLock<Mutex<Option<SqlitePool>>> = OnceLock::new();

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
    let mutex = DB_POOL.get_or_init(|| Mutex::new(None));
    let mut guard = mutex.lock().await;

    if let Some(pool) = guard.as_ref() {
        return Ok(pool.clone());
    }

    let db_path = find_db_path().ok_or("Database not found. Run 'npm run scrape:requirements --popular' first.")?;
    let db_url = format!("sqlite:{}", db_path);

    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    *guard = Some(pool.clone());
    Ok(pool)
}

/// Test helper: set the global DB pool to a provided `SqlitePool`.
/// This is used by unit tests to ensure the shared pool points at the
/// temporary database created during tests.
#[cfg(test)]
pub async fn set_db_pool_for_tests(pool: SqlitePool) {
    let mutex = DB_POOL.get_or_init(|| Mutex::new(None));
    let mut guard = mutex.lock().await;
    *guard = Some(pool);
}

#[cfg(test)]
pub async fn reset_db_pool() {
    let mutex = DB_POOL.get_or_init(|| Mutex::new(None));
    let mut guard = mutex.lock().await;
    *guard = None;
}
