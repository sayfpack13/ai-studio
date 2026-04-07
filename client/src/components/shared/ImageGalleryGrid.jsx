import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, RotateCcw, GitCompare, Maximize2, Copy, Check } from "lucide-react";
import { Button } from "../ui";

export default function ImageGalleryGrid({
  images,
  onSelect,
  onCompare,
  onDelete,
  onReload,
  selectedForCompare = [],
  className = "",
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleCopyPrompt = (e, image) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(image.prompt || "");
    setCopiedId(image.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (e, image) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = image.url;
    link.download = `generated-${image.id}.png`;
    link.click();
  };

  const handleDelete = (e, imageId) => {
    e.stopPropagation();
    onDelete?.(imageId);
  };

  const handleCompare = (e, image) => {
    e.stopPropagation();
    onCompare?.(image);
  };

  const handleReload = (e, image) => {
    e.stopPropagation();
    onReload?.(image);
  };

  const isInCompare = (imageId) => selectedForCompare.includes(imageId);

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 ${className}`}>
      {images.map((image) => {
        const isHovered = hoveredId === image.id;
        const isComparing = isInCompare(image.id);

        return (
          <motion.div
            key={image.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 border border-gray-700 cursor-pointer group"
            onMouseEnter={() => setHoveredId(image.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelect?.(image)}
          >
            {/* Thumbnail */}
            <img
              src={image.url}
              alt={image.prompt?.slice(0, 30) || "Generated image"}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />

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
                  className="absolute inset-0 bg-black/70 flex flex-col justify-between p-2"
                >
                  {/* Top Actions */}
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={(e) => handleCompare(e, image)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isComparing
                          ? "bg-purple-600 text-white"
                          : "bg-gray-700/80 text-gray-300 hover:bg-purple-600 hover:text-white"
                      }`}
                      title="Add to comparison"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleReload(e, image)}
                      className="p-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-blue-600 hover:text-white transition-colors"
                      title="Reload prompt"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, image.id)}
                      className="p-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-red-600 hover:text-white transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bottom Info */}
                  <div>
                    <p className="text-xs text-gray-200 line-clamp-2 mb-1.5">
                      {image.prompt?.slice(0, 60) || "No prompt"}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => handleCopyPrompt(e, image)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-gray-700/80 text-gray-300 hover:bg-gray-600 text-xs transition-colors"
                      >
                        {copiedId === image.id ? (
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
                        onClick={(e) => handleDownload(e, image)}
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
                {image.lastUpdated ? new Date(image.lastUpdated).toLocaleDateString() : ""}
              </p>
            </div>
          </motion.div>
        );
      })}

      {images.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
          <Maximize2 className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No images generated yet</p>
          <p className="text-xs text-gray-500 mt-1">Your generated images will appear here</p>
        </div>
      )}
    </div>
  );
}
