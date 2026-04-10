import { useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { resolveAssetUrl } from "../../services/api";
import {
  Search,
  X,
  Check,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  ImageOff,
  Play,
  Maximize2,
  FolderOpen,
} from "lucide-react";

const fallbackTime = 0;

function isInvalidMediaUrl(url) {
  if (!url) return true;
  const normalized = String(url).trim();
  if (!normalized) return true;
  const lower = normalized.toLowerCase();
  if (
    lower === "not found" ||
    lower === "missing" ||
    lower === "undefined" ||
    lower === "null"
  ) {
    return true;
  }
  if (normalized.includes("videolan.org")) return true;
  if (normalized.startsWith("data:")) return true;
  return false;
}

function normalizeHistoryItem(item, id, type, source) {
  if (!item) return null;

  const titleBase =
    item.title ||
    item.prompt ||
    item.name ||
    `${type.charAt(0).toUpperCase()}${type.slice(1)} ${id}`;

  const url =
    item?.url ||
    item?.result?.url ||
    item?.result?.video ||
    item?.result?.audio ||
    item?.result?.image ||
    "";

  if (isInvalidMediaUrl(url)) return null;

  return {
    id: `hist_${type}_${id}`,
    title: String(titleBase).slice(0, 120),
    type,
    source,
    url,
    metadata: item?.metadata || {},
    createdAt: item?.createdAt || item?.lastUpdated || fallbackTime,
    updatedAt:
      item?.lastUpdated || item?.updatedAt || item?.createdAt || fallbackTime,
    _origin: "history",
    _originId: id,
  };
}

function normalizeLibraryAsset(asset) {
  if (!asset) return null;
  return {
    ...asset,
    createdAt: asset.createdAt || asset.updatedAt || fallbackTime,
    updatedAt: asset.updatedAt || asset.createdAt || fallbackTime,
    _origin: "library",
    _originId: asset.id,
  };
}

export default function AssetPickerDialog({
  open,
  onClose,
  onSelect,
  type = "image",
  title = "Select Asset",
}) {
  const {
    libraryAssets,
    imageHistory,
    videoHistory,
    musicHistory,
    remixHistory,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
  } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewAsset, setPreviewAsset] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const mergedAssets = useMemo(() => {
    const apiAssets = (libraryAssets || [])
      .map(normalizeLibraryAsset)
      .filter(Boolean);

    const historyAssets = [
      ...(getImageIds?.() || []).map((id) =>
        normalizeHistoryItem(imageHistory?.[id], id, "image", "image-history"),
      ),
      ...(getVideoIds?.() || []).map((id) =>
        normalizeHistoryItem(videoHistory?.[id], id, "video", "video-history"),
      ),
      ...(getMusicIds?.() || []).map((id) =>
        normalizeHistoryItem(musicHistory?.[id], id, "audio", "music-history"),
      ),
      ...(getRemixIds?.() || []).map((id) =>
        normalizeHistoryItem(remixHistory?.[id], id, "audio", "remix-history"),
      ),
    ].filter(Boolean);

    // Normalize URLs for deduplication (remove trailing slashes, normalize path)
    const normalizeUrl = (url) => {
      if (!url) return null;
      // Remove trailing slashes and convert to lowercase for comparison
      return url.replace(/\/+$/, "").toLowerCase();
    };

    const byUrlOrId = new Map();

    // Add API assets first (they have preference)
    for (const asset of apiAssets) {
      const normalizedUrl = normalizeUrl(asset.url);
      const dedupeKey = normalizedUrl
        ? `url:${normalizedUrl}`
        : `id:${asset.id}`;
      if (!byUrlOrId.has(dedupeKey)) {
        byUrlOrId.set(dedupeKey, asset);
      }
    }

    // Add history assets, skipping if URL already exists
    for (const asset of historyAssets) {
      const normalizedUrl = normalizeUrl(asset.url);
      const dedupeKey = normalizedUrl
        ? `url:${normalizedUrl}`
        : `id:${asset.id}`;
      if (!byUrlOrId.has(dedupeKey)) {
        byUrlOrId.set(dedupeKey, asset);
      }
    }

    return Array.from(byUrlOrId.values());
  }, [
    libraryAssets,
    imageHistory,
    videoHistory,
    musicHistory,
    remixHistory,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
  ]);

  const filteredAssets = useMemo(() => {
    let assets = mergedAssets;

    // Filter by type
    if (type && type !== "all") {
      assets = assets.filter((asset) => asset.type === type);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      assets = assets.filter((asset) => {
        const haystack = [
          asset.title,
          asset.source,
          asset.type,
          asset.url,
          JSON.stringify(asset.metadata || {}),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    // Sort by most recent
    return assets.sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || 0;
      const bTime = b.updatedAt || b.createdAt || 0;
      return bTime - aTime;
    });
  }, [mergedAssets, type, searchQuery]);

  const handleSelectClick = () => {
    const asset = mergedAssets.find((a) => a.id === selectedAssetId);
    if (asset && onSelect) {
      onSelect(asset);
    }
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery("");
    setPreviewAsset(null);
    setSelectedAssetId(null);
    if (onClose) onClose();
  };

  const handleAssetClick = (asset) => {
    setSelectedAssetId(asset.id);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return "-";
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-5xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              {type === "video" ? (
                <VideoIcon className="w-5 h-5 text-rose-300" />
              ) : type === "audio" ? (
                <MusicIcon className="w-5 h-5 text-emerald-300" />
              ) : (
                <ImageIcon className="w-5 h-5 text-violet-300" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="text-sm text-gray-400">
                {filteredAssets.length} {type !== "all" ? type + " " : ""}asset
                {filteredAssets.length !== 1 ? "s" : ""} available
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-gray-800/80 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-800 bg-gray-950/80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets..."
              className="w-full bg-gray-900/70 text-white pl-9 pr-9 py-2 rounded-lg text-sm border border-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Asset Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredAssets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-gray-600" />
              </div>
              <p className="text-gray-300 font-medium">No assets yet</p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery
                  ? "No assets match your search"
                  : `No ${type !== "all" ? type + " " : ""}assets in library`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleAssetClick(asset)}
                  className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border transition-all ${
                    selectedAssetId === asset.id
                      ? "border-purple-500/60 ring-2 ring-purple-500/30"
                      : "border-gray-800 hover:border-gray-700"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="absolute inset-0">
                    {asset.type === "image" && asset.url && (
                      <img
                        src={resolveAssetUrl(asset.url)}
                        alt={asset.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    {asset.type === "video" && asset.url && (
                      <div className="w-full h-full flex items-center justify-center bg-gray-900">
                        <video
                          src={resolveAssetUrl(asset.url)}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <div className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
                            <Play className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      </div>
                    )}
                    {asset.type === "audio" && asset.url && (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-950/70 via-gray-900 to-gray-950">
                        <MusicIcon className="w-10 h-10 text-emerald-400/70" />
                      </div>
                    )}
                    {asset.type === "project" && (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-950/70 via-gray-900 to-gray-950">
                        <FolderOpen className="w-9 h-9 text-amber-400/70" />
                      </div>
                    )}
                    {!asset.url && (
                      <div className="w-full h-full flex items-center justify-center bg-gray-900">
                        <ImageOff className="w-8 h-8 text-gray-600" />
                      </div>
                    )}
                  </div>

                  {/* Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950/90 via-gray-950/50 to-transparent pt-6 pb-2 px-2.5">
                    <p className="text-xs text-white truncate font-medium">
                      {asset.title}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {asset.source} •{" "}
                      {formatDate(asset.updatedAt || asset.createdAt)}
                    </p>
                  </div>

                  {/* Selected indicator */}
                  {selectedAssetId === asset.id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAsset(asset);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/20 flex items-center gap-1.5"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelect) onSelect(asset);
                        handleClose();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-purple-600/90 text-white text-xs font-medium hover:bg-purple-500 flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Select button */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between bg-gray-950/80">
          <p className="text-sm text-gray-400">
            {selectedAssetId
              ? `Selected: ${mergedAssets.find((a) => a.id === selectedAssetId)?.title || "Asset"}`
              : "Click an asset to select it"}
          </p>
          <button
            onClick={handleSelectClick}
            disabled={!selectedAssetId}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Select
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewAsset(null);
          }}
        >
          <div className="max-w-4xl w-full bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <div>
                <p className="text-sm font-semibold text-white truncate">
                  {previewAsset.title}
                </p>
                <p className="text-xs text-gray-400">
                  {previewAsset.type} • {previewAsset.source}
                </p>
              </div>
              <button
                onClick={() => setPreviewAsset(null)}
                className="px-2 py-1 text-sm rounded bg-gray-800 hover:bg-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/60">
              {previewAsset.type === "image" && previewAsset.url && (
                <img
                  src={resolveAssetUrl(previewAsset.url)}
                  alt={previewAsset.title}
                  className="max-w-full max-h-[70vh] object-contain rounded"
                />
              )}
              {previewAsset.type === "video" && previewAsset.url && (
                <video
                  src={resolveAssetUrl(previewAsset.url)}
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded"
                />
              )}
              {previewAsset.type === "audio" && previewAsset.url && (
                <audio
                  src={resolveAssetUrl(previewAsset.url)}
                  controls
                  autoPlay
                  className="w-full max-w-md"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
