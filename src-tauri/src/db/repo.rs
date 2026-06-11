use rusqlite::{params, Connection, OptionalExtension, Row};
use crate::config::FolderConfig;
use crate::error::AppError;
use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub display_name: String,
    pub config: FolderConfig,
    pub active: bool,
    pub created_at: i64,
    pub paused: bool,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: i64,
    pub folder_id: i64,
    pub rel_path: String,
    pub is_binary: bool,
    pub current_hash: Option<String>,
    pub last_modified: i64,
    pub note: Option<String>,
    pub no_auto_snapshot: bool,
    pub snapshot_count: u32,
    pub last_snapshot_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: i64,
    pub file_id: i64,
    pub content_hash: String,
    pub size_bytes: i64,
    pub delta_bytes: i64,
    pub source: String,
    pub created_at: i64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHit {
    pub kind: String,
    pub id: i64,
    pub file_id: Option<i64>,
    pub folder_id: i64,
    pub label: String,
    pub note: String,
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameEvent {
    pub id: i64,
    pub file_id: i64,
    pub old_rel_path: String,
    pub new_rel_path: String,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: i64,
    pub folder_id: i64,
    pub timestamp: i64,
    pub action: String,
    pub rel_path: Option<String>,
    pub reason: Option<String>,
    pub snapshot_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityResult {
    pub db_ok: bool,
    pub db_messages: Vec<String>,
    pub cas_checked: u64,
    pub cas_missing: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub rel_path: String,
    pub snapshot_count: u32,
    pub physical_bytes: i64,
    pub logical_bytes: i64,
}


fn map_folder(row: &Row) -> rusqlite::Result<Folder> {
    let config_json: String = row.get(3)?;
    let config: FolderConfig = serde_json::from_str(&config_json).unwrap_or_default();
    Ok(Folder {
        id: row.get(0)?,
        path: row.get(1)?,
        display_name: row.get(2)?,
        config,
        active: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        paused: row.get::<_, i64>(6)? != 0,
        deleted_at: row.get(7)?,
    })
}


pub fn map_folder_row(row: &Row) -> rusqlite::Result<Folder> {
    map_folder(row)
}

fn map_file(row: &Row) -> rusqlite::Result<FileEntry> {
    Ok(FileEntry {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        rel_path: row.get(2)?,
        is_binary: row.get::<_, i64>(3)? != 0,
        current_hash: row.get(4)?,
        last_modified: row.get(5)?,
        note: row.get(6)?,
        no_auto_snapshot: row.get::<_, i64>(7)? != 0,
        snapshot_count: 0,
        last_snapshot_at: None,
    })
}

fn map_file_with_stats(row: &Row) -> rusqlite::Result<FileEntry> {
    let config_json_or_null: Option<String> = None;
    let _ = config_json_or_null;
    Ok(FileEntry {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        rel_path: row.get(2)?,
        is_binary: row.get::<_, i64>(3)? != 0,
        current_hash: row.get(4)?,
        last_modified: row.get(5)?,
        note: row.get(6)?,
        no_auto_snapshot: row.get::<_, i64>(7)? != 0,
        snapshot_count: row.get::<_, i64>(8)? as u32,
        last_snapshot_at: row.get(9)?,
    })
}

fn map_snapshot(row: &Row) -> rusqlite::Result<Snapshot> {
    Ok(Snapshot {
        id: row.get(0)?,
        file_id: row.get(1)?,
        content_hash: row.get(2)?,
        size_bytes: row.get(3)?,
        delta_bytes: row.get(4)?,
        source: row.get(5)?,
        created_at: row.get(6)?,
        note: row.get(7)?,
    })
}


pub fn folder_path_exists(conn: &Connection, path: &str) -> Result<bool, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM folders WHERE path = ?1 AND deleted_at IS NULL",
        params![path],
        |r| r.get(0),
    ).map_err(AppError::Database)?;
    Ok(count > 0)
}


pub fn get_folder_by_path(conn: &Connection, path: &str) -> Result<Option<Folder>, AppError> {
    conn.query_row(
        "SELECT id, path, display_name, config_json, active, created_at, paused, deleted_at
         FROM folders WHERE path = ?1",
        params![path],
        map_folder_row,
    ).optional().map_err(AppError::Database)
}


pub fn revive_folder(conn: &Connection, id: i64, config: &FolderConfig) -> Result<(), AppError> {
    let config_json = serde_json::to_string(config)?;
    conn.execute(
        "UPDATE folders SET deleted_at = NULL, config_json = ?1, active = 1 WHERE id = ?2",
        params![config_json, id],
    )?;
    Ok(())
}

pub fn insert_folder(
    conn: &Connection,
    path: &str,
    display_name: &str,
    config: &FolderConfig,
) -> Result<Folder, AppError> {
    let config_json = serde_json::to_string(config)?;
    let now = now_unix();
    conn.execute(
        "INSERT INTO folders (path, display_name, config_json, active, created_at)
         VALUES (?1, ?2, ?3, 1, ?4)",
        params![path, display_name, config_json, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Folder {
        id,
        path: path.to_string(),
        display_name: display_name.to_string(),
        config: config.clone(),
        active: true,
        created_at: now,
        paused: false,
        deleted_at: None,
    })
}

pub fn list_folders(conn: &Connection) -> Result<Vec<Folder>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, path, display_name, config_json, active, created_at, paused, deleted_at
         FROM folders WHERE deleted_at IS NULL ORDER BY id"
    )?;
    let rows = stmt.query_map([], map_folder)?;
    rows.map(|r| r.map_err(AppError::Database)).collect()
}

pub fn get_folder(conn: &Connection, id: i64) -> Result<Option<Folder>, AppError> {
    conn.query_row(
        "SELECT id, path, display_name, config_json, active, created_at, paused, deleted_at FROM folders WHERE id = ?1",
        params![id],
        map_folder,
    )
    .optional()
    .map_err(AppError::Database)
}

pub fn update_folder_config(
    conn: &Connection,
    id: i64,
    config: &FolderConfig,
) -> Result<(), AppError> {
    let json = serde_json::to_string(config)?;
    conn.execute(
        "UPDATE folders SET config_json = ?1 WHERE id = ?2",
        params![json, id],
    )?;
    Ok(())
}

pub fn rename_folder(conn: &Connection, id: i64, display_name: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE folders SET display_name = ?1 WHERE id = ?2",
        params![display_name, id],
    )?;
    Ok(())
}

pub fn delete_folder(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}


pub fn soft_delete_folder(conn: &Connection, id: i64, at: i64) -> Result<(), AppError> {
    conn.execute("UPDATE folders SET deleted_at = ?1 WHERE id = ?2", params![at, id])?;
    Ok(())
}


pub fn undelete_folder(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("UPDATE folders SET deleted_at = NULL WHERE id = ?1", params![id])?;
    Ok(())
}


pub fn hard_delete_folder(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}


pub fn purge_stale_deletions(conn: &Connection) -> Result<u64, AppError> {
    let cutoff = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64 - 7 * 24 * 3600 * 1000;
    let n = conn.execute(
        "DELETE FROM folders WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
        params![cutoff],
    )?;
    Ok(n as u64)
}


pub fn toggle_folder_pause(conn: &Connection, id: i64, paused: bool) -> Result<(), AppError> {
    conn.execute("UPDATE folders SET paused = ?1 WHERE id = ?2", params![paused as i64, id])?;
    Ok(())
}


pub fn upsert_file(
    conn: &Connection,
    folder_id: i64,
    rel_path: &str,
    is_binary: bool,
    current_hash: Option<&str>,
    last_modified: i64,
) -> Result<FileEntry, AppError> {
    conn.execute(
        "INSERT INTO files (folder_id, rel_path, is_binary, current_hash, last_modified)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(folder_id, rel_path) DO UPDATE SET
           is_binary = excluded.is_binary,
           current_hash = excluded.current_hash,
           last_modified = excluded.last_modified",
        params![folder_id, rel_path, is_binary as i64, current_hash, last_modified],
    )?;
    get_file_by_path(conn, folder_id, rel_path)?
        .ok_or_else(|| AppError::NotFound(rel_path.to_string()))
}

pub fn get_file_by_id(conn: &Connection, id: i64) -> Result<Option<FileEntry>, AppError> {
    conn.query_row(
        "SELECT id, folder_id, rel_path, is_binary, current_hash, last_modified, note, no_auto_snapshot
         FROM files WHERE id = ?1",
        params![id],
        map_file,
    )
    .optional()
    .map_err(AppError::Database)
}

pub fn list_files(conn: &Connection, folder_id: i64, include_deleted: bool) -> Result<Vec<FileEntry>, AppError> {
    let sql = if include_deleted {
        "SELECT f.id, f.folder_id, f.rel_path, f.is_binary, f.current_hash, f.last_modified,
                f.note, f.no_auto_snapshot,
                COUNT(s.id) as snapshot_count,
                MAX(s.created_at) as last_snapshot_at
         FROM files f
         LEFT JOIN snapshots s ON s.file_id = f.id
         WHERE f.folder_id = ?1
         GROUP BY f.id
         ORDER BY f.rel_path"
    } else {
        "SELECT f.id, f.folder_id, f.rel_path, f.is_binary, f.current_hash, f.last_modified,
                f.note, f.no_auto_snapshot,
                COUNT(s.id) as snapshot_count,
                MAX(s.created_at) as last_snapshot_at
         FROM files f
         LEFT JOIN snapshots s ON s.file_id = f.id
         WHERE f.folder_id = ?1 AND f.deleted_at IS NULL
         GROUP BY f.id
         ORDER BY f.rel_path"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![folder_id], map_file_with_stats)?;
    rows.map(|r| r.map_err(AppError::Database)).collect()
}

pub fn list_files_paged(conn: &Connection, folder_id: i64, limit: u32, offset: u32) -> Result<(Vec<FileEntry>, u32), AppError> {
    let total: u32 = conn.query_row(
        "SELECT COUNT(*) FROM files WHERE folder_id = ?1 AND deleted_at IS NULL",
        params![folder_id],
        |r| r.get::<_, i64>(0),
    ).map(|n| n as u32).unwrap_or(0);

    let mut stmt = conn.prepare(
        "SELECT f.id, f.folder_id, f.rel_path, f.is_binary, f.current_hash, f.last_modified,
                f.note, f.no_auto_snapshot,
                COUNT(s.id) as snapshot_count,
                MAX(s.created_at) as last_snapshot_at
         FROM files f LEFT JOIN snapshots s ON s.file_id = f.id
         WHERE f.folder_id = ?1 AND f.deleted_at IS NULL
         GROUP BY f.id ORDER BY f.rel_path
         LIMIT ?2 OFFSET ?3"
    )?;
    let rows = stmt.query_map(params![folder_id, limit, offset], map_file_with_stats)?;
    let items: Vec<FileEntry> = rows.map(|r| r.map_err(AppError::Database)).collect::<Result<_, _>>()?;
    Ok((items, total))
}


pub fn scan_state(conn: &Connection, folder_id: i64) -> Result<std::collections::HashMap<String, i64>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT rel_path, last_modified FROM files WHERE folder_id = ?1 AND deleted_at IS NULL",
    )?;
    let map = stmt
        .query_map(params![folder_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(map)
}

pub fn get_file_by_path(
    conn: &Connection,
    folder_id: i64,
    rel_path: &str,
) -> Result<Option<FileEntry>, AppError> {
    conn.query_row(
        "SELECT id, folder_id, rel_path, is_binary, current_hash, last_modified, note, no_auto_snapshot
         FROM files WHERE folder_id = ?1 AND rel_path = ?2",
        params![folder_id, rel_path],
        map_file,
    )
    .optional()
    .map_err(AppError::Database)
}


pub fn get_file_by_hash(conn: &Connection, hash: &str) -> Result<Option<FileEntry>, AppError> {
    conn.query_row(
        "SELECT f.id, f.folder_id, f.rel_path, f.is_binary, f.current_hash, f.last_modified,
                f.note, f.no_auto_snapshot
         FROM files f
         WHERE f.current_hash = ?1 AND f.deleted_at IS NULL
         ORDER BY f.last_modified DESC LIMIT 1",
        params![hash],
        map_file,
    )
    .optional()
    .map_err(AppError::Database)
}


pub fn mark_file_deleted(conn: &Connection, file_id: i64, at: i64) -> Result<(), AppError> {
    conn.execute("UPDATE files SET deleted_at = ?1 WHERE id = ?2", params![at, file_id])?;
    Ok(())
}

pub fn update_file_hash(
    conn: &Connection,
    file_id: i64,
    hash: &str,
    last_modified: i64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE files SET current_hash = ?1, last_modified = ?2 WHERE id = ?3",
        params![hash, last_modified, file_id],
    )?;
    Ok(())
}

pub fn rename_file(
    conn: &Connection,
    file_id: i64,
    new_rel_path: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE files SET rel_path = ?1 WHERE id = ?2",
        params![new_rel_path, file_id],
    )?;
    Ok(())
}


pub fn insert_snapshot(
    conn: &Connection,
    file_id: i64,
    content_hash: &str,
    size_bytes: i64,
    delta_bytes: i64,
    source: &str,
) -> Result<Snapshot, AppError> {
    let now = now_unix();
    conn.execute(
        "INSERT INTO snapshots (file_id, content_hash, size_bytes, delta_bytes, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![file_id, content_hash, size_bytes, delta_bytes, source, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Snapshot { id, file_id, content_hash: content_hash.to_string(), size_bytes, delta_bytes, source: source.to_string(), created_at: now, note: None })
}

pub fn list_snapshots(conn: &Connection, file_id: i64) -> Result<Vec<Snapshot>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, file_id, content_hash, size_bytes, delta_bytes, source, created_at, note
         FROM snapshots WHERE file_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map(params![file_id], map_snapshot)?;
    rows.map(|r| r.map_err(AppError::Database)).collect()
}

pub fn get_snapshot(conn: &Connection, id: i64) -> Result<Option<Snapshot>, AppError> {
    conn.query_row(
        "SELECT id, file_id, content_hash, size_bytes, delta_bytes, source, created_at, note
         FROM snapshots WHERE id = ?1",
        params![id],
        map_snapshot,
    )
    .optional()
    .map_err(AppError::Database)
}

pub fn get_latest_snapshot(conn: &Connection, file_id: i64) -> Result<Option<Snapshot>, AppError> {
    conn.query_row(
        "SELECT id, file_id, content_hash, size_bytes, delta_bytes, source, created_at, note
         FROM snapshots WHERE file_id = ?1 ORDER BY created_at DESC LIMIT 1",
        params![file_id],
        map_snapshot,
    )
    .optional()
    .map_err(AppError::Database)
}


pub fn get_nth_latest_snapshot(conn: &Connection, file_id: i64, offset: u32) -> Result<Option<Snapshot>, AppError> {
    conn.query_row(
        "SELECT id, file_id, content_hash, size_bytes, delta_bytes, source, created_at, note
         FROM snapshots WHERE file_id = ?1 ORDER BY created_at DESC LIMIT 1 OFFSET ?2",
        params![file_id, offset],
        map_snapshot,
    )
    .optional()
    .map_err(AppError::Database)
}


pub fn get_snapshot_at_or_before(conn: &Connection, file_id: i64, ts_ms: i64) -> Result<Option<Snapshot>, AppError> {
    conn.query_row(
        "SELECT id, file_id, content_hash, size_bytes, delta_bytes, source, created_at, note
         FROM snapshots WHERE file_id = ?1 AND created_at <= ?2 ORDER BY created_at DESC LIMIT 1",
        params![file_id, ts_ms],
        map_snapshot,
    )
    .optional()
    .map_err(AppError::Database)
}


pub fn get_snapshot_at_or_after(conn: &Connection, file_id: i64, ts_ms: i64) -> Result<Option<Snapshot>, AppError> {
    conn.query_row(
        "SELECT id, file_id, content_hash, size_bytes, delta_bytes, source, created_at, note
         FROM snapshots WHERE file_id = ?1 AND created_at >= ?2 ORDER BY created_at ASC LIMIT 1",
        params![file_id, ts_ms],
        map_snapshot,
    )
    .optional()
    .map_err(AppError::Database)
}


pub fn get_snapshot_nearest(conn: &Connection, file_id: i64, ts_ms: i64) -> Result<Option<Snapshot>, AppError> {
    let before = get_snapshot_at_or_before(conn, file_id, ts_ms)?;
    let after  = get_snapshot_at_or_after(conn, file_id, ts_ms)?;
    Ok(match (before, after) {
        (None, x) | (x, None) => x,
        (Some(b), Some(a)) => {
            let db = (ts_ms - b.created_at).abs();
            let da = (a.created_at - ts_ms).abs();

            if da <= db { Some(a) } else { Some(b) }
        }
    })
}

pub fn delete_snapshot(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM snapshots WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn count_snapshots(conn: &Connection, file_id: i64) -> Result<i64, AppError> {
    conn.query_row(
        "SELECT COUNT(*) FROM snapshots WHERE file_id = ?1",
        params![file_id],
        |r| r.get(0),
    )
    .map_err(AppError::Database)
}

pub fn delete_oldest_snapshots_over_limit(
    conn: &Connection,
    file_id: i64,
    keep: u32,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT content_hash FROM snapshots WHERE file_id = ?1
         ORDER BY created_at DESC LIMIT -1 OFFSET ?2",
    )?;
    let hashes: Vec<String> = stmt
        .query_map(params![file_id, keep], |r| r.get(0))?
        .map(|r| r.map_err(AppError::Database))
        .collect::<Result<_, _>>()?;

    if !hashes.is_empty() {
        conn.execute(
            "DELETE FROM snapshots WHERE file_id = ?1
             AND id NOT IN (
               SELECT id FROM snapshots WHERE file_id = ?1 ORDER BY created_at DESC LIMIT ?2
             )",
            params![file_id, keep],
        )?;
    }
    Ok(hashes)
}

pub fn delete_snapshots_older_than(
    conn: &Connection,
    file_id: i64,
    cutoff_unix: i64,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT content_hash FROM snapshots WHERE file_id = ?1 AND created_at < ?2",
    )?;
    let hashes: Vec<String> = stmt
        .query_map(params![file_id, cutoff_unix], |r| r.get(0))?
        .map(|r| r.map_err(AppError::Database))
        .collect::<Result<_, _>>()?;

    if !hashes.is_empty() {
        conn.execute(
            "DELETE FROM snapshots WHERE file_id = ?1 AND created_at < ?2",
            params![file_id, cutoff_unix],
        )?;
    }
    Ok(hashes)
}


pub fn insert_rename_event(
    conn: &Connection,
    file_id: i64,
    old_path: &str,
    new_path: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO rename_events (file_id, old_rel_path, new_rel_path, at)
         VALUES (?1, ?2, ?3, ?4)",
        params![file_id, old_path, new_path, now_unix()],
    )?;
    Ok(())
}


pub fn increment_cas_ref(
    conn: &Connection,
    hash: &str,
    size_bytes: i64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO cas_refs (content_hash, size_bytes, ref_count) VALUES (?1, ?2, 1)
         ON CONFLICT(content_hash) DO UPDATE SET ref_count = ref_count + 1",
        params![hash, size_bytes],
    )?;
    Ok(())
}

pub fn decrement_cas_ref(conn: &Connection, hash: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE cas_refs SET ref_count = MAX(0, ref_count - 1) WHERE content_hash = ?1",
        params![hash],
    )?;
    Ok(())
}

pub fn decrement_cas_refs_batch(conn: &Connection, hashes: &[String]) -> Result<(), AppError> {
    if hashes.is_empty() { return Ok(()); }
    for hash in hashes {
        conn.execute(
            "UPDATE cas_refs SET ref_count = MAX(0, ref_count - 1) WHERE content_hash = ?1",
            params![hash],
        )?;
    }
    Ok(())
}

pub fn list_orphaned_cas(conn: &Connection) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT content_hash FROM cas_refs WHERE ref_count = 0"
    )?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    rows.map(|r| r.map_err(AppError::Database)).collect()
}

pub fn delete_cas_ref(conn: &Connection, hash: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM cas_refs WHERE content_hash = ?1", params![hash])?;
    Ok(())
}


pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .optional()
    .map_err(AppError::Database)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}


pub fn set_file_note(conn: &Connection, file_id: i64, note: Option<&str>) -> Result<(), AppError> {
    conn.execute("UPDATE files SET note = ?1 WHERE id = ?2", params![note, file_id])?;
    Ok(())
}

pub fn set_snapshot_note(conn: &Connection, snapshot_id: i64, note: Option<&str>) -> Result<(), AppError> {
    conn.execute("UPDATE snapshots SET note = ?1 WHERE id = ?2", params![note, snapshot_id])?;
    Ok(())
}

pub fn search_notes(conn: &Connection, folder_id: i64, query: &str) -> Result<Vec<NoteHit>, AppError> {
    let like = format!("%{query}%");
    let mut results: Vec<NoteHit> = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT f.id, f.folder_id, f.rel_path, f.note
         FROM files f WHERE f.folder_id = ?1 AND f.note IS NOT NULL AND f.note LIKE ?2",
    )?;
    let file_hits = stmt.query_map(params![folder_id, &like], |row| {
        Ok(NoteHit {
            kind: "file".to_string(),
            id: row.get(0)?,
            folder_id: row.get(1)?,
            file_id: None,
            label: row.get(2)?,
            note: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            created_at: None,
        })
    })?;
    for h in file_hits { results.push(h.map_err(AppError::Database)?); }

    let mut stmt = conn.prepare(
        "SELECT s.id, f.folder_id, f.id, f.rel_path, s.note, s.created_at
         FROM snapshots s JOIN files f ON f.id = s.file_id
         WHERE f.folder_id = ?1 AND s.note IS NOT NULL AND s.note LIKE ?2
         ORDER BY s.created_at DESC",
    )?;
    let snap_hits = stmt.query_map(params![folder_id, &like], |row| {
        Ok(NoteHit {
            kind: "snapshot".to_string(),
            id: row.get(0)?,
            folder_id: row.get(1)?,
            file_id: Some(row.get(2)?),
            label: row.get(3)?,
            note: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            created_at: Some(row.get(5)?),
        })
    })?;
    for h in snap_hits { results.push(h.map_err(AppError::Database)?); }

    Ok(results)
}


pub fn cleanup_orphaned_files(conn: &Connection) -> Result<u64, AppError> {
    let n = conn.execute(
        "DELETE FROM files WHERE id NOT IN (SELECT DISTINCT file_id FROM snapshots)",
        [],
    )?;
    Ok(n as u64)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupStats {
    pub physical_bytes: i64,
    pub logical_bytes: i64,
    pub saved_bytes: i64,
    pub dedup_ratio: f64,
}


pub fn get_dedup_stats(conn: &Connection) -> Result<DedupStats, AppError> {
    let row: (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(size_bytes), 0), COALESCE(SUM(size_bytes * ref_count), 0)
         FROM cas_refs WHERE ref_count > 0",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(AppError::Database)?;
    let physical = row.0;
    let logical = row.1;
    let saved = logical - physical;
    let ratio = if physical > 0 { logical as f64 / physical as f64 } else { 1.0 };
    Ok(DedupStats { physical_bytes: physical, logical_bytes: logical, saved_bytes: saved, dedup_ratio: ratio })
}


pub fn set_file_override(conn: &Connection, file_id: i64, no_auto_snapshot: bool) -> Result<(), AppError> {
    conn.execute(
        "UPDATE files SET no_auto_snapshot = ?1 WHERE id = ?2",
        params![no_auto_snapshot as i64, file_id],
    )?;
    Ok(())
}


pub fn set_path_override(
    conn: &Connection,
    folder_id: i64,
    path_prefix: &str,
    no_auto_snapshot: bool,
) -> Result<u64, AppError> {
    let rows = if path_prefix.is_empty() {
        conn.execute(
            "UPDATE files SET no_auto_snapshot = ?1 WHERE folder_id = ?2",
            params![no_auto_snapshot as i64, folder_id],
        )?
    } else {
        let like = format!("{path_prefix}/%");
        conn.execute(
            "UPDATE files SET no_auto_snapshot = ?1 WHERE folder_id = ?2 AND rel_path LIKE ?3",
            params![no_auto_snapshot as i64, folder_id, like],
        )?
    };
    Ok(rows as u64)
}


pub fn log_activity(
    conn: &Connection,
    folder_id: i64,
    timestamp: i64,
    action: &str,
    rel_path: Option<&str>,
    reason: Option<&str>,
    snapshot_id: Option<i64>,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO activity_log (folder_id, timestamp, action, rel_path, reason, snapshot_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![folder_id, timestamp, action, rel_path, reason, snapshot_id],
    )?;
    Ok(())
}

pub fn list_activity_log(conn: &Connection, folder_id: i64, limit: u32) -> Result<Vec<ActivityEntry>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, timestamp, action, rel_path, reason, snapshot_id
         FROM activity_log WHERE folder_id = ?1 ORDER BY timestamp DESC LIMIT ?2"
    )?;
    let rows = stmt.query_map(params![folder_id, limit], |row| {
        Ok(ActivityEntry {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            timestamp: row.get(2)?,
            action: row.get(3)?,
            rel_path: row.get(4)?,
            reason: row.get(5)?,
            snapshot_id: row.get(6)?,
        })
    })?;
    rows.map(|r| r.map_err(AppError::Database)).collect()
}


pub fn run_db_integrity_check(conn: &Connection) -> Result<IntegrityResult, AppError> {
    let messages: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA integrity_check")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };
    let db_ok = messages.len() == 1 && messages[0] == "ok";
    Ok(IntegrityResult { db_ok, db_messages: messages, cas_checked: 0, cas_missing: 0 })
}


pub fn get_storage_breakdown(conn: &Connection, folder_id: i64) -> Result<Vec<StorageEntry>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT f.rel_path,
                COUNT(s.id) as snapshot_count,
                COALESCE(SUM(DISTINCT cr.size_bytes), 0) as physical_bytes,
                COALESCE(SUM(s.size_bytes), 0) as logical_bytes
         FROM files f
         JOIN snapshots s ON s.file_id = f.id
         JOIN cas_refs cr ON cr.content_hash = s.content_hash
         WHERE f.folder_id = ?1
         GROUP BY f.id
         ORDER BY logical_bytes DESC
         LIMIT 100"
    )?;
    let rows = stmt.query_map(params![folder_id], |row| {
        Ok(StorageEntry {
            rel_path: row.get(0)?,
            snapshot_count: row.get::<_, i64>(1)? as u32,
            physical_bytes: row.get(2)?,
            logical_bytes: row.get(3)?,
        })
    })?;
    rows.map(|r| r.map_err(AppError::Database)).collect()
}


pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
