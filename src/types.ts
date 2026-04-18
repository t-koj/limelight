export interface Folder {
  id: number;
  path: string;
  created_at: string;
}

export interface ImageInfo {
  id: number;
  path: string;
  folder_id: number;
  filename: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  tagged_at: string | null;
  created_at: string;
  tags: string[];
}

export interface TagInfo {
  name: string;
  score: number | null;
  is_manual: boolean;
}

export interface Settings {
  threshold: number;
}

export interface ModelStatus {
  downloaded: boolean;
  path: string | null;
}

export interface ScanResult {
  added: number;
  skipped: number;
}

export interface DownloadProgress {
  progress: number;
  message: string;
}

export interface TaggingProgress {
  progress: number;
  current: number;
  total: number;
}
