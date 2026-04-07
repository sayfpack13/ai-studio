import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Gauge, Sparkles, Settings, RotateCcw, Sliders } from "lucide-react";
import { Button } from "../ui";
import ResolutionPicker from "./ResolutionPicker";

// Quality presets for z-image-turbo
const zImageQualityPresets = {
  fast: {
    label: "Fast",
    description: "Quick generation",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-600/20",
    borderColor: "ring-yellow-500",
    params: { numInferenceSteps: 15, guidanceScale: 3, shift: 3 },
  },
  balanced: {
    label: "Balanced",
    description: "Good quality",
    icon: Gauge,
    color: "text-blue-400",
    bgColor: "bg-blue-600/20",
    borderColor: "ring-blue-500",
    params: { numInferenceSteps: 25, guidanceScale: 5, shift: 5 },
  },
  high: {
    label: "High Quality",
    description: "Best results",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-600/20",
    borderColor: "ring-purple-500",
    params: { numInferenceSteps: 40, guidanceScale: 8, shift: 8 },
  },
};

// Resolution presets optimized for z-image
const zImageResolutionPresets = [
  { label: "Square", width: 1024, height: 1024 },
  { label: "Portrait", width: 768, height: 1024 },
  { label: "Landscape", width: 1024, height: 768 },
  { label: "Widescreen", width: 1280, height: 720 },
];

export default function ChutesImagePresetPanel({
  modelId,
  // z-image-turbo params
  zImageParams,
  onZImageParamsChange,
  // hunyuan params
  hunyuanParams,
  onHunyuanParamsChange,
  // qwen params
  qwenParams,
  onQwenParamsChange,
  // General
  defaultExpanded = false,
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [selectedQuality, setSelectedQuality] = useState("balanced");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isZImage = modelId === "chutes/z-image-turbo";
  const isHunyuan = modelId === "chutes/hunyuan-image-3";
  const isQwen = modelId === "chutes/Qwen-Image-2512";

  const applyQualityPreset = (presetKey) => {
    const preset = zImageQualityPresets[presetKey];
    setSelectedQuality(presetKey);
    if (isZImage && onZImageParamsChange) {
      onZImageParamsChange((prev) => ({
        ...prev,
        ...preset.params,
      }));
    }
  };

  const handleReset = () => {
    setSelectedQuality("balanced");
    if (isZImage && onZImageParamsChange) {
      onZImageParamsChange({
        seed: "",
        shift: 5,
        guidanceScale: 5,
        maxSequenceLength: 512,
        numInferenceSteps: 25,
        width: 1024,
        height: 1024,
      });
    }
    if (isHunyuan && onHunyuanParamsChange) {
      onHunyuanParamsChange({
        seed: "",
        size: "1024x1024",
        steps: 20,
      });
    }
    if (isQwen && onQwenParamsChange) {
      onQwenParamsChange({
        seed: "",
        width: 1024,
        height: 1024,
        trueCfgScale: 4,
        negativePrompt: "",
        numInferenceSteps: 30,
      });
    }
  };

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-gray-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium">Model Settings</span>
          <span className="text-xs px-1.5 py-0.5 bg-purple-600/30 text-purple-300 rounded">
            {isZImage ? "Z-Image" : isHunyuan ? "Hunyuan" : isQwen ? "Qwen" : "Chutes"}
          </span>
        </div>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.span>
      </button>

      {/* Quick Settings - Always visible for Z-Image */}
      {isZImage && (
        <div className="px-3 py-3 border-b border-gray-700 space-y-3">
          {/* Quality */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Quality</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(zImageQualityPresets).map(([key, preset]) => {
                const PresetIcon = preset.icon;
                const isSelected = selectedQuality === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyQualityPreset(key)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? `${preset.bgColor} ring-2 ${preset.borderColor}`
                        : "bg-gray-700/30 hover:bg-gray-700/50"
                    }`}
                  >
                    <PresetIcon className={`w-4 h-4 mb-1 ${preset.color}`} />
                    <span className={`text-xs font-medium ${isSelected ? "text-white" : "text-gray-300"}`}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Size */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Size</label>
            <div className="grid grid-cols-4 gap-2">
              {zImageResolutionPresets.map((preset) => {
                const isSelected = zImageParams?.width === preset.width && zImageParams?.height === preset.height;
                return (
                  <button
                    key={preset.label}
                    onClick={() => onZImageParamsChange?.((prev) => ({
                      ...prev,
                      width: preset.width,
                      height: preset.height,
                    }))}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-purple-600/20 ring-2 ring-purple-500"
                        : "bg-gray-700/30 hover:bg-gray-700/50"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isSelected ? "text-purple-300" : "text-gray-300"}`}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Settings - Always visible for Hunyuan */}
      {isHunyuan && (
        <div className="px-3 py-3 border-b border-gray-700 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Size</label>
            <div className="grid grid-cols-4 gap-2">
              {["1024x1024", "768x1024", "1024x768", "1280x720"].map((size) => {
                const isSelected = hunyuanParams?.size === size;
                return (
                  <button
                    key={size}
                    onClick={() => onHunyuanParamsChange?.((prev) => ({ ...prev, size }))}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-purple-600/20 ring-2 ring-purple-500"
                        : "bg-gray-700/30 hover:bg-gray-700/50"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isSelected ? "text-purple-300" : "text-gray-300"}`}>
                      {size}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Settings - Always visible for Qwen */}
      {isQwen && (
        <div className="px-3 py-3 border-b border-gray-700 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Size</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Square", w: 1024, h: 1024 },
                { label: "Portrait", w: 768, h: 1024 },
                { label: "Landscape", w: 1024, h: 768 },
              ].map((preset) => {
                const isSelected = qwenParams?.width === preset.w && qwenParams?.height === preset.h;
                return (
                  <button
                    key={preset.label}
                    onClick={() => onQwenParamsChange?.((prev) => ({
                      ...prev,
                      width: preset.w,
                      height: preset.h,
                    }))}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-purple-600/20 ring-2 ring-purple-500"
                        : "bg-gray-700/30 hover:bg-gray-700/50"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isSelected ? "text-purple-300" : "text-gray-300"}`}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 space-y-3"
          >
            {/* Z-Image Turbo - Manual Controls */}
            {isZImage && (
              <div className="space-y-3 pt-2 border-t border-gray-700">
                {/* Seed */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
                  <input
                    type="text"
                    value={zImageParams?.seed || ""}
                    onChange={(e) => onZImageParamsChange?.((prev) => ({ ...prev, seed: e.target.value }))}
                    placeholder="Random"
                    className="w-full bg-gray-700 text-white p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Inference Steps Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">Inference Steps</label>
                    <span className="text-xs font-mono text-gray-500">{zImageParams?.numInferenceSteps || 25}</span>
                  </div>
                  <input
                    type="range"
                    value={zImageParams?.numInferenceSteps || 25}
                    onChange={(e) => onZImageParamsChange?.((prev) => ({
                      ...prev,
                      numInferenceSteps: parseInt(e.target.value),
                    }))}
                    min={10}
                    max={50}
                    step={1}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Guidance Scale Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">Guidance Scale</label>
                    <span className="text-xs font-mono text-gray-500">{zImageParams?.guidanceScale || 5}</span>
                  </div>
                  <input
                    type="range"
                    value={zImageParams?.guidanceScale || 5}
                    onChange={(e) => onZImageParamsChange?.((prev) => ({
                      ...prev,
                      guidanceScale: parseFloat(e.target.value),
                    }))}
                    min={1}
                    max={15}
                    step={0.5}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Shift Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">Shift</label>
                    <span className="text-xs font-mono text-gray-500">{zImageParams?.shift || 5}</span>
                  </div>
                  <input
                    type="range"
                    value={zImageParams?.shift || 5}
                    onChange={(e) => onZImageParamsChange?.((prev) => ({
                      ...prev,
                      shift: parseFloat(e.target.value),
                    }))}
                    min={1}
                    max={15}
                    step={0.5}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Hunyuan Image - Manual Controls */}
            {isHunyuan && (
              <div className="space-y-3 pt-2 border-t border-gray-700">
                {/* Steps Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">Steps</label>
                    <span className="text-xs font-mono text-gray-500">{hunyuanParams?.steps || 20}</span>
                  </div>
                  <input
                    type="range"
                    value={hunyuanParams?.steps || 20}
                    onChange={(e) => onHunyuanParamsChange?.((prev) => ({
                      ...prev,
                      steps: parseInt(e.target.value),
                    }))}
                    min={10}
                    max={50}
                    step={1}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Seed */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
                  <input
                    type="text"
                    value={hunyuanParams?.seed || ""}
                    onChange={(e) => onHunyuanParamsChange?.((prev) => ({ ...prev, seed: e.target.value }))}
                    placeholder="Random"
                    className="w-full bg-gray-700 text-white p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Qwen Image - Manual Controls */}
            {isQwen && (
              <div className="space-y-3 pt-2 border-t border-gray-700">
                {/* Steps Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">Inference Steps</label>
                    <span className="text-xs font-mono text-gray-500">{qwenParams?.numInferenceSteps || 30}</span>
                  </div>
                  <input
                    type="range"
                    value={qwenParams?.numInferenceSteps || 30}
                    onChange={(e) => onQwenParamsChange?.((prev) => ({
                      ...prev,
                      numInferenceSteps: parseInt(e.target.value),
                    }))}
                    min={15}
                    max={50}
                    step={1}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* CFG Scale Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">CFG Scale</label>
                    <span className="text-xs font-mono text-gray-500">{qwenParams?.trueCfgScale || 4}</span>
                  </div>
                  <input
                    type="range"
                    value={qwenParams?.trueCfgScale || 4}
                    onChange={(e) => onQwenParamsChange?.((prev) => ({
                      ...prev,
                      trueCfgScale: parseFloat(e.target.value),
                    }))}
                    min={1}
                    max={10}
                    step={0.5}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Negative Prompt */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
                  <textarea
                    value={qwenParams?.negativePrompt || ""}
                    onChange={(e) => onQwenParamsChange?.((prev) => ({
                      ...prev,
                      negativePrompt: e.target.value,
                    }))}
                    placeholder="What to avoid..."
                    rows={2}
                    className="w-full bg-gray-700 text-white p-2 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Seed */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
                  <input
                    type="text"
                    value={qwenParams?.seed || ""}
                    onChange={(e) => onQwenParamsChange?.((prev) => ({ ...prev, seed: e.target.value }))}
                    placeholder="Random"
                    className="w-full bg-gray-700 text-white p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

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
