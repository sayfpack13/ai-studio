import { useMemo, useState } from "react";
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

  const handleDownload = async (item) => {
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

