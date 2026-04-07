import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sliders, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "../ui";
import { SliderControl, TextAreaInput } from "./ui";
import ResolutionPicker from "./ResolutionPicker";

export default function GeneratorPresetPanel({
  // Resolution props
  width,
  height,
  onWidthChange,
  onHeightChange,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  showResolution = true,
  
  // Quality props
  steps,
  guidanceScale,
  onStepsChange,
  onGuidanceScaleChange,
  minSteps = 10,
  maxSteps = 100,
  showQuality = true,
  
  // Style props
  style,
  negativePrompt,
  onStyleChange,
  onNegativePromptChange,
  showStyle = true,
  
  // General props
  defaultExpanded = false,
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleReset = () => {
    onWidthChange?.(1024);
    onHeightChange?.(1024);
    onStepsChange?.(30);
    onGuidanceScaleChange?.(7.5);
    onNegativePromptChange?.("");
    onStyleChange?.(null);
  };

  // Count active settings
  const activeSettingsCount = [
    width !== 1024 || height !== 1024,
    steps !== 30 || guidanceScale !== 7.5,
    negativePrompt && negativePrompt.length > 0,
  ].filter(Boolean).length;

  return (
    <div className={`bg-gray-800/30 rounded-lg border border-gray-700 ${className}`}>
      {/* Header Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-gray-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium">Advanced Settings</span>
          {activeSettingsCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded">
              {activeSettingsCount} modified
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </motion.div>
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 space-y-3"
          >
            {/* Resolution */}
            {showResolution && (
              <ResolutionPicker
                width={width}
                height={height}
                onWidthChange={onWidthChange}
                onHeightChange={onHeightChange}
                minWidth={minWidth}
                maxWidth={maxWidth}
                minHeight={minHeight}
                maxHeight={maxHeight}
              />
            )}

            {/* Quality */}
            {showQuality && (
              <div className="space-y-3">
                <SliderControl
                  label="Steps"
                  value={steps}
                  onChange={onStepsChange}
                  min={minSteps}
                  max={maxSteps}
                  step={1}
                />
                <SliderControl
                  label="Guidance Scale"
                  value={guidanceScale}
                  onChange={onGuidanceScaleChange}
                  min={1}
                  max={20}
                  step={0.5}
                  formatValue={(v) => v?.toFixed(1)}
                />
              </div>
            )}

            {/* Style */}
            {showStyle && (
              <TextAreaInput
                label="Negative Prompt"
                value={negativePrompt}
                onChange={onNegativePromptChange}
                placeholder="What to avoid in the image..."
                rows={2}
              />
            )}

            {/* Reset Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-3 h-3" />}
              className="w-full"
            >
              Reset All to Defaults
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
