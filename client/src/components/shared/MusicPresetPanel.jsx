import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Clock, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "../ui";
import { SliderControl, PresetCard } from "./ui";

// Duration presets for music
const durationPresets = [
  { id: "15s", label: "15s", value: 15 },
  { id: "30s", label: "30s", value: 30 },
  { id: "60s", label: "60s", value: 60 },
  { id: "90s", label: "90s", value: 90 },
  { id: "120s", label: "120s", value: 120 },
];

// Format presets
const formatPresets = [
  { id: "mp3", label: "MP3", value: "mp3" },
  { id: "wav", label: "WAV", value: "wav" },
  { id: "ogg", label: "OGG", value: "ogg" },
];

// Style presets for music
const stylePresets = [
  { id: "ambient", label: "Ambient", bgColor: "bg-blue-600/20", borderColor: "ring-blue-500" },
  { id: "electronic", label: "Electronic", bgColor: "bg-purple-600/20", borderColor: "ring-purple-500" },
  { id: "classical", label: "Classical", bgColor: "bg-amber-600/20", borderColor: "ring-amber-500" },
  { id: "jazz", label: "Jazz", bgColor: "bg-yellow-600/20", borderColor: "ring-yellow-500" },
  { id: "rock", label: "Rock", bgColor: "bg-red-600/20", borderColor: "ring-red-500" },
];

export default function MusicPresetPanel({
  // Duration props
  duration,
  onDurationChange,
  minDuration = 5,
  maxDuration = 180,
  
  // Format props
  format,
  onFormatChange,
  
  // Style props
  style,
  onStyleChange,
  
  // General props
  defaultExpanded = false,
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleReset = () => {
    onDurationChange?.(30);
    onFormatChange?.("mp3");
    onStyleChange?.(null);
  };

  return (
    <div className={`bg-gray-800/30 rounded-lg border border-gray-700 ${className}`}>
      {/* Header Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-gray-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium">Music Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {duration}s · {format?.toUpperCase()}
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
                bgColor="bg-emerald-600/20"
                borderColor="ring-emerald-500"
              />
            ))}
          </div>
        </div>
        {/* Format */}
        <div>
          <label className="block text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {formatPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                isSelected={format === preset.value}
                onClick={() => onFormatChange?.(preset.value)}
                bgColor="bg-teal-600/20"
                borderColor="ring-teal-500"
              />
            ))}
          </div>
        </div>
        {/* Style */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Style</label>
          <div className="grid grid-cols-5 gap-2">
            {stylePresets.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                isSelected={style === preset.id}
                onClick={() => onStyleChange?.(preset.id)}
                bgColor={preset.bgColor}
                borderColor={preset.borderColor}
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
            {/* Manual Controls */}
            <div className="space-y-3 pt-2 border-t border-gray-700">
              <SliderControl
                label="Duration (seconds)"
                value={duration}
                onChange={onDurationChange}
                min={minDuration}
                max={maxDuration}
                step={5}
                unit="s"
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
