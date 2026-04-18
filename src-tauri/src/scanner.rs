use anyhow::Result;
use std::path::Path;
use walkdir::WalkDir;

use crate::models::ScanResult;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif"];

pub struct ScannedImage {
    pub path: String,
    pub filename: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_size: Option<u64>,
}

pub fn scan_folder(folder_path: &str) -> Result<Vec<ScannedImage>> {
    let mut images = Vec::new();

    for entry in WalkDir::new(folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if !IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                continue;
            }
        } else {
            continue;
        }

        let path_str = path.to_string_lossy().to_string();
        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_size = path.metadata().ok().map(|m| m.len());
        let (width, height) = read_image_dimensions(path);

        images.push(ScannedImage {
            path: path_str,
            filename,
            width,
            height,
            file_size,
        });
    }

    Ok(images)
}

fn read_image_dimensions(path: &Path) -> (Option<u32>, Option<u32>) {
    match image::image_dimensions(path) {
        Ok((w, h)) => (Some(w), Some(h)),
        Err(_) => (None, None),
    }
}

pub fn count_result(added: usize, skipped: usize) -> ScanResult {
    ScanResult { added, skipped }
}
