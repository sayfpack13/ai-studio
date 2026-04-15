import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars
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
  Music,
  ImageOff,
  Clock,
} from "lucide-react";
import { resolveAssetUrl } from "../../services/api";

const TYPE_ACCENT = {
  image: {
    bg: "from-violet-500/20 via-gray-900 to-gray-950",
    icon: Image,
    badge: "bg-violet-500/25 text-violet-200",
    glow: "ring-violet-500/40",
  },
  video: {
    bg: "from-rose-500/20 via-gray-900 to-gray-950",
    icon: Video,
    badge: "bg-rose-500/25 text-rose-200",
    glow: "ring-rose-500/40",
  },
  music: {
    bg: "from-emerald-500/20 via-gray-900 to-gray-950",
    icon: Volume2,
    badge: "bg-emerald-500/25 text-emerald-200",
    glow: "ring-emerald-500/40",
  },
};

export default function MediaGalleryGrid({
  mediaType = "image",
  items,
  onSelect,
  onCompare,
  onDelete,
  onReload,
  onView,
  selectedForCompare = [],
  className = "",
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [failedThumbIds, setFailedThumbIds] = useState(() => new Set());

  const markBroken = (id) => {
    let shouldRemove = false;
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      shouldRemove = true;
      return next;
    });
    if (shouldRemove && typeof onDelete === "function") {
      onDelete(id);
    }
  };

  const markThumbFailed = (id) => {
    setFailedThumbIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleCopyPrompt = (e, item) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(item.prompt || "");
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = async (e, item) => {
    e.stopPropagation();
    const resolved = resolveAssetUrl(item.url);
    const sanitize = (value) =>
      String(value || "generated")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim() || "generated";
    const ext =
      mediaType === "image" ? ".png" : mediaType === "video" ? ".mp4" : ".mp3";
    const baseName = sanitize(item.prompt || `generated-${item.id}`);
    const filename = baseName.toLowerCase().endsWith(ext)
      ? baseName
      : `${baseName}${ext}`;

    try {
      const response = await fetch(resolved);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = resolved;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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

  const visibleItems = useMemo(() => {
    return (items || []).filter((item) => item && !brokenIds.has(item.id));
  }, [items, brokenIds]);

  const accent = TYPE_ACCENT[mediaType] || TYPE_ACCENT.image;
  const TypeIcon = accent.icon;

  const renderMedia = (item) => {
    const url = resolveAssetUrl(item.url);

    if (mediaType === "image") {
      return (
        <img
          src={url}
          alt={item.prompt?.slice(0, 40) || "Generated image"}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => markBroken(item.id)}
        />
      );
    }

    if (mediaType === "video") {
      const hasGoodThumb = item.thumbnail && !failedThumbIds.has(item.id);
      return (
        <>
          {hasGoodThumb ? (
            <img
              src={resolveAssetUrl(item.thumbnail)}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => markThumbFailed(item.id)}
            />
          ) : (
            <video
              src={url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
              onError={() => markBroken(item.id)}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        </>
      );
    }

    if (mediaType === "music") {
      return (
        <div
          className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${accent.bg}`}
        >
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/15">
            <Volume2 className="w-10 h-10 text-emerald-400/70" />
          </div>
        </div>
      );
    }

    return null;
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 ${className}`}
    >
      <AnimatePresence mode="popLayout">
        {visibleItems.map((item) => {
          const isComparing = isInCompare(item.id);

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="group relative aspect-square rounded-xl overflow-hidden bg-gray-900 border border-gray-800 cursor-pointer hover:border-gray-600 hover:shadow-lg hover:shadow-black/30 transition-all duration-200"
              onClick={() => onSelect?.(item)}
            >
              {/* Media content */}
              <div className="absolute inset-0">{renderMedia(item)}</div>

              {/* Broken placeholder */}
              {brokenIds.has(item.id) && (
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${accent.bg} bg-gray-900`}
                >
                  <ImageOff className="w-8 h-8 text-gray-500 mb-1" />
                  <span className="text-[10px] text-gray-500">Unavailable</span>
                </div>
              )}

              {/* Compare badge */}
              {isComparing && (
                <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-semibold rounded-full shadow-lg">
                  Comparing
                </div>
              )}

              {/* Gradient overlay at bottom (always visible, subtle) */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent pt-6 pb-1.5 px-2.5 pointer-events-none">
                <p className="text-[11px] font-medium text-gray-100 truncate leading-tight">
                  {item.prompt?.slice(0, 50) || "No prompt"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${accent.badge}`}
                  >
                    <TypeIcon className="w-2.5 h-2.5" />
                    {mediaType}
                  </span>
                  {item.lastUpdated && (
                    <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDate(item.lastUpdated)}
                    </span>
                  )}
                </div>
              </div>

              {/* Hover action overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors duration-200 flex flex-col opacity-0 group-hover:opacity-100">
                {/* Top row: icon actions */}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={(e) => handleDownload(e, item)}
                    className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {onCompare && (
                    <button
                      onClick={(e) => handleCompare(e, item)}
                      className={`p-2 rounded-lg border transition-colors ${
                        isComparing
                          ? "bg-purple-500/30 border-purple-500/60 text-white"
                          : "bg-gray-900/80 border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20"
                      }`}
                      title="Compare"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleReload(e, item)}
                    className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-blue-200 hover:border-blue-500/60 hover:bg-blue-600/20 transition-colors"
                    title="Reload prompt"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-rose-200 hover:border-rose-500/60 hover:bg-rose-600/20 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Bottom action: copy prompt */}
                <div className="absolute bottom-2 left-2 right-2">
                  <button
                    onClick={(e) => handleCopyPrompt(e, item)}
                    className="w-full py-1.5 rounded-lg bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 hover:bg-gray-800/80 text-[10px] transition-colors flex items-center justify-center gap-1.5"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3 h-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy prompt
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {visibleItems.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500">
          <div className="w-16 h-16 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
            <TypeIcon className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-400">
            No {mediaType}s generated yet
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Your generated {mediaType}s will appear here
          </p>
        </div>
      )}
    </div>
  );
}
