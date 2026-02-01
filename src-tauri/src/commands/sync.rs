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

    // Build a list of candidate starting paths to search for the script. We include:
    // - Tauri app_dir (runtime-resolved)
    // - current executable parent
    // - current working directory
    // - compile-time CARGO_MANIFEST_DIR (useful during development)
    // - a simple relative ../ fallback
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(app_dir) = app_handle.path_resolver().app_dir() {
        candidates.push(PathBuf::from(app_dir));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }

    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        candidates.push(PathBuf::from(manifest_dir));
    }

    candidates.push(PathBuf::from(".."));

    // Search up from each candidate for the script path
    for start in candidates {
        let mut p = start.clone();
        for _ in 0..=MAX_SCRIPT_SEARCH_DEPTH {
            let candidate = p.join("scripts/sync/protondb.js");
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
            if !p.pop() {
                break;
            }
        }
    }

    Err("ProtonDB sync script not found. Ensure scripts/sync/protondb.js exists or bundle the sync tool with the application.".to_string())
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
