import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Trash2,
  RotateCcw,
  GitCompare,
  Play,
  Pause,
  Volume2,
  Video,
  Image,
  Music,
  ImageOff,
  Clock,
  Heart,
  Maximize2,
  Upload,
} from "lucide-react";
import { resolveAssetUrl } from "../../services/api";
import { useFavorites } from "../../context/FavoritesContext";
import { useAudioPlayer } from "../../context/AudioPlayerContext";

const TYPE_ACCENT = {
  image: {
    bg: "from-violet-500/20 via-gray-900 to-gray-950",
    icon: Image,
    badge: "bg-violet-500/25 text-violet-200",
  },
  video: {
    bg: "from-rose-500/20 via-gray-900 to-gray-950",
    icon: Video,
    badge: "bg-rose-500/25 text-rose-200",
  },
  music: {
    bg: "from-emerald-500/20 via-gray-900 to-gray-950",
    icon: Volume2,
    badge: "bg-emerald-500/25 text-emerald-200",
  },
  audio: {
    bg: "from-emerald-500/20 via-gray-900 to-gray-950",
    icon: Volume2,
    badge: "bg-emerald-500/25 text-emerald-200",
  },
  remix: {
    bg: "from-purple-500/20 via-gray-900 to-gray-950",
    icon: Music,
    badge: "bg-purple-500/25 text-purple-200",
  },
  project: {
    bg: "from-amber-500/20 via-gray-900 to-gray-950",
    icon: Image,
    badge: "bg-amber-500/25 text-amber-200",
  },
};

function formatDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function MediaCard({
  item,
  mediaType = "image",
  onSelect,
  onCompare,
  onDelete,
  onReload,
  onDownload,
  onPreview,
  onLoadHistory,
  isComparing = false,
  aspectRatio = "aspect-[4/5]",
  className = "",
}) {
  const [broken, setBroken] = useState(false);
  const [failedThumb, setFailedThumb] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { playTrack, pause, resume, currentTrack, isPlaying } = useAudioPlayer();

  const type = item.type || mediaType;
  const accent = TYPE_ACCENT[type] || TYPE_ACCENT.image;
  const TypeIcon = accent.icon;
  const url = resolveAssetUrl(item.url);

  const isCurrent =
    currentTrack &&
    (currentTrack.id === item.id ||
      (currentTrack.url && currentTrack.url === item.url));

  const renderMedia = () => {
    if (type === "image") {
      if (broken) return null;
      return (
        <img
          src={url}
          alt={item.prompt?.slice(0, 40) || item.title || "Image"}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setBroken(true)}
        />
      );
    }

    if (type === "video") {
      const hasGoodThumb = item.thumbnail && !failedThumb;
      return (
        <>
          {hasGoodThumb ? (
            <img
              src={resolveAssetUrl(item.thumbnail)}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setFailedThumb(true)}
            />
          ) : (
            <video
              src={url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
              onError={() => setBroken(true)}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-gray-900/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        </>
      );
    }

    if (type === "music" || type === "remix" || type === "audio") {
      const isVideoAudio =
        (type === "music" || type === "audio") &&
        (item.mode === "video_to_audio" ||
          item.metadata?.mode === "video_to_audio");
      if (isVideoAudio) {
        return (
          <>
            <video
              src={url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
              onError={() => setBroken(true)}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-11 h-11 rounded-full bg-gray-900/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          </>
        );
      }
      return (
        <div
          className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${accent.bg}`}
        >
          <div
            className={`p-4 rounded-2xl border ${
              type === "remix"
                ? "bg-purple-500/10 border-purple-500/15"
                : "bg-emerald-500/10 border-emerald-500/15"
            }`}
          >
            {type === "remix" ? (
              <Music className="w-10 h-10 text-purple-400/70" />
            ) : (
              <Volume2 className="w-10 h-10 text-emerald-400/70" />
            )}
          </div>
        </div>
      );
    }

    if (type === "project") {
      return (
        <div
          className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${accent.bg}`}
        >
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/15">
            <Image className="w-10 h-10 text-amber-400/70" />
          </div>
        </div>
      );
    }

    return null;
  };

  const isAudioLike =
    type === "music" || type === "remix" || type === "audio";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`group relative ${aspectRatio} rounded-xl overflow-hidden bg-gray-900 border border-gray-800 cursor-pointer hover:border-gray-600 hover:shadow-lg hover:shadow-black/30 transition-all duration-200 ${className}`}
      onClick={() => onSelect?.(item)}
    >
      {/* Media content */}
      <div className="absolute inset-0">{renderMedia()}</div>

      {/* Broken placeholder */}
      {broken && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${accent.bg} bg-gray-900`}
        >
          <ImageOff className="w-8 h-8 text-gray-500 mb-1" />
          <span className="text-[10px] text-gray-500">Unavailable</span>
        </div>
      )}

      {/* Playing indicator */}
      {currentTrack &&
        isPlaying &&
        (currentTrack.id === item.id ||
          (currentTrack.url && currentTrack.url === item.url)) && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-purple-600/90 backdrop-blur-sm border border-purple-500/50">
            <div className="flex gap-0.5 items-end h-3">
              <div
                className="w-0.5 bg-white animate-pulse"
                style={{ animationDelay: "0ms", height: "60%" }}
              ></div>
              <div
                className="w-0.5 bg-white animate-pulse"
                style={{ animationDelay: "150ms", height: "100%" }}
              ></div>
              <div
                className="w-0.5 bg-white animate-pulse"
                style={{ animationDelay: "300ms", height: "40%" }}
              ></div>
            </div>
            <span className="text-[10px] font-medium text-white">Playing</span>
          </div>
        )}

      {/* Compare badge */}
      {isComparing && (
        <div className="absolute top-2 left-10 z-10 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-semibold rounded-full shadow-lg">
          Comparing
        </div>
      )}

      {/* Favorite button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(type, item._originId || item.id);
        }}
        className={`absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 transition-colors hover:bg-black/60 ${
          isFavorite(type, item._originId || item.id)
            ? "text-rose-400"
            : "text-gray-300"
        }`}
        title={
          isFavorite(type, item._originId || item.id)
            ? "Unfavorite"
            : "Favorite"
        }
      >
        <Heart
          className={`w-3.5 h-3.5 transition-colors ${
            isFavorite(type, item._originId || item.id)
              ? "fill-rose-400"
              : ""
          }`}
        />
      </button>

      {/* Gradient overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent pt-6 pb-1.5 px-2.5 pointer-events-none">
        <p className="text-xs font-medium text-gray-100 truncate leading-tight">
          {item.prompt?.slice(0, 60) || item.title || "No prompt"}
        </p>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <span
            className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${accent.badge}`}
          >
            <TypeIcon className="w-2.5 h-2.5" />
            {type}
          </span>
          {item.model && (
            <span className="text-[10px] text-gray-400 truncate max-w-[100px]">
              {item.model}
            </span>
          )}
          {item.duration && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {item.duration}s
            </span>
          )}
          {item.seed != null && (
            <span className="text-[10px] text-gray-400">#{item.seed}</span>
          )}
          {item.lastUpdated && (
            <span className="text-[10px] text-gray-400">
              {formatDate(item.lastUpdated)}
            </span>
          )}
          {item._origin === "history" && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-purple-500/30 text-purple-200">
              history
            </span>
          )}
          {item._origin === "library" && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-blue-500/30 text-blue-200">
              library
            </span>
          )}
        </div>
        {item.tags && (
          <p className="text-[10px] text-purple-300/80 mt-1 truncate leading-tight">
            {item.tags}
          </p>
        )}
      </div>

      {/* Hover action overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-gray-900/50 transition-colors duration-200 flex flex-col opacity-0 group-hover:opacity-100 p-2">
        {/* Top row: primary actions */}
        <div className="flex flex-wrap justify-end gap-1">
          {isAudioLike && item.url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isCurrent) {
                  if (isPlaying) pause();
                  else resume();
                } else {
                  playTrack({ ...item, type });
                }
              }}
              className={`p-1.5 rounded-md bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20 transition-colors ${
                isCurrent && isPlaying
                  ? "text-purple-300 border-purple-500/50 bg-purple-600/20"
                  : ""
              }`}
              title={isCurrent && isPlaying ? "Pause" : "Play"}
            >
              {isCurrent && isPlaying ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </button>
          )}
          {onPreview && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(item);
              }}
              className="p-1.5 rounded-md bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20 transition-colors"
              title="Preview"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
          {onDownload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(item);
              }}
              className="p-1.5 rounded-md bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20 transition-colors"
              title="Download"
            >
              <Download className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Bottom row: secondary actions */}
        <div className="mt-auto flex flex-wrap justify-end gap-1">
          {onCompare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCompare(item);
              }}
              className={`p-1.5 rounded-md border transition-colors ${
                isComparing
                  ? "bg-purple-500/30 border-purple-500/60 text-white"
                  : "bg-gray-900/80 border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20"
              }`}
              title="Compare"
            >
              <GitCompare className="w-3 h-3" />
            </button>
          )}
          {onReload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReload(item);
              }}
              className="p-1.5 rounded-md bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-blue-200 hover:border-blue-500/60 hover:bg-blue-600/20 transition-colors"
              title="Reload prompt"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          {onLoadHistory && item._origin === "history" && item.type !== "project" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLoadHistory(item);
              }}
              className="p-1.5 rounded-md bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-purple-200 hover:border-purple-500/60 hover:bg-purple-600/20 transition-colors"
              title="Load in editor"
            >
              <Upload className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="p-1.5 rounded-md bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-rose-200 hover:border-rose-500/60 hover:bg-rose-600/20 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
