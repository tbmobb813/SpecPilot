use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use crate::db::get_db_pool;

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
    let pool = get_db_pool()
        .await
        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?;

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

// DB path resolution and pool creation are centralized in `crate::db`

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
