import { useEffect, useMemo, useState } from "react";
import { resolveAssetUrl } from "../../services/api";
import {
  X,
  Download,
  Copy,
  Check,
  Trash2,
  Upload,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  ImageOff,
} from "lucide-react";

const TYPE_META = {
  image: { icon: ImageIcon, label: "IMAGE", accent: "text-violet-300" },
  video: { icon: VideoIcon, label: "VIDEO", accent: "text-rose-300" },
  audio: { icon: MusicIcon, label: "AUDIO", accent: "text-emerald-300" },
  project: { icon: FileText, label: "PROJECT", accent: "text-amber-300" },
};

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
  const [metaExpanded, setMetaExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const safeAsset = asset || {};
  const type = safeAsset.type || "project";
  const typeMeta = TYPE_META[type] || TYPE_META.project;
  const TypeIcon = typeMeta.icon;
  const resolvedUrl = safeAsset.url ? resolveAssetUrl(safeAsset.url) : "";

  const metaRows = useMemo(() => {
    return [
      { label: "Title", value: safeAsset.title || "Untitled" },
      { label: "Type", value: type.toUpperCase() },
      { label: "Source", value: safeAsset.source || "-" },
      {
        label: "Updated",
        value: safeAsset.updatedAt
          ? new Date(safeAsset.updatedAt).toLocaleString()
          : safeAsset.createdAt
            ? new Date(safeAsset.createdAt).toLocaleString()
            : "-",
      },
    ];
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
    if (type === "audio") {
      return (
        <div className="w-full max-w-xl mx-auto space-y-3">
          <p className="text-sm text-gray-300">Audio preview</p>
          <audio src={resolvedUrl} controls autoPlay className="w-full" />
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
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-900/80 border border-gray-700 text-white hover:border-gray-600 hover:bg-gray-800 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
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
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-all"
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

          <button
            onClick={() => setMetaExpanded((prev) => !prev)}
            className="mt-3 inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white"
          >
            {metaExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {metaExpanded ? "Hide metadata" : "Show raw metadata"}
          </button>

          {metaExpanded && (
            <pre className="mt-2 bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-auto text-xs text-gray-300">
              {JSON.stringify(asset.metadata || {}, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
