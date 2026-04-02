import { useRef, useState } from "react";
import { useEditor } from "../../context/EditorContext";

function TrackHeader({ track, updateTrack }) {
  const toggle = (field) => updateTrack(track.id, { [field]: !track[field] });

  return (
    <div className="h-12 bg-gray-950/60 border border-gray-800 rounded-lg px-3 flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold text-gray-200">
          {track.type.toUpperCase()}
        </div>
        <div className="text-[10px] text-gray-500">
          {track.clips.length} clips
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          className={`w-7 h-7 rounded text-[10px] font-semibold ${
            track.muted
              ? "bg-red-600/30 text-red-200"
              : "bg-gray-800 text-gray-400"
          }`}
          onClick={() => toggle("muted")}
          title="Mute"
        >
          M
        </button>
        <button
          className={`w-7 h-7 rounded text-[10px] font-semibold ${
            track.solo
              ? "bg-amber-500/30 text-amber-200"
              : "bg-gray-800 text-gray-400"
          }`}
          onClick={() => toggle("solo")}
          title="Solo"
        >
          S
        </button>
        <button
          className={`w-7 h-7 rounded text-[10px] font-semibold ${
            track.locked
              ? "bg-blue-500/30 text-blue-200"
              : "bg-gray-800 text-gray-400"
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

  return (
    <div
      className="relative h-12 bg-gray-950/60 border border-gray-800 rounded-lg overflow-hidden"
      onMouseDown={(e) => {
        if (e.target.closest(".clip-item")) return;
        onTimelineClick(e);
      }}
    >
      {(track.clips || []).map((clip) => {
        const isSelected = selectedClipId === clip.id;
        return (
          <div
            key={clip.id}
            onMouseDown={(e) => handleMouseDown(e, clip, "move")}
            className={`clip-item absolute top-2 h-8 rounded text-xs flex items-center cursor-ew-resize transition-colors whitespace-nowrap text-white select-none ${
              isSelected ? "ring-2 ring-white z-10" : ""
            } ${
              track.type === "video"
                ? "bg-blue-600 hover:bg-blue-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            } ${track.locked ? "opacity-60 pointer-events-none" : ""}`}
            style={{
              left: `${(clip.start || 0) * pxPerSecond}px`,
              width: `${Math.max(40, (clip.duration || 5) * pxPerSecond)}px`,
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30"
              onMouseDown={(e) => handleMouseDown(e, clip, "left")}
            />
            <div className="px-2 overflow-hidden truncate pointer-events-none">
              {clip.label || "Clip"}
            </div>
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30"
              onMouseDown={(e) => handleMouseDown(e, clip, "right")}
            />
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
  } = useEditor();
  const [pxPerSecond, setPxPerSecond] = useState(12);
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const isSyncingRef = useRef(false);

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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-20 bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2">
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
          <div className="text-xs font-mono text-gray-300">
            {formatTime(playbackState.currentTime)} /{" "}
            {formatTime(project.duration)}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              Zoom
            </span>
            <button
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
              onClick={() => setPxPerSecond((prev) => Math.max(6, prev - 2))}
            >
              -
            </button>
            <input
              type="range"
              min="6"
              max="30"
              step="1"
              value={pxPerSecond}
              onChange={(e) => setPxPerSecond(Number(e.target.value))}
              className="w-28"
            />
            <button
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
              onClick={() => setPxPerSecond((prev) => Math.min(30, prev + 2))}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 w-10">Scrub</label>
        <input
          type="range"
          min="0"
          max={project.duration}
          step="0.1"
          value={playbackState.currentTime}
          onChange={(e) =>
            setPlaybackState((prev) => ({
              ...prev,
              currentTime: clampTime(Number(e.target.value)),
            }))
          }
          className="flex-1"
        />
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
            className="h-8 bg-gray-950/60 border border-gray-800 rounded-lg relative"
            style={{
              width: `${project.duration * pxPerSecond}px`,
              minWidth: "100%",
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
                      isMajor ? "h-4 bg-gray-500" : "h-2 bg-gray-700"
                    }`}
                  />
                  {isMajor && (
                    <span className="text-[10px] text-gray-500 mt-0.5 block">
                      {formatTime(t)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-2 max-h-[360px] overflow-y-auto pr-1">
        <div className="space-y-2">
          {tracks.map((track) => (
            <div key={track.id} className="space-y-1">
              <TrackHeader track={track} updateTrack={updateTrack} />
              <div className="h-6 bg-gray-950/40 border border-gray-800 rounded-lg px-3 flex items-center text-[10px] text-gray-500 uppercase tracking-wider">
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
                  />
                  <TrackKeyframesRow track={track} pxPerSecond={pxPerSecond} />
                </div>
              ))}
            </div>

            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none"
              style={{
                left: `${playbackState.currentTime * pxPerSecond}px`,
                boxShadow: "0 0 4px rgba(239, 68, 68, 0.5)",
              }}
            >
              <div className="w-3 h-3 bg-red-500 transform -translate-x-1/2 -translate-y-1 rotate-45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
