use rusqlite::Connection;
use crate::config::RetentionRule;
use crate::db::repo;
use crate::error::AppError;
use crate::store::cas::CasStore;


pub fn enforce(
    conn: &Connection,
    _cas: &CasStore,
    file_id: i64,
    rule: &RetentionRule,
) -> Result<(), AppError> {
    let hashes_to_drop = match rule {
        RetentionRule::KeepLast { count } => {
            repo::delete_oldest_snapshots_over_limit(conn, file_id, *count)?
        }
        RetentionRule::TimeBased { days } => {
            let cutoff = now_unix() - (*days as i64) * 86_400_000;
            repo::delete_snapshots_older_than(conn, file_id, cutoff)?
        }
        RetentionRule::Hybrid { count, days } => {
            let cutoff = now_unix() - (*days as i64) * 86_400_000;
            let mut by_time = repo::delete_snapshots_older_than(conn, file_id, cutoff)?;
            let by_count = repo::delete_oldest_snapshots_over_limit(conn, file_id, *count)?;
            by_time.extend(by_count);
            by_time
        }
    };

    repo::decrement_cas_refs_batch(conn, &hashes_to_drop)?;

    Ok(())
}


pub fn gc(conn: &Connection, cas: &CasStore) -> Result<usize, AppError> {
    let orphans = repo::list_orphaned_cas(conn)?;
    let count = orphans.len();
    for hash in &orphans {
        cas.remove(hash)?;
        repo::delete_cas_ref(conn, hash)?;
    }
    Ok(count)
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
