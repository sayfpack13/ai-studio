import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Clock, RotateCcw } from "lucide-react";
import { Button } from "../ui";
import { SliderControl, PresetCard } from "./ui";
import ResolutionPicker from "./ResolutionPicker";

// Duration presets
const durationPresets = [
  { id: "3s", label: "3s", value: 3 },
  { id: "5s", label: "5s", value: 5 },
  { id: "8s", label: "8s", value: 8 },
  { id: "10s", label: "10s", value: 10 },
  { id: "15s", label: "15s", value: 15 },
];

// FPS presets
const fpsPresets = [
  { id: "12", label: "12 fps", value: 12 },
  { id: "24", label: "24 fps", value: 24 },
  { id: "30", label: "30 fps", value: 30 },
  { id: "60", label: "60 fps", value: 60 },
];

export default function VideoPresetPanel({
  // Duration props
  duration,
  onDurationChange,
  minDuration = 1,
  maxDuration = 15,
  
  // FPS props
  fps,
  onFpsChange,
  minFps = 12,
  maxFps = 60,
  
  // Resolution props
  width,
  height,
  onWidthChange,
  onHeightChange,
  showResolution = false,
  
  // General props
  defaultExpanded = false,
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleReset = () => {
    onDurationChange?.(5);
    onFpsChange?.(24);
    onWidthChange?.(1280);
    onHeightChange?.(720);
  };

  return (
    <div className={`bg-gray-800/30 rounded-lg border border-gray-700 ${className}`}>
      {/* Header Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-gray-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium">Video Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {duration}s @ {fps}fps
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.span>
        </div>
      </button>

      {/* Quick Settings - Always visible */}
      <div className="px-3 py-3 border-b border-gray-700 space-y-3">
        {/* Duration */}
        <div>
          <label className="block text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Duration
          </label>
          <div className="grid grid-cols-5 gap-2">
            {durationPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                isSelected={duration === preset.value}
                onClick={() => onDurationChange?.(preset.value)}
                bgColor="bg-purple-600/20"
                borderColor="ring-purple-500"
              />
            ))}
          </div>
        </div>
        {/* FPS */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Frame Rate</label>
          <div className="grid grid-cols-4 gap-2">
            {fpsPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                isSelected={fps === preset.value}
                onClick={() => onFpsChange?.(preset.value)}
                bgColor="bg-blue-600/20"
                borderColor="ring-blue-500"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 space-y-3"
          >
            {/* Resolution (optional) */}
            {showResolution && (
              <ResolutionPicker
                width={width}
                height={height}
                onWidthChange={onWidthChange}
                onHeightChange={onHeightChange}
                minWidth={320}
                maxWidth={1920}
                minHeight={240}
                maxHeight={1080}
              />
            )}

            {/* Manual Controls */}
            <div className="space-y-3 pt-2 border-t border-gray-700">
              <SliderControl
                label="Duration (seconds)"
                value={duration}
                onChange={onDurationChange}
                min={minDuration}
                max={maxDuration}
                step={1}
                unit="s"
              />
              <SliderControl
                label="Frame Rate (fps)"
                value={fps}
                onChange={onFpsChange}
                min={minFps}
                max={maxFps}
                step={6}
                unit=" fps"
              />
            </div>

            {/* Reset Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-3 h-3" />}
              className="w-full"
            >
              Reset to Defaults
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
