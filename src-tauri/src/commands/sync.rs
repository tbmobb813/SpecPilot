use std::process::Command;
use std::path::PathBuf;

/// Trigger the ProtonDB sync Node script from the Tauri backend.
/// Returns stdout on success, or stderr on failure.
#[tauri::command]
pub async fn sync_protondb(app_handle: tauri::AppHandle) -> Result<String, String> {
    // Check if Node.js is available
    if Command::new("node")
        .arg("--version")
        .output()
        .is_err()
    {
        return Err("Node.js is not installed or not found in PATH. Please install Node.js to use this feature.".to_string());
    }

    // Get the app's resource directory and construct absolute path to script
    let app_dir = app_handle
        .path_resolver()
        .app_dir()
        .ok_or_else(|| "Failed to resolve app directory".to_string())?;
    
    // Navigate up from app_dir to project root, then to scripts/sync/protondb.js
    // In development: app_dir is typically src-tauri/target/debug or similar
    // In production: we need to ensure the script is bundled as a resource
    let mut script_path = PathBuf::from(&app_dir);
    
    // Try to find the script by going up directories
    for _ in 0..5 {
        script_path.pop();
        let candidate = script_path.join("scripts/sync/protondb.js");
        if candidate.exists() {
            let output = Command::new("node")
                .arg(candidate)
                .output()
                .map_err(|e| format!("Failed to execute node: {}", e))?;

            if output.status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).to_string());
            } else {
                return Err(String::from_utf8_lossy(&output.stderr).to_string());
            }
        }
    }

    Err("ProtonDB sync script not found. Ensure scripts/sync/protondb.js exists in the project root.".to_string())
}
