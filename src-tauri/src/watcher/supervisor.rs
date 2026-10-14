use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use crate::config::{BackupTrigger, FolderConfig};
use crate::db::repo::{self, Snapshot};
use crate::error::AppError;
use crate::events::{
    emit_error, emit_scan_progress, emit_snapshot_created, emit_snapshot_skipped,
    ErrorOccurred, FolderScanProgress, SnapshotCreated, SnapshotSkipped,
};
use crate::snapshot::{binary, retention};
use crate::store::cas::CasStore;
use crate::watcher::ignore::IgnoreMatcher;
use crate::rename;

pub struct Supervisor {

    stop_flags: HashMap<i64, Arc<AtomicBool>>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self { stop_flags: HashMap::new() }
    }

    pub fn start_folder(
        &mut self,
        folder_id: i64,
        path: PathBuf,
        config: FolderConfig,
        db: Arc<Mutex<Connection>>,
        cas: Arc<CasStore>,
        app: AppHandle,
    ) {
        self.stop_folder(folder_id);

        let stop = Arc::new(AtomicBool::new(false));
        self.stop_flags.insert(folder_id, Arc::clone(&stop));


        let should_watch = !matches!(config.trigger, BackupTrigger::Manual);
        if should_watch {
            let s = Arc::clone(&stop);
            let db2 = Arc::clone(&db);
            let cas2 = Arc::clone(&cas);
            let app2 = app.clone();
            let path2 = path.clone();
            let cfg2 = config.clone();

            std::thread::spawn(move || {
                let mut attempt = 0u32;
                loop {
                    if s.load(Ordering::Relaxed) { break; }
                    if attempt > 0 {
                        let backoff = Duration::from_secs(5u64 * 2u64.saturating_pow(attempt.min(4) - 1));
                        let mut waited = Duration::ZERO;
                        while waited < backoff && !s.load(Ordering::Relaxed) {
                            std::thread::sleep(Duration::from_millis(500));
                            waited += Duration::from_millis(500);
                        }
                        if s.load(Ordering::Relaxed) { break; }
                        tracing::warn!("Restarting watcher for folder {folder_id} (attempt {attempt})");
                        let _ = app2.emit("watcher:restarted", serde_json::json!({ "folderId": folder_id }));
                    }
                    run_watcher_thread(folder_id, path2.clone(), cfg2.clone(), db2.clone(), cas2.clone(), app2.clone(), Arc::clone(&s));
                    attempt += 1;
                    if s.load(Ordering::Relaxed) { break; }
                }
            });
        }


        let interval_mins = match &config.trigger {
            BackupTrigger::Interval { minutes } => Some(*minutes as u64),
            BackupTrigger::Hybrid { interval_minutes, .. } => Some(*interval_minutes as u64),
            _ => None,
        };

        if let Some(mins) = interval_mins {
            let s = Arc::clone(&stop);
            let db3 = Arc::clone(&db);
            let cas3 = Arc::clone(&cas);
            let app3 = app.clone();
            let path3 = path.clone();
            let cfg3 = config.clone();
            std::thread::spawn(move || {
                run_interval_thread(folder_id, path3, cfg3, db3, cas3, app3, s, mins);
            });
        }
    }

    pub fn stop_folder(&mut self, folder_id: i64) {
        if let Some(flag) = self.stop_flags.remove(&folder_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn stop_all(&mut self) {
        for flag in self.stop_flags.values() {
            flag.store(true, Ordering::Relaxed);
        }
        self.stop_flags.clear();
    }
}

impl Default for Supervisor {
    fn default() -> Self { Self::new() }
}


fn run_watcher_thread<R: Runtime>(
    folder_id: i64,
    path: PathBuf,
    config: FolderConfig,
    db: Arc<Mutex<Connection>>,
    cas: Arc<CasStore>,
    app: AppHandle<R>,
    stop: Arc<AtomicBool>,
) {
    let debounce_ms = config.debounce_ms.unwrap_or_else(|| match &config.trigger {
        BackupTrigger::Hybrid { debounce_secs, .. } => *debounce_secs * 1000,
        _ => 2000,
    }) as u64;

    let (event_tx, event_rx) = std::sync::mpsc::channel::<DebounceEventResult>();
    let mut debouncer = match new_debouncer(
        Duration::from_millis(debounce_ms),
        None,
        move |result: DebounceEventResult| { let _ = event_tx.send(result); },
    ) {
        Ok(d) => d,
        Err(e) => {
            emit_error(&app, ErrorOccurred {
                code: "WATCHER_INIT".into(),
                message: e.to_string(),
                context: format!("folder_id={folder_id}"),
            });
            return;
        }
    };

    if let Err(e) = debouncer.watcher().watch(&path, RecursiveMode::Recursive) {
        emit_error(&app, ErrorOccurred {
            code: "WATCHER_START".into(),
            message: e.to_string(),
            context: format!("folder_id={folder_id}"),
        });
        return;
    }

    let ignore_matcher = IgnoreMatcher::new(&path, &config.ignore_globs);
    tracing::info!("Watcher started for folder {folder_id} at {path:?}");

    while !stop.load(Ordering::Relaxed) {
        match event_rx.recv_timeout(Duration::from_millis(250)) {
            Ok(Ok(events)) => {
                for event in events {
                    if stop.load(Ordering::Relaxed) { break; }
                    handle_event(folder_id, &path, &event, &config, &db, &cas, &app, &ignore_matcher);
                }
            }
            Ok(Err(errs)) => {
                for e in errs { tracing::warn!("Watcher error: {e:?}"); }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    tracing::info!("Watcher stopped for folder {folder_id}");
}


fn run_interval_thread(
    folder_id: i64,
    path: PathBuf,
    config: FolderConfig,
    db: Arc<Mutex<Connection>>,
    cas: Arc<CasStore>,
    app: AppHandle,
    stop: Arc<AtomicBool>,
    interval_mins: u64,
) {
    let tick = Duration::from_secs(interval_mins * 60);
    tracing::info!("Interval watcher ({interval_mins}min) started for folder {folder_id}");


    let mut elapsed = Duration::ZERO;
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_secs(5));
        elapsed += Duration::from_secs(5);

        if elapsed >= tick {
            elapsed = Duration::ZERO;
            if stop.load(Ordering::Relaxed) { break; }
            run_interval_scan(folder_id, &path, &config, &db, &cas, &app);
        }
    }
    tracing::info!("Interval watcher stopped for folder {folder_id}");
}

fn run_interval_scan<R: Runtime>(
    folder_id: i64,
    root: &std::path::Path,
    config: &FolderConfig,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
    app: &AppHandle<R>,
) {
    let ignore_matcher = IgnoreMatcher::new(root, &config.ignore_globs);
    let entries = match collect_files(root, &ignore_matcher, config.max_depth) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!("Interval scan failed to collect files: {e}");
            return;
        }
    };

    for abs_path in entries {
        let rel_path = match abs_path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };


        let skip = {
            match db.lock() {
                Ok(conn) => {
                    match repo::get_file_by_path(&conn, folder_id, &rel_path) {
                        Ok(Some(f)) => {

                            match crate::snapshot::hasher::hash_file(&abs_path) {
                                Ok(h) => f.current_hash.as_deref() == Some(&h),
                                Err(_) => true,
                            }
                        }
                        _ => false,
                    }
                }
                Err(_) => true,
            }
        };

        if !skip {
            if let Err(e) = snapshot_file(folder_id, &abs_path, &rel_path, config, db, cas, app, false, "interval") {
                tracing::debug!("Interval snapshot error for {rel_path}: {e}");
            }
        }
    }
}


fn handle_event<R: Runtime>(
    folder_id: i64,
    root: &std::path::Path,
    event: &notify_debouncer_full::DebouncedEvent,
    config: &FolderConfig,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
    app: &AppHandle<R>,
    ignore_matcher: &IgnoreMatcher,
) {
    use notify::EventKind::*;
    for abs_path in &event.event.paths {
        if abs_path.is_dir() || crate::util::fs::is_temp_file(abs_path) { continue; }
        let rel_path = match abs_path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        if ignore_matcher.is_ignored(abs_path, false) { continue; }
        match &event.event.kind {
            Create(_) | Modify(_) => {
                if let Err(e) = snapshot_file(folder_id, abs_path, &rel_path, config, db, cas, app, true, "change") {
                    tracing::warn!("snapshot error for {rel_path}: {e}");
                }
            }
            Remove(_) => {


                if abs_path.exists() {
                    if let Err(e) = snapshot_file(folder_id, abs_path, &rel_path, config, db, cas, app, false, "change") {
                        tracing::warn!("snapshot error for {rel_path}: {e}");
                    }
                    continue;
                }
                if let Ok(conn) = db.lock() {
                    if let Ok(Some(file)) = repo::get_file_by_path(&conn, folder_id, &rel_path) {
                        let now = now_unix();
                        let _ = repo::mark_file_deleted(&conn, file.id, now);
                        let _ = repo::log_activity(&conn, folder_id, now, "file_deleted", Some(&rel_path), None, None);
                        append_activity_log(app, "file_deleted", Some(&rel_path), None);
                        let _ = app.emit("file:deleted", serde_json::json!({
                            "folderId": folder_id,
                            "fileId": file.id,
                            "relPath": rel_path,
                        }));
                    }
                }
            }
            _ => {}
        }
    }
}


pub fn snapshot_file<R: Runtime>(
    folder_id: i64,
    abs_path: &std::path::Path,
    rel_path: &str,
    config: &FolderConfig,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
    app: &AppHandle<R>,
    check_rename: bool,
    source: &str,
) -> Result<Option<Snapshot>, AppError> {
    snapshot_file_inner(folder_id, abs_path, rel_path, config, db, cas, app, check_rename, source, false)
}

fn snapshot_file_inner<R: Runtime>(
    folder_id: i64,
    abs_path: &std::path::Path,
    rel_path: &str,
    config: &FolderConfig,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
    app: &AppHandle<R>,
    check_rename: bool,
    source: &str,
    silent: bool,
) -> Result<Option<Snapshot>, AppError> {
    if !abs_path.exists() {
        return Ok(None);
    }

    let metadata = abs_path.metadata()?;
    let file_size = metadata.len();
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let is_binary = binary::is_binary_file(abs_path).unwrap_or(false);

    if is_binary {
        let max_bytes = config.binary_max_mb * 1024 * 1024;
        if file_size > max_bytes {
            if !silent {
                emit_snapshot_skipped(app, SnapshotSkipped {
                    folder_id,
                    rel_path: rel_path.to_string(),
                    reason: format!("binary file exceeds {}MB cap", config.binary_max_mb),
                });
            }
            return Ok(None);
        }
    }


    if let Some(max_mb) = config.skip_files_larger_than_mb {
        if !is_binary && file_size > max_mb * 1024 * 1024 {
            if !silent {
                emit_snapshot_skipped(app, SnapshotSkipped {
                    folder_id,
                    rel_path: rel_path.to_string(),
                    reason: format!("text file exceeds {max_mb}MB cap"),
                });
            }
            return Ok(None);
        }
    }

    let data = std::fs::read(abs_path)?;

    let compress = config.compression_enabled.unwrap_or(false);
    let hash = cas.put_with_compression(&data, compress)?;

    let conn = db.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;


    if let Ok(Some(f)) = repo::get_file_by_path(&conn, folder_id, rel_path) {
        if f.current_hash.as_deref() == Some(&hash) && source != "manual" {
            if let Ok(true) = repo::revive_file(&conn, f.id) {
                let _ = app.emit("file:restored", serde_json::json!({
                    "folderId": folder_id,
                    "fileId": f.id,
                    "relPath": rel_path,
                }));
            }
            return Ok(None);
        }
        if f.no_auto_snapshot && source != "manual" && source != "pre-rewind" {
            if !silent {
                emit_snapshot_skipped(app, SnapshotSkipped {
                    folder_id,
                    rel_path: rel_path.to_string(),
                    reason: "manual-only mode".to_string(),
                });
            }
            return Ok(None);
        }

        if let Some(min_secs) = config.min_snapshot_interval_secs {
            if source != "manual" && source != "pre-rewind" {
                if let Ok(Some(latest)) = repo::get_latest_snapshot(&conn, f.id) {
                    let elapsed_secs = (now_unix() - latest.created_at) / 1000;
                    if elapsed_secs < min_secs as i64 {
                        return Ok(None);
                    }
                }
            }
        }
    }


    if check_rename {
        if let Ok(Some(folder)) = repo::get_folder(&conn, folder_id) {
            let root = PathBuf::from(&folder.path);
            if let Ok(true) = rename::detect_and_handle(&conn, app, folder_id, &root, rel_path, &hash) {
                return Ok(None);
            }
        }
    }

    let file = repo::upsert_file(&conn, folder_id, rel_path, is_binary, Some(&hash), last_modified)?;

    let prev_size = repo::get_latest_snapshot(&conn, file.id)
        .ok()
        .flatten()
        .map(|s| s.size_bytes)
        .unwrap_or(0);
    let delta = file_size as i64 - prev_size;

    repo::increment_cas_ref(&conn, &hash, file_size as i64)?;
    let snap = repo::insert_snapshot(&conn, file.id, &hash, file_size as i64, delta, source)?;
    repo::update_file_hash(&conn, file.id, &hash, last_modified)?;


    if let Err(e) = retention::enforce(&conn, cas, file.id, &config.retention) {
        tracing::warn!("retention enforce failed for file {}: {e}", file.id);
    }

    if !silent {
        emit_snapshot_created(app, SnapshotCreated {
            folder_id,
            file_id: file.id,
            snapshot_id: snap.id,
        });
        let _ = repo::log_activity(&conn, folder_id, now_unix(), "snapshot_created", Some(rel_path), Some(source), Some(snap.id));
        append_activity_log(app, "snapshot_created", Some(rel_path), Some(source));


        if let Ok(Some(cap_mb)) = repo::get_setting(&conn, "global_size_cap_mb")
            .map(|v| v.and_then(|s| s.parse::<u64>().ok()))
        {
            let cap_bytes = cap_mb * 1024 * 1024;
            let used_bytes = cas.estimate_size_bytes();
            let percent = (used_bytes * 100 / cap_bytes.max(1)).min(255) as u8;
            if percent >= 90 {
                crate::events::emit_storage_warning(app, crate::events::StorageWarning {
                    used_bytes,
                    cap_bytes,
                    percent,
                });
            }
        }
    }

    Ok(Some(snap))
}


pub fn initial_scan<R: Runtime>(
    folder_id: i64,
    root: &std::path::Path,
    config: &FolderConfig,
    db: &Arc<Mutex<Connection>>,
    cas: &Arc<CasStore>,
    app: &AppHandle<R>,
) -> Result<(), AppError> {
    let ignore_matcher = IgnoreMatcher::new(root, &config.ignore_globs);
    let entries = collect_files(root, &ignore_matcher, config.max_depth)?;
    let total = entries.len() as u64;


    let known_mtimes: std::collections::HashMap<String, i64> = {
        let conn = db.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        repo::scan_state(&conn, folder_id).unwrap_or_default()
    };

    let mut last_progress = std::time::Instant::now();
    let mut new_count: u64 = 0;

    for (i, abs_path) in entries.into_iter().enumerate() {
        let rel_path = match abs_path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };


        let mtime = abs_path.metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        if known_mtimes.get(&rel_path) == Some(&mtime) {

        } else {

            if let Err(e) = snapshot_file_inner(folder_id, &abs_path, &rel_path, config, db, cas, app, false, "initial", true) {
                tracing::debug!("initial_scan: skipped {rel_path}: {e}");
            } else {
                new_count += 1;
            }
        }


        let is_last = i + 1 == total as usize;
        if is_last || last_progress.elapsed() >= Duration::from_millis(200) {
            emit_scan_progress(app, FolderScanProgress {
                folder_id,
                scanned: (i + 1) as u64,
                total,
            });
            last_progress = std::time::Instant::now();
        }
    }


    if let Ok(conn) = db.lock() {
        let _ = repo::log_activity(
            &conn, folder_id, now_unix(), "scan_complete", None,
            Some(&format!("total={total} new_or_changed={new_count}")), None,
        );
    }
    append_activity_log(app, "scan_complete", None, Some(&format!("total={total} new={new_count}")));

    Ok(())
}


fn collect_files(root: &std::path::Path, ignore: &IgnoreMatcher, max_depth: Option<u32>) -> Result<Vec<PathBuf>, AppError> {
    let mut out = Vec::new();
    collect_recursive(root, root, ignore, &mut out, 0, max_depth)?;
    Ok(out)
}

fn collect_recursive(
    root: &std::path::Path,
    dir: &std::path::Path,
    ignore: &IgnoreMatcher,
    out: &mut Vec<PathBuf>,
    depth: u32,
    max_depth: Option<u32>,
) -> Result<(), AppError> {
    if let Some(max) = max_depth {
        if depth >= max {
            return Ok(());
        }
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!("read_dir failed for {dir:?}: {e}");
            return Ok(());
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let is_dir = path.is_dir();
        if ignore.is_ignored(&path, is_dir) { continue; }
        if is_dir {
            collect_recursive(root, &path, ignore, out, depth + 1, max_depth)?;
        } else {
            out.push(path);
        }
    }
    Ok(())
}


pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}


pub fn append_activity_log<R: Runtime>(app: &AppHandle<R>, action: &str, rel_path: Option<&str>, reason: Option<&str>) {
    let state = app.state::<crate::AppState>();
    let path = &state.activity_log_path;
    let ts = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

        chrono::DateTime::from_timestamp(ms as i64, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| ms.to_string())
    };
    let rel = rel_path.unwrap_or("-");
    let why = reason.unwrap_or("-");
    let line = format!("{ts} UTC | {action:<20} | {rel} | {why}\n");
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = f.write_all(line.as_bytes());
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::commands::rewind::write_snapshot_to_disk;
    use crate::db::migrations;
    use notify::event::{CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode};
    use notify_debouncer_full::DebouncedEvent;
    use std::path::Path;
    use std::time::Instant;
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    struct Env {
        _dir: tempfile::TempDir,
        root: PathBuf,
        folder_id: i64,
        config: FolderConfig,
        db: Arc<Mutex<Connection>>,
        cas: Arc<CasStore>,
        app: tauri::App<MockRuntime>,
    }

    fn setup() -> Env {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("watched");
        std::fs::create_dir_all(&root).unwrap();
        let cas_dir = dir.path().join("cas");
        std::fs::create_dir_all(&cas_dir).unwrap();

        let conn = Connection::open(dir.path().join("db.sqlite")).unwrap();
        migrations::run(&conn).unwrap();
        let config = FolderConfig { debounce_ms: Some(150), ..Default::default() };
        let folder = repo::insert_folder(&conn, root.to_str().unwrap(), "test", &config).unwrap();

        let db = Arc::new(Mutex::new(conn));
        let cas = Arc::new(CasStore::new(cas_dir));
        let app = mock_builder().build(mock_context(noop_assets())).unwrap();
        app.manage(crate::AppState {
            db: Arc::clone(&db),
            cas: Arc::clone(&cas),
            data_dir: dir.path().to_path_buf(),
            activity_log_path: dir.path().join("activity.log"),
            supervisor: Mutex::new(Supervisor::new()),
            close_to_tray: Arc::new(Mutex::new(false)),
        });
        Env { _dir: dir, root, folder_id: folder.id, config, db, cas, app }
    }

    impl Env {
        fn save(&self, rel: &str, content: &str) -> Snapshot {
            let abs = self.root.join(rel);
            std::fs::write(&abs, content).unwrap();
            snapshot_file(self.folder_id, &abs, rel, &self.config, &self.db, &self.cas, self.app.handle(), true, "change")
                .unwrap()
                .expect("a new snapshot")
        }

        fn fire(&self, kind: EventKind, paths: &[&Path]) {
            let mut ev = notify::Event::new(kind);
            for p in paths { ev = ev.add_path(p.to_path_buf()); }
            let ignore = IgnoreMatcher::new(&self.root, &self.config.ignore_globs);
            handle_event(self.folder_id, &self.root, &DebouncedEvent::new(ev, Instant::now()),
                         &self.config, &self.db, &self.cas, self.app.handle(), &ignore);
        }

        fn listed(&self) -> Vec<String> {
            let conn = self.db.lock().unwrap();
            repo::list_files(&conn, self.folder_id, false).unwrap().into_iter().map(|f| f.rel_path).collect()
        }

        fn file(&self, rel: &str) -> repo::FileEntry {
            repo::get_file_by_path(&self.db.lock().unwrap(), self.folder_id, rel).unwrap().unwrap()
        }
    }


    #[test]
    fn restore_survives_windows_replace_events() {
        let env = setup();
        let v1 = env.save("notes.txt", "first version");
        env.save("notes.txt", "second version");

        let target = env.root.join("notes.txt");
        let file_id = env.file("notes.txt").id;
        write_snapshot_to_disk(&env.db, &env.cas, file_id, &target, &v1.content_hash).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "first version");

        let tmp = env.root.join(".zftm_tmp_00000000_00000000");
        env.fire(EventKind::Remove(RemoveKind::File), &[&target]);
        env.fire(EventKind::Modify(ModifyKind::Name(RenameMode::Both)), &[&tmp, &target]);
        env.fire(EventKind::Modify(ModifyKind::Any), &[&target]);

        assert_eq!(env.listed(), vec!["notes.txt"], "restored file must stay in the list");
        assert_eq!(env.file("notes.txt").current_hash.as_deref(), Some(v1.content_hash.as_str()));
    }


    #[test]
    fn previously_hidden_file_is_revived() {
        let env = setup();
        env.save("a.txt", "hello");
        let id = env.file("a.txt").id;
        repo::mark_file_deleted(&env.db.lock().unwrap(), id, now_unix()).unwrap();
        assert!(env.listed().is_empty());

        env.fire(EventKind::Modify(ModifyKind::Any), &[&env.root.join("a.txt")]);
        assert_eq!(env.listed(), vec!["a.txt"]);
    }


    #[test]
    fn real_deletion_still_hides_file() {
        let env = setup();
        env.save("gone.txt", "bye");
        let path = env.root.join("gone.txt");
        std::fs::remove_file(&path).unwrap();
        env.fire(EventKind::Remove(RemoveKind::File), &[&path]);
        assert!(env.listed().is_empty());
    }


    #[test]
    fn identical_copy_is_not_a_rename() {
        let env = setup();
        env.save("orig.txt", "same bytes");
        let orig_id = env.file("orig.txt").id;

        std::fs::copy(env.root.join("orig.txt"), env.root.join("copy.txt")).unwrap();
        env.fire(EventKind::Create(CreateKind::File), &[&env.root.join("copy.txt")]);

        assert_eq!(env.file("orig.txt").id, orig_id, "original keeps its history");
        assert_eq!(env.listed(), vec!["copy.txt", "orig.txt"]);
    }


    #[test]
    fn restore_with_live_watcher_keeps_file_listed() {
        let env = setup();
        let v1 = env.save("live.txt", "v1");
        env.save("live.txt", "v2");
        let file_id = env.file("live.txt").id;

        let stop = Arc::new(AtomicBool::new(false));
        let handle = {
            let (root, cfg, db, cas, app, stop) = (
                env.root.clone(), env.config.clone(), Arc::clone(&env.db), Arc::clone(&env.cas),
                env.app.handle().clone(), Arc::clone(&stop),
            );
            let folder_id = env.folder_id;
            std::thread::spawn(move || run_watcher_thread(folder_id, root, cfg, db, cas, app, stop))
        };
        std::thread::sleep(Duration::from_millis(300));

        write_snapshot_to_disk(&env.db, &env.cas, file_id, &env.root.join("live.txt"), &v1.content_hash).unwrap();
        std::thread::sleep(Duration::from_millis(1200));

        stop.store(true, Ordering::Relaxed);
        handle.join().unwrap();

        assert_eq!(env.listed(), vec!["live.txt"]);
        assert_eq!(env.file("live.txt").current_hash.as_deref(), Some(v1.content_hash.as_str()));
    }
}
