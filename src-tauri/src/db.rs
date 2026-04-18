use anyhow::Result;
use sqlx::{sqlite::SqlitePool, Row};

use crate::models::{Folder, ImageInfo, Settings, TagInfo};

pub async fn init_db(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            folder_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            width INTEGER,
            height INTEGER,
            file_size INTEGER,
            tagged_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS image_tags (
            image_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            score REAL,
            is_manual INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (image_id, tag_id),
            FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn add_folder(pool: &SqlitePool, path: &str) -> Result<Folder> {
    let row = sqlx::query(
        "INSERT INTO folders (path) VALUES (?) ON CONFLICT(path) DO UPDATE SET path=path RETURNING id, path, created_at"
    )
    .bind(path)
    .fetch_one(pool)
    .await?;

    Ok(Folder {
        id: row.get("id"),
        path: row.get("path"),
        created_at: row.get("created_at"),
    })
}

pub async fn remove_folder(pool: &SqlitePool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM folders WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_folders(pool: &SqlitePool) -> Result<Vec<Folder>> {
    let rows = sqlx::query("SELECT id, path, created_at FROM folders ORDER BY created_at")
        .fetch_all(pool)
        .await?;

    Ok(rows
        .iter()
        .map(|r| Folder {
            id: r.get("id"),
            path: r.get("path"),
            created_at: r.get("created_at"),
        })
        .collect())
}

pub async fn upsert_image(
    pool: &SqlitePool,
    path: &str,
    folder_id: i64,
    filename: &str,
    width: Option<u32>,
    height: Option<u32>,
    file_size: Option<u64>,
) -> Result<i64> {
    let row = sqlx::query(
        "INSERT INTO images (path, folder_id, filename, width, height, file_size)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           filename=excluded.filename,
           width=excluded.width,
           height=excluded.height,
           file_size=excluded.file_size
         RETURNING id",
    )
    .bind(path)
    .bind(folder_id)
    .bind(filename)
    .bind(width.map(|v| v as i64))
    .bind(height.map(|v| v as i64))
    .bind(file_size.map(|v| v as i64))
    .fetch_one(pool)
    .await?;

    Ok(row.get("id"))
}

pub async fn get_images(
    pool: &SqlitePool,
    tag_filter: &[String],
    folder_id: Option<i64>,
) -> Result<Vec<ImageInfo>> {
    let rows = if tag_filter.is_empty() {
        let base = if let Some(fid) = folder_id {
            sqlx::query(
                "SELECT id, path, folder_id, filename, width, height, file_size, tagged_at, created_at
                 FROM images WHERE folder_id = ? ORDER BY filename",
            )
            .bind(fid)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query(
                "SELECT id, path, folder_id, filename, width, height, file_size, tagged_at, created_at
                 FROM images ORDER BY filename",
            )
            .fetch_all(pool)
            .await?
        };
        base
    } else {
        // Images that have ALL the specified tags
        let placeholders = tag_filter.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let count = tag_filter.len() as i64;
        let sql = format!(
            "SELECT i.id, i.path, i.folder_id, i.filename, i.width, i.height, i.file_size, i.tagged_at, i.created_at
             FROM images i
             WHERE i.id IN (
                 SELECT it.image_id FROM image_tags it
                 JOIN tags t ON t.id = it.tag_id
                 WHERE t.name IN ({placeholders})
                 GROUP BY it.image_id
                 HAVING COUNT(DISTINCT t.id) = ?
             )
             {}
             ORDER BY i.filename",
            if let Some(fid) = folder_id {
                format!("AND i.folder_id = {fid}")
            } else {
                String::new()
            }
        );
        let mut q = sqlx::query(&sql);
        for tag in tag_filter {
            q = q.bind(tag);
        }
        q = q.bind(count);
        q.fetch_all(pool).await?
    };

    let mut images = Vec::new();
    for row in &rows {
        let image_id: i64 = row.get("id");
        let tags = get_image_tags_names(pool, image_id).await?;
        images.push(ImageInfo {
            id: image_id,
            path: row.get("path"),
            folder_id: row.get("folder_id"),
            filename: row.get("filename"),
            width: row.get("width"),
            height: row.get("height"),
            file_size: row.get("file_size"),
            tagged_at: row.get("tagged_at"),
            created_at: row.get("created_at"),
            tags,
        });
    }

    Ok(images)
}

async fn get_image_tags_names(pool: &SqlitePool, image_id: i64) -> Result<Vec<String>> {
    let rows = sqlx::query(
        "SELECT t.name FROM tags t
         JOIN image_tags it ON it.tag_id = t.id
         WHERE it.image_id = ?
         ORDER BY it.is_manual DESC, it.score DESC",
    )
    .bind(image_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(|r| r.get("name")).collect())
}

pub async fn get_image_tags(pool: &SqlitePool, image_id: i64) -> Result<Vec<TagInfo>> {
    let rows = sqlx::query(
        "SELECT t.name, it.score, it.is_manual FROM tags t
         JOIN image_tags it ON it.tag_id = t.id
         WHERE it.image_id = ?
         ORDER BY it.is_manual DESC, it.score DESC",
    )
    .bind(image_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .iter()
        .map(|r| TagInfo {
            name: r.get("name"),
            score: r.get("score"),
            is_manual: r.get::<i64, _>("is_manual") != 0,
        })
        .collect())
}

pub async fn add_image_tag(
    pool: &SqlitePool,
    image_id: i64,
    tag_name: &str,
    score: Option<f64>,
    is_manual: bool,
) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?)")
        .bind(tag_name)
        .execute(pool)
        .await?;

    let tag_row = sqlx::query("SELECT id FROM tags WHERE name = ?")
        .bind(tag_name)
        .fetch_one(pool)
        .await?;
    let tag_id: i64 = tag_row.get("id");

    sqlx::query(
        "INSERT INTO image_tags (image_id, tag_id, score, is_manual)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(image_id, tag_id) DO UPDATE SET
           score = CASE WHEN excluded.is_manual = 1 THEN score ELSE excluded.score END,
           is_manual = MAX(is_manual, excluded.is_manual)",
    )
    .bind(image_id)
    .bind(tag_id)
    .bind(score)
    .bind(is_manual as i64)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn remove_image_tag(pool: &SqlitePool, image_id: i64, tag_name: &str) -> Result<()> {
    sqlx::query(
        "DELETE FROM image_tags WHERE image_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
    )
    .bind(image_id)
    .bind(tag_name)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_image_tagged(pool: &SqlitePool, image_id: i64) -> Result<()> {
    sqlx::query("UPDATE images SET tagged_at = datetime('now') WHERE id = ?")
        .bind(image_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn clear_ai_tags(pool: &SqlitePool, image_id: i64) -> Result<()> {
    sqlx::query(
        "DELETE FROM image_tags WHERE image_id = ? AND is_manual = 0",
    )
    .bind(image_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_all_tags(pool: &SqlitePool) -> Result<Vec<String>> {
    let rows = sqlx::query(
        "SELECT DISTINCT t.name FROM tags t
         JOIN image_tags it ON it.tag_id = t.id
         ORDER BY t.name",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(|r| r.get("name")).collect())
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.get("value")))
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_untagged_images(pool: &SqlitePool) -> Result<Vec<ImageInfo>> {
    let rows = sqlx::query(
        "SELECT id, path, folder_id, filename, width, height, file_size, tagged_at, created_at
         FROM images WHERE tagged_at IS NULL ORDER BY filename",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .iter()
        .map(|r| ImageInfo {
            id: r.get("id"),
            path: r.get("path"),
            folder_id: r.get("folder_id"),
            filename: r.get("filename"),
            width: r.get("width"),
            height: r.get("height"),
            file_size: r.get("file_size"),
            tagged_at: r.get("tagged_at"),
            created_at: r.get("created_at"),
            tags: vec![],
        })
        .collect())
}
