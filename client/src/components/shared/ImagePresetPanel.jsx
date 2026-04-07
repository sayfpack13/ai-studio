import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sliders, RotateCcw, Square, RectangleHorizontal, RectangleVertical, Maximize, Lock, Unlock } from "lucide-react";
import { Button } from "../ui";
import { SliderControl, NumberInput, PresetCard, PresetCardGrid, CollapsiblePanel, TextAreaInput, TextInput } from "./ui";
import { getModelConfig, aspectRatioPresets, qualityPresets } from "./configs";

export default function ImagePresetPanel({
  modelId,
  params,
  onParamsChange,
  defaultExpanded = false,
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [aspectLocked, setAspectLocked] = useState(false);
  const [selectedQualityId, setSelectedQualityId] = useState(null);

  const config = useMemo(() => getModelConfig(modelId), [modelId]);

  // Get current values with defaults
  const getValue = (key) => {
    return params?.[key] ?? config.defaultValues?.[key] ?? "";
  };

  // Determine selected size preset based on current params
  const getSelectedSizeId = useMemo(() => {
    const sizePresets = config.sizePresets || aspectRatioPresets;
    
    if (config.supportsSize) {
      // For models like Hunyuan that use size string
      const currentSize = getValue("size");
      return sizePresets.find(p => p.id === currentSize)?.id || null;
    } else if (config.supportsWidthHeight) {
      // For models that use width/height
      const currentWidth = getValue("width");
      const currentHeight = getValue("height");
      const matching = sizePresets.find(p => p.width === currentWidth && p.height === currentHeight);
      return matching?.id || null;
    }
    return null;
  }, [config, params]);

  // Update a single parameter
  const updateParam = (key, value) => {
    onParamsChange?.((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Update multiple parameters
  const updateParams = (updates) => {
    onParamsChange?.((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  // Handle aspect ratio preset selection
  const handleAspectRatioSelect = (preset) => {
    if (config.supportsWidthHeight) {
      updateParams({
        width: preset.width,
        height: preset.height,
      });
    } else if (config.supportsSize) {
      updateParam("size", `${preset.width}x${preset.height}`);
    }
  };

  // Handle width change with aspect lock
  const handleWidthChange = (newWidth) => {
    if (aspectLocked && config.supportsWidthHeight) {
      const currentWidth = getValue("width");
      const currentHeight = getValue("height");
      const ratio = currentHeight / currentWidth;
      updateParams({
        width: newWidth,
        height: Math.round(newWidth * ratio),
      });
    } else {
      updateParam("width", newWidth);
    }
  };

  // Handle height change with aspect lock
  const handleHeightChange = (newHeight) => {
    if (aspectLocked && config.supportsWidthHeight) {
      const currentWidth = getValue("width");
      const currentHeight = getValue("height");
      const ratio = currentWidth / currentHeight;
      updateParams({
        width: Math.round(newHeight * ratio),
        height: newHeight,
      });
    } else {
      updateParam("height", newHeight);
    }
  };

  // Handle quality preset selection
  const handleQualityPresetSelect = (preset) => {
    setSelectedQualityId(preset.id);
    if (config.qualityPresets) {
      // Z-Image style presets
      updateParams(preset.params);
    } else {
      // Standard quality presets
      updateParams({
        steps: preset.steps,
        guidanceScale: preset.guidanceScale,
      });
    }
  };

  // Handle size preset selection (for models that use size string)
  const handleSizePresetSelect = (preset) => {
    if (config.supportsSize) {
      updateParam("size", preset.id);
    } else if (config.supportsWidthHeight) {
      updateParams({
        width: preset.width,
        height: preset.height,
      });
    }
  };

  // Reset to defaults
  const handleReset = () => {
    onParamsChange?.(config.defaultValues);
    setSelectedQualityId(null);
  };

  // Determine which quality presets to use
  const activeQualityPresets = config.qualityPresets || qualityPresets;

  // Get size presets for current model
  const sizePresets = config.sizePresets || aspectRatioPresets;

  // Calculate current aspect ratio label
  const getCurrentAspectRatioLabel = () => {
    if (config.supportsSize) {
      return getValue("size");
    }
    const width = getValue("width");
    const height = getValue("height");
    if (!width || !height) return "";
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  };

  // Check if a size preset is selected
  const isSizePresetSelected = (preset) => {
    if (config.supportsSize) {
      return getValue("size") === preset.id;
    }
    return getValue("width") === preset.width && getValue("height") === preset.height;
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
          {config.name !== "Standard" && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-600/30 text-purple-300 rounded">
              {config.name}
            </span>
          )}
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

      {/* Quick Settings - Always visible */}
      <div className="px-3 py-3 border-b border-gray-700 space-y-3">
        {/* Quality Presets */}
        {config.supportsQualityPresets && (
          <div>
            <label className="block text-xs text-gray-500 mb-2">Quality</label>
            <PresetCardGrid
              presets={Object.values(activeQualityPresets).map((p) => ({
                ...p,
                icon: p.icon,
                color: p.color,
                bgColor: p.bgColor,
                borderColor: p.borderColor,
              }))}
              selectedId={selectedQualityId}
              onSelect={handleQualityPresetSelect}
              columns={3}
            />
          </div>
        )}

        {/* Size Presets */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Size</label>
          <PresetCardGrid
            presets={sizePresets.map((p) => ({
              ...p,
              icon: p.icon || (p.width === p.height ? Square : p.width > p.height ? RectangleHorizontal : RectangleVertical),
              bgColor: p.bgColor || "bg-purple-600/20",
              borderColor: p.borderColor || "ring-purple-500",
            }))}
            selectedId={getSelectedSizeId}
            onSelect={handleSizePresetSelect}
            columns={sizePresets.length > 3 ? 4 : 3}
          />
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
            {/* Manual Controls Section */}
            <div className="space-y-3 pt-2 border-t border-gray-700">
              {/* Width/Height Controls */}
              {config.supportsWidthHeight && (
                <>
                  {/* Number Inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                      label="Width"
                      value={getValue("width")}
                      onChange={handleWidthChange}
                      min={config.ranges?.width?.min}
                      max={config.ranges?.width?.max}
                    />
                    <NumberInput
                      label="Height"
                      value={getValue("height")}
                      onChange={handleHeightChange}
                      min={config.ranges?.height?.min}
                      max={config.ranges?.height?.max}
                    />
                  </div>

                  {/* Sliders */}
                  <SliderControl
                    label="Width"
                    value={getValue("width")}
                    onChange={handleWidthChange}
                    min={config.ranges?.width?.min || 256}
                    max={config.ranges?.width?.max || 2048}
                    step={64}
                  />
                  <SliderControl
                    label="Height"
                    value={getValue("height")}
                    onChange={handleHeightChange}
                    min={config.ranges?.height?.min || 256}
                    max={config.ranges?.height?.max || 2048}
                    step={64}
                  />

                  {/* Aspect Lock Toggle */}
                  <button
                    onClick={() => setAspectLocked(!aspectLocked)}
                    className={`flex items-center gap-1.5 text-xs ${aspectLocked ? "text-purple-400" : "text-gray-400"} hover:text-white transition-colors`}
                  >
                    {aspectLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {aspectLocked ? "Aspect locked" : "Lock aspect ratio"}
                  </button>
                </>
              )}

              {/* Size Input (for models like Hunyuan) */}
              {config.supportsSize && !config.supportsWidthHeight && (
                <TextInput
                  label="Size"
                  value={getValue("size")}
                  onChange={(v) => updateParam("size", v)}
                  placeholder="1024x1024"
                />
              )}

              {/* Steps Slider */}
              {config.supportsSteps && (
                <SliderControl
                  label={config.id === "chutes/z-image-turbo" ? "Inference Steps" : "Steps"}
                  value={getValue(config.id === "chutes/z-image-turbo" ? "numInferenceSteps" : "steps")}
                  onChange={(v) => updateParam(config.id === "chutes/z-image-turbo" ? "numInferenceSteps" : "steps", v)}
                  min={config.ranges?.numInferenceSteps?.min || config.ranges?.steps?.min || 10}
                  max={config.ranges?.numInferenceSteps?.max || config.ranges?.steps?.max || 50}
                  step={1}
                />
              )}

              {/* Guidance Scale Slider */}
              {config.supportsGuidanceScale && (
                <SliderControl
                  label="Guidance Scale"
                  value={getValue("guidanceScale")}
                  onChange={(v) => updateParam("guidanceScale", v)}
                  min={config.ranges?.guidanceScale?.min || 1}
                  max={config.ranges?.guidanceScale?.max || 15}
                  step={0.5}
                  formatValue={(v) => v?.toFixed(1)}
                />
              )}

              {/* CFG Scale Slider (Qwen) */}
              {config.supportsCfgScale && (
                <SliderControl
                  label="CFG Scale"
                  value={getValue("trueCfgScale")}
                  onChange={(v) => updateParam("trueCfgScale", v)}
                  min={config.ranges?.trueCfgScale?.min || 1}
                  max={config.ranges?.trueCfgScale?.max || 10}
                  step={0.5}
                  formatValue={(v) => v?.toFixed(1)}
                />
              )}

              {/* Shift Slider (Z-Image) */}
              {config.supportsShift && (
                <SliderControl
                  label="Shift"
                  value={getValue("shift")}
                  onChange={(v) => updateParam("shift", v)}
                  min={config.ranges?.shift?.min || 1}
                  max={config.ranges?.shift?.max || 15}
                  step={0.5}
                  formatValue={(v) => v?.toFixed(1)}
                />
              )}

              {/* Negative Prompt */}
              {config.supportsNegativePrompt && (
                <TextAreaInput
                  label="Negative Prompt"
                  value={getValue("negativePrompt")}
                  onChange={(v) => updateParam("negativePrompt", v)}
                  placeholder="What to avoid in the image..."
                  rows={2}
                />
              )}

              {/* Seed */}
              {config.supportsSeed && (
                <TextInput
                  label="Seed (optional)"
                  value={getValue("seed")}
                  onChange={(v) => updateParam("seed", v)}
                  placeholder="Random"
                />
              )}
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
