use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};
use crate::config::FolderConfig;
use crate::db::repo::{self, Folder, map_folder_row};
use crate::watcher::supervisor;
use crate::AppState;


fn normalize_canonical(path: PathBuf) -> String {
    let s = path.to_string_lossy();
    #[cfg(target_os = "windows")]
    {
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{}", rest);
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return rest.to_string();
        }
    }
    s.into_owned()
}

#[tauri::command]
pub fn get_platform() -> &'static str {
    std::env::consts::OS
}

#[tauri::command]
pub fn list_folders(state: State<AppState>) -> Result<Vec<Folder>, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::list_folders(&conn).map_err(Into::into)
}

#[tauri::command]
pub async fn add_folder(
    path: String,
    config: Option<FolderConfig>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    let config = config.unwrap_or_default();
    let folder_path = PathBuf::from(&path);

    if !folder_path.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !folder_path.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }


    let canonical = folder_path.canonicalize().unwrap_or_else(|_| folder_path.clone());
    let canonical_str = normalize_canonical(canonical);

    let existing = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::get_folder_by_path(&conn, &canonical_str).map_err(|e| e.to_string())?
    };

    let folder = match existing {
        Some(f) if f.deleted_at.is_none() => {
            return Err(format!("This folder is already being watched: {canonical_str}"));
        }
        Some(f) => {

            let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
            repo::revive_folder(&conn, f.id, &config).map_err(|e| e.to_string())?;
            repo::get_folder(&conn, f.id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Folder {id} not found after revive", id = f.id))?
        }
        None => {
            let display_name = folder_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
            repo::insert_folder(&conn, &canonical_str, &display_name, &config)
                .map_err(|e| e.to_string())?
        }
    };

    let db = state.db_arc();
    let cas = state.cas.clone();
    let folder_id = folder.id;
    let scan_path = folder_path.clone();
    let scan_config = config.clone();
    let db2 = Arc::clone(&db);
    let cas2 = Arc::clone(&cas);
    let app2 = app.clone();

    tokio::spawn(async move {
        tokio::task::spawn_blocking(move || {
            if let Err(e) = supervisor::initial_scan(folder_id, &scan_path, &scan_config, &db2, &cas2, &app2) {
                tracing::warn!("initial_scan failed for folder {folder_id}: {e}");
            }
        })
        .await
        .ok();
    });

    {
        let mut sup = state.supervisor.lock().map_err(|_| "supervisor lock poisoned")?;
        sup.start_folder(folder.id, folder_path, config, db, cas, app);
    }

    Ok(folder)
}

#[tauri::command]
pub async fn update_folder_config(
    id: i64,
    config: FolderConfig,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    let folder = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::update_folder_config(&conn, id, &config).map_err(|e| e.to_string())?;
        repo::get_folder(&conn, id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Folder {id} not found"))?
    };


    let folder_path = PathBuf::from(&folder.path);
    if folder_path.exists() {
        let db = state.db_arc();
        let cas = state.cas.clone();
        let mut sup = state.supervisor.lock().map_err(|_| "supervisor lock poisoned")?;
        sup.start_folder(id, folder_path, config, db, cas, app);
    }

    Ok(folder)
}

#[tauri::command]
pub fn rename_folder(
    id: i64,
    display_name: String,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::rename_folder(&conn, id, &display_name).map_err(|e| e.to_string())?;
    repo::get_folder(&conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Folder {id} not found"))
}


#[tauri::command]
pub fn remove_folder(id: i64, state: State<AppState>) -> Result<(), String> {
    {
        let mut sup = state.supervisor.lock().map_err(|_| "supervisor lock poisoned")?;
        sup.stop_folder(id);
    }
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    repo::soft_delete_folder(&conn, id, now).map_err(Into::into)
}


#[tauri::command]
pub async fn toggle_folder_pause(
    id: i64,
    paused: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::toggle_folder_pause(&conn, id, paused).map_err(|e| e.to_string())?;
    }
    let folder = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::get_folder(&conn, id).map_err(|e| e.to_string())?.ok_or_else(|| format!("Folder {id} not found"))?
    };
    if paused {
        let mut sup = state.supervisor.lock().map_err(|_| "supervisor lock")?;
        sup.stop_folder(id);
    } else {
        let folder_path = PathBuf::from(&folder.path);
        if folder_path.exists() {
            let db = state.db_arc();
            let cas = state.cas.clone();
            let mut sup = state.supervisor.lock().map_err(|_| "supervisor lock")?;
            sup.start_folder(id, folder_path, folder.config.clone(), db, cas, app);
        }
    }
    Ok(folder)
}


#[tauri::command]
pub async fn undelete_folder(
    id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Folder, String> {
    {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::undelete_folder(&conn, id).map_err(|e| e.to_string())?;
    }
    let folder = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;

        use rusqlite::params;
        conn.query_row(
            "SELECT id, path, display_name, config_json, active, created_at, paused, deleted_at FROM folders WHERE id = ?1",
            params![id],
            map_folder_row,
        ).map_err(|e| e.to_string())?
    };
    let folder_path = PathBuf::from(&folder.path);
    if folder_path.exists() && !folder.paused {
        let db = state.db_arc();
        let cas = state.cas.clone();
        let mut sup = state.supervisor.lock().map_err(|_| "supervisor lock")?;
        sup.start_folder(id, folder_path, folder.config.clone(), db, cas, app);
    }
    Ok(folder)
}
