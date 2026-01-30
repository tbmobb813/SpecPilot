#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod hardware;
mod commands;

use commands::AppState;

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            cached_profile: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_hardware,
            commands::get_cached_profile,
            commands::save_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
