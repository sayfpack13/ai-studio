import { useState, useRef, useEffect, useCallback } from "react";
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
    toggle,
    seek,
    setVolume,
    closePlayer,
  } = useAudioPlayer();

  const [showDetails, setShowDetails] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(null);
  const barRef = useRef(null);
  const mobileBarRef = useRef(null);

  const seekFromPoint = useCallback((clientX, ref) => {
    const bar = ref?.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * (duration || 0);
  }, [duration]);

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragProgress(seekFromPoint(e.clientX, barRef));
  }, [seekFromPoint]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setDragProgress(seekFromPoint(e.clientX, barRef));
  }, [isDragging, seekFromPoint]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragProgress !== null) {
      seek(dragProgress);
    }
    setIsDragging(false);
    setDragProgress(null);
  }, [isDragging, dragProgress, seek]);

  const handleTouchStart = useCallback((e) => {
    setIsDragging(true);
    setDragProgress(seekFromPoint(e.touches[0].clientX, mobileBarRef));
  }, [seekFromPoint]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    setDragProgress(seekFromPoint(e.touches[0].clientX, mobileBarRef));
  }, [isDragging, seekFromPoint]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging && dragProgress !== null) {
      seek(dragProgress);
    }
    setIsDragging(false);
    setDragProgress(null);
  }, [isDragging, dragProgress, seek]);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isVisible || !currentTrack) return null;

  const isRemix = currentTrack.type === "remix";
  const thumb = currentTrack.thumbnail || currentTrack.metadata?.thumbnail || null;
  const title = currentTrack.title || currentTrack.prompt || "Untitled";
  const promptText = currentTrack.prompt || "";

  const isMuted = volume <= 0.01;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-md border-t border-gray-800 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
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
                <Music className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => seek(Math.max(0, (progress || 0) - 10))}
              className="p-1.5 sm:p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              title="Back 10s"
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
              onClick={() => seek(Math.min(duration || 0, (progress || 0) + 10))}
              className="p-1.5 sm:p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              title="Forward 10s"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-2xl select-none">
            <span className="text-xs text-white w-10 text-right tabular-nums">
              {formatTime(isDragging ? dragProgress : progress)}
            </span>
            <div
              ref={barRef}
              className="flex-1 h-2 bg-gray-800 rounded-full cursor-pointer group relative"
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              title="Seek"
            >
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full relative"
                style={{ width: `${duration ? ((isDragging ? dragProgress : progress) / duration) * 100 : 0}%` }}
              >
                <div
                  className={`absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full transition-opacity shadow ${
                    isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                />
              </div>
            </div>
            <span className="text-xs text-white w-10 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>

          {/* Title + Prompt */}
          <div className="max-w-[160px] sm:max-w-[220px] min-w-0">
            <p className="text-sm font-medium text-white truncate">{title}</p>
            <p className="text-xs text-white/80 truncate">{promptText || (isRemix ? "Remix" : "Music")}</p>
          </div>

          {/* Right-side group: Volume + Details + Close */}
          <div className="ml-auto flex items-center gap-3">
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
      </div>

      {/* Mobile progress bar (below main bar) */}
      <div className="fixed bottom-[56px] left-0 right-0 z-50 sm:hidden">
        <div
          ref={mobileBarRef}
          className="h-1 bg-gray-800 cursor-pointer"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
            style={{ width: `${duration ? ((isDragging ? dragProgress : progress) / duration) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Details Panel */}
      {showDetails && (
        <div className="fixed bottom-[60px] left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-md border-t border-gray-800 shadow-2xl">
          <div className="px-4 py-4 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Track Details</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Close details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-gray-800/50 rounded-lg p-2.5">
                <p className="text-white/60 uppercase tracking-wider mb-1">Title</p>
                <p className="text-white truncate">{title}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2.5">
                <p className="text-white/60 uppercase tracking-wider mb-1">Type</p>
                <p className="text-white capitalize">{isRemix ? "Remix" : "Music"}</p>
              </div>
              {currentTrack.model && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-white/60 uppercase tracking-wider mb-1">Model</p>
                  <p className="text-white truncate">{currentTrack.model}</p>
                </div>
              )}
              {currentTrack.duration != null && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-white/60 uppercase tracking-wider mb-1">Duration</p>
                  <p className="text-white">{formatTime(currentTrack.duration)}</p>
                </div>
              )}
              {currentTrack.bpm != null && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-white/60 uppercase tracking-wider mb-1">BPM</p>
                  <p className="text-white">{currentTrack.bpm}</p>
                </div>
              )}
              {currentTrack.seed != null && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-white/60 uppercase tracking-wider mb-1">Seed</p>
                  <p className="text-white">{currentTrack.seed}</p>
                </div>
              )}
              {currentTrack.keyScale && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-white/60 uppercase tracking-wider mb-1">Key</p>
                  <p className="text-white">{currentTrack.keyScale}</p>
                </div>
              )}
              {currentTrack.coverStrength != null && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-white/60 uppercase tracking-wider mb-1">Cover Strength</p>
                  <p className="text-white">{currentTrack.coverStrength}</p>
                </div>
              )}
            </div>
            {promptText && (
              <div className="mt-3 bg-gray-800/50 rounded-lg p-2.5">
                <p className="text-white/60 uppercase tracking-wider mb-1">Prompt</p>
                <p className="text-white text-xs leading-relaxed">{promptText}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
