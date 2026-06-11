use std::path::PathBuf;
use tauri::{AppHandle, State};
use crate::db::repo::{self, FileEntry, Snapshot};
use crate::watcher::supervisor;
use crate::AppState;

#[tauri::command]
pub fn list_files(folder_id: i64, state: State<AppState>) -> Result<Vec<FileEntry>, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::list_files(&conn, folder_id, false).map_err(Into::into)
}


#[tauri::command]
pub fn list_files_paged(
    folder_id: i64,
    limit: Option<u32>,
    offset: Option<u32>,
    state: State<AppState>,
) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    let (items, total) = repo::list_files_paged(&conn, folder_id, limit.unwrap_or(200), offset.unwrap_or(0))
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "items": items, "total": total }))
}

#[tauri::command]
pub fn list_snapshots(file_id: i64, state: State<AppState>) -> Result<Vec<Snapshot>, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::list_snapshots(&conn, file_id).map_err(Into::into)
}

#[tauri::command]
pub async fn trigger_manual_snapshot(
    file_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Snapshot, String> {
    let (folder_id, abs_path, rel_path, config) = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        let file = repo::get_file_by_id(&conn, file_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("File {file_id} not found"))?;
        let folder = repo::get_folder(&conn, file.folder_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Folder {} not found", file.folder_id))?;
        let abs = PathBuf::from(&folder.path).join(&file.rel_path);
        (file.folder_id, abs, file.rel_path.clone(), folder.config)
    };

    let db = state.db_arc();
    let cas = state.cas.clone();

    tokio::task::spawn_blocking(move || {
        supervisor::snapshot_file(
            folder_id, &abs_path, &rel_path, &config, &db, &cas, &app,
            true, "manual",
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No snapshot created".to_string())
}

#[tauri::command]
pub fn run_gc(state: State<AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    crate::snapshot::retention::gc(&conn, &state.cas).map_err(Into::into)
}

#[tauri::command]
pub fn set_file_override(
    file_id: i64,
    no_auto_snapshot: bool,
    state: State<AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::set_file_override(&conn, file_id, no_auto_snapshot).map_err(Into::into)
}

#[tauri::command]
pub fn set_path_override(
    folder_id: i64,
    path_prefix: String,
    no_auto_snapshot: bool,
    state: State<AppState>,
) -> Result<u64, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::set_path_override(&conn, folder_id, &path_prefix, no_auto_snapshot).map_err(Into::into)
}

#[tauri::command]
pub fn cleanup_orphaned_files(state: State<AppState>) -> Result<u64, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::cleanup_orphaned_files(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dedup_stats(state: State<AppState>) -> Result<repo::DedupStats, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::get_dedup_stats(&conn).map_err(|e| e.to_string())
}


#[tauri::command]
pub fn get_cas_size(state: State<AppState>) -> Result<u64, String> {
    Ok(state.cas.estimate_size_bytes())
}


#[tauri::command]
pub fn list_activity_log(
    folder_id: i64,
    limit: Option<u32>,
    state: State<AppState>,
) -> Result<Vec<repo::ActivityEntry>, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::list_activity_log(&conn, folder_id, limit.unwrap_or(200)).map_err(Into::into)
}


#[tauri::command]
pub fn run_integrity_check(state: State<AppState>) -> Result<repo::IntegrityResult, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    let mut result = repo::run_db_integrity_check(&conn).map_err(|e| e.to_string())?;

    let hashes: Vec<String> = {
        let mut stmt = conn.prepare("SELECT DISTINCT content_hash FROM snapshots").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    result.cas_checked = hashes.len() as u64;
    result.cas_missing = hashes.iter().filter(|h| !state.cas.exists(h)).count() as u64;
    Ok(result)
}


#[tauri::command]
pub fn get_storage_breakdown(folder_id: i64, state: State<AppState>) -> Result<Vec<repo::StorageEntry>, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::get_storage_breakdown(&conn, folder_id).map_err(Into::into)
}
