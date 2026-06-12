import { useEffect, useMemo, useState } from "react";
import { resolveAssetUrl } from "../../services/api";
import {
  X,
  Download,
  Copy,
  Check,
  Trash2,
  Upload,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  ImageOff,
  Wand2,
  Volume2,
  Heart,
  Play,
} from "lucide-react";
import { useFavorites } from "../../context/FavoritesContext";
import { useAudioPlayer } from "../../context/AudioPlayerContext";

const TYPE_META = {
  image: { icon: ImageIcon, label: "IMAGE", accent: "text-violet-300" },
  video: { icon: VideoIcon, label: "VIDEO", accent: "text-rose-300" },
  audio: { icon: MusicIcon, label: "AUDIO", accent: "text-emerald-300" },
  music: { icon: MusicIcon, label: "MUSIC", accent: "text-emerald-300" },
  remix: { icon: MusicIcon, label: "REMIX", accent: "text-purple-300" },
  project: { icon: FileText, label: "PROJECT", accent: "text-amber-300" },
};

function isAudioType(type) {
  return type === "audio" || type === "music" || type === "remix";
}

export default function MediaPreviewDialog({
  open,
  asset,
  onClose,
  onDownload,
  onDelete,
  onLoad,
  showLoad = false,
  showDelete = false,
  showDownload = true,
  showCopy = true,
}) {
  const [copied, setCopied] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { pendingTrack, confirmReplace } = useAudioPlayer();

  const safeAsset = asset || {};
  const type = safeAsset.type || "project";
  const typeMeta = TYPE_META[type] || TYPE_META.project;
  const TypeIcon = typeMeta.icon;
  const resolvedUrl = safeAsset.url ? resolveAssetUrl(safeAsset.url) : "";

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const metaRows = useMemo(() => {
    const rows = [
      { label: "Title", value: safeAsset.title || "Untitled" },
      { label: "Type", value: type.toUpperCase() },
      { label: "Source", value: safeAsset.source || "-" },
    ];

    if (type === "remix" || type === "music") {
      if (safeAsset.model || safeAsset.metadata?.model) {
        rows.push({ label: "Model", value: safeAsset.model || safeAsset.metadata?.model });
      }
      if (safeAsset.duration != null || safeAsset.metadata?.duration != null) {
        rows.push({ label: "Duration", value: `${safeAsset.duration ?? safeAsset.metadata?.duration}s` });
      }
      if (safeAsset.seed != null || safeAsset.metadata?.seed != null) {
        rows.push({ label: "Seed", value: safeAsset.seed ?? safeAsset.metadata?.seed });
      }
      if (safeAsset.tags || safeAsset.metadata?.tags) {
        rows.push({ label: "Tags", value: safeAsset.tags || safeAsset.metadata?.tags });
      }
      if (safeAsset.bpm != null || safeAsset.metadata?.bpm != null) {
        rows.push({ label: "BPM", value: safeAsset.bpm ?? safeAsset.metadata?.bpm });
      }
      if (safeAsset.keyScale || safeAsset.metadata?.keyScale) {
        rows.push({ label: "Key", value: safeAsset.keyScale || safeAsset.metadata?.keyScale });
      }
      if (safeAsset.timeSignature != null || safeAsset.metadata?.timeSignature != null) {
        rows.push({ label: "Time Signature", value: safeAsset.timeSignature ?? safeAsset.metadata?.timeSignature });
      }
      if (safeAsset.coverStrength != null || safeAsset.metadata?.coverStrength != null) {
        const cs = safeAsset.coverStrength ?? safeAsset.metadata?.coverStrength;
        rows.push({ label: "Cover Strength", value: cs });
      }
      if (safeAsset.refAudioStrength != null || safeAsset.metadata?.refAudioStrength != null) {
        const rs = safeAsset.refAudioStrength ?? safeAsset.metadata?.refAudioStrength;
        rows.push({ label: "Ref Strength", value: rs });
      }
      if (safeAsset.inferStep != null || safeAsset.metadata?.inferStep != null) {
        rows.push({ label: "Infer Steps", value: safeAsset.inferStep ?? safeAsset.metadata?.inferStep });
      }
      if (safeAsset.guidanceScale != null || safeAsset.metadata?.guidanceScale != null) {
        rows.push({ label: "Guidance", value: safeAsset.guidanceScale ?? safeAsset.metadata?.guidanceScale });
      }
      if (safeAsset.negativeStyles || safeAsset.metadata?.negativeStyles) {
        rows.push({ label: "Negative", value: safeAsset.negativeStyles || safeAsset.metadata?.negativeStyles });
      }
      if (safeAsset.thinking != null || safeAsset.metadata?.thinking != null) {
        rows.push({ label: "Thinking", value: (safeAsset.thinking ?? safeAsset.metadata?.thinking) ? "On" : "Off" });
      }
    }

    rows.push({
      label: "Updated",
      value: safeAsset.updatedAt
        ? new Date(safeAsset.updatedAt).toLocaleString()
        : safeAsset.createdAt
          ? new Date(safeAsset.createdAt).toLocaleString()
          : "-",
    });

    return rows;
  }, [safeAsset, type]);

  if (!open || !asset) return null;

  const handleCopy = () => {
    if (!resolvedUrl) return;
    navigator.clipboard?.writeText(resolvedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderMedia = () => {
    if (!resolvedUrl) {
      return (
        <div className="w-full h-full min-h-[240px] flex flex-col items-center justify-center bg-gray-900">
          <ImageOff className="w-10 h-10 text-gray-600 mb-2" />
          <p className="text-sm text-gray-500">Preview unavailable</p>
        </div>
      );
    }

    if (type === "image") {
      return (
        <img
          src={resolvedUrl}
          alt={asset.title || "Preview"}
          className="max-w-full max-h-[70vh] object-contain rounded-2xl border border-gray-800"
        />
      );
    }
    if (type === "video") {
      return (
        <video
          src={resolvedUrl}
          controls
          autoPlay
          className="w-full max-h-[70vh] rounded-2xl border border-gray-800 bg-black"
        />
      );
    }
    if (isAudioType(type)) {
      const isRemix = type === "remix";
      const urls = asset.urls || (asset.url ? [asset.url] : []);
      const primaryUrl = urls[0] ? resolveAssetUrl(urls[0]) : "";
      const promptText =
        asset.prompt || asset.metadata?.description || asset.title || "";
      const tagsText = asset.tags || asset.metadata?.tags || "";
      const lyricsText = asset.lyrics || asset.metadata?.lyrics || "";
      const thumb = asset.thumbnail || asset.metadata?.thumbnail || null;

      return (
        <div className="w-full max-w-2xl mx-auto max-h-[70vh] overflow-y-auto space-y-4">
          {/* Styled player container */}
          <div
            className={`bg-gradient-to-br ${
              isRemix
                ? "from-purple-950/40 via-gray-900 to-gray-950"
                : "from-emerald-950/40 via-gray-900 to-gray-950"
            } rounded-xl p-6 flex flex-col items-center border border-gray-800`}
          >
            {thumb && (
              <img
                src={resolveAssetUrl(thumb)}
                alt={asset.title || "Thumbnail"}
                className="w-24 h-24 rounded-xl object-cover border border-gray-700 mb-4"
              />
            )}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
              {isRemix ? (
                <Wand2 className="w-10 h-10 text-white" />
              ) : (
                <Volume2 className="w-10 h-10 text-white" />
              )}
            </div>

            {pendingTrack ? (
              <button
                onClick={confirmReplace}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
              >
                <Play className="w-4 h-4" />
                Play in Global Player
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900/60 border border-gray-700 text-gray-300">
                <Play className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium">Playing in Global Player</span>
              </div>
            )}

            {promptText && (
              <p className="text-sm text-gray-300 mt-4 text-center max-w-md font-medium">
                {promptText}
              </p>
            )}
          </div>

          {/* Tags & Lyrics */}
          {isRemix && (tagsText || lyricsText) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tagsText && (
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Generated tags
                  </p>
                  <p className="text-sm text-purple-300">{tagsText}</p>
                </div>
              )}
              {lyricsText && (
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800 max-h-40 overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Generated lyrics
                  </p>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                    {lyricsText}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {(asset.model || asset.metadata?.model || asset.metadata?.mode) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                {asset.model || asset.metadata?.model || asset.metadata?.mode}
              </span>
            )}
            {(asset.duration != null || asset.metadata?.duration != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                {(asset.duration ?? asset.metadata?.duration)}s
              </span>
            )}
            {(asset.seed != null || asset.metadata?.seed != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                seed {asset.seed ?? asset.metadata?.seed}
              </span>
            )}
            {(asset.bpm != null || asset.metadata?.bpm != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                {(asset.bpm ?? asset.metadata?.bpm)} bpm
              </span>
            )}
            {(asset.keyScale || asset.metadata?.keyScale) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                key {asset.keyScale || asset.metadata?.keyScale}
              </span>
            )}
            {(asset.timeSignature != null || asset.metadata?.timeSignature != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                {(asset.timeSignature ?? asset.metadata?.timeSignature)}/4
              </span>
            )}
            {(asset.inferStep != null || asset.metadata?.inferStep != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                {(asset.inferStep ?? asset.metadata?.inferStep)} steps
              </span>
            )}
            {(asset.guidanceScale != null || asset.metadata?.guidanceScale != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                CFG {asset.guidanceScale ?? asset.metadata?.guidanceScale}
              </span>
            )}
            {(asset.coverStrength != null || asset.metadata?.coverStrength != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                cover {asset.coverStrength ?? asset.metadata?.coverStrength}
              </span>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full max-w-2xl mx-auto text-sm text-gray-300 space-y-2">
        <p>Project assets do not have a direct media preview.</p>
        <pre className="bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-auto text-xs text-gray-300">
          {JSON.stringify(asset.metadata || {}, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onClose?.()}
      />
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <TypeIcon className={`w-5 h-5 ${typeMeta.accent}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {asset.title || "Preview"}
              </p>
              <p className="text-xs text-gray-500">
                {typeMeta.label} • {asset.source || "-"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFavorite(type, asset.id)}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                isFavorite(type, asset.id)
                  ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                  : "bg-gray-900/80 border-gray-700 text-gray-300 hover:text-rose-200 hover:border-rose-500/60 hover:bg-rose-600/20"
              }`}
              title="Favorite"
            >
              <Heart className={`w-4 h-4 ${isFavorite(type, asset.id) ? "fill-rose-400" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-900/80 border border-gray-700 text-white hover:border-gray-600 hover:bg-gray-800 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="p-4 bg-black/60 flex items-center justify-center overflow-auto">
          {renderMedia()}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between p-3 border-t border-gray-800 bg-gray-950/80">
          <div className="flex items-center gap-2">
            {showDownload && asset.url && (
              <button
                onClick={() => onDownload?.(asset)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white transition-all"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            {showCopy && asset.url && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/80 border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-all"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied" : "Copy URL"}
              </button>
            )}
            {showLoad && (
              <button
                onClick={() => onLoad?.(asset)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-sm font-medium text-white transition-all"
              >
                <Upload className="w-4 h-4" />
                Load
              </button>
            )}
          </div>
          {showDelete && (
            <button
              onClick={() => onDelete?.(asset)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-sm font-medium text-white transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>

        {/* Metadata */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metaRows.map((row) => (
              <div key={row.label} className="text-xs text-gray-500">
                <p className="uppercase tracking-wider">{row.label}</p>
                <p className="text-sm text-gray-200 mt-1 truncate">
                  {row.value}
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
