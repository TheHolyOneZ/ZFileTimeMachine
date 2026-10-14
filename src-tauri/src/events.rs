use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Clone, Serialize)]
pub struct SnapshotCreated {
    pub folder_id: i64,
    pub file_id: i64,
    pub snapshot_id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileRenamed {
    pub folder_id: i64,
    pub file_id: i64,
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FolderScanProgress {
    pub folder_id: i64,
    pub scanned: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SnapshotSkipped {
    pub folder_id: i64,
    pub rel_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorOccurred {
    pub code: String,
    pub message: String,
    pub context: String,
}

pub fn emit_snapshot_created<R: Runtime>(app: &AppHandle<R>, payload: SnapshotCreated) {
    let _ = app.emit("snapshot:created", payload);
}

pub fn emit_file_renamed<R: Runtime>(app: &AppHandle<R>, payload: FileRenamed) {
    let _ = app.emit("file:renamed", payload);
}

pub fn emit_scan_progress<R: Runtime>(app: &AppHandle<R>, payload: FolderScanProgress) {
    let _ = app.emit("folder:scan-progress", payload);
}

pub fn emit_snapshot_skipped<R: Runtime>(app: &AppHandle<R>, payload: SnapshotSkipped) {
    let _ = app.emit("snapshot:skipped", payload);
}

pub fn emit_error<R: Runtime>(app: &AppHandle<R>, payload: ErrorOccurred) {
    let _ = app.emit("error:occurred", payload);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageWarning {
    pub used_bytes: u64,
    pub cap_bytes: u64,
    pub percent: u8,
}

pub fn emit_storage_warning<R: Runtime>(app: &AppHandle<R>, payload: StorageWarning) {
    let _ = app.emit("storage:warning", payload);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverProgress {
    pub folder_id: i64,
    pub processed: u32,
    pub total: u32,
    pub current_path: String,
}

pub fn emit_recover_progress<R: Runtime>(app: &AppHandle<R>, payload: RecoverProgress) {
    let _ = app.emit("recover:progress", payload);
}
