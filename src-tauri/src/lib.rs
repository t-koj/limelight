mod db;
mod models;
mod scanner;
mod tagger;

use models::{Folder, ImageInfo, ModelStatus, ScanResult, Settings, TagInfo};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

pub struct AppState {
    pub db: SqlitePool,
    pub data_dir: PathBuf,
    pub tagger: Arc<Mutex<Option<tagger::WdTagger>>>,
}

fn db_error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
async fn add_folder(path: String, state: State<'_, AppState>) -> Result<Folder, String> {
    let meta = std::fs::metadata(&path).map_err(db_error)?;
    if !meta.is_dir() {
        return Err("Path is not a directory".into());
    }
    db::add_folder(&state.db, &path).await.map_err(db_error)
}

#[tauri::command]
async fn remove_folder(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    db::remove_folder(&state.db, id).await.map_err(db_error)
}

#[tauri::command]
async fn get_folders(state: State<'_, AppState>) -> Result<Vec<Folder>, String> {
    db::get_folders(&state.db).await.map_err(db_error)
}

#[tauri::command]
async fn scan_folders(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    let folders = db::get_folders(&state.db).await.map_err(db_error)?;
    let mut added = 0;
    let mut skipped = 0;

    for folder in &folders {
        let images = scanner::scan_folder(&folder.path).map_err(db_error)?;
        for img in images {
            let result = db::upsert_image(
                &state.db,
                &img.path,
                folder.id,
                &img.filename,
                img.width,
                img.height,
                img.file_size,
            )
            .await;

            match result {
                Ok(_) => added += 1,
                Err(_) => skipped += 1,
            }
        }
    }

    let _ = app.emit("scan-complete", scanner::count_result(added, skipped));
    Ok(scanner::count_result(added, skipped))
}

#[tauri::command]
async fn get_images(
    tag_filter: Vec<String>,
    folder_id: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<ImageInfo>, String> {
    db::get_images(&state.db, &tag_filter, folder_id)
        .await
        .map_err(db_error)
}

#[tauri::command]
async fn get_image_tags(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<TagInfo>, String> {
    db::get_image_tags(&state.db, image_id)
        .await
        .map_err(db_error)
}

#[tauri::command]
async fn add_image_tag(
    image_id: i64,
    tag_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    db::add_image_tag(&state.db, image_id, &tag_name, None, true)
        .await
        .map_err(db_error)
}

#[tauri::command]
async fn remove_image_tag(
    image_id: i64,
    tag_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    db::remove_image_tag(&state.db, image_id, &tag_name)
        .await
        .map_err(db_error)
}

#[tauri::command]
async fn generate_tags_for_image(
    image_id: i64,
    threshold: f32,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let image_info = db::get_images(&state.db, &[], None)
        .await
        .map_err(db_error)?
        .into_iter()
        .find(|i| i.id == image_id)
        .ok_or("Image not found")?;

    let mut tag_guard = state.tagger.lock().await;
    let tagger = tag_guard.as_mut().ok_or("Model not loaded. Please download the model first.")?;

    let tags = tagger
        .predict(
            std::path::Path::new(&image_info.path),
            threshold,
        )
        .map_err(db_error)?;

    db::clear_ai_tags(&state.db, image_id)
        .await
        .map_err(db_error)?;

    let mut tag_names = Vec::new();
    for (name, score) in &tags {
        db::add_image_tag(&state.db, image_id, name, Some(*score as f64), false)
            .await
            .map_err(db_error)?;
        tag_names.push(name.clone());
    }

    db::mark_image_tagged(&state.db, image_id)
        .await
        .map_err(db_error)?;

    Ok(tag_names)
}

#[tauri::command]
async fn generate_tags_for_all(
    threshold: f32,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let images = db::get_untagged_images(&state.db)
        .await
        .map_err(db_error)?;

    let total = images.len();
    if total == 0 {
        return Ok(());
    }

    let tagger_arc = state.tagger.clone();
    let db = state.db.clone();

    for (i, image) in images.iter().enumerate() {
        let mut tag_guard = tagger_arc.lock().await;
        let tagger = tag_guard
            .as_mut()
            .ok_or("Model not loaded. Please download the model first.")?;

        let tags_result = tagger.predict(std::path::Path::new(&image.path), threshold);
        drop(tag_guard);

        if let Ok(tags) = tags_result {
            let _ = db::clear_ai_tags(&db, image.id).await;
            for (name, score) in &tags {
                let _ = db::add_image_tag(&db, image.id, name, Some(*score as f64), false).await;
            }
            let _ = db::mark_image_tagged(&db, image.id).await;
        }

        let progress = ((i + 1) as f64 / total as f64) * 100.0;
        let _ = app.emit("tagging-progress", serde_json::json!({ "progress": progress, "current": i + 1, "total": total }));
    }

    Ok(())
}

#[tauri::command]
async fn get_untagged_count(state: State<'_, AppState>) -> Result<usize, String> {
    let images = db::get_untagged_images(&state.db)
        .await
        .map_err(db_error)?;
    Ok(images.len())
}

#[tauri::command]
async fn get_all_tags(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    db::get_all_tags(&state.db).await.map_err(db_error)
}

#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let threshold = db::get_setting(&state.db, "threshold")
        .await
        .map_err(db_error)?
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.35);

    Ok(Settings { threshold })
}

#[tauri::command]
async fn save_settings(settings: Settings, state: State<'_, AppState>) -> Result<(), String> {
    db::set_setting(&state.db, "threshold", &settings.threshold.to_string())
        .await
        .map_err(db_error)
}

#[tauri::command]
async fn get_model_status(state: State<'_, AppState>) -> Result<ModelStatus, String> {
    let ready = tagger::is_model_ready(&state.data_dir);
    let path = if ready {
        Some(
            tagger::model_path(&state.data_dir)
                .to_string_lossy()
                .to_string(),
        )
    } else {
        None
    };
    Ok(ModelStatus {
        downloaded: ready,
        path,
    })
}

#[tauri::command]
async fn download_model(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let data_dir = state.data_dir.clone();
    let app_clone = app.clone();

    tagger::download_model(&data_dir, |progress, message| {
        let _ = app_clone.emit(
            "download-progress",
            serde_json::json!({ "progress": progress, "message": message }),
        );
    })
    .await
    .map_err(db_error)?;

    // Load the model after download
    let model_path = tagger::model_path(&data_dir);
    let tags_path = tagger::tags_path(&data_dir);
    match tagger::WdTagger::load(&model_path, &tags_path) {
        Ok(t) => {
            *state.tagger.lock().await = Some(t);
        }
        Err(e) => return Err(format!("Model downloaded but failed to load: {e}")),
    }

    Ok(())
}

#[tauri::command]
async fn load_model(state: State<'_, AppState>) -> Result<bool, String> {
    if !tagger::is_model_ready(&state.data_dir) {
        return Ok(false);
    }

    let model_path = tagger::model_path(&state.data_dir);
    let tags_path = tagger::tags_path(&state.data_dir);

    match tagger::WdTagger::load(&model_path, &tags_path) {
        Ok(t) => {
            *state.tagger.lock().await = Some(t);
            Ok(true)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("limelight.db");
            let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

            let rt = tokio::runtime::Runtime::new().unwrap();
            let pool = rt.block_on(async {
                let opts = SqliteConnectOptions::from_str(&db_url)
                    .unwrap()
                    .create_if_missing(true);
                SqlitePool::connect_with(opts).await.unwrap()
            });

            rt.block_on(db::init_db(&pool)).unwrap();

            // Try to load model if already downloaded
            let tagger_instance: Option<tagger::WdTagger> =
                if tagger::is_model_ready(&data_dir) {
                    let mp = tagger::model_path(&data_dir);
                    let tp = tagger::tags_path(&data_dir);
                    tagger::WdTagger::load(&mp, &tp).ok()
                } else {
                    None
                };

            app.manage(AppState {
                db: pool,
                data_dir,
                tagger: Arc::new(Mutex::new(tagger_instance)),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_folder,
            remove_folder,
            get_folders,
            scan_folders,
            get_images,
            get_image_tags,
            add_image_tag,
            remove_image_tag,
            generate_tags_for_image,
            generate_tags_for_all,
            get_all_tags,
            get_untagged_count,
            get_settings,
            save_settings,
            get_model_status,
            download_model,
            load_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
