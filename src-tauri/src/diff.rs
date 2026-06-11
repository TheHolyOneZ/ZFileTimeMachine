use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: String,
    pub content: String,
    pub old_lineno: Option<usize>,
    pub new_lineno: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub lines: Vec<DiffLine>,
    pub is_binary: bool,
    pub too_large: bool,
}

const MAX_DIFF_BYTES: usize = 512 * 1024;

pub fn compute(old: &[u8], new: &[u8]) -> DiffResult {
    if old.len() > MAX_DIFF_BYTES || new.len() > MAX_DIFF_BYTES {
        return DiffResult { lines: vec![], is_binary: false, too_large: true };
    }

    if old.contains(&0) || new.contains(&0) {
        return DiffResult { lines: vec![], is_binary: true, too_large: false };
    }
    let old_str = String::from_utf8_lossy(old);
    let new_str = String::from_utf8_lossy(new);

    let diff = TextDiff::from_lines(old_str.as_ref(), new_str.as_ref());
    let mut lines = Vec::new();
    let mut old_no: usize = 1;
    let mut new_no: usize = 1;

    for change in diff.iter_all_changes() {
        let (kind, old_lineno, new_lineno) = match change.tag() {
            ChangeTag::Equal => {
                let o = old_no;
                let n = new_no;
                old_no += 1;
                new_no += 1;
                ("equal".to_string(), Some(o), Some(n))
            }
            ChangeTag::Delete => {
                let o = old_no;
                old_no += 1;
                ("delete".to_string(), Some(o), None)
            }
            ChangeTag::Insert => {
                let n = new_no;
                new_no += 1;
                ("insert".to_string(), None, Some(n))
            }
        };
        lines.push(DiffLine {
            kind,
            content: change.value().to_string(),
            old_lineno,
            new_lineno,
        });
    }

    DiffResult { lines, is_binary: false, too_large: false }
}
