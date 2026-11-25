use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;

static PROTECTED: RwLock<Vec<PathBuf>> = RwLock::new(Vec::new());

pub fn protect_path(path: &Path) {
    let mut candidates = vec![path.to_path_buf()];
    if let Ok(canonical) = path.canonicalize() {
        candidates.push(strip_verbatim(canonical));
    }
    if let Ok(mut list) = PROTECTED.write() {
        for c in candidates {
            if !list.contains(&c) {
                list.push(c);
            }
        }
    }
}

pub fn is_protected(path: &Path) -> bool {
    PROTECTED
        .read()
        .map(|list| list.iter().any(|base| relative_components(path, base).is_some()))
        .unwrap_or(false)
}

pub fn protected_prefixes_in(root: &Path) -> Vec<String> {
    let Ok(list) = PROTECTED.read() else { return Vec::new() };
    let mut out: Vec<String> = Vec::new();
    for base in list.iter() {
        if let Some(rel) = relative_components(base, root) {
            let prefix = rel.join("/");
            if !out.contains(&prefix) {
                out.push(prefix);
            }
        }
    }
    out
}

fn strip_verbatim(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path
}

fn component_key(c: &Component) -> String {
    let s = c.as_os_str().to_string_lossy();
    if cfg!(any(target_os = "windows", target_os = "macos")) {
        s.to_lowercase()
    } else {
        s.into_owned()
    }
}

fn relative_components(path: &Path, base: &Path) -> Option<Vec<String>> {
    let mut path_iter = path.components().filter(|c| !matches!(c, Component::CurDir));
    for b in base.components().filter(|c| !matches!(c, Component::CurDir)) {
        let p = path_iter.next()?;
        if component_key(&p) != component_key(&b) {
            return None;
        }
    }
    Some(path_iter.map(|c| c.as_os_str().to_string_lossy().into_owned()).collect())
}

pub struct IgnoreMatcher {
    root: PathBuf,
    inner: Gitignore,
}

impl IgnoreMatcher {
    pub fn new(root: &Path, globs: &[String]) -> Self {
        let mut builder = GitignoreBuilder::new(root);
        for glob in globs {
            let _ = builder.add_line(None, glob);
        }
        let inner = builder.build().unwrap_or_else(|_| Gitignore::empty());
        Self { root: root.to_path_buf(), inner }
    }

    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        if is_protected(path) {
            return true;
        }
        let Ok(rel) = path.strip_prefix(&self.root) else {
            return self.inner.matched(path, is_dir).is_ignore();
        };
        let mut prefix = PathBuf::new();
        let mut parts = rel.components().peekable();
        while let Some(part) = parts.next() {
            prefix.push(part);
            if parts.peek().is_none() {
                break;
            }
            if self.inner.matched(&prefix, true).is_ignore() {
                return true;
            }
        }
        !prefix.as_os_str().is_empty() && self.inner.matched(&prefix, is_dir).is_ignore()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matcher(globs: &[&str]) -> (tempfile::TempDir, IgnoreMatcher) {
        let dir = tempfile::tempdir().unwrap();
        let globs: Vec<String> = globs.iter().map(|g| g.to_string()).collect();
        let m = IgnoreMatcher::new(dir.path(), &globs);
        (dir, m)
    }

    #[test]
    fn directory_rule_covers_files_inside_it() {
        let (dir, m) = matcher(&["com.zfiletimemachine.ZFileTimeMachine/", "node_modules/"]);
        let root = dir.path();
        assert!(m.is_ignored(&root.join("com.zfiletimemachine.ZFileTimeMachine/cas/ab/cd/abcd"), false));
        assert!(m.is_ignored(&root.join("app/node_modules/pkg/index.js"), false));
        assert!(!m.is_ignored(&root.join("app/src/index.js"), false));
    }

    #[test]
    fn nested_directory_rule_and_plain_name() {
        let (dir, m) = matcher(&["cas/", "Cache"]);
        let root = dir.path();
        assert!(m.is_ignored(&root.join("x/cas/00/11/hash"), false));
        assert!(m.is_ignored(&root.join("Some App/Cache/blob.bin"), false));
        assert!(!m.is_ignored(&root.join("x/cascade.txt"), false));
    }

    #[test]
    fn file_rules_still_match_the_file_itself() {
        let (dir, m) = matcher(&["*.log", "!keep.log"]);
        let root = dir.path();
        assert!(m.is_ignored(&root.join("a/b/run.log"), false));
        assert!(!m.is_ignored(&root.join("a/keep.log"), false));
        assert!(!m.is_ignored(&root.join("a/b/run.txt"), false));
    }

    #[test]
    fn protected_path_is_always_ignored() {
        let (dir, m) = matcher(&[]);
        let data = dir.path().join("app-data");
        std::fs::create_dir_all(&data).unwrap();
        protect_path(&data);
        assert!(m.is_ignored(&data, true));
        assert!(m.is_ignored(&data.join("cas/ab/cd/abcd"), false));
        assert!(m.is_ignored(&data.join("db.sqlite-wal"), false));
        assert!(!m.is_ignored(&dir.path().join("app-data2/file.txt"), false));
        assert_eq!(protected_prefixes_in(dir.path()), vec!["app-data".to_string()]);
        assert!(is_protected(&data.join("sub")));
    }
}
