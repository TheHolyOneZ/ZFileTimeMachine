use rusqlite::Connection;
use crate::error::AppError;

const SCHEMA: &str = include_str!("schema.sql");

pub fn run(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(SCHEMA)?;

    let _ = conn.execute_batch("ALTER TABLE files ADD COLUMN note TEXT DEFAULT NULL;");
    let _ = conn.execute_batch("ALTER TABLE snapshots ADD COLUMN note TEXT DEFAULT NULL;");

    let _ = conn.execute_batch("ALTER TABLE files ADD COLUMN no_auto_snapshot INTEGER NOT NULL DEFAULT 0;");

    let _ = conn.execute_batch("ALTER TABLE files ADD COLUMN deleted_at INTEGER DEFAULT NULL;");

    let _ = conn.execute_batch("ALTER TABLE folders ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;");

    let _ = conn.execute_batch("ALTER TABLE folders ADD COLUMN deleted_at INTEGER DEFAULT NULL;");

    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY,
            folder_id INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            action TEXT NOT NULL,
            rel_path TEXT,
            reason TEXT,
            snapshot_id INTEGER
        );"
    );
    let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_activity_folder_ts ON activity_log(folder_id, timestamp DESC);");
    Ok(())
}
