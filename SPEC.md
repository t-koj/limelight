# limelight 仕様書

## 概要

ローカルフォルダに保存された画像を対象に、AIによる自動タグ付けと、タグによる検索・フィルタリングを提供するデスクトップアプリケーション。

---

## 技術スタック

| 層 | 技術 |
|---|---|
| フレームワーク | Tauri 2.0 |
| フロントエンド | React 19 + TypeScript |
| スタイル | Tailwind CSS v4 |
| ビルド | Vite |
| バックエンド | Rust |
| データベース | SQLite（`sqlx` 経由） |
| AI 推論 | ONNX Runtime（`ort` 2.0.0-rc.12） |
| パッケージマネージャ | pnpm |

---

## 対応プラットフォーム

- macOS（主対象。CoreML / Apple Neural Engine によるGPU推論対応）
- Windows / Linux（CPU推論。CUDA / DirectML は `ort` の feature 追加で有効化可能）

---

## 対応画像フォーマット

`jpg` / `jpeg` / `png` / `gif` / `webp` / `bmp` / `tiff` / `tif`

---

## 機能一覧

### フォルダ管理
- フォルダの登録・削除（複数登録可）
- 登録フォルダ内を再帰スキャンして画像をDBへ取り込む
- サイドバーでフォルダ単位の表示切り替え

### 画像表示
- グリッドビュー（サムネイル）
- 画像ビューア（フルサイズ表示）
- 未タグ画像を示すインジケーター（黄丸）
- 画像読み込み失敗時のフォールバック表示

### タグ管理
- AIによる自動タグ生成（WD EVA02 Large Tagger v3）
- タグの手動追加・削除
- AIタグと手動タグを区別して表示（スコア付き）
- 個別画像の再タグ生成

### タグ検索・フィルタ
- サイドバーのタグ一覧から複数タグで絞り込み（AND条件）
- テキスト入力によるタグ名の部分一致検索
- 未タグ画像のみ表示フィルタ（サイドバーの件数ボタン）

### 自動タグ付け
- 未タグ画像のみを対象とした一括タグ付け
- ツールバーの「Auto-tag N」ボタンで即時実行
- タグ付け進捗をインラインプログレスバーで表示

### AI モデル
- モデル: `SmilingWolf/wd-eva02-large-tagger-v3`（ONNX形式）
- 初回のみ HuggingFace からダウンロード（約350MB）
- モデルと tags CSV は `app_data_dir` に保存
- ダウンロード進捗をリアルタイム表示

### 設定
- タグ信頼度閾値（デフォルト: 0.35 / 範囲: 0.10〜0.90）
- モデルのダウンロード状態確認・ダウンロード実行
- 未タグ画像の一括タグ付け実行

---

## データ保存場所

すべてのデータはアプリ実行環境の `app_data_dir` に保存される。

| ファイル | 内容 |
|---|---|
| `limelight.db` | SQLite データベース |
| `wd-eva02-large-tagger-v3.onnx` | ONNXモデルファイル |
| `wd-eva02-large-tagger-v3-tags.csv` | タグ定義CSV |

---

## データベーススキーマ

```sql
CREATE TABLE folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT NOT NULL UNIQUE,
    folder_id  INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    width      INTEGER,
    height     INTEGER,
    file_size  INTEGER,
    tagged_at  TEXT,           -- NULL = 未タグ
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE image_tags (
    image_id  INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    score     REAL,            -- AIタグのみ。手動タグは NULL
    is_manual INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (image_id, tag_id)
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## バックエンド Tauri コマンド

| コマンド | 説明 |
|---|---|
| `add_folder(path)` | フォルダを登録 |
| `remove_folder(id)` | フォルダを削除（画像も連鎖削除） |
| `get_folders()` | 登録フォルダ一覧を取得 |
| `scan_folders()` | 登録フォルダをスキャンしてDBへ同期 |
| `get_images(tag_filter, folder_id)` | 画像一覧取得（タグ・フォルダ絞り込み可） |
| `get_image_tags(image_id)` | 画像のタグ一覧を取得（スコア・手動フラグ付き） |
| `add_image_tag(image_id, tag_name)` | 手動タグを追加 |
| `remove_image_tag(image_id, tag_name)` | タグを削除 |
| `generate_tags_for_image(image_id, threshold)` | 単一画像にAIタグ生成 |
| `generate_tags_for_all(threshold)` | 未タグ画像すべてにAIタグ生成（進捗イベント付き） |
| `get_untagged_count()` | 未タグ画像の件数を取得 |
| `get_all_tags()` | DBに存在するタグ名一覧を取得 |
| `get_settings()` | 設定を取得 |
| `save_settings(settings)` | 設定を保存 |
| `get_model_status()` | モデルのダウンロード状態を取得 |
| `download_model()` | モデルをダウンロード（進捗イベント付き） |
| `load_model()` | モデルをメモリにロード |

---

## イベント（Rust → フロントエンド）

| イベント名 | ペイロード | タイミング |
|---|---|---|
| `download-progress` | `{ progress: number, message: string }` | モデルダウンロード中 |
| `tagging-progress` | `{ progress: number, current: number, total: number }` | 一括タグ付け中 |
| `scan-complete` | `{ added: number, skipped: number }` | スキャン完了時 |

---

## AI タグ生成仕様

| 項目 | 内容 |
|---|---|
| モデル | SmilingWolf/wd-eva02-large-tagger-v3 |
| 入力サイズ | 448 × 448 px |
| 前処理 | 白背景でスクエアパディング → リサイズ → BGR float32 |
| 出力 | Danbooru タグの確率スコア |
| フィルタ | `category == 9`（レーティングタグ）を除外 |
| 閾値 | デフォルト 0.35（設定画面で変更可） |
| GPU | macOS: CoreML（Apple Neural Engine）、その他: CPU |

---

## ディレクトリ構成

```
limelight/
├── src/                        # フロントエンド
│   ├── App.tsx                 # メインコンポーネント
│   ├── App.css                 # Tailwind CSS エントリ
│   ├── api.ts                  # Tauri invoke ラッパー
│   ├── types.ts                # 共有型定義
│   └── components/
│       ├── Sidebar.tsx         # フォルダ・タグフィルタ
│       ├── ImageCard.tsx       # グリッドのカード
│       ├── ImageViewer.tsx     # フルサイズビューア + タグ編集
│       ├── FolderManager.tsx   # フォルダ登録・削除モーダル
│       └── SettingsPanel.tsx   # 設定・モデル管理モーダル
├── src-tauri/
│   └── src/
│       ├── lib.rs              # Tauri コマンド定義・アプリ起動
│       ├── db.rs               # SQLite 操作
│       ├── scanner.rs          # フォルダスキャン
│       ├── tagger.rs           # ONNX 推論・モデルダウンロード
│       └── models.rs           # 共有データ構造体
├── SPEC.md                     # 本仕様書
└── package.json
```
