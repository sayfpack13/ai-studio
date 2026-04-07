import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Palette, Sparkles, Film, Shapes, Settings, RotateCcw } from "lucide-react";
import { Button } from "../ui";

// Style presets with parameter adjustments
const stylePresets = {
  photorealistic: {
    label: "Photo",
    description: "Realistic photo-like images",
    icon: Camera,
    color: "text-emerald-400",
    bgColor: "bg-emerald-600/20",
    borderColor: "ring-emerald-500",
    negativePrompt: "cartoon, anime, illustration, painting, drawing, art, sketch",
    guidanceScale: 12,
  },
  artistic: {
    label: "Artistic",
    description: "Creative artistic interpretation",
    icon: Palette,
    color: "text-pink-400",
    bgColor: "bg-pink-600/20",
    borderColor: "ring-pink-500",
    negativePrompt: "photorealistic, photo, realistic, hyperrealistic",
    guidanceScale: 8,
  },
  anime: {
    label: "Anime",
    description: "Japanese anime/manga style",
    icon: Sparkles,
    color: "text-violet-400",
    bgColor: "bg-violet-600/20",
    borderColor: "ring-violet-500",
    negativePrompt: "photorealistic, photo, realistic, 3d render",
    guidanceScale: 7,
  },
  cinematic: {
    label: "Cinematic",
    description: "Movie-like dramatic look",
    icon: Film,
    color: "text-amber-400",
    bgColor: "bg-amber-600/20",
    borderColor: "ring-amber-500",
    negativePrompt: "amateur, low quality, webcam",
    guidanceScale: 10,
  },
  abstract: {
    label: "Abstract",
    description: "Experimental abstract art",
    icon: Shapes,
    color: "text-cyan-400",
    bgColor: "bg-cyan-600/20",
    borderColor: "ring-cyan-500",
    negativePrompt: "realistic, photorealistic, representational",
    guidanceScale: 5,
  },
};

export default function StylePreset({
  style,
  negativePrompt,
  onStyleChange,
  onNegativePromptChange,
  guidanceScale,
  onGuidanceScaleChange,
  showAdvancedByDefault = false,
  className = "",
}) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedByDefault);

  const applyPreset = (presetKey) => {
    const preset = stylePresets[presetKey];
    setSelectedPreset(presetKey);
    onStyleChange?.(presetKey);
    onNegativePromptChange?.(preset.negativePrompt);
    onGuidanceScaleChange?.(preset.guidanceScale);
  };

  const currentPreset = selectedPreset ? stylePresets[selectedPreset] : null;
  const Icon = currentPreset?.icon || Palette;

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${currentPreset?.color || "text-gray-400"}`} />
          <span className="text-sm font-medium text-gray-300">Style</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {currentPreset?.label || "Custom"}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Style Presets - Card Style */}
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(stylePresets).map(([key, preset]) => {
            const PresetIcon = preset.icon;
            const isSelected = selectedPreset === key;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`flex flex-col items-center justify-center p-3 rounded-lg transition-all ${
                  isSelected
                    ? `${preset.bgColor} ring-2 ${preset.borderColor}`
                    : "bg-gray-700/30 hover:bg-gray-700/50"
                }`}
              >
                <PresetIcon className={`w-5 h-5 mb-1.5 ${preset.color}`} />
                <span className={`text-xs font-medium ${isSelected ? "text-white" : "text-gray-300"}`}>
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Manual Controls */}
        <div className="space-y-3 pt-3 border-t border-gray-700">
          {/* Custom Negative Prompt */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Negative Prompt
            </label>
            <textarea
              value={negativePrompt || ""}
              onChange={(e) => {
                onNegativePromptChange?.(e.target.value);
                setSelectedPreset(null);
              }}
              placeholder="What to avoid in the image..."
              rows={2}
              className="w-full bg-gray-700 text-white p-2 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Guidance Scale */}
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
                min={1}
                max={20}
                step={0.5}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}

          {/* Reset Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedPreset(null);
              onNegativePromptChange?.("");
              onGuidanceScaleChange?.(7.5);
            }}
            leftIcon={<RotateCcw className="w-3 h-3" />}
            className="w-full text-xs"
          >
            Clear Style
          </Button>
        </div>
      </div>
    </div>
  );
}
