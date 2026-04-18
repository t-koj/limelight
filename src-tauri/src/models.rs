use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageInfo {
    pub id: i64,
    pub path: String,
    pub folder_id: i64,
    pub filename: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub file_size: Option<i64>,
    pub tagged_at: Option<String>,
    pub created_at: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub name: String,
    pub score: Option<f64>,
    pub is_manual: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub threshold: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self { threshold: 0.35 }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelStatus {
    pub downloaded: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanResult {
    pub added: usize,
    pub skipped: usize,
}
