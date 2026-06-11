use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalSettings {
    pub global_size_cap_mb: Option<u64>,
    pub log_level: String,

    #[serde(default)]
    pub close_to_tray: bool,


    #[serde(default)]
    pub start_on_boot: bool,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            global_size_cap_mb: None,
            log_level: "info".to_string(),
            close_to_tray: false,
            start_on_boot: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BackupTrigger {
    OnChange,
    Interval { minutes: u32 },
    Manual,
    Hybrid { debounce_secs: u32, interval_minutes: u32 },
}

impl Default for BackupTrigger {
    fn default() -> Self {
        BackupTrigger::OnChange
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RetentionRule {
    KeepLast { count: u32 },
    TimeBased { days: u32 },
    Hybrid { count: u32, days: u32 },
}

impl Default for RetentionRule {
    fn default() -> Self {
        RetentionRule::KeepLast { count: 10 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderConfig {
    pub trigger: BackupTrigger,
    pub retention: RetentionRule,
    pub ignore_globs: Vec<String>,
    pub binary_max_mb: u64,
    pub binary_keep_last: u32,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_files_larger_than_mb: Option<u64>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_snapshot_interval_secs: Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debounce_ms: Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_depth: Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compression_enabled: Option<bool>,
}

impl Default for FolderConfig {
    fn default() -> Self {
        Self {
            trigger: BackupTrigger::default(),
            retention: RetentionRule::default(),
            ignore_globs: vec![
                "node_modules/".to_string(),
                "target/".to_string(),
                ".git/".to_string(),
                "*.tmp".to_string(),
                "*.log".to_string(),
            ],
            binary_max_mb: 50,
            binary_keep_last: 3,
            color: None,
            icon: None,
            skip_files_larger_than_mb: None,
            min_snapshot_interval_secs: None,
            debounce_ms: None,
            max_depth: None,
            compression_enabled: None,
        }
    }
}
