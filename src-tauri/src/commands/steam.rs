//! Steam Library Detection
//!
//! Detects installed Steam games by parsing Steam's library files on Linux.
//! Supports multiple library folders and returns game IDs that can be matched
//! against our database.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Information about an installed Steam game
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledGame {
    pub app_id: i64,
    pub name: String,
    pub install_dir: String,
    pub size_on_disk: u64,
    pub last_updated: Option<u64>,
}

/// Result of Steam library detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamLibraryResult {
    pub steam_path: Option<String>,
    pub library_folders: Vec<String>,
    pub installed_games: Vec<InstalledGame>,
    pub total_games: usize,
}

/// Detect Steam installation and return installed games
#[tauri::command]
pub async fn detect_steam_library() -> Result<SteamLibraryResult, String> {
    // Find Steam installation path
    let steam_path = find_steam_path()
        .ok_or_else(|| "Steam installation not found".to_string())?;

    // Parse library folders
    let library_folders = parse_library_folders(&steam_path)
        .map_err(|e| format!("Failed to parse library folders: {}", e))?;

    // Collect installed games from all library folders
    let mut installed_games = Vec::new();
    for folder in &library_folders {
        let steamapps = PathBuf::from(folder).join("steamapps");
        if steamapps.exists() {
            if let Ok(games) = parse_app_manifests(&steamapps) {
                installed_games.extend(games);
            }
        }
    }

    let total_games = installed_games.len();

    Ok(SteamLibraryResult {
        steam_path: Some(steam_path.to_string_lossy().to_string()),
        library_folders,
        installed_games,
        total_games,
    })
}

/// Find Steam installation path on Linux
fn find_steam_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;

    // Common Steam installation paths on Linux
    let candidates = [
        home.join(".steam/steam"),
        home.join(".steam/debian-installation"),
        home.join(".local/share/Steam"),
        home.join("snap/steam/common/.steam/steam"),
        PathBuf::from("/usr/share/steam"),
        // Flatpak Steam
        home.join(".var/app/com.valvesoftware.Steam/.steam/steam"),
        home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ];

    for path in candidates {
        if path.exists() && path.join("steamapps").exists() {
            return Some(path);
        }
    }

    None
}

/// Parse libraryfolders.vdf to get all library folder paths
fn parse_library_folders(steam_path: &PathBuf) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let vdf_path = steam_path.join("steamapps/libraryfolders.vdf");

    if !vdf_path.exists() {
        // Fallback: just use the main steamapps folder
        return Ok(vec![steam_path.to_string_lossy().to_string()]);
    }

    let content = fs::read_to_string(&vdf_path)?;
    let mut folders = Vec::new();

    // Parse VDF format (simple key-value parsing)
    // Looking for "path" entries
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("\"path\"") {
            // Format: "path"		"/path/to/library"
            if let Some(path) = extract_vdf_value(trimmed) {
                folders.push(path);
            }
        }
    }

    // Always include main Steam path if not already present
    let main_path = steam_path.to_string_lossy().to_string();
    if !folders.contains(&main_path) {
        folders.insert(0, main_path);
    }

    Ok(folders)
}

/// Parse app manifests in a steamapps folder
fn parse_app_manifests(steamapps_path: &PathBuf) -> Result<Vec<InstalledGame>, Box<dyn std::error::Error>> {
    let mut games = Vec::new();

    // Find all appmanifest_*.acf files
    let entries = fs::read_dir(steamapps_path)?;

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
            if filename.starts_with("appmanifest_") && filename.ends_with(".acf") {
                if let Ok(game) = parse_app_manifest(&path) {
                    // Skip Steam runtime and tools (app IDs < 100 or specific ranges)
                    if game.app_id >= 100 && !is_steam_tool(game.app_id) {
                        games.push(game);
                    }
                }
            }
        }
    }

    Ok(games)
}

/// Parse a single appmanifest_*.acf file
fn parse_app_manifest(path: &PathBuf) -> Result<InstalledGame, Box<dyn std::error::Error>> {
    let content = fs::read_to_string(path)?;

    let mut app_id: i64 = 0;
    let mut name = String::new();
    let mut install_dir = String::new();
    let mut size_on_disk: u64 = 0;
    let mut last_updated: Option<u64> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("\"appid\"") {
            if let Some(val) = extract_vdf_value(trimmed) {
                app_id = val.parse().unwrap_or(0);
            }
        } else if trimmed.starts_with("\"name\"") {
            if let Some(val) = extract_vdf_value(trimmed) {
                name = val;
            }
        } else if trimmed.starts_with("\"installdir\"") {
            if let Some(val) = extract_vdf_value(trimmed) {
                install_dir = val;
            }
        } else if trimmed.starts_with("\"SizeOnDisk\"") {
            if let Some(val) = extract_vdf_value(trimmed) {
                size_on_disk = val.parse().unwrap_or(0);
            }
        } else if trimmed.starts_with("\"LastUpdated\"") {
            if let Some(val) = extract_vdf_value(trimmed) {
                last_updated = val.parse().ok();
            }
        }
    }

    if app_id == 0 {
        return Err("Invalid app manifest: no appid".into());
    }

    Ok(InstalledGame {
        app_id,
        name,
        install_dir,
        size_on_disk,
        last_updated,
    })
}

/// Extract value from VDF line format: "key"		"value"
fn extract_vdf_value(line: &str) -> Option<String> {
    // VDF format: "key"<whitespace>"value"
    // We need to find the second quoted string (the value)
    let mut quotes: Vec<usize> = Vec::new();

    for (i, c) in line.char_indices() {
        if c == '"' {
            quotes.push(i);
        }
    }

    // We need at least 4 quotes: opening/closing for key, opening/closing for value
    if quotes.len() >= 4 {
        let value_start = quotes[2] + 1;  // After the third quote (opening of value)
        let value_end = quotes[3];         // The fourth quote (closing of value)
        if value_end > value_start {
            return Some(line[value_start..value_end].to_string());
        }
    }

    None
}

/// Check if an app ID is a Steam tool/runtime (not a game)
fn is_steam_tool(app_id: i64) -> bool {
    // Common Steam tools and runtimes
    let tools = [
        228980,  // Steamworks Common Redistributables
        1070560, // Steam Linux Runtime
        1391110, // Steam Linux Runtime - Soldier
        1628350, // Steam Linux Runtime - Sniper
        250820,  // SteamVR
        1007,    // Steam Client
        1826330, // Proton EasyAntiCheat Runtime
        1493710, // Proton Experimental
    ];

    tools.contains(&app_id) ||
        (app_id >= 1493700 && app_id <= 1493799) || // Proton versions
        (app_id >= 858280 && app_id <= 858290)      // More Proton versions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_vdf_value() {
        assert_eq!(
            extract_vdf_value("\"path\"\t\t\"/home/user/.steam/steam\""),
            Some("/home/user/.steam/steam".to_string())
        );
        assert_eq!(
            extract_vdf_value("\"appid\"\t\t\"730\""),
            Some("730".to_string())
        );
        assert_eq!(
            extract_vdf_value("\"name\"\t\t\"Counter-Strike 2\""),
            Some("Counter-Strike 2".to_string())
        );
    }

    #[test]
    fn test_is_steam_tool() {
        assert!(is_steam_tool(228980)); // Steamworks
        assert!(is_steam_tool(1070560)); // Linux Runtime
        assert!(!is_steam_tool(730)); // CS2
        assert!(!is_steam_tool(570)); // Dota 2
    }
}
