import { useState, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";
import type { ImageInfo, TagInfo } from "../types";

interface Props {
  image: ImageInfo;
  threshold: number;
  onClose: () => void;
  onTagsChanged: () => void;
  onTagClick: (tag: string) => void;
}

export function ImageViewer({
  image,
  threshold,
  onClose,
  onTagsChanged,
  onTagClick,
}: Props) {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [newTag, setNewTag] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = convertFileSrc(image.path);

  const loadTags = useCallback(async () => {
    try {
      const t = await api.getImageTags(image.id);
      setTags(t);
    } catch (e) {
      setError(String(e));
    }
  }, [image.id]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const name = newTag.trim();
    if (!name) return;
    try {
      await api.addImageTag(image.id, name);
      setNewTag("");
      await loadTags();
      onTagsChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveTag(tagName: string) {
    try {
      await api.removeImageTag(image.id, tagName);
      await loadTags();
      onTagsChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGenerateTags() {
    setGenerating(true);
    setError(null);
    try {
      await api.generateTagsForImage(image.id, threshold);
      await loadTags();
      onTagsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const aiTags = tags.filter((t) => !t.is_manual);
  const manualTags = tags.filter((t) => t.is_manual);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex z-50"
      onClick={handleBackdropClick}
    >
      {/* Image panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <img
          src={src}
          alt={image.filename}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      {/* Sidebar */}
      <div className="w-80 bg-neutral-900 border-l border-neutral-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
          <h3 className="text-white font-medium text-sm truncate">{image.filename}</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors text-xl leading-none ml-2 shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Image info */}
          {(image.width || image.file_size) && (
            <div className="text-neutral-500 text-xs space-y-0.5">
              {image.width && image.height && (
                <p>{image.width} × {image.height}px</p>
              )}
              {image.file_size && (
                <p>{(image.file_size / 1024 / 1024).toFixed(2)} MB</p>
              )}
            </div>
          )}

          {/* AI Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-400 text-xs font-medium uppercase tracking-wide">
                AI Tags ({aiTags.length})
              </span>
              <button
                onClick={handleGenerateTags}
                disabled={generating}
                className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors disabled:opacity-50"
              >
                {generating ? "Generating..." : "Regenerate"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {aiTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => onTagClick(tag.name)}
                  className="group flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 rounded px-2 py-1 text-xs text-neutral-300 transition-colors"
                >
                  <span>{tag.name}</span>
                  {tag.score !== null && (
                    <span className="text-neutral-600 text-[10px]">
                      {(tag.score * 100).toFixed(0)}%
                    </span>
                  )}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTag(tag.name);
                    }}
                    className="text-neutral-600 hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
                  >
                    ×
                  </span>
                </button>
              ))}
              {aiTags.length === 0 && (
                <p className="text-neutral-600 text-xs">No AI tags yet.</p>
              )}
            </div>
          </div>

          {/* Manual Tags */}
          <div>
            <span className="text-neutral-400 text-xs font-medium uppercase tracking-wide block mb-2">
              Manual Tags ({manualTags.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {manualTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => onTagClick(tag.name)}
                  className="group flex items-center gap-1 bg-indigo-900/50 hover:bg-indigo-900/80 rounded px-2 py-1 text-xs text-indigo-300 transition-colors"
                >
                  <span>{tag.name}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTag(tag.name);
                    }}
                    className="text-indigo-700 hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-900/20 rounded p-2">{error}</p>
          )}
        </div>

        {/* Add tag form */}
        <form
          onSubmit={handleAddTag}
          className="p-4 border-t border-neutral-700"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              className="flex-1 bg-neutral-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-neutral-700 focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!newTag.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
