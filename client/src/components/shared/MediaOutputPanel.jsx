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
  Volume2
} from "lucide-react";
import { Button } from "../ui";
import MediaGalleryGrid from "./MediaGalleryGrid";
import MediaCompareView from "./MediaCompareView";

const MEDIA_CONFIG = {
  image: {
    icon: ImageIcon,
    label: "Image",
    loadingMessage: "Generating image...",
    emptyMessage: "No image generated yet",
    supportsComparison: true,
  },
  video: {
    icon: VideoIcon,
    label: "Video",
    loadingMessage: "Generating video...",
    emptyMessage: "No video generated yet",
    supportsComparison: false,
  },
  music: {
    icon: MusicIcon,
    label: "Music",
    loadingMessage: "Generating music...",
    emptyMessage: "No music generated yet",
    supportsComparison: false,
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
  loading,
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
  const [compareItems, setCompareItems] = useState([]);

  // Get history items as array
  const historyItems = useMemo(() => {
    const ids = getMediaIds?.() || [];
    return ids.map((id) => {
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
        revisedPrompt: result.revisedPrompt,
        metadata: item.metadata,
        duration: result.duration,
      };
    }).filter((item) => item?.url);
  }, [mediaHistory, getMediaIds]);

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
    if (navigator.share && generatedMedia?.url) {
      try {
        await navigator.share({
          title: `Generated ${config.label}`,
          text: generatedMedia.prompt,
          url: generatedMedia.url,
        });
      } catch (err) {
        navigator.clipboard?.writeText(generatedMedia.url);
      }
    } else if (generatedMedia?.url) {
      navigator.clipboard?.writeText(generatedMedia.url);
    }
  };

  // Handle select from history - preview only
  const handleSelectFromHistory = (item) => {
    onPreview?.(item);
    setActiveTab("current");
  };

  // Handle reload prompt - loads prompt and model
  const handleReloadPrompt = (item) => {
    onReloadPrompt?.(item);
    setActiveTab("current");
  };

  // Render media player based on type
  const renderMediaPlayer = (item, showControls = true) => {
    if (mediaType === "image") {
      return (
        <img
          src={item.url}
          alt={item.prompt || "Generated image"}
          className="w-full h-auto max-h-[50vh] object-contain"
        />
      );
    }
    if (mediaType === "video") {
      return (
        <video
          src={item.url}
          controls={showControls}
          className="w-full h-auto max-h-[50vh]"
        >
          Your browser does not support the video tag.
        </video>
      );
    }
    if (mediaType === "music") {
      return (
        <div className="bg-gray-800 rounded-lg p-6 flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4">
            <Volume2 className="w-12 h-12 text-white" />
          </div>
          <audio src={item.url} controls className="w-full max-w-md" />
          {item.prompt && (
            <p className="text-sm text-gray-400 mt-4 text-center">{item.prompt}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`flex flex-col h-full bg-gray-900/50 ${className}`}>
      {/* Tabs Header */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-700">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = tab.id === "history" && historyItems.length > 0 ? historyItems.length : null;
          const compareBadge = tab.id === "compare" && compareItems.length > 0 ? compareItems.length : null;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-purple-600/20 text-purple-300"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {(badge || compareBadge) && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  isActive ? "bg-purple-600/30" : "bg-gray-700"
                }`}>
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
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-purple-600/20 flex items-center justify-center mb-4">
                    <RefreshCw className="w-10 h-10 text-purple-400 animate-spin" />
                  </div>
                  <p className="text-gray-400 font-medium">{config.loadingMessage}</p>
                  <p className="text-xs text-gray-500 mt-1">This may take a moment</p>
                </div>
              ) : generatedMedia ? (
                <div className="space-y-4">
                  {/* Media Display */}
                  <div 
                    className={`relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700 ${
                      mediaType === "image" ? "cursor-pointer group" : ""
                    }`}
                    onClick={() => mediaType === "image" && setZoomedMedia(generatedMedia)}
                  >
                    {renderMediaPlayer(generatedMedia)}
                    {mediaType === "image" && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Maximize2 className="w-8 h-8 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Revised Prompt */}
                  {generatedMedia.revisedPrompt && (
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                      <p className="text-xs text-gray-500 mb-1">Revised prompt:</p>
                      <p className="text-sm text-gray-300">{generatedMedia.revisedPrompt}</p>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-2">
                    {generatedMedia.model && (
                      <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                        {generatedMedia.model}
                      </span>
                    )}
                    {generatedMedia.duration && (
                      <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                        {generatedMedia.duration}s
                      </span>
                    )}
                    {generatedMedia.width && generatedMedia.height && (
                      <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
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
                      leftIcon={copiedPrompt ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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
                  <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
                    <Sparkles className="w-10 h-10 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium">{config.emptyMessage}</p>
                  <p className="text-xs text-gray-500 mt-1">Enter a prompt and click Generate</p>
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
            >
              <MediaGalleryGrid
                mediaType={mediaType}
                items={historyItems}
                onSelect={handleSelectFromHistory}
                onCompare={config.supportsComparison ? handleAddToCompare : undefined}
                onDelete={onDeleteMedia}
                onReload={handleReloadPrompt}
                selectedForCompare={compareItems.map((item) => item.id)}
              />
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
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setZoomedMedia(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.15 }}
              src={zoomedMedia.url}
              alt={zoomedMedia.prompt || "Generated image"}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setZoomedMedia(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
            {zoomedMedia.prompt && (
              <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-gray-900/90 rounded-lg p-3">
                <p className="text-sm text-gray-300">{zoomedMedia.prompt}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
