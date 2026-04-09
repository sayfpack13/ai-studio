import { useState, useMemo, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import { stitchVideos } from "../services/api";
import { Modal, Button } from "./ui";
import { LoadingSpinner } from "./shared";
import {
  Film,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  Scissors,
  Download,
  Check,
  Play,
} from "lucide-react";

function normalizeAsset(item, id, type, source) {
  if (!item) return null;
  const title =
    item.title || item.prompt || item.name || `Video ${id}`;
  const url =
    item?.url ||
    item?.result?.url ||
    item?.result?.video ||
    "";
  return {
    id: `hist_${type}_${id}`,
    title: String(title).slice(0, 120),
    url,
    source,
    createdAt: item?.createdAt || item?.lastUpdated || 0,
  };
}

function normalizeLibrary(asset) {
  if (!asset) return null;
  return {
    id: asset.id,
    title: asset.title || "Video",
    url: asset.url || "",
    source: asset.source || "library",
    createdAt: asset.createdAt || asset.updatedAt || 0,
  };
}

export default function StitchDialog({ open, onClose, onStitchComplete }) {
  const {
    libraryAssets,
    videoHistory,
    getVideoIds,
    refreshLibraryAssets,
  } = useApp();

  const [selectedClips, setSelectedClips] = useState([]);
  const [stitching, setStitching] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewVideo, setPreviewVideo] = useState(null);
  const previewRef = useRef(null);

  const availableVideos = useMemo(() => {
    const fromLibrary = (libraryAssets || [])
      .filter((a) => a.type === "video" && a.url)
      .map(normalizeLibrary)
      .filter(Boolean);

    const fromHistory = (getVideoIds?.() || [])
      .map((id) => normalizeAsset(videoHistory?.[id], id, "video", "video-history"))
      .filter(Boolean)
      .filter((h) => h.url);

    const byUrl = new Map();
    for (const a of fromLibrary) {
      const key = a.url.replace(/\/+$/, "").toLowerCase();
      if (!byUrl.has(key)) byUrl.set(key, a);
    }
    for (const a of fromHistory) {
      const key = a.url.replace(/\/+$/, "").toLowerCase();
      if (!byUrl.has(key)) byUrl.set(key, a);
    }

    return Array.from(byUrl.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );
  }, [libraryAssets, videoHistory, getVideoIds]);

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return availableVideos;
    const q = searchQuery.toLowerCase();
    return availableVideos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.source.toLowerCase().includes(q),
    );
  }, [availableVideos, searchQuery]);

  const selectedUrls = useMemo(
    () => new Set(selectedClips.map((c) => c.url)),
    [selectedClips],
  );

  const addClip = useCallback(
    (video) => {
      if (selectedUrls.has(video.url)) return;
      setSelectedClips((prev) => [...prev, video]);
    },
    [selectedUrls],
  );

  const removeClip = useCallback((index) => {
    setSelectedClips((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveClip = useCallback((index, direction) => {
    setSelectedClips((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleStitch = async () => {
    if (selectedClips.length < 2) return;
    setStitching(true);
    setError("");
    setResult(null);
    try {
      const urls = selectedClips.map((c) => c.url);
      const res = await stitchVideos(urls);
      if (res?.success && res.data?.url) {
        setResult(res.data);
        refreshLibraryAssets?.({ type: "video" });
        onStitchComplete?.(res.data);
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (err) {
      setError(err.message || "Stitching failed");
    } finally {
      setStitching(false);
    }
  };

  const handleClose = () => {
    if (!stitching) {
      setSelectedClips([]);
      setError("");
      setResult(null);
      setSearchQuery("");
      setPreviewVideo(null);
      onClose();
    }
  };

  const handleDownload = () => {
    if (!result?.url) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = "stitched-video.mp4";
    a.click();
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Stitch Video Clips"
      description={
        result
          ? "Your stitched video is ready"
          : "Select videos in order to combine them into one"
      }
      size="xl"
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleDownload}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Download
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={stitching}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleStitch}
              disabled={selectedClips.length < 2 || stitching}
              leftIcon={
                stitching ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Scissors className="w-4 h-4" />
                )
              }
            >
              {stitching
                ? "Stitching..."
                : `Stitch ${selectedClips.length} Clip${selectedClips.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4" />
            Successfully stitched {result.clipCount} clips
          </div>
          <video
            src={result.url}
            controls
            autoPlay
            className="w-full max-h-[50vh] rounded-lg bg-black"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Preview Player */}
          {previewVideo && (
            <div className="bg-black rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80">
                <p className="text-xs text-gray-300 truncate">
                  {previewVideo.title}
                </p>
                <button
                  onClick={() => setPreviewVideo(null)}
                  className="p-0.5 text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <video
                ref={previewRef}
                key={previewVideo.url}
                src={previewVideo.url}
                controls
                autoPlay
                className="w-full max-h-[200px] bg-black"
              />
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4 min-h-[350px]">
            {/* Left — Available Videos */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">
                  Available Videos
                </h3>
                <span className="text-xs text-gray-500">
                  {filteredVideos.length} video
                  {filteredVideos.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="relative mb-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full bg-gray-800 text-white pl-3 pr-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 max-h-[300px] pr-1">
                {filteredVideos.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-8">
                    No videos in library
                  </p>
                ) : (
                  filteredVideos.map((video) => {
                    const isSelected = selectedUrls.has(video.url);
                    const isPreviewing = previewVideo?.url === video.url;
                    return (
                      <div
                        key={video.id}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                          isPreviewing
                            ? "bg-indigo-900/40 ring-1 ring-indigo-500/50"
                            : isSelected
                              ? "bg-gray-800/50 opacity-50"
                              : "bg-gray-800 hover:bg-gray-700"
                        }`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewVideo(isPreviewing ? null : video);
                          }}
                          className="relative w-16 h-10 flex-shrink-0 bg-gray-900 rounded overflow-hidden group/thumb"
                          title="Preview video"
                        >
                          <video
                            src={video.url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                          <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${isPreviewing ? "opacity-100" : "opacity-0 group-hover/thumb:opacity-100"}`}>
                            <Play className={`w-4 h-4 ${isPreviewing ? "text-indigo-400" : "text-white"}`} />
                          </div>
                        </button>
                        <button
                          onClick={() => addClip(video)}
                          disabled={isSelected}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm text-white truncate">
                            {video.title}
                          </p>
                          <p className="text-[10px] text-gray-500">{video.source}</p>
                        </button>
                        <button
                          onClick={() => addClip(video)}
                          disabled={isSelected}
                          className="flex-shrink-0"
                          title={isSelected ? "Already added" : "Add to clip order"}
                        >
                          {isSelected ? (
                            <Check className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Plus className="w-4 h-4 text-gray-500 hover:text-white" />
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right — Selected Clips (ordered) */}
            <div className="lg:w-[280px] flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">
                  Clip Order
                </h3>
                {selectedClips.length > 0 && (
                  <button
                    onClick={() => setSelectedClips([])}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {selectedClips.length === 0 ? (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-700 rounded-lg">
                  <div className="text-center p-4">
                    <Film className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Select at least 2 videos
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Click videos on the left to add them
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1 max-h-[300px]">
                  {selectedClips.map((clip, index) => {
                    const isPreviewing = previewVideo?.url === clip.url;
                    return (
                      <div
                        key={`${clip.id}-${index}`}
                        className={`flex items-center gap-2 p-2 rounded-lg group ${
                          isPreviewing
                            ? "bg-indigo-900/40 ring-1 ring-indigo-500/50"
                            : "bg-gray-800"
                        }`}
                      >
                        <span className="text-xs text-gray-500 w-5 text-center font-mono">
                          {index + 1}
                        </span>
                        <button
                          onClick={() => setPreviewVideo(isPreviewing ? null : clip)}
                          className="relative w-12 h-8 flex-shrink-0 bg-gray-900 rounded overflow-hidden group/thumb"
                          title="Preview video"
                        >
                          <video
                            src={clip.url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                          <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${isPreviewing ? "opacity-100" : "opacity-0 group-hover/thumb:opacity-100"}`}>
                            <Play className={`w-3 h-3 ${isPreviewing ? "text-indigo-400" : "text-white"}`} />
                          </div>
                        </button>
                        <p className="flex-1 text-xs text-white truncate min-w-0">
                          {clip.title}
                        </p>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => moveClip(index, -1)}
                            disabled={index === 0}
                            className="p-0.5 text-gray-400 hover:text-white disabled:opacity-30"
                            title="Move up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveClip(index, 1)}
                            disabled={index === selectedClips.length - 1}
                            className="p-0.5 text-gray-400 hover:text-white disabled:opacity-30"
                            title="Move down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => removeClip(index)}
                            className="p-0.5 text-red-400 hover:text-red-300"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && (
                <div className="mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
