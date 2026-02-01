use std::process::Command;

/// Trigger the ProtonDB sync Node script from the Tauri backend.
/// Returns stdout on success, or stderr on failure.
#[tauri::command]
pub async fn sync_protondb() -> Result<String, String> {
    // Script path relative to src-tauri directory
    let script = "../scripts/sync/protondb.js";

    let output = Command::new("node")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to spawn node: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
