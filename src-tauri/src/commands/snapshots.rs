use std::path::PathBuf;
use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, State};
use crate::db::repo::{self, FileEntry, Snapshot};
use crate::store::cas::CasStore;
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


#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotLineStats {
    pub snapshot_id: i64,
    pub added: Option<u32>,
    pub removed: Option<u32>,
}

pub fn compute_line_stats(cas: &CasStore, newest_first: &[Snapshot]) -> Vec<SnapshotLineStats> {
    let mut out = Vec::with_capacity(newest_first.len());
    let mut previous: Option<(String, Option<Vec<u8>>)> = None;
    for snap in newest_first.iter().rev() {
        let stats = match &previous {
            Some((hash, _)) if *hash == snap.content_hash => Some((0, 0)),
            _ => {
                let current = cas.get(&snap.content_hash).ok();
                let stats = match (&current, &previous) {
                    (Some(new), Some((_, Some(old)))) => crate::diff::line_stats(old, new),
                    (Some(new), None) => crate::diff::line_stats(&[], new),
                    _ => None,
                };
                previous = Some((snap.content_hash.clone(), current));
                stats
            }
        };
        out.push(SnapshotLineStats {
            snapshot_id: snap.id,
            added: stats.map(|s| s.0),
            removed: stats.map(|s| s.1),
        });
    }
    out.reverse();
    out
}

#[tauri::command]
pub async fn snapshot_line_stats(file_id: i64, state: State<'_, AppState>) -> Result<Vec<SnapshotLineStats>, String> {
    let snapshots = {
        let conn = state.db.lock().map_err(|_| "db lock poisoned")?;
        repo::list_snapshots(&conn, file_id).map_err(|e| e.to_string())?
    };
    let cas: Arc<CasStore> = state.cas.clone();
    tokio::task::spawn_blocking(move || compute_line_stats(&cas, &snapshots))
        .await
        .map_err(|e| e.to_string())
}

pub fn image_mime(rel_path: &str) -> Option<&'static str> {
    let ext = std::path::Path::new(rel_path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

const MAX_PREVIEW_BYTES: usize = 40 * 1024 * 1024;

pub fn snapshot_image_response(state: Option<&AppState>, path: &str) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::{header, Response, StatusCode};
    let fail = |status: StatusCode| Response::builder().status(status).body(Vec::new()).unwrap_or_default();
    let Some(state) = state else { return fail(StatusCode::SERVICE_UNAVAILABLE) };
    let Ok(snapshot_id) = path.trim_matches('/').parse::<i64>() else { return fail(StatusCode::BAD_REQUEST) };
    let lookup = {
        let Ok(conn) = state.db.lock() else { return fail(StatusCode::INTERNAL_SERVER_ERROR) };
        repo::get_snapshot(&conn, snapshot_id).ok().flatten().and_then(|snap| {
            repo::get_file_by_id(&conn, snap.file_id).ok().flatten().map(|file| (snap, file))
        })
    };
    let Some((snap, file)) = lookup else { return fail(StatusCode::NOT_FOUND) };
    let Some(mime) = image_mime(&file.rel_path) else { return fail(StatusCode::UNSUPPORTED_MEDIA_TYPE) };
    if snap.size_bytes as usize > MAX_PREVIEW_BYTES {
        return fail(StatusCode::PAYLOAD_TOO_LARGE);
    }
    match state.cas.get(&snap.content_hash) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
            .header("X-Content-Type-Options", "nosniff")
            .body(bytes)
            .unwrap_or_default(),
        Err(_) => fail(StatusCode::NOT_FOUND),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(id: i64, hash: &str) -> Snapshot {
        Snapshot {
            id, file_id: 1, content_hash: hash.to_string(), size_bytes: 0, delta_bytes: 0,
            source: "change".into(), created_at: id, note: None,
        }
    }

    #[test]
    fn line_stats_compare_each_version_with_the_one_before() {
        let dir = tempfile::tempdir().unwrap();
        let cas = CasStore::new(dir.path().to_path_buf());
        let h1 = cas.put(b"a\nb\n").unwrap();
        let h2 = cas.put(b"a\nb\nc\n").unwrap();
        let h3 = cas.put(b"a\nc\n").unwrap();
        let newest_first = vec![snap(4, &h3), snap(3, &h3), snap(2, &h2), snap(1, &h1)];
        let stats = compute_line_stats(&cas, &newest_first);
        let got: Vec<(i64, Option<u32>, Option<u32>)> = stats.iter().map(|s| (s.snapshot_id, s.added, s.removed)).collect();
        assert_eq!(got, vec![(4, Some(0), Some(0)), (3, Some(0), Some(1)), (2, Some(1), Some(0)), (1, Some(2), Some(0))]);
    }

    #[test]
    fn missing_or_binary_content_has_no_stats() {
        let dir = tempfile::tempdir().unwrap();
        let cas = CasStore::new(dir.path().to_path_buf());
        let bin = cas.put(b"\0\x01binary").unwrap();
        let stats = compute_line_stats(&cas, &[snap(2, "missing"), snap(1, &bin)]);
        assert!(stats.iter().all(|s| s.added.is_none() && s.removed.is_none()));
    }

    #[test]
    fn only_images_are_previewable() {
        assert_eq!(image_mime("photos/Harbor.JPG"), Some("image/jpeg"));
        assert_eq!(image_mime("logo.svg"), Some("image/svg+xml"));
        assert_eq!(image_mime("notes.txt"), None);
        assert_eq!(image_mime("Makefile"), None);
        assert_eq!(image_mime("assets.png/readme"), None);
        assert_eq!(image_mime("png"), None);
    }
}
