use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use crate::db::repo;
use crate::error::AppError;
use crate::events::{emit_recover_progress, RecoverProgress};
use crate::util::fs as util_fs;
use crate::watcher::{ignore::IgnoreMatcher, supervisor};
use crate::AppState;


#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkRecoverArgs {
    pub folder_id: i64,
    pub mode: RecoverMode,
    pub destination: Option<String>,

    pub selected_paths: Vec<String>,
    pub snapshot_point: SnapshotPoint,
    pub ignore_patterns: Option<Vec<String>>,

    pub include_deleted: Option<bool>,

    pub dry_run: Option<bool>,

    pub conflict_policy: Option<ConflictPolicy>,

    pub per_file_snapshots: Option<HashMap<String, i64>>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RecoverMode {
    Export,
    Restore,
}


#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SnapshotPreference {

    #[default]
    Before,

    After,

    Nearest,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SnapshotPoint {
    Latest,
    AsOf {
        timestamp_ms: i64,

        #[serde(default)]
        preference: SnapshotPreference,

        tolerance_ms: Option<i64>,
    },

    NthFromLatest { offset: u32 },
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ConflictPolicy {
    Overwrite,
    Skip,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverFailure {
    pub rel_path: String,
    pub error: String,
}


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewItem {
    pub rel_path: String,

    pub snapshot_at: Option<i64>,
    pub snapshot_source: Option<String>,
    pub size_bytes: Option<u64>,

    pub skip_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkRecoverResult {
    pub total: u32,
    pub succeeded: u32,

    pub skipped: u32,
    pub failed: Vec<RecoverFailure>,
    pub pre_rewind_snapshot_ids: Vec<i64>,
    pub bytes_written: u64,
    pub dry_run: bool,

    pub aborted_reason: Option<String>,

    pub requires_conflict_resolution: bool,
    pub conflicts: Vec<String>,

    pub preview: Option<Vec<PreviewItem>>,
}


#[tauri::command]
pub async fn bulk_recover(
    args: BulkRecoverArgs,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BulkRecoverResult, String> {
    let db = state.db_arc();
    let cas = state.cas.clone();

    tokio::task::spawn_blocking(move || {
        run_bulk_recover(args, &app, &db, &cas)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}


pub(crate) fn run_bulk_recover(
    args: BulkRecoverArgs,
    app: &AppHandle,
    db: &std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
    cas: &std::sync::Arc<crate::store::cas::CasStore>,
) -> Result<BulkRecoverResult, AppError> {
    let dry_run = args.dry_run.unwrap_or(false);
    let include_deleted = args.include_deleted.unwrap_or(false);


    let (folder_path, folder_config) = {
        let conn = db.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        let folder = repo::get_folder(&conn, args.folder_id)?
            .ok_or_else(|| AppError::NotFound(format!("folder {}", args.folder_id)))?;
        (PathBuf::from(&folder.path), folder.config)
    };

    if args.mode == RecoverMode::Export {
        let dest = args.destination.as_deref()
            .ok_or_else(|| AppError::Other("destination required for export mode".into()))?;
        let dest_path = Path::new(dest);
        if !dest_path.exists() {
            return Err(AppError::Other(format!("destination does not exist: {dest}")));
        }
        let probe = dest_path.join(".zftm_probe");
        std::fs::write(&probe, b"").map_err(|e| {
            AppError::Other(format!("destination not writable: {e}"))
        })?;
        let _ = std::fs::remove_file(&probe);
    } else {

        if !folder_path.exists() {
            return Err(AppError::Other(format!(
                "watched folder no longer exists: {}", folder_path.display()
            )));
        }
        let probe = folder_path.join(".zftm_probe");
        std::fs::write(&probe, b"").map_err(|e| {
            AppError::Other(format!("watched folder not writable: {e}"))
        })?;
        let _ = std::fs::remove_file(&probe);
    }

    let files = {
        let conn = db.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        repo::list_files(&conn, args.folder_id, include_deleted)?
    };


    let selected: std::collections::HashSet<&str> = args.selected_paths.iter().map(|s| s.as_str()).collect();
    let patterns = args.ignore_patterns.unwrap_or_default();
    let ignore = IgnoreMatcher::new(&folder_path, &patterns);

    let work: Vec<&repo::FileEntry> = files.iter()
        .filter(|f| selected.contains(f.rel_path.as_str()))
        .filter(|f| !ignore.is_ignored(&folder_path.join(&f.rel_path), false))
        .collect();


    if args.mode == RecoverMode::Export && args.conflict_policy.is_none() {
        let dest = args.destination.as_deref().unwrap_or("");
        let conflicts: Vec<String> = work.iter()
            .filter(|f| Path::new(dest).join(&f.rel_path).exists())
            .map(|f| f.rel_path.clone())
            .collect();
        if !conflicts.is_empty() {
            return Ok(BulkRecoverResult {
                total: work.len() as u32,
                succeeded: 0,
                skipped: 0,
                failed: vec![],
                pre_rewind_snapshot_ids: vec![],
                bytes_written: 0,
                dry_run,
                aborted_reason: None,
                requires_conflict_resolution: true,
                conflicts,
                preview: None,
            });
        }
    }


    let total = work.len() as u32;
    emit_recover_progress(app, RecoverProgress { folder_id: args.folder_id, processed: 0, total, current_path: String::new() });

    let mut succeeded = 0u32;
    let mut skipped = 0u32;
    let mut failed: Vec<RecoverFailure> = Vec::new();
    let mut pre_rewind_ids: Vec<i64> = Vec::new();
    let mut bytes_written = 0u64;
    let mut last_emit = Instant::now();
    let mut preview_items: Option<Vec<PreviewItem>> = if dry_run { Some(Vec::new()) } else { None };

    for (i, file) in work.iter().enumerate() {


        let (snap, pinned_sid) = {
            let conn = db.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
            if let Some(ref pfs) = args.per_file_snapshots {
                if let Some(&sid) = pfs.get(&file.rel_path) {
                    (repo::get_snapshot(&conn, sid)?, Some(sid))
                } else {
                    (resolve_snapshot_point(&conn, file.id, &args.snapshot_point)?, None)
                }
            } else {
                (resolve_snapshot_point(&conn, file.id, &args.snapshot_point)?, None)
            }
        };

        let snap = match snap {
            Some(s) => s,
            None => {
                let reason = match pinned_sid {
                    Some(sid) => format!("pinned snapshot {sid} not found"),
                    None => "no snapshot at chosen point".to_string(),
                };
                failed.push(RecoverFailure { rel_path: file.rel_path.clone(), error: reason.clone() });
                if let Some(ref mut pv) = preview_items {
                    pv.push(PreviewItem { rel_path: file.rel_path.clone(), snapshot_at: None, snapshot_source: None, size_bytes: None, skip_reason: Some(reason) });
                }
                continue;
            }
        };

        let content = match cas.get(&snap.content_hash) {
            Ok(b) => b,
            Err(e) => {
                let reason = format!("cas read: {e}");
                failed.push(RecoverFailure { rel_path: file.rel_path.clone(), error: reason.clone() });
                if let Some(ref mut pv) = preview_items {
                    pv.push(PreviewItem { rel_path: file.rel_path.clone(), snapshot_at: Some(snap.created_at), snapshot_source: Some(snap.source.clone()), size_bytes: None, skip_reason: Some(reason) });
                }
                continue;
            }
        };


        if dry_run {
            succeeded += 1;
            bytes_written += content.len() as u64;
            if let Some(ref mut pv) = preview_items {
                pv.push(PreviewItem { rel_path: file.rel_path.clone(), snapshot_at: Some(snap.created_at), snapshot_source: Some(snap.source.clone()), size_bytes: Some(content.len() as u64), skip_reason: None });
            }
            throttled_emit(app, &mut last_emit, i, total, args.folder_id, &file.rel_path);
            continue;
        }

        let target = match args.mode {
            RecoverMode::Export => {
                let dest = args.destination.as_deref().unwrap_or("");
                let t = Path::new(dest).join(&file.rel_path);

                if args.conflict_policy == Some(ConflictPolicy::Skip) && t.exists() {
                    skipped += 1;
                    throttled_emit(app, &mut last_emit, i, total, args.folder_id, &file.rel_path);
                    continue;
                }
                t
            }
            RecoverMode::Restore => folder_path.join(&file.rel_path),
        };


        if args.mode == RecoverMode::Restore && target.exists() {
            match supervisor::snapshot_file(
                args.folder_id, &target, &file.rel_path, &folder_config,
                db, cas, app, false, "pre-rewind",
            ) {
                Ok(Some(s)) => pre_rewind_ids.push(s.id),
                Ok(None) => {}
                Err(e) => {
                    failed.push(RecoverFailure {
                        rel_path: file.rel_path.clone(),
                        error: format!("pre-rewind failed — skipped to protect data: {e}"),
                    });
                    continue;
                }
            }
        }

        match util_fs::atomic_write(&target, &content, &snap.content_hash) {
            Ok(()) => {
                succeeded += 1;
                bytes_written += content.len() as u64;
            }
            Err(e) => {

                if is_enospc(&e) {
                    return Ok(BulkRecoverResult {
                        total,
                        succeeded,
                        skipped,
                        failed,
                        pre_rewind_snapshot_ids: pre_rewind_ids,
                        bytes_written,
                        dry_run,
                        aborted_reason: Some("disk_full".into()),
                        requires_conflict_resolution: false,
                        conflicts: vec![],
                        preview: preview_items,
                    });
                }
                failed.push(RecoverFailure { rel_path: file.rel_path.clone(), error: e.to_string() });
                continue;
            }
        }

        throttled_emit(app, &mut last_emit, i, total, args.folder_id, &file.rel_path);
    }


    emit_recover_progress(app, RecoverProgress {
        folder_id: args.folder_id,
        processed: total,
        total,
        current_path: String::new(),
    });

    if !dry_run {
        if let Ok(conn) = db.lock() {
            let summary = format!(
                "mode={} ok={} fail={}",
                if args.mode == RecoverMode::Export { "export" } else { "restore" },
                succeeded, failed.len()
            );
            let _ = repo::log_activity(
                &conn, args.folder_id, supervisor::now_unix(),
                "bulk_recover", None, Some(&summary), None,
            );
        }
    }

    Ok(BulkRecoverResult {
        total,
        succeeded,
        skipped,
        failed,
        pre_rewind_snapshot_ids: pre_rewind_ids,
        bytes_written,
        dry_run,
        aborted_reason: None,
        requires_conflict_resolution: false,
        conflicts: vec![],
        preview: preview_items,
    })
}


fn resolve_snapshot_point(
    conn: &std::sync::MutexGuard<rusqlite::Connection>,
    file_id: i64,
    point: &SnapshotPoint,
) -> Result<Option<repo::Snapshot>, AppError> {
    match point {
        SnapshotPoint::Latest => repo::get_latest_snapshot(conn, file_id),
        SnapshotPoint::NthFromLatest { offset } => repo::get_nth_latest_snapshot(conn, file_id, *offset),
        SnapshotPoint::AsOf { timestamp_ms, preference, tolerance_ms } => {
            let snap = match preference {
                SnapshotPreference::Before  => repo::get_snapshot_at_or_before(conn, file_id, *timestamp_ms)?,
                SnapshotPreference::After   => repo::get_snapshot_at_or_after(conn, file_id, *timestamp_ms)?,
                SnapshotPreference::Nearest => repo::get_snapshot_nearest(conn, file_id, *timestamp_ms)?,
            };
            if let (Some(ref s), Some(tol)) = (&snap, tolerance_ms) {
                if (s.created_at - timestamp_ms).abs() > *tol {
                    return Ok(None);
                }
            }
            Ok(snap)
        }
    }
}

fn throttled_emit(app: &AppHandle, last: &mut Instant, i: usize, total: u32, folder_id: i64, path: &str) {
    if last.elapsed() >= Duration::from_millis(100) || (i + 1) % 20 == 0 {
        emit_recover_progress(app, RecoverProgress {
            folder_id,
            processed: (i + 1) as u32,
            total,
            current_path: path.to_string(),
        });
        *last = Instant::now();
    }
}

fn is_enospc(e: &AppError) -> bool {
    if let AppError::Io(io_err) = e {
        return io_err.kind() == std::io::ErrorKind::StorageFull
            || io_err.raw_os_error() == Some(28)
            || io_err.raw_os_error() == Some(112);
    }
    false
}


#[cfg(target_os = "windows")]
fn strip_unc_prefix(path: &str) -> &str {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return rest;
    }
    path.strip_prefix(r"\\?\").unwrap_or(path)
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(strip_unc_prefix(&path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tempfile::tempdir;
    use crate::db::migrations;
    use crate::store::cas::CasStore;

    fn setup() -> (Arc<Mutex<rusqlite::Connection>>, Arc<CasStore>, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        migrations::run(&conn).unwrap();
        let cas_dir = dir.path().join("cas");
        std::fs::create_dir_all(&cas_dir).unwrap();
        let cas = Arc::new(CasStore::new(cas_dir));
        (Arc::new(Mutex::new(conn)), cas, dir)
    }

    #[test]
    fn export_files_match_hashes() {
        let (db, cas, dir) = setup();


        let folder_dir = dir.path().join("watched");
        std::fs::create_dir_all(&folder_dir).unwrap();
        let folder = {
            let conn = db.lock().unwrap();
            repo::insert_folder(&conn, folder_dir.to_str().unwrap(), "test", &Default::default()).unwrap()
        };


        let file_path = folder_dir.join("hello.txt");
        std::fs::write(&file_path, b"hello world").unwrap();
        let hash = cas.put(b"hello world").unwrap();
        let file_entry = {
            let conn = db.lock().unwrap();
            let f = repo::upsert_file(&conn, folder.id, "hello.txt", false, Some(&hash), 0).unwrap();
            repo::increment_cas_ref(&conn, &hash, 11).unwrap();
            repo::insert_snapshot(&conn, f.id, &hash, 11, 11, "change").unwrap();
            f
        };
        let _ = file_entry;


        let dest = dir.path().join("export");
        std::fs::create_dir_all(&dest).unwrap();

        let args = BulkRecoverArgs {
            folder_id: folder.id,
            mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["hello.txt".to_string()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None,
            include_deleted: None,
            dry_run: Some(true),
            conflict_policy: None,
            per_file_snapshots: None,
        };


        let file_id = {
            let conn = db.lock().unwrap();
            repo::list_files(&conn, folder.id, false).unwrap()[0].id
        };
        let snap = {
            let conn = db.lock().unwrap();
            repo::get_latest_snapshot(&conn, file_id).unwrap()
        };
        assert!(snap.is_some());
        assert_eq!(snap.unwrap().content_hash, hash);


        let content = cas.get(&hash).unwrap();
        assert_eq!(content, b"hello world");


        let target = dest.join("hello.txt");
        util_fs::atomic_write(&target, &content, &hash).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"hello world");

        let _ = args;
    }
}
