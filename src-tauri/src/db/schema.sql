PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
    id           INTEGER PRIMARY KEY,
    path         TEXT    NOT NULL UNIQUE,
    display_name TEXT    NOT NULL,
    config_json  TEXT    NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    id            INTEGER PRIMARY KEY,
    folder_id     INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    rel_path      TEXT    NOT NULL,
    is_binary     INTEGER NOT NULL DEFAULT 0,
    current_hash  TEXT,
    last_modified INTEGER NOT NULL,
    UNIQUE(folder_id, rel_path)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id           INTEGER PRIMARY KEY,
    file_id      INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    content_hash TEXT    NOT NULL,
    size_bytes   INTEGER NOT NULL,
    delta_bytes  INTEGER NOT NULL,
    source       TEXT    NOT NULL,
    created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_file_created
    ON snapshots(file_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rename_events (
    id          INTEGER PRIMARY KEY,
    file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    old_rel_path TEXT   NOT NULL,
    new_rel_path TEXT   NOT NULL,
    at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cas_refs (
    content_hash TEXT    PRIMARY KEY,
    size_bytes   INTEGER NOT NULL,
    ref_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
