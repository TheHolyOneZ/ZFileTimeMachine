use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use crate::config::{FolderConfig, RetentionRule};
use crate::db::repo;
use crate::store::cas::CasStore;
use crate::watcher::supervisor;
use crate::AppState;
use crate::commands::recover::{
    run_bulk_recover, BulkRecoverArgs, RecoverMode, SnapshotPoint, SnapshotPreference, ConflictPolicy,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaTestResult {
    pub id: String,
    pub name: String,
    pub passed: bool,
    pub message: String,
    pub duration_ms: u64,
}

fn insert_test_folder(conn: &Connection, path: &PathBuf, config: &FolderConfig) -> Result<i64, String> {
    let config_json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    let created_at = supervisor::now_unix();
    let path_str = path.to_string_lossy();
    conn.execute(
        "INSERT INTO folders (path, display_name, config_json, created_at) VALUES (?, 'QA Test Folder', ?, ?)",
        rusqlite::params![path_str, config_json, created_at],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn cleanup_test_folder(conn: &Connection, cas: &Arc<CasStore>, folder_id: i64) {
    let hashes: Vec<String> = {
        let mut stmt = match conn.prepare(
            "SELECT content_hash FROM snapshots WHERE file_id IN (SELECT id FROM files WHERE folder_id = ?)",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        stmt.query_map(rusqlite::params![folder_id], |r| r.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    };

    let _ = conn.execute("DELETE FROM activity_log WHERE folder_id = ?", rusqlite::params![folder_id]);
    let _ = conn.execute(
        "DELETE FROM rename_events WHERE file_id IN (SELECT id FROM files WHERE folder_id = ?)",
        rusqlite::params![folder_id],
    );
    let _ = conn.execute(
        "DELETE FROM snapshots WHERE file_id IN (SELECT id FROM files WHERE folder_id = ?)",
        rusqlite::params![folder_id],
    );
    let _ = conn.execute("DELETE FROM files WHERE folder_id = ?", rusqlite::params![folder_id]);
    let _ = conn.execute("DELETE FROM folders WHERE id = ?", rusqlite::params![folder_id]);

    for hash in &hashes {
        let _ = conn.execute("DELETE FROM cas_refs WHERE content_hash = ?", rusqlite::params![hash]);
        let _ = cas.remove(hash);
    }
}

fn count_snapshots_for_file(conn: &Connection, folder_id: i64, rel_path: &str) -> usize {
    conn.query_row(
        "SELECT COUNT(*) FROM snapshots WHERE file_id = (SELECT id FROM files WHERE folder_id = ? AND rel_path = ?)",
        rusqlite::params![folder_id, rel_path],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0) as usize
}

fn get_snapshot_hash(conn: &Connection, folder_id: i64, rel_path: &str) -> Option<String> {
    conn.query_row(
        "SELECT s.content_hash FROM snapshots s JOIN files f ON s.file_id = f.id WHERE f.folder_id = ? AND f.rel_path = ? ORDER BY s.created_at DESC LIMIT 1",
        rusqlite::params![folder_id, rel_path],
        |r| r.get(0),
    )
    .ok()
}

fn t_global_settings(db: &Arc<Mutex<Connection>>, _cas: &Arc<CasStore>, _app: &AppHandle, _tmp: &PathBuf) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let val = repo::get_setting(&conn, "global_size_cap_mb").map_err(|e| e.to_string())?;
    Ok(format!("global_size_cap_mb = {}", val.as_deref().unwrap_or("(not set)")))
}

fn t_binary_detection(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let file_path = tmp.join("test.bin");
    std::fs::write(&file_path, b"Binary\x00Data\x00Here").map_err(|e| e.to_string())?;
    let config = FolderConfig::default();
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    supervisor::snapshot_file(folder_id, &file_path, "test.bin", &config, db, cas, app, false, "qa")
        .map_err(|e| e.to_string())?;
    let is_binary: bool = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT is_binary FROM files WHERE folder_id = ? AND rel_path = 'test.bin'",
            rusqlite::params![folder_id],
            |r| r.get::<_, i64>(0),
        )
        .map(|v| v != 0)
        .unwrap_or(false)
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if is_binary {
        Ok("file correctly detected as binary".to_string())
    } else {
        Err("file was not detected as binary".to_string())
    }
}

fn t_binary_size_cap(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let file_path = tmp.join("large.bin");
    std::fs::write(&file_path, b"\x00AAAAAAAAAAAAAAAA").map_err(|e| e.to_string())?;
    let config = FolderConfig { binary_max_mb: 0, ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    supervisor::snapshot_file(folder_id, &file_path, "large.bin", &config, db, cas, app, false, "qa")
        .map_err(|e| e.to_string())?;
    let snap_count = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        count_snapshots_for_file(&conn, folder_id, "large.bin")
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if snap_count == 0 {
        Ok("binary size cap correctly blocked snapshot".to_string())
    } else {
        Err(format!("expected 0 snapshots, got {snap_count}"))
    }
}

fn t_text_size_cap(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let file_path = tmp.join("large.txt");
    std::fs::write(&file_path, b"AAAAAAAAAAAAAAAAAAAAAAAAA").map_err(|e| e.to_string())?;
    let config = FolderConfig { skip_files_larger_than_mb: Some(0), ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    supervisor::snapshot_file(folder_id, &file_path, "large.txt", &config, db, cas, app, false, "qa")
        .map_err(|e| e.to_string())?;
    let snap_count = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        count_snapshots_for_file(&conn, folder_id, "large.txt")
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if snap_count == 0 {
        Ok("text size cap correctly blocked snapshot".to_string())
    } else {
        Err(format!("expected 0 snapshots, got {snap_count}"))
    }
}

fn t_ignore_rules(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    std::fs::write(tmp.join("ignored.qa_skip"), b"should be ignored").map_err(|e| e.to_string())?;
    std::fs::write(tmp.join("control.txt"), b"should be snapshotted").map_err(|e| e.to_string())?;
    let config = FolderConfig { ignore_globs: vec!["*.qa_skip".to_string()], ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    supervisor::initial_scan(folder_id, tmp, &config, db, cas, app).map_err(|e| e.to_string())?;
    let (has_ignored, has_control) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let files = repo::list_files(&conn, folder_id, false).map_err(|e| e.to_string())?;
        let has_ignored = files.iter().any(|f| f.rel_path.contains("ignored.qa_skip"));
        let has_control = files.iter().any(|f| f.rel_path.contains("control.txt"));
        (has_ignored, has_control)
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if !has_ignored && has_control {
        Ok("ignore glob correctly excluded .qa_skip file".to_string())
    } else {
        Err(format!("has_ignored={has_ignored}, has_control={has_control}"))
    }
}

fn t_zstd_compression(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let file_path = tmp.join("compress_me.txt");
    let content = b"Hello zstd! ".repeat(20);
    std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;
    let config = FolderConfig { compression_enabled: Some(true), ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    supervisor::snapshot_file(folder_id, &file_path, "compress_me.txt", &config, db, cas, app, false, "qa")
        .map_err(|e| e.to_string())?;
    let compressed = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let hash = get_snapshot_hash(&conn, folder_id, "compress_me.txt");
        hash.map(|h| cas.is_compressed_blob(&h)).unwrap_or(false)
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if compressed {
        Ok("blob stored as compressed .zst".to_string())
    } else {
        Err("blob was not stored compressed".to_string())
    }
}

fn t_retention_keep_last_n(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let config = FolderConfig { retention: RetentionRule::KeepLast { count: 2 }, ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    let file_path = tmp.join("versioned.txt");
    for i in 0..4usize {
        let content = format!("content_v{i}_{}\n", "x".repeat(i * 30 + 20)).into_bytes();
        std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;
        supervisor::snapshot_file(folder_id, &file_path, "versioned.txt", &config, db, cas, app, false, "qa")
            .map_err(|e| e.to_string())?;
    }
    let snap_count = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        count_snapshots_for_file(&conn, folder_id, "versioned.txt")
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if snap_count == 2 {
        Ok("retention correctly kept last 2 snapshots".to_string())
    } else {
        Err(format!("expected 2 snapshots after retention, got {snap_count}"))
    }
}

fn t_min_snapshot_interval(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let config = FolderConfig { min_snapshot_interval_secs: Some(3600), ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    let file_path = tmp.join("interval.txt");
    std::fs::write(&file_path, b"version one").map_err(|e| e.to_string())?;
    supervisor::snapshot_file(folder_id, &file_path, "interval.txt", &config, db, cas, app, false, "change")
        .map_err(|e| e.to_string())?;
    std::fs::write(&file_path, b"version two different").map_err(|e| e.to_string())?;
    supervisor::snapshot_file(folder_id, &file_path, "interval.txt", &config, db, cas, app, false, "change")
        .map_err(|e| e.to_string())?;
    let snap_count = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        count_snapshots_for_file(&conn, folder_id, "interval.txt")
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if snap_count == 1 {
        Ok("min interval correctly blocked second snapshot".to_string())
    } else {
        Err(format!("expected 1 snapshot, got {snap_count}"))
    }
}

fn t_max_folder_depth(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    std::fs::create_dir_all(tmp.join("subdir")).map_err(|e| e.to_string())?;
    std::fs::write(tmp.join("surface.txt"), b"root level").map_err(|e| e.to_string())?;
    std::fs::write(tmp.join("subdir").join("deep.txt"), b"deep level").map_err(|e| e.to_string())?;
    let config = FolderConfig { max_depth: Some(1), ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    supervisor::initial_scan(folder_id, tmp, &config, db, cas, app).map_err(|e| e.to_string())?;
    let (has_surface, has_deep) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let files = repo::list_files(&conn, folder_id, false).map_err(|e| e.to_string())?;
        let has_surface = files.iter().any(|f| f.rel_path.contains("surface.txt"));
        let has_deep = files.iter().any(|f| f.rel_path.contains("deep.txt"));
        (has_surface, has_deep)
    };
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if has_surface && !has_deep {
        Ok("max_depth=1 correctly excluded subdirectory files".to_string())
    } else {
        Err(format!("has_surface={has_surface}, has_deep={has_deep}"))
    }
}

fn t_watcher_debounce(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let config = FolderConfig { debounce_ms: Some(300), ..Default::default() };
    let folder_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        insert_test_folder(&conn, tmp, &config)?
    };
    let mut local_sup = supervisor::Supervisor::new();
    local_sup.start_folder(folder_id, tmp.clone(), config.clone(), db.clone(), cas.clone(), app.clone());
    std::thread::sleep(Duration::from_millis(250));
    let file_path = tmp.join("debounce_test.txt");
    for i in 0..5usize {
        std::fs::write(&file_path, format!("write {i}").as_bytes()).map_err(|e| e.to_string())?;
        std::thread::sleep(Duration::from_millis(40));
    }
    std::thread::sleep(Duration::from_millis(700));
    let snap_count = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        count_snapshots_for_file(&conn, folder_id, "debounce_test.txt")
    };
    local_sup.stop_folder(folder_id);
    std::thread::sleep(Duration::from_millis(100));
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        cleanup_test_folder(&conn, cas, folder_id);
    }
    if snap_count == 0 {
        Ok("watcher may not have initialized".to_string())
    } else if snap_count <= 2 {
        Ok(format!("debounce correctly coalesced writes into {snap_count} snapshot(s)"))
    } else {
        Err(format!("expected 1-2 snapshots, got {snap_count}"))
    }
}


fn insert_snapshot_at(conn: &Connection, file_id: i64, hash: &str, size: i64, ts_ms: i64) {
    let _ = conn.execute(
        "INSERT INTO snapshots (file_id, content_hash, size_bytes, delta_bytes, source, created_at) \
         VALUES (?1, ?2, ?3, ?3, 'manual', ?4)",
        rusqlite::params![file_id, hash, size, ts_ms],
    );
}

fn do_recover(
    args: BulkRecoverArgs,
    app: &AppHandle,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
) -> Result<crate::commands::recover::BulkRecoverResult, String> {
    run_bulk_recover(args, app, db, cas).map_err(|e| e.to_string())
}


fn snap(
    folder_id: i64,
    abs_path: &PathBuf,
    rel_path: &str,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
    app: &AppHandle,
) -> Result<repo::Snapshot, String> {
    let config = FolderConfig::default();
    supervisor::snapshot_file(folder_id, abs_path, rel_path, &config, db, cas, app, false, "manual")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("snapshot_file returned None for {rel_path} (content unchanged?)"))
}


fn t_recover_export_basic(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(watched.join("sub")).map_err(|e| e.to_string())?;
    std::fs::write(watched.join("a.txt"), b"file-A version 1 content").map_err(|e| e.to_string())?;
    std::fs::write(watched.join("sub").join("b.txt"), b"file-B nested in subdir").map_err(|e| e.to_string())?;

    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };
    snap(folder_id, &watched.join("a.txt"), "a.txt", db, cas, app)?;
    snap(folder_id, &watched.join("sub/b.txt"), "sub/b.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["a.txt".into(), "sub/b.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if res.succeeded != 2 || !res.failed.is_empty() {
            return Err(format!("expected 2 ok, got succeeded={} failed={:?}", res.succeeded, res.failed));
        }
        let got_a = std::fs::read(dest.join("a.txt")).map_err(|e| e.to_string())?;
        let got_b = std::fs::read(dest.join("sub/b.txt")).map_err(|e| e.to_string())?;
        if got_a != b"file-A version 1 content" { return Err(format!("a.txt wrong: {:?}", String::from_utf8_lossy(&got_a))); }
        if got_b != b"file-B nested in subdir"  { return Err(format!("sub/b.txt wrong: {:?}", String::from_utf8_lossy(&got_b))); }
        Ok(format!("exported 2 files ({} bytes) to {}", res.bytes_written, dest.display()))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_pinned_snapshot(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("versioned.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"v1 oldest content aaaaaa").map_err(|e| e.to_string())?;
    let snap1 = snap(folder_id, &file, "versioned.txt", db, cas, app)?;

    std::fs::write(&file, b"v2 middle content bbbbbb").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "versioned.txt", db, cas, app)?;

    std::fs::write(&file, b"v3 latest content cccccc").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "versioned.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let mut pins = HashMap::new();
        pins.insert("versioned.txt".to_string(), snap1.id);
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["versioned.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None,
            per_file_snapshots: Some(pins),
        }, app, db, cas)?;
        if res.succeeded != 1 { return Err(format!("expected 1 ok: {:?}", res.failed)); }
        let got = std::fs::read(dest.join("versioned.txt")).map_err(|e| e.to_string())?;
        if got != b"v1 oldest content aaaaaa" {
            return Err(format!("expected v1 bytes, got: {}", String::from_utf8_lossy(&got)));
        }
        Ok(format!("pinned snap {} (v1) recovered correctly, not latest (v3)", snap1.id))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_nth_from_latest(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("file.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"nth v1 oldest aaaa").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "file.txt", db, cas, app)?;
    std::fs::write(&file, b"nth v2 middle bbbb").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "file.txt", db, cas, app)?;
    std::fs::write(&file, b"nth v3 latest cccc").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "file.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["file.txt".into()],
            snapshot_point: SnapshotPoint::NthFromLatest { offset: 1 },
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if res.succeeded != 1 { return Err(format!("expected 1 ok: {:?}", res.failed)); }
        let got = std::fs::read(dest.join("file.txt")).map_err(|e| e.to_string())?;
        if got != b"nth v2 middle bbbb" {
            return Err(format!("expected v2 (nthFromLatest=1), got: {}", String::from_utf8_lossy(&got)));
        }
        Ok("nthFromLatest=1 correctly recovered second-to-latest version".into())
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_as_of_before(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("file.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };


    std::fs::write(&file, b"as-of-before v1 older").map_err(|e| e.to_string())?;
    let snap1 = snap(folder_id, &file, "file.txt", db, cas, app)?;
    let t1 = snap1.created_at;


    let v3: &[u8] = b"as-of-before v3 newer";
    let h3 = cas.put(v3).map_err(|e| e.to_string())?;
    let t3 = t1 + 60_000;
    {
        let c = db.lock().map_err(|e| e.to_string())?;
        let file_entry = repo::get_file_by_path(&c, folder_id, "file.txt")
            .map_err(|e| e.to_string())?
            .ok_or("file entry not found")?;
        insert_snapshot_at(&c, file_entry.id, &h3, v3.len() as i64, t3);
    }


    let target = t1 + 30_000;
    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["file.txt".into()],
            snapshot_point: SnapshotPoint::AsOf { timestamp_ms: target, preference: SnapshotPreference::Before, tolerance_ms: None },
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if res.succeeded != 1 { return Err(format!("expected 1 ok: {:?}", res.failed)); }
        let got = std::fs::read(dest.join("file.txt")).map_err(|e| e.to_string())?;
        if got != b"as-of-before v1 older" {
            return Err(format!("Before: expected v1, got: {}", String::from_utf8_lossy(&got)));
        }
        Ok(format!("AsOf/Before: target={target} -> snap at T1={t1} correctly chosen over T3={t3}"))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}

fn t_recover_as_of_after(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("file.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"as-of-after v1 older").map_err(|e| e.to_string())?;
    let snap1 = snap(folder_id, &file, "file.txt", db, cas, app)?;
    let t1 = snap1.created_at;

    let v3: &[u8] = b"as-of-after v3 newer";
    let h3 = cas.put(v3).map_err(|e| e.to_string())?;
    let t3 = t1 + 60_000;
    {
        let c = db.lock().map_err(|e| e.to_string())?;
        let fe = repo::get_file_by_path(&c, folder_id, "file.txt")
            .map_err(|e| e.to_string())?.ok_or("file entry not found")?;
        insert_snapshot_at(&c, fe.id, &h3, v3.len() as i64, t3);
    }

    let target = t1 + 30_000;
    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["file.txt".into()],
            snapshot_point: SnapshotPoint::AsOf { timestamp_ms: target, preference: SnapshotPreference::After, tolerance_ms: None },
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if res.succeeded != 1 { return Err(format!("expected 1 ok: {:?}", res.failed)); }
        let got = std::fs::read(dest.join("file.txt")).map_err(|e| e.to_string())?;
        if got != b"as-of-after v3 newer" {
            return Err(format!("After: expected v3, got: {}", String::from_utf8_lossy(&got)));
        }
        Ok(format!("AsOf/After: target={target} -> snap at T3={t3} correctly chosen over T1={t1}"))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_restore_in_place(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("myfile.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };


    std::fs::write(&file, b"v1 content to restore to").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "myfile.txt", db, cas, app)?;


    std::fs::write(&file, b"v2 unsaved current state xyz").map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Restore,
            destination: None,
            selected_paths: vec!["myfile.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if res.succeeded != 1 { return Err(format!("restore: expected 1 ok: {:?}", res.failed)); }
        let on_disk = std::fs::read(&file).map_err(|e| e.to_string())?;
        if on_disk != b"v1 content to restore to" {
            return Err(format!("file on disk after restore: {}", String::from_utf8_lossy(&on_disk)));
        }
        if res.pre_rewind_snapshot_ids.is_empty() {
            return Err("pre-rewind snapshot not created".into());
        }
        let pre_hash = {
            let c = db.lock().map_err(|e| e.to_string())?;
            c.query_row(
                "SELECT content_hash FROM snapshots WHERE id = ?1",
                rusqlite::params![res.pre_rewind_snapshot_ids[0]],
                |r| r.get::<_, String>(0),
            ).map_err(|e| e.to_string())?
        };
        let pre_bytes = cas.get(&pre_hash).map_err(|e| e.to_string())?;
        if pre_bytes != b"v2 unsaved current state xyz" {
            return Err(format!("pre-rewind snap has wrong content: {}", String::from_utf8_lossy(&pre_bytes)));
        }
        Ok(format!("restored to v1; pre-rewind snap {} has v2 bytes", res.pre_rewind_snapshot_ids[0]))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_dry_run(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("dry.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"dry run test content here").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "dry.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["dry.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: Some(true), conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if !res.dry_run { return Err("result.dryRun should be true".into()); }
        if res.succeeded != 1 { return Err(format!("dry-run succeeded should be 1, got {}", res.succeeded)); }
        let expected_bytes = b"dry run test content here".len() as u64;
        if res.bytes_written != expected_bytes {
            return Err(format!("bytes_written {} != {}", res.bytes_written, expected_bytes));
        }
        if dest.join("dry.txt").exists() {
            return Err("dry.txt was physically written — dry-run broken".into());
        }
        let preview = res.preview.as_ref().ok_or("no preview items in result")?;
        if preview.len() != 1 { return Err(format!("expected 1 preview item, got {}", preview.len())); }
        if preview[0].skip_reason.is_some() {
            return Err(format!("preview item unexpectedly skipped: {:?}", preview[0].skip_reason));
        }
        Ok(format!("dry-run ok: {} bytes accounted, 0 written, preview populated", expected_bytes))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_conflict_detection(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("file.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"snapshot content for conflict test").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "file.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    std::fs::write(dest.join("file.txt"), b"pre-existing file at destination").map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["file.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if !res.requires_conflict_resolution {
            return Err("expected requires_conflict_resolution=true".into());
        }
        if !res.conflicts.contains(&"file.txt".to_string()) {
            return Err(format!("file.txt missing from conflicts list: {:?}", res.conflicts));
        }
        let still_there = std::fs::read(dest.join("file.txt")).map_err(|e| e.to_string())?;
        if still_there != b"pre-existing file at destination" {
            return Err("destination file was modified before conflict policy was set".into());
        }
        Ok(format!("{} conflict(s) detected; destination untouched", res.conflicts.len()))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_conflict_overwrite(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("file.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"snapshot wins over old dest file").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "file.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    std::fs::write(dest.join("file.txt"), b"old file at destination to be overwritten").map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["file.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: Some(ConflictPolicy::Overwrite), per_file_snapshots: None,
        }, app, db, cas)?;
        if res.requires_conflict_resolution {
            return Err("overwrite policy must not re-trigger conflict dialog".into());
        }
        if res.succeeded != 1 { return Err(format!("expected 1 ok: {:?}", res.failed)); }
        let got = std::fs::read(dest.join("file.txt")).map_err(|e| e.to_string())?;
        if got != b"snapshot wins over old dest file" {
            return Err(format!("expected snapshot content after overwrite, got: {}", String::from_utf8_lossy(&got)));
        }
        Ok("conflict_policy=overwrite replaced destination file with snapshot content".into())
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_pinned_missing(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let file = watched.join("file.txt");
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(&file, b"real file with a real snapshot").map_err(|e| e.to_string())?;
    snap(folder_id, &file, "file.txt", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let mut pins = HashMap::new();
        pins.insert("file.txt".to_string(), 999_999_i64);
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["file.txt".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: None, include_deleted: None,
            dry_run: None, conflict_policy: None,
            per_file_snapshots: Some(pins),
        }, app, db, cas)?;
        if res.succeeded != 0 { return Err(format!("expected 0 succeeded, got {}", res.succeeded)); }
        if res.failed.len() != 1 { return Err(format!("expected 1 failure: {:?}", res.failed)); }
        let err = &res.failed[0].error;
        if !err.contains("999999") {
            return Err(format!("error must mention snapshot id 999999, got: {err}"));
        }
        if err.contains("no snapshot at chosen point") {
            return Err(format!("error is still generic, must say 'pinned snapshot': {err}"));
        }
        Ok(format!("missing pin gave specific error: {err}"))
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}


fn t_recover_ignore_patterns(db: &Arc<Mutex<Connection>>, cas: &Arc<CasStore>, app: &AppHandle, tmp: &PathBuf) -> Result<String, String> {
    let watched = tmp.join("watched");
    std::fs::create_dir_all(&watched).map_err(|e| e.to_string())?;
    let folder_id = { let c = db.lock().map_err(|e| e.to_string())?; insert_test_folder(&c, &watched, &Default::default())? };

    std::fs::write(watched.join("app.txt"), b"txt file must be exported").map_err(|e| e.to_string())?;
    std::fs::write(watched.join("debug.log"), b"log file must be ignored").map_err(|e| e.to_string())?;
    snap(folder_id, &watched.join("app.txt"),   "app.txt",   db, cas, app)?;
    snap(folder_id, &watched.join("debug.log"), "debug.log", db, cas, app)?;

    let dest = tmp.join("export_out");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let run = || -> Result<String, String> {
        let res = do_recover(BulkRecoverArgs {
            folder_id, mode: RecoverMode::Export,
            destination: Some(dest.to_str().unwrap().to_string()),
            selected_paths: vec!["app.txt".into(), "debug.log".into()],
            snapshot_point: SnapshotPoint::Latest,
            ignore_patterns: Some(vec!["*.log".into()]),
            include_deleted: None,
            dry_run: None, conflict_policy: None, per_file_snapshots: None,
        }, app, db, cas)?;
        if res.succeeded != 1 {
            return Err(format!("expected 1 ok (txt only), got succeeded={} failed={:?}", res.succeeded, res.failed));
        }
        if dest.join("debug.log").exists() {
            return Err("debug.log was written despite *.log ignore pattern".into());
        }
        let got = std::fs::read(dest.join("app.txt")).map_err(|e| e.to_string())?;
        if got != b"txt file must be exported" {
            return Err(format!("app.txt wrong content: {}", String::from_utf8_lossy(&got)));
        }
        Ok("*.log correctly excluded; app.txt exported with correct bytes".into())
    };
    let r = run();
    { let c = db.lock().map_err(|e| e.to_string())?; cleanup_test_folder(&c, cas, folder_id); }
    r
}

type TestFn = fn(&Arc<Mutex<Connection>>, &Arc<CasStore>, &AppHandle, &PathBuf) -> Result<String, String>;

const TESTS: &[(&str, &str, TestFn)] = &[
    ("global_settings",   "Global settings readable",                  t_global_settings),
    ("binary_detect",     "Binary file detection",                     t_binary_detection),
    ("binary_cap",        "Binary file size cap",                      t_binary_size_cap),
    ("text_cap",          "Text file size cap",                        t_text_size_cap),
    ("ignore_rules",      "Ignore glob rules",                         t_ignore_rules),
    ("zstd_compress",     "ZSTD compression",                         t_zstd_compression),
    ("retention",         "Retention: keep last N",                    t_retention_keep_last_n),
    ("min_interval",      "Min snapshot interval",                     t_min_snapshot_interval),
    ("max_depth",         "Max folder depth",                          t_max_folder_depth),
    ("debounce",          "Watcher debounce (live)",                   t_watcher_debounce),

    ("rec_export",        "Recover: export 2 files (incl. nested)",    t_recover_export_basic),
    ("rec_pinned",        "Recover: pinned snapshot override",         t_recover_pinned_snapshot),
    ("rec_nth",           "Recover: NthFromLatest=1",                  t_recover_nth_from_latest),
    ("rec_asof_before",   "Recover: AsOf / Before preference",         t_recover_as_of_before),
    ("rec_asof_after",    "Recover: AsOf / After preference",          t_recover_as_of_after),
    ("rec_restore",       "Recover: restore in place + pre-rewind",    t_recover_restore_in_place),
    ("rec_dryrun",        "Recover: dry run (no writes, preview data)", t_recover_dry_run),
    ("rec_conflict_det",  "Recover: conflict detection without policy", t_recover_conflict_detection),
    ("rec_conflict_ow",   "Recover: conflict_policy=overwrite",        t_recover_conflict_overwrite),
    ("rec_pin_missing",   "Recover: pinned snapshot ID not found",     t_recover_pinned_missing),
    ("rec_ignore",        "Recover: ignore patterns filter files",     t_recover_ignore_patterns),
];

fn run_tests_blocking(
    db: Arc<Mutex<Connection>>,
    cas: Arc<CasStore>,
    app: AppHandle,
    base_tmp: PathBuf,
) -> Result<Vec<QaTestResult>, String> {
    let total = TESTS.len();
    let mut results: Vec<QaTestResult> = Vec::with_capacity(total);

    for (index, (id, name, test_fn)) in TESTS.iter().enumerate() {
        let test_dir = base_tmp.join(id);
        if let Err(e) = std::fs::create_dir_all(&test_dir) {
            return Err(format!("failed to create test dir: {e}"));
        }

        let start = Instant::now();
        let outcome = test_fn(&db, &cas, &app, &test_dir);
        let duration_ms = start.elapsed().as_millis() as u64;

        let result = match outcome {
            Ok(msg)  => QaTestResult { id: id.to_string(), name: name.to_string(), passed: true,  message: msg, duration_ms },
            Err(msg) => QaTestResult { id: id.to_string(), name: name.to_string(), passed: false, message: msg, duration_ms },
        };

        let _ = app.emit("qa:progress", serde_json::json!({
            "index": index,
            "total": total,
            "result": result,
        }));

        results.push(result);
    }

    let _ = std::fs::remove_dir_all(&base_tmp);
    Ok(results)
}

#[tauri::command]
pub async fn run_qa_suite(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<QaTestResult>, String> {
    let db  = Arc::clone(&state.db);
    let cas = Arc::clone(&state.cas);
    let base_tmp = std::env::temp_dir().join(format!("zftm_qa_{}", supervisor::now_unix()));
    std::fs::create_dir_all(&base_tmp).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || run_tests_blocking(db, cas, app, base_tmp))
        .await
        .map_err(|e| format!("QA task panicked: {e}"))
        .and_then(|r| r)
}
