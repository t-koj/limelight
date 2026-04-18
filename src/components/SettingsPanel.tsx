import { useState } from "react";
import { api } from "../api";
import type { ModelStatus, Settings } from "../types";

interface Props {
  settings: Settings;
  modelStatus: ModelStatus;
  downloadProgress: number | null;
  downloadMessage: string;
  taggingProgress: number | null;
  onClose: () => void;
  onSettingsChanged: (s: Settings) => void;
  onDownloadModel: () => void;
  onTagAll: () => void;
}

export function SettingsPanel({
  settings,
  modelStatus,
  downloadProgress,
  downloadMessage,
  taggingProgress,
  onClose,
  onSettingsChanged,
  onDownloadModel,
  onTagAll,
}: Props) {
  const [threshold, setThreshold] = useState(settings.threshold);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const s: Settings = { threshold };
      await api.saveSettings(s);
      onSettingsChanged(s);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-xl w-[480px] shadow-2xl border border-neutral-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <h2 className="text-white font-semibold text-lg">Settings</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Threshold */}
          <div>
            <label className="block text-neutral-300 text-sm font-medium mb-2">
              Tag confidence threshold:{" "}
              <span className="text-indigo-400">{threshold.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-neutral-600 text-xs mt-1">
              <span>0.10 (more tags)</span>
              <span>0.90 (fewer tags)</span>
            </div>
          </div>

          {/* Model */}
          <div>
            <p className="text-neutral-300 text-sm font-medium mb-2">
              AI Model (wd-eva02-large-tagger-v3)
            </p>
            {modelStatus.downloaded ? (
              <div className="flex items-center gap-2 bg-green-900/30 border border-green-800/50 rounded-lg px-4 py-3">
                <span className="text-green-400 text-sm">Model ready</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-4 py-3">
                  <p className="text-yellow-400 text-sm">Model not downloaded (~350MB)</p>
                </div>
                {downloadProgress !== null && (
                  <div>
                    <div className="flex justify-between text-xs text-neutral-400 mb-1">
                      <span>{downloadMessage}</span>
                      <span>{downloadProgress.toFixed(0)}%</span>
                    </div>
                    <div className="bg-neutral-800 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={onDownloadModel}
                  disabled={downloadProgress !== null}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm transition-colors"
                >
                  {downloadProgress !== null ? "Downloading..." : "Download Model"}
                </button>
              </div>
            )}
          </div>

          {/* Tag all */}
          {modelStatus.downloaded && (
            <div>
              <p className="text-neutral-300 text-sm font-medium mb-2">
                Auto-tag untagged images
              </p>
              {taggingProgress !== null && (
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-neutral-400 mb-1">
                    <span>Tagging...</span>
                    <span>{taggingProgress.toFixed(0)}%</span>
                  </div>
                  <div className="bg-neutral-800 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${taggingProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={onTagAll}
                disabled={taggingProgress !== null}
                className="w-full bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg py-2 text-sm transition-colors"
              >
                {taggingProgress !== null ? "Tagging..." : "Tag All Images"}
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
