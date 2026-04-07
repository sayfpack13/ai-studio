import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Image as ImageIcon, 
  History, 
  GitCompare, 
  Download, 
  Film, 
  Share2, 
  Copy, 
  Check, 
  Maximize2, 
  X, 
  Info,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { Button } from "../ui";
import ImageGalleryGrid from "./ImageGalleryGrid";
import ImageCompareView from "./ImageCompareView";

const TABS = [
  { id: "current", label: "Current", icon: ImageIcon },
  { id: "history", label: "History", icon: History },
  { id: "compare", label: "Compare", icon: GitCompare },
];

export default function ImageOutputPanel({
  generatedImage,
  imageHistory,
  getImageIds,
  onDownload,
  onSendToVideo,
  onReloadPrompt,
  onDeleteImage,
  loading,
  className = "",
}) {
  const [activeTab, setActiveTab] = useState("current");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [compareImages, setCompareImages] = useState([]);

  // Get history images as array
  const historyImages = useMemo(() => {
    const ids = getImageIds?.() || [];
    return ids.map((id) => ({
      id: id,
      ...imageHistory[id],
    })).filter((img) => img?.url);
  }, [imageHistory, getImageIds]);

  // Handle add to compare
  const handleAddToCompare = (image) => {
    setCompareImages((prev) => {
      if (prev.find((img) => img.id === image.id)) {
        return prev.filter((img) => img.id !== image.id);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, image];
    });
  };

  // Handle remove from compare
  const handleRemoveFromCompare = (imageId) => {
    setCompareImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  // Handle clear compare
  const handleClearCompare = () => {
    setCompareImages([]);
  };

  // Handle copy prompt
  const handleCopyPrompt = () => {
    if (generatedImage?.prompt) {
      navigator.clipboard?.writeText(generatedImage.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  // Handle share
  const handleShare = async () => {
    if (navigator.share && generatedImage?.url) {
      try {
        await navigator.share({
          title: "Generated Image",
          text: generatedImage.prompt,
          url: generatedImage.url,
        });
      } catch (err) {
        // Fallback to copy URL
        navigator.clipboard?.writeText(generatedImage.url);
      }
    } else if (generatedImage?.url) {
      navigator.clipboard?.writeText(generatedImage.url);
    }
  };

  // Handle select from history
  const handleSelectFromHistory = (image) => {
    onReloadPrompt?.(image);
    setActiveTab("current");
  };

  return (
    <div className={`flex flex-col h-full bg-gray-900/50 ${className}`}>
      {/* Tabs Header */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-700">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = tab.id === "history" && historyImages.length > 0 ? historyImages.length : null;
          const compareBadge = tab.id === "compare" && compareImages.length > 0 ? compareImages.length : null;

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
              className="h-full flex flex-col"
            >
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-purple-600/20 flex items-center justify-center mb-4">
                    <RefreshCw className="w-10 h-10 text-purple-400 animate-spin" />
                  </div>
                  <p className="text-gray-400 font-medium">Generating image...</p>
                  <p className="text-xs text-gray-500 mt-1">This may take a moment</p>
                </div>
              ) : generatedImage ? (
                <div className="space-y-4">
                  {/* Image Display */}
                  <div 
                    className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700 cursor-pointer group"
                    onClick={() => setZoomedImage(generatedImage)}
                  >
                    <img
                      src={generatedImage.url}
                      alt="Generated"
                      className="w-full h-auto max-h-[50vh] object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Maximize2 className="w-8 h-8 text-white" />
                    </div>
                  </div>

                  {/* Revised Prompt */}
                  {generatedImage.revisedPrompt && (
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                      <p className="text-xs text-gray-500 mb-1">Revised prompt:</p>
                      <p className="text-sm text-gray-300">{generatedImage.revisedPrompt}</p>
                    </div>
                  )}

                  {/* Metadata */}
                  {generatedImage.model && (
                    <div className="flex flex-wrap gap-2">
                      {generatedImage.model && (
                        <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                          {generatedImage.model}
                        </span>
                      )}
                      {generatedImage.width && generatedImage.height && (
                        <span className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                          {generatedImage.width}×{generatedImage.height}
                        </span>
                      )}
                    </div>
                  )}

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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onSendToVideo}
                      leftIcon={<Film className="w-4 h-4" />}
                    >
                      Send to Video
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddToCompare(generatedImage)}
                      leftIcon={<GitCompare className="w-4 h-4" />}
                    >
                      Compare
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
                    <Sparkles className="w-10 h-10 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium">No image generated yet</p>
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
            >
              <ImageGalleryGrid
                images={historyImages}
                onSelect={handleSelectFromHistory}
                onCompare={handleAddToCompare}
                onDelete={onDeleteImage}
                onReload={handleSelectFromHistory}
                selectedForCompare={compareImages.map((img) => img.id)}
              />
            </motion.div>
          )}

          {/* Compare Tab */}
          {activeTab === "compare" && (
            <motion.div
              key="compare"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ImageCompareView
                images={compareImages}
                onRemove={handleRemoveFromCompare}
                onClear={handleClearCompare}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setZoomedImage(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={zoomedImage.url}
              alt={zoomedImage.prompt || "Generated image"}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
            {zoomedImage.prompt && (
              <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-gray-900/90 rounded-lg p-3">
                <p className="text-sm text-gray-300">{zoomedImage.prompt}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
