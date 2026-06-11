use std::path::PathBuf;
use sha2::{Digest, Sha256};
use crate::error::AppError;

pub struct CasStore {
    base: PathBuf,
}

impl CasStore {
    pub fn new(base: PathBuf) -> Self {
        Self { base }
    }


    pub fn put(&self, data: &[u8]) -> Result<String, AppError> {
        self.put_with_compression(data, false)
    }


    pub fn put_with_compression(&self, data: &[u8], compress: bool) -> Result<String, AppError> {
        let hash = hex::encode(Sha256::digest(data));

        let (bytes_to_write, path) = if compress {
            let compressed = zstd::encode_all(data, 3).map_err(|e| AppError::Other(e.to_string()))?;
            (compressed, self.blob_path_compressed(&hash))
        } else {
            (data.to_vec(), self.blob_path(&hash))
        };
        if path.exists() {
            return Ok(hash);
        }

        let other_path = if compress { self.blob_path(&hash) } else { self.blob_path_compressed(&hash) };
        if other_path.exists() {
            return Ok(hash);
        }
        let parent = path.parent().expect("has parent");
        std::fs::create_dir_all(parent)?;
        let tmp = parent.join(format!(".tmp.{}", &hash[..16]));
        std::fs::write(&tmp, &bytes_to_write)?;
        std::fs::rename(&tmp, &path)?;
        Ok(hash)
    }

    pub fn get(&self, hash: &str) -> Result<Vec<u8>, AppError> {
        let compressed_path = self.blob_path_compressed(hash);
        if compressed_path.exists() {
            let data = std::fs::read(&compressed_path)?;
            return zstd::decode_all(data.as_slice())
                .map_err(|e| AppError::Other(e.to_string()));
        }
        std::fs::read(self.blob_path(hash)).map_err(AppError::Io)
    }

    pub fn remove(&self, hash: &str) -> Result<(), AppError> {
        let path = self.blob_path(hash);
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        let compressed_path = self.blob_path_compressed(hash);
        if compressed_path.exists() {
            std::fs::remove_file(&compressed_path)?;
        }
        Ok(())
    }

    pub fn exists(&self, hash: &str) -> bool {
        self.blob_path(hash).exists() || self.blob_path_compressed(hash).exists()
    }

    pub fn is_compressed_blob(&self, hash: &str) -> bool {
        self.blob_path_compressed(hash).exists()
    }


    pub fn estimate_size_bytes(&self) -> u64 {
        fn walk_dir(dir: &std::path::Path) -> u64 {
            let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
            entries.filter_map(|e| e.ok()).map(|e| {
                let p = e.path();
                if p.is_dir() { walk_dir(&p) } else { p.metadata().map(|m| m.len()).unwrap_or(0) }
            }).sum()
        }
        walk_dir(&self.base)
    }

    fn blob_path(&self, hash: &str) -> PathBuf {

        let (shard1, rest) = hash.split_at(2);
        let (shard2, _) = rest.split_at(2);
        self.base.join(shard1).join(shard2).join(hash)
    }

    fn blob_path_compressed(&self, hash: &str) -> PathBuf {
        let (shard1, rest) = hash.split_at(2);
        let (shard2, _) = rest.split_at(2);
        self.base.join(shard1).join(shard2).join(format!("{hash}.zst"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trip() {
        let dir = tempdir().unwrap();
        let cas = CasStore::new(dir.path().to_path_buf());
        let data = b"hello world";
        let hash = cas.put(data).unwrap();
        assert_eq!(cas.get(&hash).unwrap(), data);
    }

    #[test]
    fn idempotent_put() {
        let dir = tempdir().unwrap();
        let cas = CasStore::new(dir.path().to_path_buf());
        let data = b"same content";
        let h1 = cas.put(data).unwrap();
        let h2 = cas.put(data).unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn compressed_round_trip() {
        let dir = tempdir().unwrap();
        let cas = CasStore::new(dir.path().to_path_buf());
        let data = b"hello compressed world";
        let hash = cas.put_with_compression(data, true).unwrap();
        assert_eq!(cas.get(&hash).unwrap(), data);
    }
}
