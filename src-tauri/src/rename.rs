use rusqlite::Connection;
use crate::db::repo;
use crate::error::AppError;
use crate::events::{emit_file_renamed, FileRenamed};
use tauri::AppHandle;


pub fn detect_and_handle(
    conn: &Connection,
    app: &AppHandle,
    folder_id: i64,
    new_rel_path: &str,
    hash: &str,
) -> Result<bool, AppError> {
    let existing = repo::get_file_by_hash(conn, hash)?;
    let Some(file) = existing else { return Ok(false); };


    if file.folder_id != folder_id || file.rel_path == new_rel_path {
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
