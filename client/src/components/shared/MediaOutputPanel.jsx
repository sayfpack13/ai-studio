import { useState, useMemo } from "react";
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
  AlertCircle,
  Clock,
  Trash2,
} from "lucide-react";
import { Button } from "../ui";
import { resolveAssetUrl } from "../../services/api";
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
  onClearError,
  className = "",
}) {
  const config = MEDIA_CONFIG[mediaType];
  const MediaIcon = config.icon;

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

  // Get history items as array
  const historyItems = useMemo(() => {
    const ids = getMediaIds?.() || [];
    return ids
      .map((id) => {
        const item = mediaHistory[id];
        if (!item) return null;
        // Handle result object structure (image/video/music history stores url in result)
        const result = item.result || {};
        return {
          id: id,
          prompt: item.prompt,
          model: item.model,
          lastUpdated: item.lastUpdated,
          url: result.url,
          thumbnail: result.thumbnail || null,
          revisedPrompt: result.revisedPrompt,
          metadata: item.metadata,
          duration: result.duration,
        };
      })
      .filter((item) => item?.url);
  }, [mediaHistory, getMediaIds]);

  const historyCount = historyItems.length;

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

  const handlePreviewDownload = async (asset) => {
    if (!asset?.url) return;
    const resolved = resolveAssetUrl(asset.url);
    const sanitize = (value) =>
      String(value || "generated")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim() || "generated";
    const ext =
      mediaType === "image" ? ".png" : mediaType === "video" ? ".mp4" : ".mp3";
    const baseName = sanitize(
      asset.prompt || `generated-${asset.id || "media"}`,
    );
    const filename = baseName.toLowerCase().endsWith(ext)
      ? baseName
      : `${baseName}${ext}`;

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
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = resolved;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Handle select from history - preview only
  const handleSelectFromHistory = (item) => {
    setPreviewMedia(item);
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
    if (mediaType === "music") {
      return (
        <div
          className={`bg-gradient-to-br ${config.loadingBg === "bg-emerald-600/10 border-emerald-500/30" ? "from-emerald-950/40 via-gray-900 to-gray-950" : config.loadingBg === "bg-rose-600/10 border-rose-500/30" ? "from-rose-950/40 via-gray-900 to-gray-950" : "from-violet-950/40 via-gray-900 to-gray-950"} rounded-xl p-6 flex flex-col items-center border border-gray-800`}
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
            <Volume2 className="w-10 h-10 text-white" />
          </div>
          <audio key={url} src={url} controls className="w-full max-w-md" />
          {item.prompt && (
            <p className="text-sm text-gray-400 mt-4 text-center max-w-md">
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
      className={`flex flex-col h-full bg-gray-950/60 border border-gray-800 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Tabs Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-800 bg-gray-950/80">
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
                      {config.loadingMessage}
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
                    {generatedMedia.width && generatedMedia.height && (
                      <span className="px-2 py-1 rounded-md text-xs bg-gray-800 text-gray-400">
                        {generatedMedia.width}×{generatedMedia.height}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={onDownload}
                      leftIcon={<Download className="w-4 h-4" />}
                    >
                      Download
                    </Button>
                    {mediaType === "image" && onSendToVideo && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onSendToVideo}
                        leftIcon={<Film className="w-4 h-4" />}
                      >
                        Send to Video
                      </Button>
                    )}
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
              <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-950/70">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <History className="w-4 h-4" />
                  <span>
                    {historyCount} {historyCount === 1 ? "item" : "items"}
                  </span>
                </div>
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
              <div className="flex-1 overflow-y-auto">
                <MediaGalleryGrid
                  mediaType={mediaType}
                  items={historyItems}
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
              <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-gray-950/90 border border-gray-800 rounded-xl p-3">
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
                type: mediaType,
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
