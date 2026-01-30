use crate::hardware;
use tauri::State;
use std::sync::Mutex;

pub struct AppState {
    pub cached_profile: Mutex<Option<hardware::HardwareProfile>>,
}

#[tauri::command]
pub async fn scan_hardware() -> Result<hardware::HardwareProfile, String> {
    hardware::scan_system()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cached_profile(
    state: State<'_, AppState>
) -> Result<Option<hardware::HardwareProfile>, String> {
    // Return cached profile if exists and recent
    Ok(state.cached_profile.lock().unwrap().clone())
}

#[tauri::command]
pub async fn save_profile(
    profile: hardware::HardwareProfile,
    state: State<'_, AppState>
) -> Result<(), String> {
    *state.cached_profile.lock().unwrap() = Some(profile);
    Ok(())
}
