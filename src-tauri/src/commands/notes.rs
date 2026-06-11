use tauri::State;
use crate::db::repo::{self, NoteHit};
use crate::AppState;

#[tauri::command]
pub fn set_file_note(id: i64, note: Option<String>, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::set_file_note(&conn, id, note.as_deref()).map_err(Into::into)
}

#[tauri::command]
pub fn set_snapshot_note(id: i64, note: Option<String>, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::set_snapshot_note(&conn, id, note.as_deref()).map_err(Into::into)
}

#[tauri::command]
pub fn search_notes(folder_id: i64, query: String, state: State<AppState>) -> Result<Vec<NoteHit>, String> {
    let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
    repo::search_notes(&conn, folder_id, &query).map_err(Into::into)
}
