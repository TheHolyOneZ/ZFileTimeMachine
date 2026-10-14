use std::path::Path;
use rusqlite::Connection;
use crate::db::repo;
use crate::error::AppError;
use crate::events::{emit_file_renamed, FileRenamed};
use tauri::{AppHandle, Runtime};


pub fn detect_and_handle<R: Runtime>(
    conn: &Connection,
    app: &AppHandle<R>,
    folder_id: i64,
    root: &Path,
    new_rel_path: &str,
    hash: &str,
) -> Result<bool, AppError> {
    let existing = repo::get_file_by_hash(conn, hash)?;
    let Some(file) = existing else { return Ok(false); };


    if file.folder_id != folder_id || file.rel_path == new_rel_path {
        return Ok(false);
    }


    if root.join(&file.rel_path).exists() {
        return Ok(false);
    }
    if repo::get_file_by_path(conn, folder_id, new_rel_path)?.is_some() {
        return Ok(false);
    }

    let old_path = file.rel_path.clone();
    repo::insert_rename_event(conn, file.id, &old_path, new_rel_path)?;
    repo::rename_file(conn, file.id, new_rel_path)?;

    emit_file_renamed(app, FileRenamed {
        folder_id,
        file_id: file.id,
        old_path,
        new_path: new_rel_path.to_string(),
    });

    Ok(true)
}
