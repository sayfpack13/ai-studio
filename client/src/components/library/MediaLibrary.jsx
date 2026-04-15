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
import MediaPreviewDialog from "../shared/MediaPreviewDialog";

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

async function handleDownload(url, title, type, metadata = {}) {
  const resolved = resolveAssetUrl(url);
  const sanitize = (value) => {
    const cleaned = String(value || "download")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .trim();
    return cleaned || "download";
  };

  const getExtensionFromUrl = (resolvedUrl) => {
    try {
      const parsed = new URL(resolvedUrl, window.location.origin);
      const pathname = parsed.pathname || "";
      const dot = pathname.lastIndexOf(".");
      if (dot !== -1 && pathname.length - dot <= 6) {
        return pathname.slice(dot);
      }
    } catch {
      const dot = String(resolvedUrl || "").lastIndexOf(".");
      if (dot !== -1 && String(resolvedUrl || "").length - dot <= 6) {
        return String(resolvedUrl || "").slice(dot);
      }
    }
    return "";
  };

  const getFilenameFromUrl = (resolvedUrl) => {
    try {
      const parsed = new URL(resolvedUrl, window.location.origin);
      const parts = (parsed.pathname || "").split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : "";
    } catch {
      const parts = String(resolvedUrl || "")
        .split("/")
        .filter(Boolean);
      return parts.length ? parts[parts.length - 1] : "";
    }
  };

  const stripExtension = (name) => {
    const idx = name.lastIndexOf(".");
    return idx > 0 ? name.slice(0, idx) : name;
  };

  const getExtensionFromType = (assetType, meta) => {
    const mime = String(meta?.mimeType || meta?.mimetype || "").toLowerCase();
    const mimeMap = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
      "audio/mpeg": ".mp3",
      "audio/mp3": ".mp3",
      "audio/wav": ".wav",
      "audio/ogg": ".ogg",
      "audio/webm": ".weba",
    };
    if (mimeMap[mime]) return mimeMap[mime];
    if (assetType === "image") return ".png";
    if (assetType === "video") return ".mp4";
    if (assetType === "audio") return ".mp3";
    if (assetType === "project") return ".json";
    return "";
  };

  const urlFilename = getFilenameFromUrl(resolved);
  const urlBase = stripExtension(urlFilename);
  const promptBase =
    metadata?.prompt || metadata?.revised_prompt || metadata?.title || "";
  const isGenericTitle =
    /^asset_\d+_/i.test(String(title || "")) ||
    /^uploaded-\d+/i.test(String(title || ""));

  const chosenBase =
    promptBase?.trim() ||
    (!title || isGenericTitle ? urlBase : title) ||
    urlBase ||
    "download";

  const baseName = sanitize(chosenBase);
  const extFromUrl = getExtensionFromUrl(resolved);
  const ext = extFromUrl || getExtensionFromType(type, metadata);
  const filename =
    ext && !baseName.toLowerCase().endsWith(ext.toLowerCase())
      ? `${baseName}${ext}`
      : baseName;

  try {
    const response = await fetch(resolved);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch {
    const link = document.createElement("a");
    link.href = resolved;
    link.download = filename || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
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

  const [imgErrors, setImgErrors] = useState({});
  const [imgVideoErrors, setImgVideoErrors] = useState({});

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
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
        type: inferTypeFromFile(uploadFile),
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
              <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/20">
                <Library className="w-6 h-6 text-purple-400" />
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
              className="w-full bg-gray-800/70 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
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
              className="appearance-none bg-gray-800/70 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all cursor-pointer"
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
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white transition-all duration-150 shrink-0"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 border border-dashed border-gray-600 hover:border-purple-500/50 cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition-all">
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
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                  />
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
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAsset(asset);
                      }}
                      className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 hover:border-purple-500 hover:bg-purple-600/20 text-gray-300 hover:text-purple-300 transition-all"
                      title="Preview"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    {asset.url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(
                            asset.url,
                            asset.title,
                            asset.type,
                            asset.metadata,
                          );
                        }}
                        className="p-2 rounded-lg bg-gray-900/80 border border-gray-700 hover:border-purple-500 hover:bg-purple-600/20 text-gray-300 hover:text-purple-300 transition-all"
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
                    {asset._origin === "history" &&
                      asset.type !== "project" && (
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
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Preview Dialog ── */}
        <MediaPreviewDialog
          open={Boolean(previewAsset)}
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          onDownload={(asset) =>
            handleDownload(asset.url, asset.title, asset.type, asset.metadata)
          }
          onDelete={(asset) => {
            removeLibraryAsset(asset.id);
            setPreviewAsset(null);
          }}
          onLoad={(asset) => handleLoadHistory(asset)}
          showLoad={
            previewAsset?._origin === "history" &&
            previewAsset?.type !== "project"
          }
          showDelete={previewAsset?._origin === "library"}
          showDownload={Boolean(previewAsset?.url)}
        />
      </div>
    </div>
  );
}
