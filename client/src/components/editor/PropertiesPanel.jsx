import { useState } from "react";
import { useEditor } from "../../context/EditorContext";

const RESOLUTION_PRESETS = [
  { label: "4K (2160p)", value: "3840x2160", width: 3840, height: 2160 },
  { label: "2K (1440p)", value: "2560x1440", width: 2560, height: 1440 },
  { label: "Full HD (1080p)", value: "1920x1080", width: 1920, height: 1080 },
  { label: "HD (720p)", value: "1280x720", width: 1280, height: 720 },
  { label: "SD (480p)", value: "854x480", width: 854, height: 480 },
  {
    label: "Square (1080x1080)",
    value: "1080x1080",
    width: 1080,
    height: 1080,
  },
  {
    label: "Vertical (1080x1920)",
    value: "1080x1920",
    width: 1080,
    height: 1920,
  },
  { label: "Custom", value: "custom", width: null, height: null },
];

const FPS_PRESETS = [
  { label: "24 fps (Cinema)", value: 24 },
  { label: "25 fps (PAL)", value: 25 },
  { label: "30 fps (Standard)", value: 30 },
  { label: "50 fps (PAL Smooth)", value: 50 },
  { label: "60 fps (Smooth)", value: 60 },
];

const DURATION_PRESETS = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
];

function ProjectSettings() {
  const { project, setProject } = useEditor();
  const [showCustomResolution, setShowCustomResolution] = useState(false);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);

  const currentPreset = RESOLUTION_PRESETS.find(
    (p) => p.value === project.resolution,
  );
  const isCustomResolution = !currentPreset || currentPreset.value === "custom";

  const handleResolutionChange = (value) => {
    if (value === "custom") {
      setShowCustomResolution(true);
      setProject((prev) => ({
        ...prev,
        resolution: `${customWidth}x${customHeight}`,
      }));
    } else {
      setShowCustomResolution(false);
      setProject((prev) => ({ ...prev, resolution: value }));
    }
  };

  const handleCustomResolutionUpdate = (w, h) => {
    setCustomWidth(w);
    setCustomHeight(h);
    setProject((prev) => ({
      ...prev,
      resolution: `${w}x${h}`,
    }));
  };

  const handleDurationPreset = (value) => {
    setProject((prev) => ({ ...prev, duration: value }));
  };

  const parseResolution = (res) => {
    const parts = res.split("x");
    return {
      width: parts[0] ? parseInt(parts[0], 10) : 1920,
      height: parts[1] ? parseInt(parts[1], 10) : 1080,
    };
  };

  const { width, height } = parseResolution(project.resolution);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/40">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <svg
            className="w-4 h-4 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Project Settings
        </h3>
      </div>

      <div className="p-4 space-y-5">
        {/* Project Name */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            Project Name
          </label>
          <input
            value={project.name}
            onChange={(e) =>
              setProject((prev) => ({ ...prev, name: e.target.value }))
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
            placeholder="My Awesome Video"
          />
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
            Resolution
          </label>
          <select
            value={isCustomResolution ? "custom" : project.resolution}
            onChange={(e) => handleResolutionChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors cursor-pointer"
          >
            {RESOLUTION_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>

          {isCustomResolution && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">
                  Width
                </label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) =>
                    handleCustomResolutionUpdate(
                      parseInt(e.target.value, 10) || 1920,
                      height,
                    )
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 transition-colors"
                  min="1"
                  max="7680"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">
                  Height
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) =>
                    handleCustomResolutionUpdate(
                      width,
                      parseInt(e.target.value, 10) || 1080,
                    )
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 transition-colors"
                  min="1"
                  max="4320"
                />
              </div>
            </div>
          )}

          {/* Resolution Preview */}
          <div className="flex items-center justify-center p-3 bg-gray-800/50 rounded-lg">
            <div
              className="border-2 border-blue-500/50 rounded bg-blue-500/10 flex items-center justify-center"
              style={{
                width: Math.min(120, (width / height) * 60),
                height: Math.min(60, (height / width) * 120),
                minWidth: 40,
                minHeight: 30,
              }}
            >
              <span className="text-[10px] text-gray-400">
                {width}x{height}
              </span>
            </div>
          </div>
        </div>

        {/* Frame Rate */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Frame Rate
          </label>
          <select
            value={project.fps}
            onChange={(e) =>
              setProject((prev) => ({
                ...prev,
                fps: parseInt(e.target.value, 10) || 30,
              }))
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors cursor-pointer"
          >
            {FPS_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {FPS_PRESETS.slice(0, 4).map((preset) => (
              <button
                key={preset.value}
                onClick={() =>
                  setProject((prev) => ({ ...prev, fps: preset.value }))
                }
                className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  project.fps === preset.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {preset.value}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Duration
            </span>
            <span className="text-[10px] text-blue-400 font-mono">
              {Math.floor(project.duration / 60)}:
              {String(project.duration % 60).padStart(2, "0")}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="5"
              max="600"
              step="5"
              value={project.duration}
              onChange={(e) =>
                setProject((prev) => ({
                  ...prev,
                  duration: parseInt(e.target.value, 10),
                }))
              }
              className="flex-1 accent-blue-500"
            />
            <input
              type="number"
              value={project.duration}
              onChange={(e) =>
                setProject((prev) => ({
                  ...prev,
                  duration: Math.max(1, parseInt(e.target.value, 10) || 30),
                }))
              }
              className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white text-center"
              min="1"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleDurationPreset(preset.value)}
                className={`px-2.5 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  project.duration === preset.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Presets */}
        <div className="pt-3 border-t border-gray-800 space-y-2">
          <label className="text-xs text-gray-400">Quick Presets</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                setProject((prev) => ({
                  ...prev,
                  resolution: "1920x1080",
                  fps: 30,
                  duration: 60,
                }))
              }
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-left transition-colors group"
            >
              <div className="text-gray-200 group-hover:text-white font-medium">
                YouTube
              </div>
              <div className="text-[10px] text-gray-500">1080p • 30fps</div>
            </button>
            <button
              onClick={() =>
                setProject((prev) => ({
                  ...prev,
                  resolution: "1080x1920",
                  fps: 30,
                  duration: 30,
                }))
              }
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-left transition-colors group"
            >
              <div className="text-gray-200 group-hover:text-white font-medium">
                TikTok / Reels
              </div>
              <div className="text-[10px] text-gray-500">Vertical • 30fps</div>
            </button>
            <button
              onClick={() =>
                setProject((prev) => ({
                  ...prev,
                  resolution: "3840x2160",
                  fps: 60,
                  duration: 120,
                }))
              }
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-left transition-colors group"
            >
              <div className="text-gray-200 group-hover:text-white font-medium">
                4K Cinema
              </div>
              <div className="text-[10px] text-gray-500">2160p • 60fps</div>
            </button>
            <button
              onClick={() =>
                setProject((prev) => ({
                  ...prev,
                  resolution: "1080x1080",
                  fps: 30,
                  duration: 60,
                }))
              }
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-left transition-colors group"
            >
              <div className="text-gray-200 group-hover:text-white font-medium">
                Instagram Post
              </div>
              <div className="text-[10px] text-gray-500">Square • 30fps</div>
            </button>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-950/20">
        <p className="text-[11px] text-gray-500 flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 text-blue-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Select a clip in the timeline to edit its properties.
        </p>
      </div>
    </div>
  );
}

function ClipSettings() {
  const { selectedClip, updateClip, tracks } = useEditor();

  if (!selectedClip) return null;

  const parentTrack = tracks.find((t) =>
    t.clips.some((c) => c.id === selectedClip.id),
  );
  const isVideoClip = parentTrack?.type === "video";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/40">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <svg
              className={`w-4 h-4 ${
                isVideoClip ? "text-blue-400" : "text-emerald-400"
              }`}
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
            Clip Properties
          </h3>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
              isVideoClip
                ? "bg-blue-500/20 text-blue-300"
                : "bg-emerald-500/20 text-emerald-300"
            }`}
          >
            {isVideoClip ? "Video" : "Audio"}
          </span>
        </div>
        <div className="mt-2 px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-300 truncate flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isVideoClip ? "bg-blue-500" : "bg-emerald-500"
            }`}
          />
          {selectedClip.label || `Clip ${selectedClip.id.slice(-6)}`}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Transform Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
            Transform
          </div>

          {/* Position */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1.5 flex items-center justify-between">
                <span>X Position</span>
                <span className="text-gray-400 font-mono">
                  {selectedClip.x || 0}
                </span>
              </label>
              <input
                type="range"
                min="-1920"
                max="1920"
                step="1"
                value={selectedClip.x || 0}
                onChange={(e) =>
                  updateClip(selectedClip.id, { x: Number(e.target.value) })
                }
                className="w-full accent-blue-500"
              />
              <input
                type="number"
                value={selectedClip.x || 0}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    x: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full mt-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1.5 flex items-center justify-between">
                <span>Y Position</span>
                <span className="text-gray-400 font-mono">
                  {selectedClip.y || 0}
                </span>
              </label>
              <input
                type="range"
                min="-1080"
                max="1080"
                step="1"
                value={selectedClip.y || 0}
                onChange={(e) =>
                  updateClip(selectedClip.id, { y: Number(e.target.value) })
                }
                className="w-full accent-blue-500"
              />
              <input
                type="number"
                value={selectedClip.y || 0}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    y: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full mt-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Scale & Rotation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1.5 flex items-center justify-between">
                <span>Scale</span>
                <span className="text-gray-400 font-mono">
                  {(selectedClip.scale ?? 1).toFixed(2)}
                </span>
              </label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.01"
                value={selectedClip.scale ?? 1}
                onChange={(e) =>
                  updateClip(selectedClip.id, { scale: Number(e.target.value) })
                }
                className="w-full accent-blue-500"
              />
              <input
                type="number"
                step="0.01"
                min="0.1"
                max="3"
                value={(selectedClip.scale ?? 1).toFixed(2)}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    scale: Math.max(
                      0.1,
                      Math.min(3, parseFloat(e.target.value) || 1),
                    ),
                  })
                }
                className="w-full mt-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1.5 flex items-center justify-between">
                <span>Rotation</span>
                <span className="text-gray-400 font-mono">
                  {selectedClip.rotation || 0}°
                </span>
              </label>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={selectedClip.rotation || 0}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    rotation: Number(e.target.value),
                  })
                }
                className="w-full accent-blue-500"
              />
              <input
                type="number"
                step="1"
                min="-180"
                max="180"
                value={selectedClip.rotation || 0}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    rotation: Math.max(
                      -180,
                      Math.min(180, parseInt(e.target.value, 10) || 0),
                    ),
                  })
                }
                className="w-full mt-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Quick Transform Buttons */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => updateClip(selectedClip.id, { x: 0, y: 0 })}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 transition-colors"
            >
              Center
            </button>
            <button
              onClick={() => updateClip(selectedClip.id, { scale: 1 })}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 transition-colors"
            >
              100%
            </button>
            <button
              onClick={() => updateClip(selectedClip.id, { scale: 1.5 })}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 transition-colors"
            >
              150%
            </button>
            <button
              onClick={() => updateClip(selectedClip.id, { scale: 2 })}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 transition-colors"
            >
              200%
            </button>
            <button
              onClick={() => updateClip(selectedClip.id, { rotation: 0 })}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 transition-colors"
            >
              0°
            </button>
            <button
              onClick={() => updateClip(selectedClip.id, { rotation: 90 })}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 transition-colors"
            >
              90°
            </button>
          </div>
        </div>

        {/* Visuals Section */}
        <div className="pt-3 border-t border-gray-800 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
            Visuals
          </div>

          <div>
            <label className="text-[10px] text-gray-500 mb-1.5 flex items-center justify-between">
              <span>Opacity</span>
              <span className="text-gray-400 font-mono">
                {Math.round((selectedClip.opacity ?? 1) * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={selectedClip.opacity ?? 1}
              onChange={(e) =>
                updateClip(selectedClip.id, { opacity: Number(e.target.value) })
              }
              className="w-full accent-blue-500"
            />
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={Math.round((selectedClip.opacity ?? 1) * 100)}
              onChange={(e) =>
                updateClip(selectedClip.id, {
                  opacity:
                    Math.max(
                      0,
                      Math.min(100, parseInt(e.target.value, 10) || 100),
                    ) / 100,
                })
              }
              className="w-full mt-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-1 mt-2">
              {[100, 75, 50, 25].map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    updateClip(selectedClip.id, { opacity: val / 100 })
                  }
                  className={`flex-1 px-2 py-1 rounded text-[10px] transition-colors ${
                    Math.round((selectedClip.opacity ?? 1) * 100) === val
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timing Section */}
        <div className="pt-3 border-t border-gray-800 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Timing
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1.5 block">
                Start Time
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={selectedClip.start || 0}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      start: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 transition-colors pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
                  s
                </span>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1.5 block">
                Duration
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={selectedClip.duration || 5}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      duration: Math.max(0.1, Number(e.target.value)),
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 transition-colors pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
                  s
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 mb-1.5 flex items-center justify-between">
              <span>Clip Duration</span>
              <span className="text-gray-400 font-mono">
                {selectedClip.duration || 5}s
              </span>
            </label>
            <input
              type="range"
              min="0.5"
              max="60"
              step="0.1"
              value={selectedClip.duration || 5}
              onChange={(e) =>
                updateClip(selectedClip.id, {
                  duration: Number(e.target.value),
                })
              }
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PropertiesPanel() {
  const { selectedClip } = useEditor();

  return selectedClip ? <ClipSettings /> : <ProjectSettings />;
}
