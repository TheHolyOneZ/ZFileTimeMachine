use std::io::Write;
use std::path::Path;
use sha2::{Digest, Sha256};
use crate::error::AppError;


pub fn atomic_write(target: &Path, content: &[u8], expected_hash: &str) -> Result<(), AppError> {
    let parent = target.parent().ok_or_else(|| {
        AppError::Other("target has no parent directory".into())
    })?;
    std::fs::create_dir_all(parent)?;

    let tmp = parent.join(format!(
        ".zftm_tmp_{:08x}_{:08x}",
        nanos_low(),
        ptr_entropy(),
    ));


    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(content)?;
        f.sync_all()?;
    }


    match std::fs::rename(&tmp, target) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            let _ = std::fs::remove_file(&tmp);
            let mut f = std::fs::File::create(target)?;
            f.write_all(content)?;
            f.sync_all()?;
        }
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(AppError::Io(e));
        }
    }


    let on_disk = std::fs::read(target)
        .map_err(|e| AppError::Other(format!("post-write read failed: {e}")))?;
    let actual = hex::encode(Sha256::digest(&on_disk));
    if actual != expected_hash {
        return Err(AppError::Other(format!(
            "write verify failed: expected {expected_hash}, got {actual}"
        )));
    }

    Ok(())
}

pub fn mtime_millis(path: &Path) -> i64 {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn is_temp_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with(".zftm_tmp_"))
}

fn nanos_low() -> u32 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos()
}

fn ptr_entropy() -> u32 {
    let x: u32 = 0;
    let p = &x as *const u32 as usize;
    (p ^ (p >> 16)) as u32
}
