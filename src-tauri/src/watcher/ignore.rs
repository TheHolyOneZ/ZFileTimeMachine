use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::Path;

pub struct IgnoreMatcher {
    inner: Gitignore,
}

impl IgnoreMatcher {
    pub fn new(root: &Path, globs: &[String]) -> Self {
        let mut builder = GitignoreBuilder::new(root);
        for glob in globs {
            let _ = builder.add_line(None, glob);
        }
        let inner = builder.build().unwrap_or_else(|_| Gitignore::empty());
        Self { inner }
    }

    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.inner.matched(path, is_dir).is_ignore()
    }
}
