import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import type { Folder } from "../types";

interface Props {
  folders: Folder[];
  onClose: () => void;
  onChanged: () => void;
}

export function FolderManager({ folders, onClose, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;
      await api.addFolder(selected);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemove(id: number) {
    setError(null);
    try {
      await api.removeFolder(id);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-xl w-[560px] max-h-[70vh] flex flex-col shadow-2xl border border-neutral-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <h2 className="text-white font-semibold text-lg">Manage Folders</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {folders.length === 0 && (
            <p className="text-neutral-500 text-sm text-center py-8">
              No folders registered yet.
            </p>
          )}
          {folders.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 bg-neutral-800 rounded-lg px-4 py-3"
            >
              <span className="text-neutral-300 text-sm flex-1 truncate font-mono">
                {f.path}
              </span>
              <button
                onClick={() => handleRemove(f.id)}
                className="text-red-400 hover:text-red-300 text-xs shrink-0 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="px-6 pb-2 text-red-400 text-sm">{error}</p>
        )}

        <div className="px-6 py-4 border-t border-neutral-700">
          <button
            onClick={handleAdd}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            + Add Folder
          </button>
        </div>
      </div>
    </div>
  );
}
