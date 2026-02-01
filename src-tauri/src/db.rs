use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;
use tokio::sync::OnceCell;

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
        .get_or_try_init(async {
            let db_path = find_db_path().ok_or("Database not found. Run 'npm run scrape:requirements --popular' first.")?;
            let db_url = format!("sqlite:{}", db_path);
            SqlitePool::connect(&db_url)
                .await
                .map_err(|e| format!("Failed to connect to database: {}", e))
        })
        .await?;

    Ok(pool_ref.clone())
}
    let pool_ref = DB_POOL
        .get_or_try_init(async {
            let db_path = find_db_path().ok_or("Database not found. Run 'npm run scrape:requirements --popular' first.")?;
            let db_url = format!("sqlite:{}", db_path);
            SqlitePool::connect(&db_url)
                .await
                .map_err(|e| format!("Failed to connect to database: {}", e))
        })
        .await?;

    Ok(pool_ref.clone())
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
