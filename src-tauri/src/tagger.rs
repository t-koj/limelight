use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use image::{imageops::FilterType, DynamicImage, GenericImageView, Rgb, RgbImage};
use ort::execution_providers::CoreMLExecutionProvider;
use ort::session::Session;
use std::io::Write;
use std::path::{Path, PathBuf};

const MODEL_FILENAME: &str = "wd-eva02-large-tagger-v3.onnx";
const TAGS_FILENAME: &str = "wd-eva02-large-tagger-v3-tags.csv";
const MODEL_URL: &str = "https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3/resolve/main/model.onnx";
const TAGS_URL: &str = "https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3/resolve/main/selected_tags.csv";
const TARGET_SIZE: u32 = 448;

pub struct WdTagger {
    session: Session,
    tags: Vec<Tag>,
}

#[derive(Debug)]
struct Tag {
    name: String,
    category: i32,
}

impl WdTagger {
    pub fn load(model_path: &Path, tags_path: &Path) -> Result<Self> {
        let session = Session::builder()
            .context("Failed to create ONNX session builder")?
            .with_execution_providers([CoreMLExecutionProvider::default().build()])
            .map_err(|e| anyhow::anyhow!("Failed to register CoreML execution provider: {e}"))?
            .commit_from_file(model_path)
            .context("Failed to load ONNX model")?;

        let tags = load_tags(tags_path)?;

        Ok(Self { session, tags })
    }

    pub fn predict(&mut self, image_path: &Path, threshold: f32) -> Result<Vec<(String, f32)>> {
        let img = image::open(image_path).context("Failed to open image")?;
        let input = preprocess_image(&img);

        // ort 2.0.0-rc.8+: tuple-based API (ndarray integration removed)
        let tensor = ort::value::Tensor::from_array(
            ([1_usize, TARGET_SIZE as usize, TARGET_SIZE as usize, 3_usize], input),
        )
        .context("Failed to create input tensor")?;
        let outputs = self
            .session
            .run(ort::inputs![tensor])
            .context("Failed to run inference")?;

        // try_extract_tensor returns (&Shape, &[T]) in rc.12
        let (_, scores_flat) = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract output tensor")?;

        let mut results = Vec::new();
        for (i, &score) in scores_flat.iter().enumerate() {
            if i >= self.tags.len() {
                break;
            }
            let tag = &self.tags[i];
            // Skip rating tags (category 9), keep general (0) and character (4) tags
            if tag.category == 9 {
                continue;
            }
            if score >= threshold {
                results.push((tag.name.clone(), score));
            }
        }

        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        Ok(results)
    }
}

fn preprocess_image(img: &DynamicImage) -> Vec<f32> {
    let (w, h) = img.dimensions();
    let max_dim = w.max(h);

    // Pad to square with white background
    let mut padded = RgbImage::from_pixel(max_dim, max_dim, Rgb([255u8, 255, 255]));
    let offset_x = (max_dim - w) / 2;
    let offset_y = (max_dim - h) / 2;

    let rgb = img.to_rgb8();
    image::imageops::overlay(&mut padded, &rgb, offset_x as i64, offset_y as i64);

    // Resize to target size
    let resized = image::imageops::resize(&padded, TARGET_SIZE, TARGET_SIZE, FilterType::Lanczos3);

    // Flatten to NHWC float32 Vec, BGR channel order (WD tagger convention)
    let n = TARGET_SIZE as usize;
    let mut data = Vec::with_capacity(n * n * 3);
    for y in 0..n {
        for x in 0..n {
            let pixel = resized.get_pixel(x as u32, y as u32);
            data.push(pixel[2] as f32); // B
            data.push(pixel[1] as f32); // G
            data.push(pixel[0] as f32); // R
        }
    }
    data
}

fn load_tags(tags_path: &Path) -> Result<Vec<Tag>> {
    let content = std::fs::read_to_string(tags_path)?;
    let mut tags = Vec::new();

    for line in content.lines().skip(1) {
        // skip header
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 3 {
            continue;
        }
        let name = parts[1].trim().to_string();
        let category: i32 = parts[2].trim().parse().unwrap_or(0);
        tags.push(Tag { name, category });
    }

    Ok(tags)
}

pub fn model_path(data_dir: &Path) -> PathBuf {
    data_dir.join(MODEL_FILENAME)
}

pub fn tags_path(data_dir: &Path) -> PathBuf {
    data_dir.join(TAGS_FILENAME)
}

pub fn is_model_ready(data_dir: &Path) -> bool {
    model_path(data_dir).exists() && tags_path(data_dir).exists()
}

pub async fn download_model<F>(data_dir: &Path, mut progress_cb: F) -> Result<()>
where
    F: FnMut(f64, &str),
{
    std::fs::create_dir_all(data_dir)?;

    let model_dest = model_path(data_dir);
    let tags_dest = tags_path(data_dir);

    // Download tags CSV first (small file)
    if !tags_dest.exists() {
        progress_cb(0.0, "Downloading tags CSV...");
        download_file(TAGS_URL, &tags_dest, |p| {
            progress_cb(p * 0.05, "Downloading tags CSV...")
        })
        .await?;
    }

    // Download model ONNX (large file)
    if !model_dest.exists() {
        progress_cb(5.0, "Downloading model (this may take a while)...");
        download_file(MODEL_URL, &model_dest, |p| {
            progress_cb(5.0 + p * 95.0, "Downloading model...")
        })
        .await?;
    }

    Ok(())
}

async fn download_file<F>(url: &str, dest: &Path, mut progress_cb: F) -> Result<()>
where
    F: FnMut(f64),
{
    let client = reqwest::Client::new();
    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(anyhow!("HTTP error: {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let tmp_path = dest.with_extension("tmp");
    let mut file = std::fs::File::create(&tmp_path)?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        file.write_all(&bytes)?;
        downloaded += bytes.len() as u64;
        if total > 0 {
            progress_cb((downloaded as f64 / total as f64) * 100.0);
        }
    }

    drop(file);
    std::fs::rename(&tmp_path, dest)?;
    Ok(())
}
