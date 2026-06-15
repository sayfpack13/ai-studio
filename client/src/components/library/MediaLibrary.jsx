import { useEffect, useMemo, useState } from "react";
import { Mp3Encoder } from "lamejs";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars -- motion is used as motion.div/motion.pre
import {
  Library,
  Search,
  Filter,
  Upload,
  RefreshCw,
  FolderOpen,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  Heart,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { resolveAssetUrl, uploadLibraryFile } from "../../services/api";
import MediaPreviewDialog from "../shared/MediaPreviewDialog";
import MediaCard from "../shared/MediaCard";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { useFavorites } from "../../context/FavoritesContext";

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
  const urls = item?.urls || item?.result?.urls || [];

  return {
    id: `hist_${type}_${id}`,
    title: String(titleBase).slice(0, 120),
    type,
    source,
    url,
    urls,
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
  const isRemix = asset.source === "remix";
  return {
    ...asset,
    type: isRemix ? "remix" : asset.type,
    thumbnail: asset.thumbnail || asset.metadata?.thumbnail || null,
    createdAt: asset.createdAt || asset.updatedAt || fallbackTime,
    updatedAt: asset.updatedAt || asset.createdAt || fallbackTime,
    _origin: "library",
    _originId: asset.metadata?.remixHistoryId || asset.id,
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

async function handleDownload(url, title, type, metadata = {}, format = "original") {
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

  const getExtensionFromType = (assetType, meta, selectedFormat) => {
    if (selectedFormat === "mp3") return ".mp3";
    if (selectedFormat === "wav") return ".wav";
    
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
  const extFromUrl = format === "mp3" ? ".mp3" : format === "wav" ? ".wav" : getExtensionFromUrl(resolved);
  const ext = extFromUrl || getExtensionFromType(type, metadata, format);
  const filename =
    ext && !baseName.toLowerCase().endsWith(ext.toLowerCase())
      ? `${baseName}${ext}`
      : baseName;

  // Handle MP3 conversion for audio files
  if ((type === "audio" || type === "remix") && format === "mp3") {
    try {
      const response = await fetch(resolved);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to MP3 using lamejs
      const mp3encoder = new Mp3Encoder(audioBuffer.numberOfChannels, audioBuffer.sampleRate, 128);
      const mp3Data = [];
      
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
      
      const sampleBlockSize = 1152;
      for (let i = 0; i < leftChannel.length; i += sampleBlockSize) {
        const leftChunk = leftChannel.subarray(i, i + sampleBlockSize);
        const rightChunk = rightChannel.subarray(i, i + sampleBlockSize);
        const leftInt16 = new Int16Array(leftChunk.map(x => x < 0 ? x * 32768 : x * 32767));
        const rightInt16 = new Int16Array(rightChunk.map(x => x < 0 ? x * 32768 : x * 32767));
        const mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }
      
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
      
      const blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename || "download.mp3";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      return;
    } catch (err) {
      console.error("MP3 conversion failed:", err);
      // Fallback to original download
    }
  }

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
  
  const [downloadFormat, setDownloadFormat] = useState("original");
  const [showDownloadMenu, setShowDownloadMenu] = useState(null);

  const { requestPlayTrack } = useAudioPlayer();
  const { isFavorite } = useFavorites();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

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
        normalizeHistoryItem(remixHistory?.[id], id, "remix", "remix-history"),
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

    // Group assets, handling multi-URL remixes specially
    const groupedAssets = new Map();

    // Helper to get group key for an asset
    const getGroupKey = (asset) => {
      const remixHistoryId = asset.metadata?.remixHistoryId;
      const hasMultipleUrls = asset.urls && asset.urls.length > 1;
      // Group by remix history ID, or by ID if has multiple URLs
      if (remixHistoryId) return `remix:${remixHistoryId}`;
      if (hasMultipleUrls) return `id:${asset.id}`;
      return null; // Not grouped, dedupe by URL individually
    };

    // Process API assets first (they have preference)
    for (const asset of apiAssets) {
      const groupKey = getGroupKey(asset);
      if (groupKey) {
        // This is a grouped asset (remix)
        if (!groupedAssets.has(groupKey)) {
          groupedAssets.set(groupKey, { ...asset, urls: [asset.url] });
        } else {
          // Merge URL into existing group
          const existing = groupedAssets.get(groupKey);
          if (!existing.urls.includes(asset.url)) {
            existing.urls.push(asset.url);
          }
        }
      } else {
        // Regular asset - dedupe by URL
        const normalizedUrl = normalizeUrl(asset.url);
        const dedupeKey = normalizedUrl ? `url:${normalizedUrl}` : `id:${asset.id}`;
        if (!groupedAssets.has(dedupeKey)) {
          groupedAssets.set(dedupeKey, asset);
        }
      }
    }

    // Process history assets
    for (const asset of historyAssets) {
      const groupKey = getGroupKey(asset);
      if (groupKey) {
        // Check if already have this group from API assets
        if (groupedAssets.has(groupKey)) {
          // Merge URLs from history into existing group
          const existing = groupedAssets.get(groupKey);
          for (const url of asset.urls || [asset.url]) {
            if (!existing.urls.includes(url)) {
              existing.urls.push(url);
            }
          }
        } else {
          groupedAssets.set(groupKey, asset);
        }
      } else {
        // Regular asset - dedupe by URL
        const normalizedUrl = normalizeUrl(asset.url);
        const dedupeKey = normalizedUrl ? `url:${normalizedUrl}` : `id:${asset.id}`;
        if (!groupedAssets.has(dedupeKey)) {
          groupedAssets.set(dedupeKey, asset);
        }
      }
    }

    const all = Array.from(groupedAssets.values());

    const query = (libraryFilters?.query || "").trim().toLowerCase();
    const type = (libraryFilters?.type || "").trim().toLowerCase();
    const favoritesOnly = libraryFilters?.favoritesOnly || false;

    const filtered = all.filter((asset) => {
      const typeOk = !type || (asset.type || "").toLowerCase() === type;
      if (!typeOk) return false;

      if (favoritesOnly) {
        const favOk = isFavorite(asset.type, asset._originId || asset.id);
        if (!favOk) return false;
      }

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
    if (asset.source === "remix-history" || asset.metadata?.source === "remix") {
      window.dispatchEvent(
        new CustomEvent("remixHistorySelected", { detail: { remixId: originId } }),
      );
      navigate("/remix");
      return;
    }
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
            onClick={() =>
              setLibraryFilters((prev) => ({
                ...prev,
                favoritesOnly: !prev.favoritesOnly,
              }))
            }
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 shrink-0 ${
              libraryFilters.favoritesOnly
                ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
            }`}
          >
            <Heart
              className={`w-4 h-4 ${
                libraryFilters.favoritesOnly ? "fill-rose-400 text-rose-400" : ""
              }`}
            />
            {libraryFilters.favoritesOnly ? "Favorites" : "All"}
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
              <MediaCard
                key={asset.id}
                item={asset}
                mediaType={asset.type}
                aspectRatio="aspect-square"
                onSelect={(item) => {
                  setPreviewAsset(item);
                  if (
                    (item.type === "audio" || item.type === "remix") &&
                    item.url
                  ) {
                    requestPlayTrack(
                      item,
                      mergedAssets.filter((a) => a.type === item.type),
                    );
                  }
                }}
                onPreview={(item) => setPreviewAsset(item)}
                onDownload={(item, format) =>
                  handleDownload(item.url, item.title, item.type, item.metadata, format)
                }
                onDelete={
                  asset._origin === "library"
                    ? (id) => removeLibraryAsset(id)
                    : undefined
                }
                onLoadHistory={
                  asset._origin === "history" && asset.type !== "project"
                    ? handleLoadHistory
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {/* ── Preview Dialog ── */}
        <MediaPreviewDialog
          open={Boolean(previewAsset)}
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          onDownload={(asset, format) =>
            handleDownload(asset.url, asset.title, asset.type, asset.metadata, format)
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
