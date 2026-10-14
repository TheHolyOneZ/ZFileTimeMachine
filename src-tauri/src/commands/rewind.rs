use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use crate::store::cas::CasStore;
use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};
use crate::db::repo;
use crate::diff::{self, DiffResult};
use crate::util::fs as util_fs;
use crate::watcher::supervisor;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewindResult {
    pub pre_rewind_snapshot_id: Option<i64>,
    pub restored_snapshot_id: i64,
}

#[tauri::command]
pub fn preview_diff(
    snapshot_id: i64,
    against_current: bool,
    state: State<AppState>,
) -> Result<DiffResult, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;

    let snapshot = repo::get_snapshot(&conn, snapshot_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Snapshot {snapshot_id} not found"))?;

    let file = repo::get_file_by_id(&conn, snapshot.file_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "File record not found".to_string())?;

    let snapshot_data = state.cas.get(&snapshot.content_hash).map_err(|e| e.to_string())?;

    let compare_data: Vec<u8> = if against_current {
        let folder = repo::get_folder(&conn, file.folder_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Folder not found".to_string())?;
        let abs = PathBuf::from(&folder.path).join(&file.rel_path);

        std::fs::read(&abs).unwrap_or_default()
    } else {
        let snapshots = repo::list_snapshots(&conn, snapshot.file_id)
            .map_err(|e| e.to_string())?;
        let pos = snapshots.iter().position(|s| s.id == snapshot_id);
        match pos.and_then(|i| snapshots.get(i + 1)) {
            Some(prev) => state.cas.get(&prev.content_hash).unwrap_or_default(),
            None => vec![],
        }
    };


    Ok(diff::compute(&compare_data, &snapshot_data))
}


pub fn write_snapshot_to_disk(
    db: &Arc<Mutex<Connection>>,
    cas: &CasStore,
    file_id: i64,
    abs_path: &Path,
    snapshot_hash: &str,
) -> Result<(), String> {
    let content = cas.get(snapshot_hash).map_err(|e| e.to_string())?;
    util_fs::atomic_write(abs_path, &content, snapshot_hash).map_err(|e| e.to_string())?;

    let conn = db.lock().map_err(|_| "db lock poisoned")?;
    repo::mark_file_restored(&conn, file_id, snapshot_hash, util_fs::mtime_millis(abs_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rewind_to(
    snapshot_id: i64,
    auto_save_current: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RewindResult, String> {
    let (abs_path, rel_path, snapshot_hash, config, folder_id, file_id) = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;

        let snapshot = repo::get_snapshot(&conn, snapshot_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Snapshot {snapshot_id} not found"))?;

        let file = repo::get_file_by_id(&conn, snapshot.file_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "File not found".to_string())?;

        let folder = repo::get_folder(&conn, file.folder_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Folder not found".to_string())?;

        let abs = PathBuf::from(&folder.path).join(&file.rel_path);
        (abs, file.rel_path.clone(), snapshot.content_hash.clone(), folder.config, file.folder_id, file.id)
    };

    let db = state.db_arc();
    let cas = state.cas.clone();

    tokio::task::spawn_blocking(move || -> Result<RewindResult, String> {

        let pre_rewind_snapshot_id = if auto_save_current && abs_path.exists() {
            match supervisor::snapshot_file(
                folder_id, &abs_path, &rel_path, &config, &db, &cas, &app,
                false, "pre-rewind",
            ) {
                Ok(Some(snap)) => Some(snap.id),
                _ => None,
            }
        } else {
            None
        };


        write_snapshot_to_disk(&db, &cas, file_id, &abs_path, &snapshot_hash)?;
        let _ = app.emit("file:restored", serde_json::json!({
            "folderId": folder_id,
            "fileId": file_id,
            "relPath": rel_path,
        }));

        Ok(RewindResult {
            pre_rewind_snapshot_id,
            restored_snapshot_id: snapshot_id,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
