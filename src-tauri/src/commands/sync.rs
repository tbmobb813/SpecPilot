use std::process::Command;
use std::path::PathBuf;

// Maximum number of parent directories to traverse when searching for the script
const MAX_SCRIPT_SEARCH_DEPTH: usize = 5;

/// Trigger the ProtonDB sync Node script from the Tauri backend.
/// Returns stdout on success, or stderr on failure.
/// Note: This command is intended for development use. In production, ensure Node.js
/// dependencies are properly installed or consider alternative sync mechanisms.
#[tauri::command]
pub async fn sync_protondb(app_handle: tauri::AppHandle) -> Result<String, String> {
    // Check if Node.js is available
    let node_check = Command::new("node")
        .arg("--version")
        .output()
        .map_err(|_| "Node.js is not installed or not found in PATH. Please install Node.js to use this feature.".to_string())?;
    
    if !node_check.status.success() {
        return Err("Node.js is installed but not working correctly. Please verify your Node.js installation.".to_string());
    }

    // Get the app's resource directory and construct absolute path to script
    let app_dir = app_handle
        .path_resolver()
        .app_dir()
        .ok_or_else(|| "Failed to resolve app directory".to_string())?;
    
    let mut script_path = PathBuf::from(&app_dir);
    
    // Search for the script by traversing up the directory tree
    // This handles both development and production scenarios where app_dir depth may vary
    for _ in 0..MAX_SCRIPT_SEARCH_DEPTH {
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

// Note: Integration tests for sync_protondb would require mocking AppHandle,
// which is complex and typically done in Tauri integration tests.
// The function includes several testable paths:
// 1. Node.js not installed or not in PATH
// 2. Node.js installed but not working correctly
// 3. App directory resolution failure
// 4. Script not found within MAX_SCRIPT_SEARCH_DEPTH
// 5. Script found but execution fails
// 6. Script found and execution succeeds
// These scenarios should be tested in integration tests with a proper Tauri test harness.
