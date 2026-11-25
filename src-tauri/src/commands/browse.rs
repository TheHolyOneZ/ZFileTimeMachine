use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::watcher::ignore::{is_protected, IgnoreMatcher};

const SIZE_BUDGET: usize = 40_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub items: Option<u32>,
    pub ignored: bool,
    pub protected: bool,
}

fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Invalid path".into());
    }
    Ok(root.join(rel_path))
}

fn dir_size(path: &Path, budget: &mut usize) -> Option<u64> {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            if *budget == 0 {
                return None;
            }
            *budget -= 1;
            let Ok(meta) = entry.metadata() else { continue };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                if !is_protected(&entry.path()) {
                    stack.push(entry.path());
                }
            } else {
                total += meta.len();
            }
        }
    }
    Some(total)
}

pub fn list_dir(root: &Path, rel: &str, globs: &[String]) -> Result<Vec<DirEntryInfo>, String> {
    let dir = safe_join(root, rel)?;
    let read = fs::read_dir(&dir).map_err(|e| format!("Couldn't read {}: {e}", dir.display()))?;
    let matcher = IgnoreMatcher::new(root, globs);
    let mut budget = SIZE_BUDGET;
    let mut out = Vec::new();

    for entry in read.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel_path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        let is_dir = meta.is_dir();
        let protected = is_protected(&path);
        let ignored = protected || matcher.is_ignored(&path, is_dir);
        let (size, items) = if is_dir {
            let items = fs::read_dir(&path).map(|r| r.count() as u32).ok();
            let size = if ignored { None } else { dir_size(&path, &mut budget) };
            (size, items)
        } else {
            (Some(meta.len()), None)
        };
        out.push(DirEntryInfo { name, rel_path, is_dir, size, items, ignored, protected });
    }

    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub async fn list_directory(root: String, rel: String, globs: Vec<String>) -> Result<Vec<DirEntryInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || list_dir(Path::new(&root), &rel, &globs))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        fs::create_dir_all(r.join("src/components")).unwrap();
        fs::create_dir_all(r.join("node_modules/pkg")).unwrap();
        fs::write(r.join("src/main.ts"), "hello").unwrap();
        fs::write(r.join("src/components/A.tsx"), "abc").unwrap();
        fs::write(r.join("node_modules/pkg/index.js"), "x").unwrap();
        fs::write(r.join("README.md"), "readme").unwrap();
        fs::write(r.join("debug.log"), "log").unwrap();
        dir
    }

    #[test]
    fn lists_folders_first_with_sizes_and_rules() {
        let dir = tree();
        let globs = vec!["node_modules/".to_string(), "*.log".to_string()];
        let list = list_dir(dir.path(), "", &globs).unwrap();
        let names: Vec<_> = list.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["node_modules", "src", "debug.log", "README.md"]);

        let src = list.iter().find(|e| e.name == "src").unwrap();
        assert!(src.is_dir && !src.ignored);
        assert_eq!(src.items, Some(2));
        assert_eq!(src.size, Some(8));

        let nm = list.iter().find(|e| e.name == "node_modules").unwrap();
        assert!(nm.ignored);
        assert_eq!(nm.size, None);

        assert!(list.iter().find(|e| e.name == "debug.log").unwrap().ignored);
        assert_eq!(list.iter().find(|e| e.name == "README.md").unwrap().size, Some(6));
    }

    #[test]
    fn anchored_rules_only_skip_that_exact_path() {
        let dir = tree();
        fs::create_dir_all(dir.path().join("src/src")).unwrap();
        let globs = vec!["/src/components/".to_string(), "/src/main.ts".to_string()];
        let list = list_dir(dir.path(), "src", &globs).unwrap();
        let get = |n: &str| list.iter().find(|e| e.name == n).unwrap().clone();
        assert!(get("components").ignored);
        assert!(get("main.ts").ignored);
        assert!(!get("src").ignored);
        assert_eq!(get("components").rel_path, "src/components");
    }

    #[test]
    fn escaped_rules_match_names_with_wildcard_characters() {
        let dir = tree();
        fs::create_dir_all(dir.path().join("[slug]")).unwrap();
        fs::write(dir.path().join("s"), "x").unwrap();
        fs::write(dir.path().join("{a,b}.txt"), "x").unwrap();
        fs::write(dir.path().join("a.txt"), "x").unwrap();
        let globs = vec!["/\\[slug\\]/".to_string(), "/\\{a,b\\}.txt".to_string()];
        let list = list_dir(dir.path(), "", &globs).unwrap();
        let ignored = |n: &str| list.iter().find(|e| e.name == n).unwrap().ignored;
        assert!(ignored("[slug]"));
        assert!(ignored("{a,b}.txt"));
        assert!(!ignored("s"));
        assert!(!ignored("a.txt"));
    }

    #[test]
    fn negated_rules_bring_a_path_back() {
        let dir = tree();
        let globs = vec!["node_modules/".to_string(), "!/node_modules/".to_string()];
        let list = list_dir(dir.path(), "", &globs).unwrap();
        assert!(!list.iter().find(|e| e.name == "node_modules").unwrap().ignored);
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        let dir = tree();
        assert!(list_dir(dir.path(), "../", &[]).is_err());
        assert!(list_dir(dir.path(), "/etc", &[]).is_err());
        assert!(list_dir(dir.path(), "src/../..", &[]).is_err());
    }

    #[test]
    fn size_gives_up_on_huge_folders() {
        let dir = tree();
        let mut budget = 1;
        assert_eq!(dir_size(dir.path(), &mut budget), None);
    }
}
