import { invoke } from "@tauri-apps/api/core";
import type {
  Folder,
  ImageInfo,
  ModelStatus,
  ScanResult,
  Settings,
  TagInfo,
} from "./types";

export const api = {
  // Folders
  addFolder: (path: string) => invoke<Folder>("add_folder", { path }),
  removeFolder: (id: number) => invoke<void>("remove_folder", { id }),
  getFolders: () => invoke<Folder[]>("get_folders"),
  scanFolders: () => invoke<ScanResult>("scan_folders"),

  // Images
  getImages: (tagFilter: string[] = [], folderId?: number) =>
    invoke<ImageInfo[]>("get_images", {
      tagFilter,
      folderId: folderId ?? null,
    }),

  // Tags
  getImageTags: (imageId: number) =>
    invoke<TagInfo[]>("get_image_tags", { imageId }),
  addImageTag: (imageId: number, tagName: string) =>
    invoke<void>("add_image_tag", { imageId, tagName }),
  removeImageTag: (imageId: number, tagName: string) =>
    invoke<void>("remove_image_tag", { imageId, tagName }),
  getAllTags: () => invoke<string[]>("get_all_tags"),

  // AI Tagging
  generateTagsForImage: (imageId: number, threshold: number) =>
    invoke<string[]>("generate_tags_for_image", { imageId, threshold }),
  generateTagsForAll: (threshold: number) =>
    invoke<void>("generate_tags_for_all", { threshold }),
  getUntaggedCount: () =>
    invoke<number>("get_untagged_count"),

  // Settings
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),

  // Model
  getModelStatus: () => invoke<ModelStatus>("get_model_status"),
  downloadModel: () => invoke<void>("download_model"),
  loadModel: () => invoke<boolean>("load_model"),
};
