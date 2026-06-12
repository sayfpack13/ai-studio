import { useState } from "react";
import { useAudioPlayer } from "../context/AudioPlayerContext";
import { resolveAssetUrl } from "../services/api";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Maximize2,
  Music,
  Wand2,
  AlertCircle,
} from "lucide-react";

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function GlobalAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    isVisible,
    progress,
    duration,
    volume,
    hasNext,
    hasPrev,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    closePlayer,
  } = useAudioPlayer();

  const [showDetails, setShowDetails] = useState(false);

  if (!isVisible || !currentTrack) return null;

  const isRemix = currentTrack.type === "remix";
  const thumb = currentTrack.thumbnail || currentTrack.metadata?.thumbnail || null;
  const title = currentTrack.title || currentTrack.prompt || "Untitled";
  const promptText = currentTrack.prompt || "";

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * (duration || 0));
  };

  const isMuted = volume <= 0.01;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950/95 backdrop-blur-md border-t border-gray-800 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-3">
          {/* Thumbnail / Icon */}
          <div className="flex-shrink-0">
            {thumb ? (
              <img
                src={resolveAssetUrl(thumb)}
                alt=""
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border border-gray-700"
              />
            ) : (
              <div
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center border border-gray-700 ${
                  isRemix
                    ? "bg-gradient-to-br from-purple-600 to-pink-600"
                    : "bg-gradient-to-br from-emerald-600 to-teal-600"
                }`}
              >
                {isRemix ? (
                  <Wand2 className="w-5 h-5 text-white" />
                ) : (
                  <Music className="w-5 h-5 text-white" />
                )}
              </div>
            )}
          </div>

          {/* Title + Prompt */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{title}</p>
            <p className="text-xs text-gray-400 truncate">{promptText || (isRemix ? "Remix" : "Music")}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={prev}
              disabled={!hasPrev}
              className="p-1.5 sm:p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              onClick={toggle}
              className={`p-2 sm:p-2.5 rounded-xl transition-colors ${
                isPlaying
                  ? "bg-white text-gray-950 hover:bg-gray-200"
                  : "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
              }`}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" />
              )}
            </button>

            <button
              onClick={next}
              disabled={!hasNext}
              className="p-1.5 sm:p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-[10px] text-gray-500 w-9 text-right tabular-nums">
              {formatTime(progress)}
            </span>
            <div
              className="flex-1 h-1.5 bg-gray-800 rounded-full cursor-pointer group relative"
              onClick={handleSeek}
              title="Seek"
            >
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full relative"
                style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
              </div>
            </div>
            <span className="text-[10px] text-gray-500 w-9 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>

          {/* Volume */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setVolume(isMuted ? 0.8 : 0)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 accent-purple-500"
            />
          </div>

          {/* Details + Close */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowDetails(true)}
              className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="Details"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={closePlayer}
              className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile progress bar (below main bar) */}
      <div className="fixed bottom-[56px] left-0 right-0 z-50 sm:hidden">
        <div
          className="h-1 bg-gray-800 cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
    </>
  );
}
