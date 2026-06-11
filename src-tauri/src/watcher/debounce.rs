use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};


pub struct DebounceTracker {
    last_snapshot: HashMap<PathBuf, Instant>,
    window: Duration,
}

impl DebounceTracker {
    pub fn new(window_secs: u32) -> Self {
        Self {
            last_snapshot: HashMap::new(),
            window: Duration::from_secs(window_secs as u64),
        }
    }


    pub fn should_snapshot(&mut self, path: &PathBuf) -> bool {
        let now = Instant::now();
        match self.last_snapshot.get(path) {
            Some(last) if now.duration_since(*last) < self.window => false,
            _ => {
                self.last_snapshot.insert(path.clone(), now);
                true
            }
        }
    }

    pub fn mark_snapshoted(&mut self, path: &PathBuf) {
        self.last_snapshot.insert(path.clone(), Instant::now());
    }
}
