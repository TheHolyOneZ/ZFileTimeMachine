use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("watcher error: {0}")]
    Watcher(String),

    #[error("{0}")]
    Other(String),
}


impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
