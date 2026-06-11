use tauri::State;
use tauri_plugin_autostart::ManagerExt;
use crate::config::GlobalSettings;
use crate::db::repo;
use crate::AppState;

const SETTINGS_KEY: &str = "global_settings";

#[tauri::command]
pub fn get_global_settings(state: State<AppState>) -> Result<GlobalSettings, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    match repo::get_setting(&conn, SETTINGS_KEY).map_err(|e| e.to_string())? {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(GlobalSettings::default()),
    }
}

#[tauri::command]
pub fn update_global_settings(
    settings: GlobalSettings,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<GlobalSettings, String> {
    let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::set_setting(&conn, SETTINGS_KEY, &json).map_err(|e| e.to_string())?;
    }


    if let Ok(mut flag) = state.close_to_tray.lock() {
        *flag = settings.close_to_tray;
    }


    let mgr = app.autolaunch();
    if settings.start_on_boot {
        let _ = mgr.enable();
    } else {
        let _ = mgr.disable();
    }

    Ok(settings)
}
