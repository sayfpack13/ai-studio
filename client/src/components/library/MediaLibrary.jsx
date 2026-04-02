import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { uploadLibraryFile } from "../../services/api";

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

function inferTypeFromFile(file) {
  if (!file?.type) return "project";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "project";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function MediaLibrary() {
  const {
    libraryAssets,
    libraryFilters,
    setLibraryFilters,
    refreshLibraryAssets,
    removeLibraryAsset,
    runLibrarySearch,
    imageHistory,
    videoHistory,
    musicHistory,
    remixHistory,
    editorProjects,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
    getEditorProjectIds,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const loadLibraryAssets = async () => {
    setLoading(true);
    try {
      await refreshLibraryAssets(libraryFilters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibraryAssets();
  }, []);

  const onSearch = async () => {
    setLoading(true);
    try {
      await runLibrarySearch(libraryFilters);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUploadFile = (event) => {
    const selected = event.target.files?.[0] || null;
    setUploadFile(selected);
    setUploadError("");
    setUploadSuccess("");

    if (selected && !uploadTitle.trim()) {
      const dot = selected.name.lastIndexOf(".");
      const baseName = dot > 0 ? selected.name.slice(0, dot) : selected.name;
      setUploadTitle(baseName);
    }

    if (selected && !uploadType) {
      setUploadType(inferTypeFromFile(selected));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || uploading) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const dataUrl = await fileToDataUrl(uploadFile);

      const response = await uploadLibraryFile({
        fileName: uploadFile.name,
        fileBase64: dataUrl,
        mimeType: uploadFile.type || undefined,
        title: uploadTitle.trim() || uploadFile.name,
        type: uploadType || inferTypeFromFile(uploadFile),
        source: "upload",
        metadata: {
          uploadedFrom: "media-library-ui",
          sizeBytes: uploadFile.size,
        },
      });

      if (!response?.success) {
        throw new Error(response?.error || "Upload failed");
      }

      setUploadSuccess("File uploaded successfully.");
      setUploadFile(null);
      setUploadTitle("");
      setUploadType("");

      await loadLibraryAssets();
    } catch (error) {
      setUploadError(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

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
      ...(getEditorProjectIds?.() || []).map((id) =>
        normalizeHistoryItem(
          editorProjects?.[id],
          id,
          "project",
          "editor-history",
        ),
      ),
    ].filter(Boolean);

    const byUrlOrId = new Map();

    for (const asset of apiAssets) {
      const dedupeKey = asset.url ? `url:${asset.url}` : `id:${asset.id}`;
      byUrlOrId.set(dedupeKey, asset);
    }

    for (const asset of historyAssets) {
      const dedupeKey = asset.url ? `url:${asset.url}` : `id:${asset.id}`;
      if (!byUrlOrId.has(dedupeKey)) {
        byUrlOrId.set(dedupeKey, asset);
      }
    }

    const all = Array.from(byUrlOrId.values());

    const query = (libraryFilters?.query || "").trim().toLowerCase();
    const type = (libraryFilters?.type || "").trim().toLowerCase();

    const filtered = all.filter((asset) => {
      const typeOk = !type || (asset.type || "").toLowerCase() === type;
      if (!typeOk) return false;

      if (!query) return true;
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

    filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return filtered;
  }, [
    libraryAssets,
    libraryFilters,
    imageHistory,
    videoHistory,
    musicHistory,
    remixHistory,
    editorProjects,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
    getEditorProjectIds,
  ]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold">Media Library</h2>
        <p className="text-sm text-gray-400">
          Global assets merged with generated history from image, video, music,
          remix, and editor.
        </p>
      </div>

      {/* Upload Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Upload File</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            type="file"
            onChange={handleSelectUploadFile}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 md:col-span-2"
          />
          <input
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Asset title"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
          <select
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            <option value="">Auto type</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="project">Project</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
            className="px-3 py-2 rounded bg-emerald-600 disabled:opacity-50 text-sm"
          >
            {uploading ? "Uploading..." : "Upload to Library"}
          </button>
          {uploadFile && (
            <span className="text-xs text-gray-400 truncate">
              {uploadFile.name} ({Math.round(uploadFile.size / 1024)} KB)
            </span>
          )}
        </div>

        {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}
        {uploadSuccess && (
          <p className="text-sm text-emerald-400">{uploadSuccess}</p>
        )}
      </div>

      {/* Search / Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid md:grid-cols-4 gap-2">
        <input
          value={libraryFilters.query || ""}
          onChange={(e) =>
            setLibraryFilters((prev) => ({ ...prev, query: e.target.value }))
          }
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          placeholder="Search assets"
        />
        <select
          value={libraryFilters.type || ""}
          onChange={(e) =>
            setLibraryFilters((prev) => ({ ...prev, type: e.target.value }))
          }
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="project">Project</option>
        </select>
        <button
          onClick={onSearch}
          className="px-3 py-2 rounded bg-blue-600 text-sm"
        >
          Search
        </button>
        <button
          onClick={loadLibraryAssets}
          className="px-3 py-2 rounded bg-gray-700 text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Assets */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {mergedAssets.map((asset) => (
          <div
            key={asset.id}
            className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{asset.title}</p>
              <span className="text-xs px-2 py-1 rounded bg-gray-700">
                {asset.type}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400 truncate">
                {asset.source || "-"}
              </p>
              {asset._origin === "history" && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-700/50 text-purple-200">
                  history
                </span>
              )}
            </div>

            {asset.url && asset.type === "image" && (
              <img
                src={asset.url}
                alt={asset.title}
                className="w-full h-28 object-cover rounded"
              />
            )}

            {asset.url && asset.type === "video" && (
              <video
                src={asset.url}
                className="w-full h-28 object-cover rounded"
              />
            )}

            {asset.url && asset.type === "audio" && (
              <audio src={asset.url} controls className="w-full" />
            )}

            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-500">
                {asset.updatedAt
                  ? new Date(asset.updatedAt).toLocaleString()
                  : "No date"}
              </span>
              <div className="flex items-center gap-2">
                {asset.url && (
                  <button
                    onClick={() => setPreviewAsset(asset)}
                    className="text-xs px-2 py-1 rounded bg-gray-700"
                  >
                    Open
                  </button>
                )}
                {asset._origin === "library" ? (
                  <button
                    onClick={() => removeLibraryAsset(asset.id)}
                    className="text-xs px-2 py-1 rounded bg-red-700"
                  >
                    Delete
                  </button>
                ) : (
                  <span className="text-[11px] text-gray-500">in history</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && mergedAssets.length === 0 && (
        <p className="text-sm text-gray-400">No assets yet.</p>
      )}

      {loading && <p className="text-sm text-gray-400">Loading library...</p>}

      {/* Preview Dialog */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewAsset(null);
          }}
        >
          <div className="w-full max-w-4xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {previewAsset.title || "Preview"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {previewAsset.type} • {previewAsset.source || "-"}
                </p>
              </div>
              <button
                onClick={() => setPreviewAsset(null)}
                className="px-2 py-1 text-sm rounded bg-gray-800 hover:bg-gray-700"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1">
              {previewAsset.type === "image" && previewAsset.url && (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.title || "Image preview"}
                  className="max-w-full max-h-[70vh] mx-auto rounded"
                />
              )}

              {previewAsset.type === "video" && previewAsset.url && (
                <video
                  src={previewAsset.url}
                  controls
                  autoPlay
                  className="w-full max-h-[70vh] rounded"
                />
              )}

              {previewAsset.type === "audio" && previewAsset.url && (
                <div className="max-w-xl mx-auto space-y-3">
                  <p className="text-sm text-gray-300">Audio preview</p>
                  <audio
                    src={previewAsset.url}
                    controls
                    autoPlay
                    className="w-full"
                  />
                </div>
              )}

              {previewAsset.type === "project" && (
                <div className="text-sm text-gray-300 space-y-2">
                  <p>Project assets do not have direct media preview.</p>
                  <pre className="bg-gray-800 border border-gray-700 rounded p-3 overflow-auto text-xs text-gray-300">
                    {JSON.stringify(previewAsset.metadata || {}, null, 2)}
                  </pre>
                </div>
              )}

              {!["image", "video", "audio", "project"].includes(
                previewAsset.type,
              ) && (
                <div className="text-sm text-gray-300">
                  Preview is not available for this asset type.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
