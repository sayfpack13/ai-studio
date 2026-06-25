import { useState, useMemo, useEffect } from "react";
import { Mp3Encoder } from "lamejs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  History,
  GitCompare,
  Download,
  Film,
  Share2,
  Copy,
  Check,
  Maximize2,
  X,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  Volume2,
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
  Heart,
  ChevronDown,
} from "lucide-react";
import { Button } from "../ui";
import { resolveAssetUrl } from "../../services/api";
import { useFavorites } from "../../context/FavoritesContext";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import MediaGalleryGrid from "./MediaGalleryGrid";
import MediaCompareView from "./MediaCompareView";
import MediaPreviewDialog from "./MediaPreviewDialog";

const MEDIA_CONFIG = {
  image: {
    icon: ImageIcon,
    label: "Image",
    loadingMessage: "Generating image...",
    emptyMessage: "No image generated yet",
    supportsComparison: true,
    accent: "violet",
    activeTab: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    progressBg: "bg-violet-500",
    loadingBg: "bg-violet-600/10 border-purple-500/30",
    loadingText: "text-violet-300",
  },
  video: {
    icon: VideoIcon,
    label: "Video",
    loadingMessage: "Generating video...",
    emptyMessage: "No video generated yet",
    supportsComparison: false,
    accent: "rose",
    activeTab: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    progressBg: "bg-rose-500",
    loadingBg: "bg-rose-600/10 border-rose-500/30",
    loadingText: "text-rose-300",
  },
  music: {
    icon: MusicIcon,
    label: "Music",
    loadingMessage: "Generating music...",
    emptyMessage: "No music generated yet",
    supportsComparison: false,
    accent: "emerald",
    activeTab: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    progressBg: "bg-emerald-500",
    loadingBg: "bg-emerald-600/10 border-emerald-500/30",
    loadingText: "text-emerald-300",
  },
  remix: {
    icon: MusicIcon,
    label: "Remix",
    loadingMessage: "Generating remix...",
    emptyMessage: "No remix generated yet",
    supportsComparison: false,
    accent: "purple",
    activeTab: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    progressBg: "bg-purple-500",
    loadingBg: "bg-purple-600/10 border-purple-500/30",
    loadingText: "text-purple-300",
  },
};

export default function MediaOutputPanel({
  mediaType = "image",
  generatedMedia,
  mediaHistory,
  getMediaIds,
  onDownload,
  onSendToVideo,
  onReloadPrompt,
  onPreview,
  onDeleteMedia,
  onClearHistory,
  loading,
  error,
  progress,
  loadingMessage: loadingMessageOverride,
  onClearError,
  downloadFormat,
  setDownloadFormat,
  isConverting,
  downloadName,
  className = "",
}) {
  const config = MEDIA_CONFIG[mediaType];
  const MediaIcon = config.icon;
  const { isFavorite, toggleFavorite } = useFavorites();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: "current", label: "Current", icon: MediaIcon },
      { id: "history", label: "History", icon: History },
    ];
    if (config.supportsComparison) {
      baseTabs.push({ id: "compare", label: "Compare", icon: GitCompare });
    }
    return baseTabs;
  }, [config.supportsComparison, MediaIcon]);

  const [activeTab, setActiveTab] = useState("current");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [zoomedMedia, setZoomedMedia] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [compareItems, setCompareItems] = useState([]);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const { requestPlayTrack, playTrack } = useAudioPlayer();

  useEffect(() => {
    if (loading) {
      setActiveTab("current");
    }
  }, [loading]);

  // Get history items as array
  const historyItems = useMemo(() => {
    const ids = getMediaIds?.() || [];
    const items = [];
    
    for (const id of ids) {
      const item = mediaHistory[id];
      if (!item) continue;
      // Handle result object structure (image/video/music history stores url in result)
      const result = item.result || {};
      const baseEntry = {
        id: id,
        type: mediaType,
        source: "history",
        prompt: item.prompt,
        model: item.model,
        lastUpdated: item.lastUpdated,
        updatedAt: item.lastUpdated,
        url: result.url,
        urls: result.urls,
        title: result.title || null,
        tags: result.tags || null,
        lyrics: result.lyrics || null,
        thumbnail: result.thumbnail || null,
        revisedPrompt: result.revisedPrompt,
        metadata: item.metadata,
        mode: result.mode || item.metadata?.mode || null,
        duration: result.duration || item.metadata?.duration || null,
        seed: result.seed ?? item.metadata?.seed ?? null,
        coverStrength: result.coverStrength ?? item.metadata?.coverStrength ?? null,
        refAudioStrength: result.refAudioStrength ?? item.metadata?.refAudioStrength ?? null,
        bpm: result.bpm ?? item.metadata?.bpm ?? null,
        keyScale: result.keyScale ?? item.metadata?.keyScale ?? null,
        timeSignature: result.timeSignature ?? item.metadata?.timeSignature ?? null,
        negativeStyles: result.negativeStyles ?? item.metadata?.negativeStyles ?? null,
        thinking: result.thinking ?? item.metadata?.thinking ?? null,
        inferStep: result.inferStep ?? item.metadata?.inferStep ?? null,
        guidanceScale: result.guidanceScale ?? item.metadata?.guidanceScale ?? null,
      };
      
      items.push(baseEntry);
    }
    
    return items.filter((item) => item?.url && !String(item.url).startsWith("data:"));
  }, [mediaHistory, getMediaIds, mediaType]);

  const displayedHistoryItems = useMemo(() => {
    if (!showFavoritesOnly) return historyItems;
    return historyItems.filter((item) => isFavorite(mediaType, item.id));
  }, [historyItems, showFavoritesOnly, isFavorite, mediaType]);

  const historyCount = displayedHistoryItems.length;

  // Handle add to compare
  const handleAddToCompare = (item) => {
    setCompareItems((prev) => {
      if (prev.find((i) => i.id === item.id)) {
        return prev.filter((i) => i.id !== item.id);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, item];
    });
  };

  // Handle remove from compare
  const handleRemoveFromCompare = (itemId) => {
    setCompareItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Handle clear compare
  const handleClearCompare = () => {
    setCompareItems([]);
  };

  // Handle copy prompt
  const handleCopyPrompt = () => {
    if (generatedMedia?.prompt) {
      navigator.clipboard?.writeText(generatedMedia.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  // Handle share
  const handleShare = async () => {
    const shareUrl = resolveAssetUrl(generatedMedia?.url);
    if (navigator.share && shareUrl) {
      try {
        await navigator.share({
          title: `Generated ${config.label}`,
          text: generatedMedia.prompt,
          url: shareUrl,
        });
      } catch (err) {
        navigator.clipboard?.writeText(shareUrl);
      }
    } else if (shareUrl) {
      navigator.clipboard?.writeText(shareUrl);
    }
  };

  const handlePreviewDownload = async (asset, format = "original") => {
    if (!asset?.url) return;
    const resolved = resolveAssetUrl(asset.url);
    const sanitize = (value) =>
      String(value || "generated")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim() || "generated";
    const getExtensionFromUrl = (url) => {
      try {
        const parsed = new URL(url, window.location.origin);
        const pathname = parsed.pathname || "";
        const dot = pathname.lastIndexOf(".");
        if (dot !== -1 && pathname.length - dot <= 6) {
          return pathname.slice(dot);
        }
      } catch {
        const dot = String(url || "").lastIndexOf(".");
        if (dot !== -1 && String(url || "").length - dot <= 6) {
          return String(url || "").slice(dot);
        }
      }
      return "";
    };

    const extFromUrl = getExtensionFromUrl(resolved);
    const ext = format === "mp3"
      ? ".mp3"
      : extFromUrl || (mediaType === "image" ? ".png" : mediaType === "video" ? ".mp4" : ".mp3");
    const baseName = sanitize(
      downloadName || asset.prompt || `generated-${asset.id || "media"}`,
    );
    const filename = baseName.toLowerCase().endsWith(ext.toLowerCase())
      ? baseName
      : `${baseName}${ext}`;

    const isAudioType = mediaType === "music" || mediaType === "audio" || mediaType === "remix";
    if (isAudioType && format === "mp3") {
      try {
        const response = await fetch(resolved);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

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
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        console.error("MP3 conversion failed:", err);
        // Try direct fetch download as fallback
        try {
          const response = await fetch(resolved);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = filename;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
        } catch {
          window.open(resolved, "_blank");
        }
      }
      return;
    }

    // Always fetch as blob to handle cross-origin downloads properly
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
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Download failed:", err);
      // Last resort: try opening in new tab
      window.open(resolved, "_blank");
    }
  };

  // Handle select from history - preview and auto-play audio
  const handleSelectFromHistory = (item) => {
    setPreviewMedia(item);
    if ((mediaType === "music" || mediaType === "remix") && item.url) {
      requestPlayTrack({ ...item, type: mediaType }, displayedHistoryItems);
    }
  };

  // Handle reload prompt - loads prompt and model
  const handleReloadPrompt = (item) => {
    onReloadPrompt?.(item);
    setActiveTab("current");
  };

  // Render media player based on type
  const renderMediaPlayer = (item, showControls = true) => {
    const url = resolveAssetUrl(item.url);

    if (mediaType === "image") {
      return (
        <img
          src={url}
          alt={item.prompt || "Generated image"}
          className="w-full h-auto max-h-[50vh] object-contain rounded-lg"
        />
      );
    }
    if (mediaType === "video") {
      return (
        <video
          key={url}
          src={url}
          controls={showControls}
          className="w-full h-auto max-h-[50vh] rounded-lg"
        >
          Your browser does not support the video tag.
        </video>
      );
    }
    if (mediaType === "music" || mediaType === "remix") {
      // Video-to-audio mode produces a video file (mp4), not just audio
      const isVideoAudio = mediaType === "music" && item.mode === "video_to_audio";
      if (isVideoAudio) {
        return (
          <div className="flex flex-col items-center gap-3">
            <video
              key={url}
              src={url}
              controls={showControls}
              className="w-full h-auto max-h-[50vh] rounded-lg"
            >
              Your browser does not support the video tag.
            </video>
            {item.prompt && (
              <p className="text-sm text-gray-400 text-center max-w-md">
                {item.prompt}
              </p>
            )}
          </div>
        );
      }
      const playerGradient =
        mediaType === "remix"
          ? "from-purple-950/40 via-gray-900 to-gray-950"
          : config.loadingBg === "bg-emerald-600/10 border-emerald-500/30"
            ? "from-emerald-950/40 via-gray-900 to-gray-950"
            : config.loadingBg === "bg-rose-600/10 border-rose-500/30"
              ? "from-rose-950/40 via-gray-900 to-gray-950"
              : "from-violet-950/40 via-gray-900 to-gray-950";
      return (
        <div
          className={`bg-gradient-to-br ${playerGradient} rounded-xl p-6 flex flex-col items-center border border-gray-800`}
        >
          {item.thumbnail && (
            <img
              src={resolveAssetUrl(item.thumbnail)}
              alt={item.title || "Remix thumbnail"}
              className="w-24 h-24 rounded-xl object-cover border border-gray-700 mb-4"
            />
          )}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
            {mediaType === "remix" ? (
              <MusicIcon className="w-10 h-10 text-white" />
            ) : (
              <Volume2 className="w-10 h-10 text-white" />
            )}
          </div>
          {/* Variant buttons for multi-URL remixes */}
          {item.urls && item.urls.length > 1 ? (
            <div className="w-full space-y-2 mt-2">
              {item.urls.map((variantUrl, idx) => {
                const label = String.fromCharCode(65 + idx);
                const variantItem = { ...item, url: variantUrl, id: `${item.id}_${idx}`, type: mediaType };
                return (
                  <button
                    key={idx}
                    onClick={() => playTrack(variantItem)}
                    className="w-full flex items-center gap-3 bg-gray-900/50 hover:bg-gray-800/50 rounded-lg p-3 border border-gray-800 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-full bg-purple-600/80 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                      {label}
                    </span>
                    <div className="flex-1 text-left">
                      <span className="text-sm text-white font-medium block">Variant {label}</span>
                      <span className="text-xs text-gray-500">
                        {idx === 0 ? "Primary version" : "Alternative version"}
                      </span>
                    </div>
                    <Play className="w-5 h-5 text-purple-400" />
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              onClick={() => playTrack({ ...item, type: mediaType })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-gray-950 font-medium hover:bg-gray-200 transition-colors"
            >
              <Play className="w-5 h-5" />
              Play
            </button>
          )}
          {(item.title || item.prompt) && (
            <p className="text-sm text-gray-300 mt-4 text-center max-w-md font-medium">
              {item.title || item.prompt}
            </p>
          )}
          {item.prompt && item.title && (
            <p className="text-xs text-gray-500 mt-1 text-center max-w-md">
              {item.prompt}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`flex flex-col h-full bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Tabs Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-800 bg-gray-900/80">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge =
            tab.id === "history" && historyCount > 0 ? historyCount : null;
          const compareBadge =
            tab.id === "compare" && compareItems.length > 0
              ? compareItems.length
              : null;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border ${
                isActive
                  ? config.activeTab
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {(badge || compareBadge) && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {badge || compareBadge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {/* Current Tab */}
          {activeTab === "current" && (
            <motion.div
              key="current"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full flex flex-col"
            >
              {/* Show loading indicator at top if generating, but don't block content */}
              {loading && (
                <div
                  className={`mb-3 p-3 ${config.loadingBg} rounded-xl flex items-center gap-3`}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${config.loadingText} animate-spin flex-shrink-0`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${config.loadingText} font-medium`}>
                      {loadingMessageOverride || config.loadingMessage}
                    </p>
                    {progress !== null && progress !== undefined && (
                      <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${config.progressBg} transition-all duration-300`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                  </div>
                  <p className="text-red-400 font-semibold text-center px-4 text-lg">
                    Generation Failed
                  </p>
                  <div className="mt-3 p-4 bg-red-950/30 border border-red-700/40 rounded-xl max-w-md mx-4">
                    <p className="text-sm text-red-300 break-words">{error}</p>
                  </div>
                  {onClearError && (
                    <button
                      onClick={onClearError}
                      className="mt-5 px-5 py-2.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              ) : generatedMedia ? (
                <div className="space-y-4">
                  {/* Media Display */}
                  <div
                    className={`relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 ${
                      mediaType === "image" ? "cursor-pointer group" : ""
                    }`}
                    onClick={() =>
                      mediaType === "image" && setZoomedMedia(generatedMedia)
                    }
                  >
                    {renderMediaPlayer(generatedMedia)}
                    {mediaType === "image" && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
                          <Maximize2 className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Revised Prompt */}
                  {generatedMedia.revisedPrompt && (
                    <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                        Revised prompt
                      </p>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {generatedMedia.revisedPrompt}
                      </p>
                    </div>
                  )}

                  {mediaType === "remix" &&
                    (generatedMedia.tags || generatedMedia.lyrics) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generatedMedia.tags && (
                          <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                              Generated tags
                            </p>
                            <p className="text-sm text-purple-300">
                              {generatedMedia.tags}
                            </p>
                          </div>
                        )}
                        {generatedMedia.lyrics && (
                          <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800 max-h-40 overflow-y-auto">
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                              Generated lyrics
                            </p>
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                              {generatedMedia.lyrics}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-1.5">
                    {generatedMedia.model && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${config.activeTab}`}
                      >
                        {generatedMedia.model}
                      </span>
                    )}
                    {generatedMedia.duration && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        <Clock className="w-3 h-3" />
                        {generatedMedia.duration}s
                      </span>
                    )}
                    {generatedMedia.seed != null && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        seed {generatedMedia.seed}
                      </span>
                    )}
                    {generatedMedia.bpm != null && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        {generatedMedia.bpm} bpm
                      </span>
                    )}
                    {generatedMedia.keyScale && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        key {generatedMedia.keyScale}
                      </span>
                    )}
                    {generatedMedia.timeSignature != null && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        {generatedMedia.timeSignature}/4
                      </span>
                    )}
                    {generatedMedia.inferStep != null && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        {generatedMedia.inferStep} steps
                      </span>
                    )}
                    {generatedMedia.guidanceScale != null && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        CFG {generatedMedia.guidanceScale}
                      </span>
                    )}
                    {generatedMedia.coverStrength != null && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        cover {generatedMedia.coverStrength}
                      </span>
                    )}
                    {generatedMedia.width && generatedMedia.height && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        {generatedMedia.width}×{generatedMedia.height}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {mediaType === "remix" ? (
                      <div className="relative">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                          disabled={isConverting}
                          leftIcon={isConverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          rightIcon={<ChevronDown className="w-4 h-4" />}
                        >
                          {isConverting ? "Converting..." : "Download"}
                        </Button>
                        {showDownloadMenu && (
                          <div className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-[150px]">
                            <button
                              onClick={() => {
                                setDownloadFormat?.("wav");
                                setShowDownloadMenu(false);
                                onDownload();
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 rounded-t-lg"
                            >
                              WAV
                            </button>
                            <button
                              onClick={() => {
                                setDownloadFormat?.("mp3");
                                setShowDownloadMenu(false);
                                onDownload();
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 rounded-b-lg"
                            >
                              MP3
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={onDownload}
                        leftIcon={<Download className="w-4 h-4" />}
                      >
                        Download
                      </Button>
                    )}
                    <Button
                      variant={isFavorite(mediaType, generatedMedia._originId || generatedMedia.id) ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => toggleFavorite(mediaType, generatedMedia._originId || generatedMedia.id)}
                      leftIcon={
                        <Heart
                          className={`w-4 h-4 ${isFavorite(mediaType, generatedMedia._originId || generatedMedia.id) ? "fill-rose-400 text-rose-400" : ""}`}
                        />
                      }
                    >
                      {isFavorite(mediaType, generatedMedia._originId || generatedMedia.id) ? "Favorited" : "Favorite"}
                    </Button>
                    {(mediaType === "image" || mediaType === "remix") &&
                      onSendToVideo && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onSendToVideo}
                        leftIcon={<Film className="w-4 h-4" />}
                      >
                        Send to Video
                      </Button>
                    )}
                    {mediaType !== "remix" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyPrompt}
                        leftIcon={
                          copiedPrompt ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )
                        }
                      >
                        {copiedPrompt ? "Copied" : "Copy Prompt"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleShare}
                      leftIcon={<Share2 className="w-4 h-4" />}
                    >
                      Share
                    </Button>
                    {config.supportsComparison && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddToCompare(generatedMedia)}
                        leftIcon={<GitCompare className="w-4 h-4" />}
                      >
                        Compare
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <div className="w-20 h-20 rounded-2xl bg-gray-800/60 border border-gray-700/50 flex items-center justify-center mb-4">
                    <Sparkles className="w-10 h-10 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-300">
                    {config.emptyMessage}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a prompt and click Generate
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* History Tab */}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col h-full"
            >
              <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900/70">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <History className="w-4 h-4" />
                  <span>
                    {historyCount} {historyCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFavoritesOnly((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      showFavoritesOnly
                        ? "bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25"
                        : "text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-rose-400" : ""}`} />
                    {showFavoritesOnly ? "Favorites" : "All"}
                  </button>
                  {onClearHistory && (
                    <button
                      onClick={onClearHistory}
                      className="inline-flex items-center gap-1.5 text-xs text-red-300 px-2.5 py-1 rounded-lg border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <MediaGalleryGrid
                  mediaType={mediaType}
                  items={displayedHistoryItems}
                  onSelect={handleSelectFromHistory}
                  onView={(item) => setPreviewMedia(item)}
                  onCompare={
                    config.supportsComparison ? handleAddToCompare : undefined
                  }
                  onDelete={onDeleteMedia}
                  onReload={handleReloadPrompt}
                  selectedForCompare={compareItems.map((item) => item.id)}
                />
              </div>
            </motion.div>
          )}

          {/* Compare Tab */}
          {activeTab === "compare" && config.supportsComparison && (
            <motion.div
              key="compare"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <MediaCompareView
                items={compareItems}
                onRemove={handleRemoveFromCompare}
                onClear={handleClearCompare}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Zoom Modal (images only) */}
      <AnimatePresence>
        {zoomedMedia && mediaType === "image" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setZoomedMedia(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.15 }}
              src={resolveAssetUrl(zoomedMedia.url)}
              alt={zoomedMedia.prompt || "Generated image"}
              className="max-w-full max-h-full object-contain rounded-2xl border border-gray-800"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setZoomedMedia(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-gray-900/80 border border-gray-700 text-white hover:border-gray-600 hover:bg-gray-800 flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </button>
            {zoomedMedia.prompt && (
              <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-gray-900/90 border border-gray-800 rounded-xl p-3">
                <p className="text-sm text-gray-300">{zoomedMedia.prompt}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <MediaPreviewDialog
        open={Boolean(previewMedia)}
        asset={
          previewMedia
            ? {
                ...previewMedia,
                type:
                  previewMedia.mode === "video_to_audio"
                    ? "video"
                    : mediaType === "music"
                      ? "audio"
                      : mediaType,
                title: previewMedia.prompt || `Generated ${config.label}`,
              }
            : null
        }
        onClose={() => setPreviewMedia(null)}
        onDownload={handlePreviewDownload}
        showLoad={false}
        showDelete={false}
        showDownload={Boolean(previewMedia?.url)}
      />
    </div>
  );
}
