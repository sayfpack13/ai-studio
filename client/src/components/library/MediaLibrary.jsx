import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars -- motion is used as motion.div/motion.pre
import {
  Library,
  Search,
  Filter,
  Upload,
  RefreshCw,
  Download,
  Maximize2,
  Trash2,
  Music,
  Video,
  Image,
  FolderOpen,
  ImageOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { resolveAssetUrl, uploadLibraryFile } from "../../services/api";

const fallbackTime = 0;

function isInvalidMediaUrl(url) {
  if (!url) return true;
  if (url.includes("videolan.org")) return true;
  if (url.startsWith("data:")) return true;
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

  // Skip entries with invalid URLs
  if (isInvalidMediaUrl(url)) return null;

  const thumbnail = item?.thumbnail || item?.result?.thumbnail || null;

  return {
    id: `hist_${type}_${id}`,
    title: String(titleBase).slice(0, 120),
    type,
    source,
    url,
    thumbnail,
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

function handleDownload(url, title) {
  const resolved = resolveAssetUrl(url);
  const link = document.createElement("a");
  link.href = resolved;
  link.download = title || "download";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [imgErrors, setImgErrors] = useState({});
  const [imgVideoErrors, setImgVideoErrors] = useState({});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!previewAsset) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setPreviewAsset(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [previewAsset]);

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
      .filter((a) => a && !isInvalidMediaUrl(a.url));

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

  const stats = useMemo(() => {
    const counts = {};
    for (const a of mergedAssets) {
      const t = a.type || "other";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [mergedAssets]);

  const typeCounts = useMemo(() => {
    const parts = [];
    if (stats.image)
      parts.push(`${stats.image} image${stats.image !== 1 ? "s" : ""}`);
    if (stats.video)
      parts.push(`${stats.video} video${stats.video !== 1 ? "s" : ""}`);
    if (stats.audio)
      parts.push(`${stats.audio} audio${stats.audio !== 1 ? "s" : ""}`);
    if (stats.project)
      parts.push(`${stats.project} project${stats.project !== 1 ? "s" : ""}`);
    return parts.join(" • ") || "0 assets";
  }, [stats]);

  const handleLoadHistory = (asset) => {
    const originId = asset._originId;
    const routeMap = { image: "/image", video: "/video", audio: "/music" };
    const eventMap = {
      image: "imageHistorySelected",
      video: "videoHistorySelected",
      audio: "musicHistorySelected",
    };
    const eventType = eventMap[asset.type];
    const route = routeMap[asset.type];
    if (eventType && route) {
      window.dispatchEvent(
        new CustomEvent(eventType, {
          detail: {
            [`${asset.type === "audio" ? "music" : asset.type}Id`]: originId,
          },
        }),
      );
      navigate(route);
    }
  };

  const handleCopyUrl = async (asset) => {
    try {
      await navigator.clipboard.writeText(resolveAssetUrl(asset.url));
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* noop */
    }
  };

  const typeIcon = (type) => {
    switch (type) {
      case "image":
        return <Image className="w-3.5 h-3.5" />;
      case "video":
        return <Video className="w-3.5 h-3.5" />;
      case "audio":
        return <Music className="w-3.5 h-3.5" />;
      default:
        return <FileText className="w-3.5 h-3.5" />;
    }
  };

  const typeAccent = (type) => {
    switch (type) {
      case "image":
        return "from-blue-500/90";
      case "video":
        return "from-rose-500/90";
      case "audio":
        return "from-emerald-500/90";
      default:
        return "from-amber-500/90";
    }
  };

  const typeBadgeBg = (type) => {
    switch (type) {
      case "image":
        return "bg-blue-500/30 text-blue-200";
      case "video":
        return "bg-rose-500/30 text-rose-200";
      case "audio":
        return "bg-emerald-500/30 text-emerald-200";
      default:
        return "bg-amber-500/30 text-amber-200";
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {/* ── Header ── */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
                <Library className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-50 tracking-tight">
                  Media Library
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Browse &amp; manage assets across your generated history and
                  uploads
                </p>
                <p className="text-xs text-gray-500 mt-1">{typeCounts}</p>
              </div>
            </div>
            <button
              onClick={loadLibraryAssets}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-300 transition-all duration-150 hover:text-white disabled:opacity-50 shrink-0"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-2 shadow-lg shadow-black/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              value={libraryFilters.query || ""}
              onChange={(e) =>
                setLibraryFilters((prev) => ({
                  ...prev,
                  query: e.target.value,
                }))
              }
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              className="w-full bg-gray-800/70 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              placeholder="Search assets…"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={libraryFilters.type || ""}
              onChange={(e) =>
                setLibraryFilters((prev) => ({ ...prev, type: e.target.value }))
              }
              className="appearance-none bg-gray-800/70 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all cursor-pointer"
            >
              <option value="">All types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="project">Projects</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
          <button
            onClick={onSearch}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-all duration-150 shrink-0"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
          <button
            onClick={() => setUploadOpen((v) => !v)}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 shrink-0 ${
              uploadOpen
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
        </div>

        {/* ── Upload Panel ── */}
        <AnimatePresence>
          {uploadOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
                    <Upload className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-200">
                    Upload to Library
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 border border-dashed border-gray-600 hover:border-indigo-500/50 cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition-all">
                    <Upload className="w-4 h-4" />
                    {uploadFile ? uploadFile.name : "Choose file…"}
                    <input
                      type="file"
                      onChange={handleSelectUploadFile}
                      className="hidden"
                    />
                  </label>
                  <input
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Asset title"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                  <div className="relative">
                    <select
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value)}
                      className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all cursor-pointer"
                    >
                      <option value="">Auto type</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                      <option value="project">Project</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleUpload}
                    disabled={!uploadFile || uploading}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-all duration-150"
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload to Library
                      </>
                    )}
                  </button>
                  {uploadFile && (
                    <span className="text-xs text-gray-500">
                      {uploadFile.name} &middot;{" "}
                      {Math.round(uploadFile.size / 1024)} KB
                    </span>
                  )}
                </div>

                {uploadError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {uploadError}
                  </p>
                )}
                {uploadSuccess && (
                  <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    {uploadSuccess}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Loading Skeleton ── */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-gray-800/70 animate-pulse border border-gray-700/50"
              />
            ))}
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && mergedAssets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-gray-800/50 border border-gray-700/50 mb-4">
              <FolderOpen className="w-12 h-12 text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-300 mb-1">
              No assets yet
            </h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Upload files or generate content to see assets appear in your
              library.
            </p>
          </div>
        )}

        {/* ── Asset Grid ── */}
        {!loading && mergedAssets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {mergedAssets.map((asset) => (
              <motion.div
                key={asset.id}
                whileHover={{ scale: 1.03 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="group relative aspect-square rounded-xl overflow-hidden bg-gray-900 border border-gray-800 shadow-md shadow-black/30 cursor-pointer"
                onClick={() => setPreviewAsset(asset)}
              >
                {/* ── Media Preview ── */}
                {asset.type === "image" && asset.url && (
                  <>
                    {imgErrors[asset.id] ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800/80">
                        <ImageOff className="w-8 h-8 text-gray-600 mb-1" />
                        <span className="text-[10px] text-gray-600">
                          Preview unavailable
                        </span>
                      </div>
                    ) : (
                      <img
                        src={resolveAssetUrl(asset.url)}
                        alt={asset.title}
                        className="w-full h-full object-cover"
                        onError={() =>
                          setImgErrors((prev) => ({
                            ...prev,
                            [asset.id]: true,
                          }))
                        }
                      />
                    )}
                  </>
                )}

                {asset.type === "video" && asset.url && (
                  <>
                    {imgVideoErrors[asset.id] ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800/80">
                        <ImageOff className="w-8 h-8 text-gray-600 mb-1" />
                        <span className="text-[10px] text-gray-600">
                          Preview unavailable
                        </span>
                      </div>
                    ) : asset.thumbnail ? (
                      <img
                        src={resolveAssetUrl(asset.thumbnail)}
                        alt={asset.title}
                        className="w-full h-full object-cover"
                        onError={() =>
                          setImgVideoErrors((prev) => ({
                            ...prev,
                            [asset.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-rose-950/80 via-gray-900 to-gray-950">
                        <Video className="w-10 h-10 text-rose-400/60" />
                      </div>
                    )}
                    {!imgVideoErrors[asset.id] && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-5 h-5 fill-white"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {asset.type === "audio" && asset.url && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950/80 via-gray-900 to-gray-950">
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/15">
                      <Music className="w-10 h-10 text-emerald-400/70" />
                    </div>
                  </div>
                )}

                {asset.type === "project" && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-950/80 via-gray-900 to-gray-950">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/15">
                      <FileText className="w-10 h-10 text-amber-400/70" />
                    </div>
                  </div>
                )}

                {/* ── Gradient Overlay ── */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950 via-gray-950/70 to-transparent pt-8 pb-2 px-2.5">
                  <p className="text-[11px] font-medium text-gray-100 truncate leading-tight">
                    {asset.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md ${typeBadgeBg(asset.type)}`}
                    >
                      {typeIcon(asset.type)}
                      {asset.type}
                    </span>
                    {asset._origin === "history" && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-purple-500/30 text-purple-200">
                        history
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Hover Actions ── */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewAsset(asset);
                    }}
                    className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 hover:border-indigo-500 hover:bg-indigo-600/20 text-gray-300 hover:text-indigo-300 transition-all"
                    title="Preview"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  {asset.url && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(asset.url, asset.title);
                      }}
                      className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 hover:border-indigo-500 hover:bg-indigo-600/20 text-gray-300 hover:text-indigo-300 transition-all"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  {asset._origin === "library" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLibraryAsset(asset.id);
                      }}
                      className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 hover:border-red-500 hover:bg-red-600/20 text-gray-300 hover:text-red-300 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {asset._origin === "history" && asset.type !== "project" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadHistory(asset);
                      }}
                      className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 hover:border-purple-500 hover:bg-purple-600/20 text-gray-300 hover:text-purple-300 transition-all"
                      title="Load in editor"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Preview Dialog ── */}
        <AnimatePresence>
          {previewAsset && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPreviewAsset(null);
              }}
            >
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative w-full max-w-4xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col z-10"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                  <div className="min-w-0 flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg bg-gradient-to-br ${typeAccent(previewAsset.type)} to-transparent shrink-0`}
                    >
                      {typeIcon(previewAsset.type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-100 truncate">
                        {previewAsset.title || "Untitled"}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${typeBadgeBg(previewAsset.type)}`}
                        >
                          {typeIcon(previewAsset.type)}
                          {previewAsset.type}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {previewAsset.source || "unknown"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPreviewAsset(null)}
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Media */}
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/30">
                  {previewAsset.type === "image" && previewAsset.url && (
                    <img
                      src={resolveAssetUrl(previewAsset.url)}
                      alt={previewAsset.title || "Preview"}
                      className="max-w-full max-h-[55vh] rounded-lg object-contain shadow-xl"
                    />
                  )}
                  {previewAsset.type === "video" && previewAsset.url && (
                    <video
                      src={resolveAssetUrl(previewAsset.url)}
                      controls
                      autoPlay
                      className="max-w-full max-h-[55vh] rounded-lg shadow-xl"
                    />
                  )}
                  {previewAsset.type === "audio" && previewAsset.url && (
                    <div className="w-full max-w-lg space-y-6 flex flex-col items-center py-8">
                      <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-gray-900 to-gray-950 border border-emerald-500/15 shadow-lg">
                        <Music className="w-16 h-16 text-emerald-400/60" />
                      </div>
                      <p className="text-sm text-gray-300 text-center">
                        {previewAsset.title}
                      </p>
                      <audio
                        src={resolveAssetUrl(previewAsset.url)}
                        controls
                        autoPlay
                        className="w-full"
                      />
                    </div>
                  )}
                  {previewAsset.type === "project" && (
                    <div className="text-center space-y-2 py-8">
                      <FileText className="w-12 h-12 text-amber-400/50 mx-auto" />
                      <p className="text-sm text-gray-400">
                        Project – no direct media preview
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800 shrink-0 flex-wrap">
                  {previewAsset.url && (
                    <button
                      onClick={() =>
                        handleDownload(previewAsset.url, previewAsset.title)
                      }
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  )}
                  {previewAsset.url && (
                    <button
                      onClick={() => handleCopyUrl(previewAsset)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-300 transition-all"
                    >
                      {copiedId === previewAsset.id ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy URL
                        </>
                      )}
                    </button>
                  )}
                  {previewAsset._origin === "history" &&
                    previewAsset.type !== "project" && (
                      <button
                        onClick={() => handleLoadHistory(previewAsset)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white transition-all"
                      >
                        <Upload className="w-4 h-4" />
                        Load
                      </button>
                    )}
                  {previewAsset._origin === "library" && (
                    <button
                      onClick={() => {
                        removeLibraryAsset(previewAsset.id);
                        setPreviewAsset(null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-sm font-medium text-white transition-all ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>

                {/* Metadata */}
                <div className="px-4 pb-4 shrink-0">
                  <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <div>
                        <span className="text-gray-500">Source</span>
                        <p className="text-gray-200 truncate">
                          {previewAsset.source || "unknown"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Type</span>
                        <p className="text-gray-200">{previewAsset.type}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Created</span>
                        <p className="text-gray-200">
                          {previewAsset.createdAt
                            ? new Date(previewAsset.createdAt).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Updated</span>
                        <p className="text-gray-200">
                          {previewAsset.updatedAt
                            ? new Date(previewAsset.updatedAt).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    {previewAsset.metadata &&
                      Object.keys(previewAsset.metadata).length > 0 && (
                        <div>
                          <button
                            onClick={() => setMetaExpanded((v) => !v)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                          >
                            {metaExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                            Raw metadata
                          </button>
                          <AnimatePresence>
                            {metaExpanded && (
                              <motion.pre
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden mt-2 bg-gray-950 border border-gray-800 rounded-lg p-3 text-[11px] text-gray-400 overflow-auto max-h-48"
                              >
                                {JSON.stringify(previewAsset.metadata, null, 2)}
                              </motion.pre>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
