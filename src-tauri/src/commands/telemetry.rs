use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use sqlx::sqlite::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryReport {
    pub game_id: i64,
    pub hardware_hash: String,
    pub avg_fps: f64,
    pub stable: bool,
    pub settings: String,
    pub predicted_verdict: String,
}

pub struct TelemetryState {
    pub enabled: Mutex<bool>,
    pub pending_reports: Mutex<Vec<TelemetryReport>>,
}

impl Default for TelemetryState {
    fn default() -> Self {
        Self {
            enabled: Mutex::new(false),
            pending_reports: Mutex::new(Vec::new()),
        }
    }
}

#[tauri::command]
pub async fn submit_telemetry(
    report: TelemetryReport,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    // Check if telemetry is enabled
    let enabled = *state.enabled.lock().map_err(|e| e.to_string())?;
    if !enabled {
        return Err("Telemetry is not enabled".to_string());
    }

    // Store in pending reports (scope to release lock before await)
    {
        let mut reports = state.pending_reports.lock().map_err(|e| e.to_string())?;
        reports.push(report.clone());
    }

    // Attempt to persist to database if available
    if let Err(e) = persist_telemetry_report(&report).await {
        // Log error but don't fail - report is still in memory
        eprintln!("Failed to persist telemetry: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub async fn get_telemetry_enabled(
    state: State<'_, TelemetryState>,
) -> Result<bool, String> {
    let enabled = *state.enabled.lock().map_err(|e| e.to_string())?;
    Ok(enabled)
}

#[tauri::command]
pub async fn set_telemetry_enabled(
    enabled: bool,
    state: State<'_, TelemetryState>,
) -> Result<(), String> {
    let mut state_enabled = state.enabled.lock().map_err(|e| e.to_string())?;
    *state_enabled = enabled;
    Ok(())
}

async fn persist_telemetry_report(report: &TelemetryReport) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Get the database path
    let db_path = get_intelligence_db_path()?;

    if !std::path::Path::new(&db_path).exists() {
        return Err("Intelligence database not found".into());
    }

    let db_url = format!("sqlite:{}", db_path);
    let pool = SqlitePool::connect(&db_url).await?;

    sqlx::query(
        "INSERT INTO telemetry (game_id, hardware_hash, avg_fps, stable, settings, predicted_verdict)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(report.game_id)
    .bind(&report.hardware_hash)
    .bind(report.avg_fps)
    .bind(if report.stable { 1i32 } else { 0i32 })
    .bind(&report.settings)
    .bind(&report.predicted_verdict)
    .execute(&pool)
    .await?;

    Ok(())
}

fn get_intelligence_db_path() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    use std::path::PathBuf;

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Check directory of the running executable first (packaged app layouts)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("intelligence.db"));
            candidates.push(parent.join("resources").join("intelligence.db"));
            candidates.push(parent.join("..").join("share").join("specpilot").join("intelligence.db"));
        }
    }

    // Fallback development locations
    candidates.push(PathBuf::from("intelligence.db"));
    candidates.push(PathBuf::from("../intelligence.db"));
    candidates.push(PathBuf::from("data/intelligence.db"));

    for p in candidates {
        if p.exists() {
            if let Some(s) = p.to_str() {
                return Ok(s.to_string());
            }
        }
    }

    // As a last resort, return default filename (will likely not exist)
    Ok("intelligence.db".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_telemetry_report_serialization() {
        let report = TelemetryReport {
            game_id: 1091500,
            hardware_hash: "abc123".to_string(),
            avg_fps: 60.5,
            stable: true,
            settings: "High".to_string(),
            predicted_verdict: "Good".to_string(),
        };

        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("1091500"));
        assert!(json.contains("abc123"));
    }

    #[test]
    fn test_telemetry_state_default() {
        let state = TelemetryState::default();
        assert!(!*state.enabled.lock().unwrap());
        assert!(state.pending_reports.lock().unwrap().is_empty());
    }
}
