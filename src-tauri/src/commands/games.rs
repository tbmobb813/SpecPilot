use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use crate::hardware::HardwareProfile;

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
    let db_path = find_db_path().ok_or("Database not found. Run 'npm run scrape:requirements --popular' first.")?;
    let db_url = format!("sqlite:{}", db_path);

    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let search_pattern = format!("%{}%", query.to_lowercase());

    let rows: Vec<GameRow> = sqlx::query_as(
        "SELECT g.steam_id, g.name, g.genre, g.release_year, g.header_image,
                p.protondb_rating, d.deck_status
         FROM games g
         LEFT JOIN proton_compatibility p ON p.game_id = g.id
         LEFT JOIN steamdeck_compatibility d ON d.game_id = g.id
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
    filter_verdict: Option<String>,
    filter_genre: Option<String>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<GameResult>, String> {
    let db_path = find_db_path().ok_or("Database not found")?;
    let db_url = format!("sqlite:{}", db_path);

    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    let limit_val = limit.unwrap_or(50);
    let offset_val = offset.unwrap_or(0);

    // Build query based on filters
    let mut query = String::from(
        "SELECT g.steam_id, g.name, g.genre, g.release_year, g.header_image,
                p.protondb_rating, d.deck_status
         FROM games g
         LEFT JOIN proton_compatibility p ON p.game_id = g.id
         LEFT JOIN steamdeck_compatibility d ON d.game_id = g.id
         WHERE g.requirements_parsed = 1"
    );

    if let Some(ref genre) = filter_genre {
        query.push_str(&format!(" AND g.genre LIKE '%{}%'", genre));
    }

    query.push_str(" ORDER BY g.name");
    query.push_str(&format!(" LIMIT {} OFFSET {}", limit_val, offset_val));

    let rows: Vec<GameRow> = sqlx::query_as(&query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

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
    let db_path = find_db_path().ok_or("Database not found")?;
    let db_url = format!("sqlite:{}", db_path);

    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

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

    // User hardware values
    let user_ram_mb = hardware.memory.total as i32;  // Already in MB
    let user_vram_mb = hardware.gpu.vram as i32;     // Already in MB
    let user_cpu_cores = hardware.cpu.cores as i32;
    let user_storage_gb = hardware.storage.available as i32;  // Available space

    let mut details = Vec::new();
    let mut meets_min = true;
    let mut meets_rec = true;
    let mut checks_performed = 0;

    // RAM check
    if let Some(min_ram) = game.min_ram_mb {
        checks_performed += 1;
        if user_ram_mb >= min_ram {
            if let Some(rec_ram) = game.rec_ram_mb {
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
        checks_performed += 1;
        if user_vram_mb >= min_vram {
            if let Some(rec_vram) = game.rec_gpu_vram_mb {
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
        checks_performed += 1;
        if user_cpu_cores >= min_cores {
            if let Some(rec_cores) = game.rec_cpu_cores {
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
        checks_performed += 1;
        if user_storage_gb >= min_storage {
            details.push(format!("✅ Storage: {} GB available (need {} GB)", user_storage_gb, min_storage));
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
        // Check if we significantly exceed
        let exceeds = user_ram_mb > game.rec_ram_mb.unwrap_or(0) * 2
            || user_vram_mb > game.rec_gpu_vram_mb.unwrap_or(0) * 2;

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

fn find_db_path() -> Option<String> {
    let candidates = [
        "intelligence.db",
        "../intelligence.db",
        "src-tauri/intelligence.db",
    ];

    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unknown_verdict() {
        let verdict = generate_unknown_verdict();
        assert_eq!(verdict.status, "unknown");
        assert_eq!(verdict.confidence, "low");
    }
}
