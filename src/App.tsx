import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { ImageCard } from "./components/ImageCard";
import { ImageViewer } from "./components/ImageViewer";
import { FolderManager } from "./components/FolderManager";
import { SettingsPanel } from "./components/SettingsPanel";
import type {
  DownloadProgress,
  Folder,
  ImageInfo,
  ModelStatus,
  Settings,
  TaggingProgress,
} from "./types";
import "./App.css";

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({ threshold: 0.35 });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ downloaded: false, path: null });

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);

  const [showFolderManager, setShowFolderManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [taggingProgress, setTaggingProgress] = useState<number | null>(null);
  const [untaggedCount, setUntaggedCount] = useState(0);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false);

  const loadFolders = useCallback(async () => {
    const f = await api.getFolders();
    setFolders(f);
  }, []);

  const loadImages = useCallback(async () => {
    const imgs = await api.getImages(activeTags, selectedFolderId ?? undefined);
    setImages(showUntaggedOnly ? imgs.filter((i) => !i.tagged_at) : imgs);
  }, [activeTags, selectedFolderId, showUntaggedOnly]);

  const loadTags = useCallback(async () => {
    const tags = await api.getAllTags();
    setAllTags(tags);
  }, []);

  useEffect(() => {
    async function init() {
      await Promise.all([loadFolders(), loadImages(), loadTags()]);
      const [s, ms, uc] = await Promise.all([
        api.getSettings(),
        api.getModelStatus(),
        api.getUntaggedCount(),
      ]);
      setSettings(s);
      setModelStatus(ms);
      setUntaggedCount(uc);
    }
    init();
  }, []);

  useEffect(() => {
    loadImages();
  }, [activeTags, selectedFolderId]);

  useEffect(() => {
    const unlistenDownload = listen<DownloadProgress>("download-progress", (e) => {
      setDownloadProgress(e.payload.progress);
      setDownloadMessage(e.payload.message);
    });

    const unlistenTagging = listen<TaggingProgress>("tagging-progress", (e) => {
      setTaggingProgress(e.payload.progress);
      if (e.payload.current === e.payload.total) {
        setTimeout(async () => {
          setTaggingProgress(null);
          const uc = await api.getUntaggedCount();
          setUntaggedCount(uc);
          loadImages();
          loadTags();
        }, 1000);
      }
    });

    return () => {
      unlistenDownload.then((fn) => fn());
      unlistenTagging.then((fn) => fn());
    };
  }, [loadImages, loadTags]);

  function handleToggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleScan() {
    setScanning(true);
    try {
      await api.scanFolders();
      const [, , uc] = await Promise.all([loadImages(), loadTags(), api.getUntaggedCount()]);
      setUntaggedCount(uc);
    } finally {
      setScanning(false);
    }
  }

  async function handleDownloadModel() {
    setDownloadProgress(0);
    setDownloadMessage("Starting...");
    try {
      await api.downloadModel();
      setModelStatus({ downloaded: true, path: null });
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadProgress(null);
    }
  }

  async function handleTagAll() {
    setTaggingProgress(0);
    try {
      await api.generateTagsForAll(settings.threshold);
    } catch (e) {
      console.error(e);
      setTaggingProgress(null);
    }
  }

  async function refreshSelectedImage(id: number) {
    const imgs = await api.getImages(activeTags, selectedFolderId ?? undefined);
    setImages(imgs);
    const updated = imgs.find((i) => i.id === id);
    if (updated) setSelectedImage(updated);
  }

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden">
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        activeTags={activeTags}
        allTags={allTags}
        showUntaggedOnly={showUntaggedOnly}
        untaggedCount={untaggedCount}
        onSelectFolder={setSelectedFolderId}
        onToggleTag={handleToggleTag}
        onToggleUntaggedOnly={() => setShowUntaggedOnly((v) => !v)}
        onOpenFolderManager={() => setShowFolderManager(true)}
        onScan={handleScan}
        scanning={scanning}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 text-sm">
              {images.length} image{images.length !== 1 ? "s" : ""}
            </span>
            {activeTags.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-neutral-600 text-xs">filtered by:</span>
                {activeTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleToggleTag(t)}
                    className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                  >
                    {t} <span className="opacity-70">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {modelStatus.downloaded && untaggedCount > 0 && (
              taggingProgress !== null ? (
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-neutral-800 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${taggingProgress}%` }}
                    />
                  </div>
                  <span className="text-neutral-400 text-xs">{taggingProgress.toFixed(0)}%</span>
                </div>
              ) : (
                <button
                  onClick={handleTagAll}
                  className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  Auto-tag
                  <span className="bg-green-900/60 px-1.5 py-0.5 rounded-full">
                    {untaggedCount}
                  </span>
                </button>
              )
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="text-neutral-400 hover:text-white transition-colors text-sm"
            >
              ⚙ Settings
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <p className="text-neutral-500 text-sm">
                {folders.length === 0
                  ? "Add a folder to get started."
                  : "No images found. Try scanning folders."}
              </p>
              {folders.length === 0 && (
                <button
                  onClick={() => setShowFolderManager(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Add Folder
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {images.map((img) => (
                <ImageCard
                  key={img.id}
                  image={img}
                  onClick={() => setSelectedImage(img)}
                  onTagClick={(tag) => {
                    if (!activeTags.includes(tag)) handleToggleTag(tag);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedImage && (
        <ImageViewer
          image={selectedImage}
          threshold={settings.threshold}
          onClose={() => setSelectedImage(null)}
          onTagsChanged={() => {
            loadTags();
            refreshSelectedImage(selectedImage.id);
          }}
          onTagClick={(tag) => {
            setSelectedImage(null);
            if (!activeTags.includes(tag)) handleToggleTag(tag);
          }}
        />
      )}

      {showFolderManager && (
        <FolderManager
          folders={folders}
          onClose={() => setShowFolderManager(false)}
          onChanged={() => {
            loadFolders();
            loadImages();
          }}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          modelStatus={modelStatus}
          downloadProgress={downloadProgress}
          downloadMessage={downloadMessage}
          taggingProgress={taggingProgress}
          onClose={() => setShowSettings(false)}
          onSettingsChanged={setSettings}
          onDownloadModel={handleDownloadModel}
          onTagAll={handleTagAll}
        />
      )}
    </div>
  );
}
