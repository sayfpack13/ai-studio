import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Copy, Check, ArrowRightLeft } from "lucide-react";
import { Button } from "../ui";

export default function ImageCompareView({
  images = [],
  onRemove,
  onClear,
  maxImages = 4,
  className = "",
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);

  const handleCopyPrompt = (e, image) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(image.prompt || "");
    setCopiedId(image.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (e, image) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = image.url;
    link.download = `generated-${image.id}.png`;
    link.click();
  };

  // Get unique parameter keys across all images
  const getParameterKeys = () => {
    const keys = new Set();
    images.forEach((img) => {
      if (img.metadata?.params) {
        Object.keys(img.metadata.params).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  };

  const paramKeys = getParameterKeys();

  if (images.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 text-gray-400 ${className}`}>
        <ArrowRightLeft className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">Select images from history to compare</p>
        <p className="text-xs text-gray-500 mt-1">Click the compare icon on images to add them</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">
          Comparing {images.length} image{images.length !== 1 ? "s" : ""}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear All
        </Button>
      </div>

      {/* Image Grid */}
      <div className={`grid gap-4 ${images.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
        {images.map((image, index) => (
          <motion.div
            key={image.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700"
          >
            {/* Remove Button */}
            <button
              onClick={() => onRemove?.(image.id)}
              className="absolute top-2 right-2 p-1 rounded-lg bg-gray-900/80 text-gray-400 hover:text-white hover:bg-red-600 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image */}
            <div
              className="aspect-square cursor-pointer"
              onClick={() => setZoomedImage(image)}
            >
              <img
                src={image.url}
                alt={image.prompt?.slice(0, 30) || "Generated image"}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Info */}
            <div className="p-3 space-y-2">
              {/* Prompt */}
              <p className="text-xs text-gray-300 line-clamp-3">
                {image.prompt?.slice(0, 100) || "No prompt"}
              </p>

              {/* Model */}
              {image.model && (
                <p className="text-xs text-gray-500">
                  Model: <span className="text-gray-400">{image.model}</span>
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={(e) => handleCopyPrompt(e, image)}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-xs transition-colors"
                >
                  {copiedId === image.id ? (
                    <>
                      <Check className="w-3 h-3" /> Done
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => handleDownload(e, image)}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-xs transition-colors"
                >
                  <Download className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Parameter Comparison Table */}
      {images.length >= 2 && paramKeys.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <div className="p-3 border-b border-gray-700">
            <h4 className="text-sm font-medium text-gray-300">Parameter Comparison</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-2 text-gray-400 font-medium">Parameter</th>
                  {images.map((img, i) => (
                    <th key={img.id} className="text-center p-2 text-gray-400 font-medium">
                      Image {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paramKeys.map((key) => (
                  <tr key={key} className="border-b border-gray-700/50">
                    <td className="p-2 text-gray-300">{key}</td>
                    {images.map((img) => (
                      <td key={img.id} className="text-center p-2 text-gray-400">
                        {img.metadata?.params?.[key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              alt={zoomedImage.prompt}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
