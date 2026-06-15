import { useMemo, useState } from "react";
import { Mp3Encoder } from "lamejs";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars
import { Image, Video, Volume2, Music } from "lucide-react";
import { resolveAssetUrl } from "../../services/api";
import MediaCard from "./MediaCard";
import ConfirmDialog from "../ui/ConfirmDialog";

const TYPE_ICON = {
  image: Image,
  video: Video,
  music: Volume2,
  audio: Volume2,
  remix: Music,
};

export default function MediaGalleryGrid({
  mediaType = "image",
  items,
  onSelect,
  onCompare,
  onDelete,
  onReload,
  onView,
  selectedForCompare = [],
  className = "",
}) {
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleBroken = (id) => {
    let shouldRemove = false;
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      shouldRemove = true;
      return next;
    });
    if (shouldRemove && typeof onDelete === "function") {
      onDelete(id);
    }
  };

  const visibleItems = useMemo(() => {
    return (items || []).filter((item) => item && !brokenIds.has(item.id));
  }, [items, brokenIds]);

  const isInCompare = (itemId) => selectedForCompare.includes(itemId);

  const handleDownload = async (item, format = "original") => {
    const resolved = resolveAssetUrl(item.url);
    const sanitize = (value) =>
      String(value || "generated")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim() || "generated";
    const ext =
      mediaType === "image" ? ".png" : mediaType === "video" ? ".mp4" : ".mp3";
    const baseName = sanitize(item.prompt || item.title || `generated-${item.id}`);
    const filename = baseName.toLowerCase().endsWith(ext)
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
          link.download = filename.replace('.mp3', '.wav');
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

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    onDelete?.(deleteConfirm);
    setDeleteConfirm(null);
  };

  const TypeIcon = TYPE_ICON[mediaType] || Image;

  return (
    <>
      <div
        className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}
      >
        <AnimatePresence mode="popLayout">
          {visibleItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              mediaType={mediaType}
              onSelect={onSelect}
              onCompare={onCompare}
              onDelete={(id) => setDeleteConfirm(id)}
              onReload={onReload}
              onDownload={handleDownload}
              isComparing={isInCompare(item.id)}
              aspectRatio="aspect-[4/5]"
            />
          ))}
        </AnimatePresence>

        {visibleItems.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3">
              <TypeIcon className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium text-gray-400">
              No {mediaType}s generated yet
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Your generated {mediaType}s will appear here
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title={`Delete ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}`}
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
}

