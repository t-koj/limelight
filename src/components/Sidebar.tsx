import { useState } from "react";
import type { Folder } from "../types";

interface Props {
  folders: Folder[];
  selectedFolderId: number | null;
  activeTags: string[];
  allTags: string[];
  showUntaggedOnly: boolean;
  untaggedCount: number;
  onSelectFolder: (id: number | null) => void;
  onToggleTag: (tag: string) => void;
  onToggleUntaggedOnly: () => void;
  onOpenFolderManager: () => void;
  onScan: () => void;
  scanning: boolean;
}

export function Sidebar({
  folders,
  selectedFolderId,
  activeTags,
  allTags,
  showUntaggedOnly,
  untaggedCount,
  onSelectFolder,
  onToggleTag,
  onToggleUntaggedOnly,
  onOpenFolderManager,
  onScan,
  scanning,
}: Props) {
  const [tagSearch, setTagSearch] = useState("");

  const filteredTags = tagSearch.trim()
    ? allTags.filter((t) => t.includes(tagSearch.trim().toLowerCase()))
    : allTags;

  return (
    <aside className="w-60 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-neutral-800">
        <h1 className="text-white font-bold text-lg tracking-tight">limelight</h1>
      </div>

      {/* Folders */}
      <div className="px-3 py-3 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-xs font-medium uppercase tracking-wide">
            Folders
          </span>
          <button
            onClick={onOpenFolderManager}
            className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
          >
            Manage
          </button>
        </div>

        <div className="space-y-0.5">
          <button
            onClick={() => onSelectFolder(null)}
            className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
              selectedFolderId === null
                ? "bg-indigo-600 text-white"
                : "text-neutral-400 hover:text-white hover:bg-neutral-800"
            }`}
          >
            All Images
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelectFolder(f.id)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-sm truncate transition-colors ${
                selectedFolderId === f.id
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
              title={f.path}
            >
              {f.path.split("/").pop() || f.path}
            </button>
          ))}
        </div>

        <div className="flex gap-1 mt-2">
          <button
            onClick={onScan}
            disabled={scanning}
            className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-300 text-xs rounded-md py-1.5 transition-colors"
          >
            {scanning ? "Scanning..." : "Scan Folders"}
          </button>
          {untaggedCount > 0 && (
            <button
              onClick={onToggleUntaggedOnly}
              title={`${untaggedCount} untagged`}
              className={`px-2.5 rounded-md text-xs transition-colors ${
                showUntaggedOnly
                  ? "bg-yellow-600 text-white"
                  : "bg-neutral-800 text-yellow-500 hover:bg-neutral-700"
              }`}
            >
              {untaggedCount}
            </button>
          )}
        </div>
      </div>

      {/* Tag filters */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-xs font-medium uppercase tracking-wide">
            Filter by Tags
          </span>
          {activeTags.length > 0 && (
            <button
              onClick={() => activeTags.forEach(onToggleTag)}
              className="text-neutral-600 hover:text-neutral-400 text-xs transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="relative mb-2">
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Search tags..."
              className="w-full bg-neutral-800 text-white text-xs rounded-md px-3 py-1.5 pr-7 outline-none border border-neutral-700 focus:border-indigo-500 transition-colors placeholder:text-neutral-600"
            />
            {tagSearch && (
              <button
                onClick={() => setTagSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors text-sm leading-none"
              >
                ×
              </button>
            )}
          </div>
        )}

        {allTags.length === 0 ? (
          <p className="text-neutral-600 text-xs">No tags yet.</p>
        ) : filteredTags.length === 0 ? (
          <p className="text-neutral-600 text-xs">No tags match "{tagSearch}".</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {filteredTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onToggleTag(tag)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  activeTags.includes(tag)
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
