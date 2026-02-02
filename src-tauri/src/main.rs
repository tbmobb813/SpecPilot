#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod hardware;
mod commands;
mod db;

use commands::{AppState, TelemetryState};

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            cached_profile: std::sync::Mutex::new(None),
        })
        .manage(TelemetryState::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan_hardware,
            commands::get_cached_profile,
            commands::save_profile,
            commands::submit_telemetry,
            commands::get_telemetry_enabled,
            commands::set_telemetry_enabled,
            commands::search_games,
            commands::browse_games,
            commands::check_game_compatibility,
            commands::run_readyup_checks,
            commands::detect_steam_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
