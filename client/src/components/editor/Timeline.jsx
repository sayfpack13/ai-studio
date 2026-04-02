import { useRef, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import { useApp } from "../../context/AppContext";

function TrackHeader({ track, updateTrack }) {
  const toggle = (field) => updateTrack(track.id, { [field]: !track[field] });

  return (
    <div className="h-14 bg-gradient-to-r from-gray-950/80 to-gray-900/60 border border-gray-700/50 rounded-lg px-3 flex items-center justify-between group hover:border-gray-600/50 transition-colors">
      <div className="flex items-center gap-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            track.type === "video"
              ? "bg-blue-500/20 text-blue-400"
              : "bg-emerald-500/20 text-emerald-400"
          }`}
        >
          {track.type === "video" ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-200">
            {track.type === "video" ? "Video" : "Audio"} Track
          </div>
          <div className="text-[10px] text-gray-500">
            {track.clips.length} clip{track.clips.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          className={`w-7 h-7 rounded text-[10px] font-semibold transition-colors ${
            track.muted
              ? "bg-red-500/40 text-red-200 ring-1 ring-red-500/50"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
          onClick={() => toggle("muted")}
          title="Mute"
        >
          M
        </button>
        <button
          className={`w-7 h-7 rounded text-[10px] font-semibold transition-colors ${
            track.solo
              ? "bg-amber-500/40 text-amber-200 ring-1 ring-amber-500/50"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
          onClick={() => toggle("solo")}
          title="Solo"
        >
          S
        </button>
        <button
          className={`w-7 h-7 rounded text-[10px] font-semibold transition-colors ${
            track.locked
              ? "bg-blue-500/40 text-blue-200 ring-1 ring-blue-500/50"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
          onClick={() => toggle("locked")}
          title="Lock"
        >
          L
        </button>
      </div>
    </div>
  );
}

function TrackRow({
  track,
  onSelectClip,
  selectedClipId,
  updateClip,
  pxPerSecond,
  onTimelineClick,
  libraryAssets,
}) {
  const handleMouseDown = (e, clip, type) => {
    if (track.locked) return;
    e.stopPropagation();
    onSelectClip(clip);

    const startX = e.clientX;
    const initialStart = clip.start || 0;
    const initialDuration = clip.duration || 5;

    const onMouseMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / pxPerSecond; // pxPerSecond = 1s

      if (type === "move") {
        const newStart = Math.max(0, initialStart + dx);
        updateClip(
          clip.id,
          { start: parseFloat(newStart.toFixed(2)) },
          { skipHistory: true },
        );
      } else if (type === "right") {
        const newDuration = Math.max(0.5, initialDuration + dx);
        updateClip(
          clip.id,
          { duration: parseFloat(newDuration.toFixed(2)) },
          { skipHistory: true },
        );
      } else if (type === "left") {
        const possibleNewStart = initialStart + dx;
        const newStart = Math.max(0, possibleNewStart);
        const actualDx = newStart - initialStart;
        const newDuration = Math.max(0.5, initialDuration - actualDx);

        if (initialDuration - actualDx >= 0.5) {
          updateClip(
            clip.id,
            {
              start: parseFloat(newStart.toFixed(2)),
              duration: parseFloat(newDuration.toFixed(2)),
            },
            { skipHistory: true },
          );
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const clipColors = {
    video: {
      bg: "bg-gradient-to-r from-blue-600 to-blue-500",
      hover: "hover:from-blue-500 hover:to-blue-400",
      border: "border-blue-400/30",
      glow: "shadow-blue-500/30",
    },
    audio: {
      bg: "bg-gradient-to-r from-emerald-600 to-emerald-500",
      hover: "hover:from-emerald-500 hover:to-emerald-400",
      border: "border-emerald-400/30",
      glow: "shadow-emerald-500/30",
    },
  };

  const colors = clipColors[track.type] || clipColors.video;

  // Check if clip has valid source
  const hasValidSource = (clip) => {
    if (!clip.sourceUrl) return false;
    if (clip.sourceUrl.startsWith("blob:")) return false;
    try {
      new URL(clip.sourceUrl);
      return true;
    } catch {
      return false;
    }
  };

  // Check if clip asset is missing
  const isAssetMissing = (clip) => {
    if (clip.trackType === "audio") return false; // Audio doesn't need external source
    if (hasValidSource(clip)) return false;
    // If we have an assetRef, check if it exists in the library
    if (clip.assetRef && libraryAssets) {
      const asset = libraryAssets.find((a) => a.id === clip.assetRef);
      if (asset?.url) return false; // Asset exists in library
    }
    return true;
  };

  return (
    <div
      className={`relative h-14 bg-gray-950/40 border border-gray-800/50 rounded-lg overflow-hidden transition-colors ${
        track.locked ? "opacity-50" : ""
      }`}
      onMouseDown={(e) => {
        if (e.target.closest(".clip-item")) return;
        onTimelineClick(e);
      }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-gray-600"
            style={{ left: `${i * 10}%` }}
          />
        ))}
      </div>

      {(track.clips || []).map((clip) => {
        const isSelected = selectedClipId === clip.id;
        return (
          <div
            key={clip.id}
            onMouseDown={(e) => handleMouseDown(e, clip, "move")}
            className={`clip-item absolute top-2 h-10 rounded-md text-xs flex items-center cursor-ew-resize transition-all duration-150 whitespace-nowrap text-white select-none border ${
              isSelected
                ? `ring-2 ring-white z-10 shadow-lg ${colors.glow}`
                : ""
            } ${colors.bg} ${colors.hover} ${colors.border} ${
              track.locked ? "pointer-events-none" : ""
            }`}
            style={{
              left: `${(clip.start || 0) * pxPerSecond}px`,
              width: `${Math.max(50, (clip.duration || 5) * pxPerSecond)}px`,
            }}
          >
            {/* Left resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-white/20 rounded-l-md transition-colors flex items-center justify-center"
              onMouseDown={(e) => handleMouseDown(e, clip, "left")}
            >
              <div className="w-0.5 h-4 bg-white/30 rounded-full" />
            </div>

            {/* Clip content */}
            <div className="flex-1 px-3 overflow-hidden flex items-center gap-2 pointer-events-none">
              {isAssetMissing(clip) ? (
                // Missing asset indicator
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : track.type === "video" ? (
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0 opacity-70"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0 opacity-70"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              )}
              <span
                className={`truncate font-medium ${isAssetMissing(clip) ? "text-red-300" : ""}`}
              >
                {clip.label || "Clip"}
              </span>
              {isAssetMissing(clip) && (
                <span className="text-[9px] text-red-400 bg-red-500/20 px-1 rounded">
                  missing
                </span>
              )}
            </div>

            {/* Right resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize hover:bg-white/20 rounded-r-md transition-colors flex items-center justify-center"
              onMouseDown={(e) => handleMouseDown(e, clip, "right")}
            >
              <div className="w-0.5 h-4 bg-white/30 rounded-full" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrackKeyframesRow({ track, pxPerSecond }) {
  const keyframes = track.keyframes || [];
  return (
    <div className="relative h-6 bg-gray-950/60 border border-gray-800 rounded-lg overflow-hidden">
      {keyframes.map((keyframe, index) => {
        const time = keyframe?.time ?? keyframe?.at ?? keyframe?.t ?? null;
        if (typeof time !== "number") return null;
        return (
          <div
            key={`${track.id}_${index}`}
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
            style={{ left: `${time * pxPerSecond}px` }}
          />
        );
      })}
    </div>
  );
}

export default function Timeline() {
  const {
    tracks,
    playbackState,
    setPlaybackState,
    project,
    selectedClip,
    setSelectedClip,
    updateClip,
    updateTrack,
    addClipToType,
  } = useEditor();
  const { libraryAssets } = useApp();
  const [pxPerSecond, setPxPerSecond] = useState(12);
  const [isDragOver, setIsDragOver] = useState(false);
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const isSyncingRef = useRef(false);

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    // Handle library asset drop
    const assetData = e.dataTransfer.getData("application/json");
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        const type = asset.type === "audio" ? "audio" : "video";
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollLeft = bodyScrollRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + scrollLeft;
        const time = Math.max(0, x / pxPerSecond);

        addClipToType(type, {
          label: asset.title || asset.name || "Imported Media",
          start: Math.floor(time * 10) / 10,
          duration: 5,
          assetRef: asset.id,
          sourceUrl: asset.url,
        });
      } catch (err) {
        console.error("Failed to parse dropped asset:", err);
      }
    }

    // Handle file drop
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      [...files].forEach((file, index) => {
        const isAudio = file.type.startsWith("audio/");
        const isVideo = file.type.startsWith("video/");
        if (!isAudio && !isVideo) return;

        const type = isAudio ? "audio" : "video";
        const url = URL.createObjectURL(file);
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollLeft = bodyScrollRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + scrollLeft;
        const time = Math.max(0, x / pxPerSecond);

        addClipToType(type, {
          label: file.name.replace(/\.[^/.]+$/, ""),
          start: Math.floor((time + index * 5) * 10) / 10,
          duration: 5,
          sourceUrl: url,
          sourceFile: file.name,
        });
      });
    }
  };

  const syncScroll = (source, target) => {
    if (!source.current || !target.current) return;
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    target.current.scrollLeft = source.current.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const clampTime = (value) => Math.max(0, Math.min(value, project.duration));

  const formatTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? seconds : 0;
    const minutes = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const tenths = Math.floor((safe % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0",
    )}.${tenths}`;
  };

  const seekBy = (delta) =>
    setPlaybackState((prev) => ({
      ...prev,
      currentTime: clampTime(prev.currentTime + delta),
    }));

  const handleTimelineClick = (e) => {
    if (e.target.closest(".clip-item")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = bodyScrollRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    const time = clampTime(x / pxPerSecond);
    setPlaybackState((prev) => ({ ...prev, currentTime: time }));
  };

  const tickStep = pxPerSecond >= 24 ? 0.5 : pxPerSecond >= 14 ? 1 : 2;
  const ticks = [];
  for (let t = 0; t <= project.duration + 0.0001; t += tickStep) {
    ticks.push(t);
  }

  const totalClips = tracks.reduce((sum, t) => sum + (t.clips?.length || 0), 0);

  return (
    <div
      className={`bg-gray-900 border rounded-xl p-4 space-y-3 relative overflow-hidden transition-colors ${
        isDragOver ? "border-blue-500 bg-blue-500/5" : "border-gray-800"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 bg-blue-600/90 rounded-xl text-white font-semibold text-sm flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Drop media to add to timeline
          </div>
        </div>
      )}

      {/* Transport controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-20 bg-gradient-to-r from-gray-950/80 to-gray-900/60 border border-gray-700/50 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            onClick={() =>
              setPlaybackState((prev) => ({
                ...prev,
                playing: false,
                currentTime: 0,
              }))
            }
            title="Go to start"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h2v14H6V5zm3.5 7L20 5v14L9.5 12z" />
            </svg>
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            onClick={() => seekBy(-1)}
            title="Step back"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18l-8-6 8-6v12zm1-12l8 6-8 6V6z" />
            </svg>
          </button>
          <button
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() =>
              setPlaybackState((prev) => ({ ...prev, playing: !prev.playing }))
            }
            title={playbackState.playing ? "Pause" : "Play"}
          >
            {playbackState.playing ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            onClick={() => seekBy(1)}
            title="Step forward"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 6v12l8-6-8-6zm-1 0L4 12l8 6V6z" />
            </svg>
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            onClick={() =>
              setPlaybackState((prev) => ({ ...prev, playing: false }))
            }
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-1.5">
            <div className="text-sm font-mono text-white font-medium">
              {formatTime(playbackState.currentTime)}
            </div>
            <div className="text-gray-500">/</div>
            <div className="text-sm font-mono text-gray-400">
              {formatTime(project.duration)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
              Zoom
            </span>
            <button
              className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center justify-center transition-colors"
              onClick={() => setPxPerSecond((prev) => Math.max(6, prev - 2))}
            >
              −
            </button>
            <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${((pxPerSecond - 6) / 24) * 100}%` }}
              />
            </div>
            <button
              className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center justify-center transition-colors"
              onClick={() => setPxPerSecond((prev) => Math.min(30, prev + 2))}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-2">
        <div className="h-8 flex items-center px-3 text-[10px] text-gray-500 uppercase tracking-wider">
          Tracks
        </div>
        <div
          ref={headerScrollRef}
          onScroll={() => syncScroll(headerScrollRef, bodyScrollRef)}
          className="overflow-x-auto"
        >
          <div
            className="h-10 bg-gradient-to-r from-gray-950/80 to-gray-900/60 border border-gray-700/50 rounded-lg relative cursor-pointer select-none"
            style={{
              width: `${project.duration * pxPerSecond}px`,
              minWidth: "100%",
            }}
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const scrollLeft = headerScrollRef.current?.scrollLeft || 0;
              const x = e.clientX - rect.left + scrollLeft;
              const time = clampTime(x / pxPerSecond);
              setPlaybackState((prev) => ({ ...prev, currentTime: time }));

              const handleMouseMove = (moveEvent) => {
                const newX = moveEvent.clientX - rect.left + scrollLeft;
                const newTime = clampTime(newX / pxPerSecond);
                setPlaybackState((prev) => ({ ...prev, currentTime: newTime }));
              };

              const handleMouseUp = () => {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
              };

              window.addEventListener("mousemove", handleMouseMove);
              window.addEventListener("mouseup", handleMouseUp);
            }}
          >
            {ticks.map((t, index) => {
              const isMajor = Math.abs(t % 1) < 0.001;
              return (
                <div
                  key={`${t}-${index}`}
                  className="absolute top-0"
                  style={{ left: `${t * pxPerSecond}px` }}
                >
                  <div
                    className={`w-px ${
                      isMajor ? "h-5 bg-gray-500" : "h-3 bg-gray-700"
                    }`}
                  />
                  {isMajor && (
                    <span className="text-[10px] text-gray-400 mt-0.5 block font-medium">
                      {formatTime(t)}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Playhead on ruler */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
              style={{
                left: `${playbackState.currentTime * pxPerSecond}px`,
              }}
            >
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-lg shadow-red-500/30" />
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {totalClips === 0 && (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800/50 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-300 mb-1">
            No clips in timeline
          </h3>
          <p className="text-xs text-gray-500 max-w-xs">
            Drag and drop media files here, or use the Library to add clips
          </p>
        </div>
      )}

      <div
        className={`grid grid-cols-[220px_1fr] gap-2 max-h-[360px] overflow-y-auto pr-1 ${totalClips === 0 ? "opacity-30 pointer-events-none" : ""}`}
      >
        <div className="space-y-2">
          {tracks.map((track) => (
            <div key={track.id} className="space-y-1">
              <TrackHeader track={track} updateTrack={updateTrack} />
              <div className="h-6 bg-gray-950/30 border border-gray-800/30 rounded-lg px-3 flex items-center text-[10px] text-gray-600 uppercase tracking-wider">
                <svg
                  className="w-3 h-3 mr-1.5 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Keyframes
              </div>
            </div>
          ))}
        </div>

        <div
          ref={bodyScrollRef}
          onScroll={() => syncScroll(bodyScrollRef, headerScrollRef)}
          className="overflow-x-auto"
        >
          <div
            className="relative"
            style={{
              width: `${project.duration * pxPerSecond}px`,
              minWidth: "100%",
            }}
          >
            <div className="space-y-2">
              {tracks.map((track) => (
                <div key={track.id} className="space-y-1">
                  <TrackRow
                    track={track}
                    onSelectClip={setSelectedClip}
                    selectedClipId={selectedClip?.id}
                    updateClip={updateClip}
                    pxPerSecond={pxPerSecond}
                    onTimelineClick={handleTimelineClick}
                    libraryAssets={libraryAssets}
                  />
                  <TrackKeyframesRow track={track} pxPerSecond={pxPerSecond} />
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{
                left: `${playbackState.currentTime * pxPerSecond}px`,
              }}
            >
              {/* Top handle */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full shadow-lg shadow-red-500/30 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              {/* Line */}
              <div className="w-0.5 h-full bg-red-500 shadow-lg shadow-red-500/30" />
              {/* Bottom fade */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500/30 rounded-full blur-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
