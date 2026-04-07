import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Download, 
  Trash2, 
  RotateCcw, 
  GitCompare, 
  Maximize2, 
  Copy, 
  Check, 
  Play,
  Volume2,
  Video,
  Image,
  Music
} from "lucide-react";
import { Button } from "../ui";

const MEDIA_ICONS = {
  image: Image,
  video: Video,
  music: Music,
};

export default function MediaGalleryGrid({
  mediaType = "image",
  items,
  onSelect,
  onCompare,
  onDelete,
  onReload,
  selectedForCompare = [],
  className = "",
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleCopyPrompt = (e, item) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(item.prompt || "");
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (e, item) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = item.url;
    const ext = mediaType === "image" ? "png" : mediaType === "video" ? "mp4" : "mp3";
    link.download = `generated-${item.id}.${ext}`;
    link.click();
  };

  const handleDelete = (e, itemId) => {
    e.stopPropagation();
    onDelete?.(itemId);
  };

  const handleCompare = (e, item) => {
    e.stopPropagation();
    onCompare?.(item);
  };

  const handleReload = (e, item) => {
    e.stopPropagation();
    onReload?.(item);
  };

  const isInCompare = (itemId) => selectedForCompare.includes(itemId);

  // Render thumbnail based on media type
  const renderThumbnail = (item) => {
    if (mediaType === "image") {
      return (
        <img
          src={item.url}
          alt={item.prompt?.slice(0, 30) || "Generated image"}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      );
    }
    if (mediaType === "video") {
      return (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center relative">
          {item.thumbnail ? (
            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <Video className="w-12 h-12 text-gray-600" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="w-10 h-10 text-white" />
          </div>
        </div>
      );
    }
    if (mediaType === "music") {
      return (
        <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
          <Volume2 className="w-12 h-12 text-purple-400" />
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 ${className}`}>
      {items.map((item) => {
        const isHovered = hoveredId === item.id;
        const isComparing = isInCompare(item.id);

        return (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 border border-gray-700 cursor-pointer group"
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelect?.(item)}
          >
            {/* Thumbnail */}
            {renderThumbnail(item)}

            {/* Compare Badge */}
            {isComparing && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-purple-600 text-white text-xs rounded-full font-medium">
                Comparing
              </div>
            )}

            {/* Hover Overlay */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="absolute inset-0 bg-black/70 flex flex-col justify-between p-2"
                >
                  {/* Top Actions */}
                  <div className="flex justify-end gap-1">
                    {onCompare && (
                      <button
                        onClick={(e) => handleCompare(e, item)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isComparing
                            ? "bg-purple-600 text-white"
                            : "bg-gray-700/80 text-gray-300 hover:bg-purple-600 hover:text-white"
                        }`}
                        title="Add to comparison"
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleReload(e, item)}
                      className="p-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-blue-600 hover:text-white transition-colors"
                      title="Reload prompt"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="p-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-red-600 hover:text-white transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bottom Info */}
                  <div>
                    <p className="text-xs text-gray-200 line-clamp-2 mb-1.5">
                      {item.prompt?.slice(0, 60) || "No prompt"}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => handleCopyPrompt(e, item)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-xs transition-colors"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3 h-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => handleDownload(e, item)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-xs transition-colors"
                      >
                        <Download className="w-3 h-3" /> Save
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Date Badge */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pointer-events-none">
              <p className="text-[10px] text-gray-300">
                {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : ""}
              </p>
            </div>
          </motion.div>
        );
      })}

      {items.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
          <Maximize2 className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No {mediaType}s generated yet</p>
          <p className="text-xs text-gray-500 mt-1">Your generated {mediaType}s will appear here</p>
        </div>
      )}
    </div>
  );
}
