use serde::{Deserialize, Serialize};
// removed unused import to silence warnings
use crate::hardware::HardwareProfile;
use crate::db::get_db_pool;

// Use shared DB pool from `db` module (see src/db.rs)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameResult {
    pub steam_id: i64,
    pub name: String,
    pub genre: Option<String>,
    pub release_year: Option<i32>,
    pub header_image: Option<String>,
    pub protondb_rating: Option<String>,
    pub deck_status: Option<String>,
    pub verdict: Option<String>,  // Pre-computed if hardware provided
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerdictResult {
    pub status: String,           // "exceeds_recommended", "meets_recommended", "meets_minimum", "below_minimum", "unknown"
    pub confidence: String,       // "high", "medium", "low"
    pub summary: String,
    pub details: Vec<String>,
    pub min_requirements: Option<RequirementsSummary>,
    pub rec_requirements: Option<RequirementsSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementsSummary {
    pub cpu_text: Option<String>,
    pub ram_gb: Option<f32>,
    pub gpu_text: Option<String>,
    pub gpu_vram_gb: Option<f32>,
    pub storage_gb: Option<i32>,
}

#[derive(Debug, sqlx::FromRow)]
struct GameRow {
    steam_id: i64,
    name: String,
    genre: Option<String>,
    release_year: Option<i32>,
    header_image: Option<String>,
    protondb_rating: Option<String>,
    deck_status: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, sqlx::FromRow)]
struct GameRequirementsRow {
    name: String,
    min_cpu_cores: Option<i32>,
    min_cpu_clock_ghz: Option<f64>,
    min_cpu_text: Option<String>,
    min_ram_mb: Option<i32>,
    min_gpu_vram_mb: Option<i32>,
    min_gpu_text: Option<String>,
    min_storage_gb: Option<i32>,
    rec_cpu_cores: Option<i32>,
    rec_cpu_clock_ghz: Option<f64>,
    rec_cpu_text: Option<String>,
    rec_ram_mb: Option<i32>,
    rec_gpu_vram_mb: Option<i32>,
    rec_gpu_text: Option<String>,
    rec_storage_gb: Option<i32>,
    requirements_parsed: Option<i32>,
}

#[tauri::command]
pub async fn search_games(query: String) -> Result<Vec<GameResult>, String> {
    let pool = get_db_pool().await?;

    let search_pattern = format!("%{}%", query.to_lowercase());

    let rows: Vec<GameRow> = sqlx::query_as(
        "SELECT g.steam_id, g.name, g.genre, g.release_year, g.header_image,
                p.protondb_rating, d.deck_status
         FROM games g
         LEFT JOIN proton_compatibility p ON p.game_id = g.id
         LEFT JOIN steamdeck_compatibility d ON d.steam_id = g.steam_id
         WHERE LOWER(g.name) LIKE $1
         ORDER BY
           CASE WHEN g.requirements_parsed = 1 THEN 0 ELSE 1 END,
           g.name
         LIMIT 50"
    )
    .bind(&search_pattern)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Search failed: {}", e))?;

    let results = rows.into_iter().map(|row| GameResult {
        steam_id: row.steam_id,
        name: row.name,
        genre: row.genre,
        release_year: row.release_year,
        header_image: row.header_image,
        protondb_rating: row.protondb_rating,
        deck_status: row.deck_status,
        verdict: None,
    }).collect();

    Ok(results)
}

#[tauri::command]
pub async fn browse_games(
    _filter_verdict: Option<String>,
    filter_genre: Option<String>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<GameResult>, String> {
    let pool = get_db_pool().await?;

    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);

    // Build and execute parameterized query based on filters
    let rows: Vec<GameRow> = if let Some(ref genre) = filter_genre {
        // With genre filter
        sqlx::query_as(
            "SELECT g.steam_id, g.name, g.genre, g.release_year, g.header_image,
                    p.protondb_rating, d.deck_status
             FROM games g
             LEFT JOIN proton_compatibility p ON p.game_id = g.id
             LEFT JOIN steamdeck_compatibility d ON d.steam_id = g.steam_id
             WHERE g.requirements_parsed = 1
               AND g.genre LIKE ?
             ORDER BY g.name
             LIMIT ?
             OFFSET ?",
        )
        .bind(format!("%{}%", genre))
        .bind(limit_val)
        .bind(offset_val)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Query failed: {}", e))?
    } else {
        // Without genre filter
        sqlx::query_as(
            "SELECT g.steam_id, g.name, g.genre, g.release_year, g.header_image,
                    p.protondb_rating, d.deck_status
             FROM games g
             LEFT JOIN proton_compatibility p ON p.game_id = g.id
             LEFT JOIN steamdeck_compatibility d ON d.steam_id = g.steam_id
             WHERE g.requirements_parsed = 1
             ORDER BY g.name
             LIMIT ?
             OFFSET ?",
        )
        .bind(limit_val)
        .bind(offset_val)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Query failed: {}", e))?
    };

    let results = rows.into_iter().map(|row| GameResult {
        steam_id: row.steam_id,
        name: row.name,
        genre: row.genre,
        release_year: row.release_year,
        header_image: row.header_image,
        protondb_rating: row.protondb_rating,
        deck_status: row.deck_status,
        verdict: None,
    }).collect();

    Ok(results)
}

#[tauri::command]
pub async fn check_game_compatibility(
    steam_id: i64,
    hardware: HardwareProfile,
) -> Result<VerdictResult, String> {
    let pool = get_db_pool().await?;

    // Fetch game requirements
    let game: Option<GameRequirementsRow> = sqlx::query_as(
        "SELECT name,
                min_cpu_cores, min_cpu_clock_ghz, min_cpu_text, min_ram_mb,
                min_gpu_vram_mb, min_gpu_text, min_storage_gb,
                rec_cpu_cores, rec_cpu_clock_ghz, rec_cpu_text, rec_ram_mb,
                rec_gpu_vram_mb, rec_gpu_text, rec_storage_gb,
                requirements_parsed
         FROM games WHERE steam_id = $1"
    )
    .bind(steam_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Query failed: {}", e))?;

    let game = match game {
        Some(g) => g,
        None => return Ok(generate_unknown_verdict()),
    };

    

    // Check if we have parsed requirements
    if game.requirements_parsed != Some(1) {
        return Ok(generate_tier_fallback_verdict(&hardware));
    }

    // Build requirements summaries for display
    let min_reqs = RequirementsSummary {
        cpu_text: game.min_cpu_text.clone(),
        ram_gb: game.min_ram_mb.map(|mb| mb as f32 / 1024.0),
        gpu_text: game.min_gpu_text.clone(),
        gpu_vram_gb: game.min_gpu_vram_mb.map(|mb| mb as f32 / 1024.0),
        storage_gb: game.min_storage_gb,
    };

    let rec_reqs = RequirementsSummary {
        cpu_text: game.rec_cpu_text.clone(),
        ram_gb: game.rec_ram_mb.map(|mb| mb as f32 / 1024.0),
        gpu_text: game.rec_gpu_text.clone(),
        gpu_vram_gb: game.rec_gpu_vram_mb.map(|mb| mb as f32 / 1024.0),
        storage_gb: game.rec_storage_gb,
    };

    // User hardware values (use i64 to avoid any overflow risk on extreme systems)
    let user_ram_mb = hardware.memory.total as i64;
    let user_vram_mb = hardware.gpu.vram as i64;
    let user_cpu_cores = hardware.cpu.cores as i64;
    let user_storage_gb = hardware.storage.available as i64;

    let mut details = Vec::new();
    let mut meets_min = true;
    let mut meets_rec = true;
    let mut checks_performed = 0;

    // RAM check
    if let Some(min_ram) = game.min_ram_mb {
        let min_ram = min_ram as i64;
        checks_performed += 1;
        if user_ram_mb >= min_ram {
            if let Some(rec_ram) = game.rec_ram_mb {
                let rec_ram = rec_ram as i64;
                if user_ram_mb >= rec_ram {
                    details.push(format!("✅ RAM: {} GB (recommended: {} GB)", user_ram_mb / 1024, rec_ram / 1024));
                } else {
                    details.push(format!("🟡 RAM: {} GB (minimum: {} GB, recommended: {} GB)", user_ram_mb / 1024, min_ram / 1024, rec_ram / 1024));
                    meets_rec = false;
                }
            } else {
                details.push(format!("✅ RAM: {} GB (minimum: {} GB)", user_ram_mb / 1024, min_ram / 1024));
            }
        } else {
            details.push(format!("❌ RAM: {} GB (need {} GB minimum)", user_ram_mb / 1024, min_ram / 1024));
            meets_min = false;
            meets_rec = false;
        }
    }

    // VRAM check
    if let Some(min_vram) = game.min_gpu_vram_mb {
        let min_vram = min_vram as i64;
        checks_performed += 1;
        if user_vram_mb >= min_vram {
            if let Some(rec_vram) = game.rec_gpu_vram_mb {
                let rec_vram = rec_vram as i64;
                if user_vram_mb >= rec_vram {
                    details.push(format!("✅ VRAM: {} GB (recommended: {} GB)", user_vram_mb / 1024, rec_vram / 1024));
                } else {
                    details.push(format!("🟡 VRAM: {} GB (minimum: {} GB, recommended: {} GB)", user_vram_mb / 1024, min_vram / 1024, rec_vram / 1024));
                    meets_rec = false;
                }
            } else {
                details.push(format!("✅ VRAM: {} GB (minimum: {} GB)", user_vram_mb / 1024, min_vram / 1024));
            }
        } else {
            details.push(format!("❌ VRAM: {} GB (need {} GB minimum)", user_vram_mb / 1024, min_vram / 1024));
            meets_min = false;
            meets_rec = false;
        }
    }

    // CPU cores check
    if let Some(min_cores) = game.min_cpu_cores {
        let min_cores = min_cores as i64;
        checks_performed += 1;
        if user_cpu_cores >= min_cores {
            if let Some(rec_cores) = game.rec_cpu_cores {
                let rec_cores = rec_cores as i64;
                if user_cpu_cores >= rec_cores {
                    details.push(format!("✅ CPU: {} cores (recommended: {} cores)", user_cpu_cores, rec_cores));
                } else {
                    details.push(format!("🟡 CPU: {} cores (minimum: {}, recommended: {})", user_cpu_cores, min_cores, rec_cores));
                    meets_rec = false;
                }
            } else {
                details.push(format!("✅ CPU: {} cores (minimum: {} cores)", user_cpu_cores, min_cores));
            }
        } else {
            details.push(format!("❌ CPU: {} cores (need {} cores minimum)", user_cpu_cores, min_cores));
            meets_min = false;
            meets_rec = false;
        }
    }

    // Storage check
    if let Some(min_storage) = game.min_storage_gb {
        let min_storage = min_storage as i64;
        checks_performed += 1;
        if user_storage_gb >= min_storage {
            if let Some(rec_storage) = game.rec_storage_gb {
                let rec_storage = rec_storage as i64;
                if user_storage_gb >= rec_storage {
                    details.push(format!("✅ Storage: {} GB available (recommended: {} GB)", user_storage_gb, rec_storage));
                } else {
                    details.push(format!("🟡 Storage: {} GB available (minimum: {} GB, recommended: {} GB)", user_storage_gb, min_storage, rec_storage));
                    meets_rec = false;
                }
            } else {
                details.push(format!("✅ Storage: {} GB available (need {} GB)", user_storage_gb, min_storage));
            }
        } else {
            details.push(format!("❌ Storage: {} GB available (need {} GB)", user_storage_gb, min_storage));
            meets_min = false;
            meets_rec = false;
        }
    }

    // Determine verdict
    let (status, summary, confidence) = if checks_performed == 0 {
        (
            "unknown".to_string(),
            "No requirements data available for comparison".to_string(),
            "low".to_string(),
        )
    } else if !meets_min {
        (
            "below_minimum".to_string(),
            format!("Your hardware does not meet the minimum requirements for {}", game.name),
            if checks_performed >= 2 { "high" } else { "medium" }.to_string(),
        )
    } else if !meets_rec {
        (
            "meets_minimum".to_string(),
            format!("Your hardware meets minimum but not recommended specs for {}", game.name),
            if checks_performed >= 2 { "high" } else { "medium" }.to_string(),
        )
    } else {
            // Check if we significantly exceed recommended specs.
            // Only consider a metric if the corresponding recommended value is present.
            let mut exceeds = false;

            if let Some(rec_ram) = game.rec_ram_mb {
                if user_ram_mb > (rec_ram as i64) * 2 {
                    exceeds = true;
                }
            }

            if let Some(rec_vram) = game.rec_gpu_vram_mb {
                if user_vram_mb > (rec_vram as i64) * 2 {
                    exceeds = true;
                }
            }

            if let Some(rec_cores) = game.rec_cpu_cores {
                if user_cpu_cores > (rec_cores as i64) * 2 {
                    exceeds = true;
                }
            }

            if exceeds {
                (
                    "exceeds_recommended".to_string(),
                    format!("Your hardware exceeds recommended specs for {}", game.name),
                    if checks_performed >= 2 { "high" } else { "medium" }.to_string(),
                )
            } else {
                (
                    "meets_recommended".to_string(),
                    format!("Your hardware meets recommended specs for {}", game.name),
                    if checks_performed >= 2 { "high" } else { "medium" }.to_string(),
                )
            }
        };

    Ok(VerdictResult {
        status,
        confidence,
        summary,
        details,
        min_requirements: Some(min_reqs),
        rec_requirements: Some(rec_reqs),
    })
}

fn generate_unknown_verdict() -> VerdictResult {
    VerdictResult {
        status: "unknown".to_string(),
        confidence: "low".to_string(),
        summary: "Game not found in database".to_string(),
        details: vec!["Try syncing more games with 'npm run scrape:requirements --popular'".to_string()],
        min_requirements: None,
        rec_requirements: None,
    }
}

fn generate_tier_fallback_verdict(hardware: &HardwareProfile) -> VerdictResult {
    let gpu_tier = hardware.gpu.tier as u8;
    let cpu_tier = hardware.cpu.tier as u8;
    let min_tier = gpu_tier.min(cpu_tier);

    let (status, summary) = match min_tier {
        6..=7 => ("likely_good", "Based on your hardware tier, this game should run well"),
        4..=5 => ("likely_playable", "Based on your hardware tier, this game should be playable"),
        2..=3 => ("uncertain", "Based on your hardware tier, performance may vary"),
        _ => ("uncertain", "Unable to estimate performance without requirements data"),
    };

    VerdictResult {
        status: status.to_string(),
        confidence: "low".to_string(),
        summary: summary.to_string(),
        details: vec![
            "⚠️ No parsed requirements data for this game".to_string(),
            "Verdict is based on hardware tier estimation only".to_string(),
        ],
        min_requirements: None,
        rec_requirements: None,
    }
}

#[allow(dead_code)]
fn find_db_path() -> Option<String> {
    use std::path::PathBuf;

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Check directory of the running executable (handles packaged app layouts)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Windows/Linux: database next to executable
            candidates.push(exe_dir.join("intelligence.db"));

            // Windows/Linux: in resources subfolder
            candidates.push(exe_dir.join("resources").join("intelligence.db"));

            // Linux AppImage/package: in share directory
            candidates.push(exe_dir.join("..").join("share").join("specpilot").join("intelligence.db"));

            // macOS: executable is in Contents/MacOS/, resources in Contents/Resources/
            #[cfg(target_os = "macos")]
            {
                candidates.push(exe_dir.join("..").join("Resources").join("intelligence.db"));
            }

            // Tauri bundles resources relative to the app
            if let Some(grandparent) = exe_dir.parent() {
                candidates.push(grandparent.join("resources").join("intelligence.db"));
                candidates.push(grandparent.join("Resources").join("intelligence.db"));
            }
        }
    }

    // Fallbacks for development layouts (when running via `cargo run` or `npm run tauri dev`)
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use sqlx::sqlite::SqlitePool;
    use std::env;
    use crate::db::reset_db_pool;
    use crate::hardware::{
        CpuInfo, GpuInfo, MemoryInfo, StorageInfo, OsInfo, GraphicsApiSupport,
        CpuTier, GpuTier, GpuVendor, StorageType,
    };

    #[test]
    fn test_unknown_verdict() {
        let verdict = generate_unknown_verdict();
        assert_eq!(verdict.status, "unknown");
        assert_eq!(verdict.confidence, "low");
    }

    #[tokio::test]
    async fn test_no_rec_does_not_exceed() {
        // Reset the global pool so we use a fresh connection
        reset_db_pool().await;

        // Setup temp dir and DB
        let td = tempdir().unwrap();
        let db_path = td.path().join("intelligence.db");
        let db_str = db_path.to_str().unwrap().to_string();

        // Use ?mode=rwc to create the database file
        let db_url = format!("sqlite:{}?mode=rwc", db_str);
        let pool = SqlitePool::connect(&db_url).await.unwrap();

        // Create schema with all columns that check_game_compatibility expects
        sqlx::query(
            r#"CREATE TABLE games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                steam_id INTEGER,
                name TEXT,
                min_cpu_cores INTEGER,
                min_cpu_clock_ghz REAL,
                min_cpu_text TEXT,
                min_ram_mb INTEGER,
                min_gpu_vram_mb INTEGER,
                min_gpu_text TEXT,
                min_storage_gb INTEGER,
                rec_cpu_cores INTEGER,
                rec_cpu_clock_ghz REAL,
                rec_cpu_text TEXT,
                rec_ram_mb INTEGER,
                rec_gpu_vram_mb INTEGER,
                rec_gpu_text TEXT,
                rec_storage_gb INTEGER,
                requirements_parsed INTEGER
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a game where recommended fields are NULL
        sqlx::query(
            "INSERT INTO games (steam_id, name, min_cpu_cores, min_ram_mb, min_gpu_vram_mb, min_storage_gb, requirements_parsed) VALUES ($1,$2,$3,$4,$5,$6,$7)"
        )
        .bind(1i64)
        .bind("Test Game")
        .bind(2i32)
        .bind(4096i32)
        .bind(1024i32)
        .bind(10i32)
        .bind(1i32)
        .execute(&pool)
        .await
        .unwrap();

        // Make the test process current dir the temp dir so find_db_path finds intelligence.db
        let orig_dir = env::current_dir().unwrap();
        env::set_current_dir(td.path()).unwrap();

        // Build a hardware profile that has more than minimum but there are no recommended values
        let hw = HardwareProfile {
            cpu: CpuInfo { model: "TestCPU".into(), vendor: "TestVendor".into(), cores: 4, threads: 4, base_clock: 2.5, boost_clock: None, architecture: "x86_64".into(), tier: CpuTier::Mainstream },
            gpu: GpuInfo { model: "TestGPU".into(), vendor: GpuVendor::Unknown, vram: 8192, driver_version: "v".into(), pci_id: None, tier: GpuTier::Mainstream },
            memory: MemoryInfo { total: 8192, available: 8000, speed: None, ddr_type: None },
            storage: StorageInfo { total: 500, available: 200, storage_type: StorageType::NvmeSsd },
            os: OsInfo { platform: "linux".into(), version: "1".into(), distribution: None },
            graphics_api: GraphicsApiSupport { directx: None, vulkan: None, opengl: None, metal: None },
        };

        let verdict = check_game_compatibility(1, hw).await.unwrap();

        // Should not be incorrectly classified as exceeds_recommended when rec fields are missing
        assert_ne!(verdict.status, "exceeds_recommended");

        // restore cwd
        env::set_current_dir(orig_dir).unwrap();
    }

    #[tokio::test]
    async fn test_with_rec_exceeds() {
        // Reset the global pool so we use a fresh connection
        reset_db_pool().await;

        let td = tempdir().unwrap();
        let db_path = td.path().join("intelligence.db");
        let db_str = db_path.to_str().unwrap().to_string();

        // Use ?mode=rwc to create the database file
        let db_url = format!("sqlite:{}?mode=rwc", db_str);
        let pool = SqlitePool::connect(&db_url).await.unwrap();

        // Create schema with all columns that check_game_compatibility expects
        sqlx::query(
            r#"CREATE TABLE games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                steam_id INTEGER,
                name TEXT,
                min_cpu_cores INTEGER,
                min_cpu_clock_ghz REAL,
                min_cpu_text TEXT,
                min_ram_mb INTEGER,
                min_gpu_vram_mb INTEGER,
                min_gpu_text TEXT,
                min_storage_gb INTEGER,
                rec_cpu_cores INTEGER,
                rec_cpu_clock_ghz REAL,
                rec_cpu_text TEXT,
                rec_ram_mb INTEGER,
                rec_gpu_vram_mb INTEGER,
                rec_gpu_text TEXT,
                rec_storage_gb INTEGER,
                requirements_parsed INTEGER
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a game with recommended values
        sqlx::query(
            "INSERT INTO games (steam_id, name, min_cpu_cores, min_ram_mb, min_gpu_vram_mb, rec_ram_mb, rec_gpu_vram_mb, requirements_parsed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"
        )
        .bind(2i64)
        .bind("GameWithRec")
        .bind(2i32)
        .bind(2048i32)
        .bind(512i32)
        .bind(2048i32) // rec_ram_mb
        .bind(512i32)  // rec_vram
        .bind(1i32)
        .execute(&pool)
        .await
        .unwrap();

        let orig_dir = env::current_dir().unwrap();
        env::set_current_dir(td.path()).unwrap();

        let hw = HardwareProfile {
            cpu: CpuInfo { model: "CPU".into(), vendor: "V".into(), cores: 8, threads: 8, base_clock: 3.0, boost_clock: None, architecture: "x86_64".into(), tier: CpuTier::Performance },
            gpu: GpuInfo { model: "GPU".into(), vendor: GpuVendor::Unknown, vram: 8192, driver_version: "v".into(), pci_id: None, tier: GpuTier::Performance },
            memory: MemoryInfo { total: 8192, available: 8000, speed: None, ddr_type: None },
            storage: StorageInfo { total: 1000, available: 500, storage_type: StorageType::NvmeSsd },
            os: OsInfo { platform: "linux".into(), version: "1".into(), distribution: None },
            graphics_api: GraphicsApiSupport { directx: None, vulkan: None, opengl: None, metal: None },
        };

        let verdict = check_game_compatibility(2, hw).await.unwrap();
        assert_eq!(verdict.status, "exceeds_recommended");

        env::set_current_dir(orig_dir).unwrap();
    }
}
