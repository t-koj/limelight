import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ImageInfo } from "../types";

interface Props {
  image: ImageInfo;
  onClick: () => void;
  onTagClick: (tag: string) => void;
}

export function ImageCard({ image, onClick, onTagClick }: Props) {
  const [error, setError] = useState(false);
  const src = convertFileSrc(image.path);

  return (
    <div
      className="group relative bg-neutral-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
      onClick={onClick}
    >
      <div className="aspect-square overflow-hidden bg-neutral-900 flex items-center justify-center">
        {error ? (
          <span className="text-neutral-600 text-xs px-2 text-center">{image.filename}</span>
        ) : (
          <img
            src={src}
            alt={image.filename}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setError(true)}
          />
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform">
        <p className="text-white text-xs font-medium truncate mb-1">
          {image.filename}
        </p>
        <div className="flex flex-wrap gap-1">
          {image.tags.slice(0, 5).map((tag) => (
            <button
              key={tag}
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(tag);
              }}
              className="bg-indigo-600/80 text-white text-xs px-1.5 py-0.5 rounded truncate max-w-[80px]"
            >
              {tag}
            </button>
          ))}
          {image.tags.length > 5 && (
            <span className="text-neutral-400 text-xs">
              +{image.tags.length - 5}
            </span>
          )}
        </div>
      </div>

      {!image.tagged_at && (
        <div className="absolute top-2 right-2 bg-yellow-500/80 rounded-full w-2 h-2" title="Not tagged" />
      )}
    </div>
  );
}
