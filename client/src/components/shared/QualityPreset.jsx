import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Gauge, Sparkles, Settings, RotateCcw, Clock, Wand2 } from "lucide-react";
import { Button } from "../ui";

// Quality presets with parameter adjustments
const qualityPresets = {
  fast: {
    label: "Fast",
    description: "Quick generation",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-600/20",
    borderColor: "ring-yellow-500",
    steps: 15,
    guidanceScale: 5,
    time: "~5s",
  },
  balanced: {
    label: "Balanced",
    description: "Good quality",
    icon: Gauge,
    color: "text-blue-400",
    bgColor: "bg-blue-600/20",
    borderColor: "ring-blue-500",
    steps: 30,
    guidanceScale: 7.5,
    time: "~15s",
  },
  high: {
    label: "High Quality",
    description: "Best results",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-600/20",
    borderColor: "ring-purple-500",
    steps: 50,
    guidanceScale: 10,
    time: "~30s",
  },
};

export default function QualityPreset({
  steps,
  guidanceScale,
  onStepsChange,
  onGuidanceScaleChange,
  minSteps = 10,
  maxSteps = 100,
  minGuidance = 1,
  maxGuidance = 20,
  showAdvancedByDefault = false,
  className = "",
}) {
  const [selectedPreset, setSelectedPreset] = useState("balanced");
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedByDefault);

  const applyPreset = (presetKey) => {
    const preset = qualityPresets[presetKey];
    setSelectedPreset(presetKey);
    onStepsChange?.(preset.steps);
    onGuidanceScaleChange?.(preset.guidanceScale);
  };

  const currentPreset = qualityPresets[selectedPreset];
  const Icon = currentPreset?.icon || Gauge;

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${currentPreset?.color || "text-gray-400"}`} />
          <span className="text-sm font-medium text-gray-300">Quality</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {steps} steps
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Quality Presets - Card Style */}
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(qualityPresets).map(([key, preset]) => {
            const PresetIcon = preset.icon;
            const isSelected = selectedPreset === key;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`flex flex-col items-center p-3 rounded-lg transition-all ${
                  isSelected
                    ? `${preset.bgColor} ring-2 ${preset.borderColor}`
                    : "bg-gray-700/30 hover:bg-gray-700/50"
                }`}
              >
                <PresetIcon className={`w-6 h-6 mb-2 ${preset.color}`} />
                <span className={`text-sm font-medium mb-1 ${isSelected ? "text-white" : "text-gray-300"}`}>
                  {preset.label}
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Wand2 className="w-3 h-3" />
                  <span>{preset.steps} steps</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <Clock className="w-3 h-3" />
                  <span>{preset.time}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Manual Controls */}
        <div className="space-y-3 pt-3 border-t border-gray-700">
          {/* Steps Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400">Inference Steps</label>
              <span className="text-xs font-mono text-gray-500">{steps}</span>
            </div>
            <input
              type="range"
              value={steps}
              onChange={(e) => {
                onStepsChange?.(parseInt(e.target.value));
                setSelectedPreset(null); // Deselect preset when manually adjusting
              }}
              min={minSteps}
              max={maxSteps}
              step={1}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>Fast ({minSteps})</span>
              <span>Quality ({maxSteps})</span>
            </div>
          </div>

          {/* Guidance Scale Slider */}
          {guidanceScale !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-400">Guidance Scale</label>
                <span className="text-xs font-mono text-gray-500">{guidanceScale?.toFixed(1)}</span>
              </div>
              <input
                type="range"
                value={guidanceScale}
                onChange={(e) => {
                  onGuidanceScaleChange?.(parseFloat(e.target.value));
                  setSelectedPreset(null);
                }}
                min={minGuidance}
                max={maxGuidance}
                step={0.5}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>Low ({minGuidance})</span>
                <span>High ({maxGuidance})</span>
              </div>
            </div>
          )}

          {/* Reset Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => applyPreset("balanced")}
            leftIcon={<RotateCcw className="w-3 h-3" />}
            className="w-full text-xs"
          >
            Reset to Balanced
          </Button>
        </div>
      </div>
    </div>
  );
}
