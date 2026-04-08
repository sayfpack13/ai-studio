import { useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";

const fallbackTime = 0;

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
      return url.replace(/\/+$/, '').toLowerCase();
    };

    const byUrlOrId = new Map();

    // Add API assets first (they have preference)
    for (const asset of apiAssets) {
      const normalizedUrl = normalizeUrl(asset.url);
      const dedupeKey = normalizedUrl ? `url:${normalizedUrl}` : `id:${asset.id}`;
      if (!byUrlOrId.has(dedupeKey)) {
        byUrlOrId.set(dedupeKey, asset);
      }
    }

    // Add history assets, skipping if URL already exists
    for (const asset of historyAssets) {
      const normalizedUrl = normalizeUrl(asset.url);
      const dedupeKey = normalizedUrl ? `url:${normalizedUrl}` : `id:${asset.id}`;
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
      <div className="w-full max-w-5xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="text-sm text-gray-400">
              {filteredAssets.length} {type !== "all" ? type + " " : ""}asset
              {filteredAssets.length !== 1 ? "s" : ""} available
            </p>
          </div>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Cancel
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-800">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets..."
              className="w-full bg-gray-800 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Asset Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredAssets.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-gray-400">
                {searchQuery
                  ? "No assets match your search"
                  : `No ${type !== "all" ? type + " " : ""}assets in library`}
              </p>
              {!searchQuery && (
                <p className="text-sm text-gray-500 mt-1">
                  Upload some files to the library first
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleAssetClick(asset)}
                  className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedAssetId === asset.id
                      ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900"
                      : "hover:ring-2 hover:ring-gray-600"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-gray-800">
                    {asset.type === "image" && asset.url && (
                      <img
                        src={asset.url}
                        alt={asset.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {asset.type === "video" && asset.url && (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <video
                          src={asset.url}
                          className="w-full h-full object-cover"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <svg
                            className="w-8 h-8 text-white/80"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                    {asset.type === "audio" && asset.url && (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900 to-gray-800">
                        <svg
                          className="w-12 h-12 text-purple-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                          />
                        </svg>
                      </div>
                    )}
                    {!asset.url && (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
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
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Select button */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {selectedAssetId
              ? `Selected: ${mergedAssets.find((a) => a.id === selectedAssetId)?.title || "Asset"}`
              : "Click an asset to select it"}
          </p>
          <button
            onClick={handleSelectClick}
            disabled={!selectedAssetId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
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
          <div className="max-w-4xl w-full bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
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
                Close
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/50">
              {previewAsset.type === "image" && previewAsset.url && (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.title}
                  className="max-w-full max-h-[70vh] object-contain rounded"
                />
              )}
              {previewAsset.type === "video" && previewAsset.url && (
                <video
                  src={previewAsset.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded"
                />
              )}
              {previewAsset.type === "audio" && previewAsset.url && (
                <audio
                  src={previewAsset.url}
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
