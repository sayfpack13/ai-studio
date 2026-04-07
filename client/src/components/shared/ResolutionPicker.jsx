import { useState, useEffect } from "react";
import { Maximize2, Lock, Unlock, Monitor, Smartphone, Tablet } from "lucide-react";
import { SliderControl, NumberInput, PresetCard } from "./ui";

// Aspect ratio presets with visual representation
const aspectRatios = [
  { id: "square", label: "1:1", ratio: 1, width: 1024, height: 1024, shape: "square" },
  { id: "portrait-23", label: "2:3", ratio: 2/3, width: 768, height: 1024, shape: "portrait" },
  { id: "portrait-34", label: "3:4", ratio: 3/4, width: 768, height: 1024, shape: "portrait" },
  { id: "landscape-32", label: "3:2", ratio: 3/2, width: 1024, height: 768, shape: "landscape" },
  { id: "landscape-43", label: "4:3", ratio: 4/3, width: 1024, height: 768, shape: "landscape" },
  { id: "widescreen", label: "16:9", ratio: 16/9, width: 1280, height: 720, shape: "wide" },
  { id: "ultrawide", label: "21:9", ratio: 21/9, width: 1280, height: 549, shape: "ultrawide" },
];

// Quick size presets with icons
const quickSizes = [
  { id: "512", label: "512", width: 512, height: 512, icon: Smartphone },
  { id: "768", label: "768", width: 768, height: 768, icon: Tablet },
  { id: "1024", label: "1024", width: 1024, height: 1024, icon: Monitor },
  { id: "720p", label: "720p", width: 1280, height: 720, icon: Monitor },
  { id: "1080p", label: "1080p", width: 1920, height: 1080, icon: Monitor },
];

export default function ResolutionPicker({
  width,
  height,
  onWidthChange,
  onHeightChange,
  minWidth = 256,
  maxWidth = 2048,
  minHeight = 256,
  maxHeight = 2048,
  showQuickSizes = true,
  showAspectRatioPresets = true,
  className = "",
}) {
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(width / height);
  const [selectedPreset, setSelectedPreset] = useState(null);

  // Update aspect ratio when dimensions change
  useEffect(() => {
    if (height > 0) {
      setAspectRatio(width / height);
    }
  }, [width, height]);

  // Handle aspect ratio lock
  const handleWidthChange = (newWidth) => {
    const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    onWidthChange?.(clampedWidth);
    
    if (lockAspectRatio && aspectRatio > 0) {
      const newHeight = Math.round(clampedWidth / aspectRatio);
      onHeightChange?.(Math.min(Math.max(newHeight, minHeight), maxHeight));
    }
  };

  const handleHeightChange = (newHeight) => {
    const clampedHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);
    onHeightChange?.(clampedHeight);
    
    if (lockAspectRatio && aspectRatio > 0) {
      const newWidth = Math.round(clampedHeight * aspectRatio);
      onWidthChange?.(Math.min(Math.max(newWidth, minWidth), maxWidth));
    }
  };

  // Apply aspect ratio preset
  const applyAspectRatioPreset = (preset) => {
    setSelectedPreset(preset.id);
    setAspectRatio(preset.ratio);
    onWidthChange?.(preset.width);
    onHeightChange?.(preset.height);
  };

  // Apply quick size
  const applyQuickSize = (size) => {
    setSelectedPreset(null);
    onWidthChange?.(size.width);
    onHeightChange?.(size.height);
    setAspectRatio(size.width / size.height);
  };

  // Get current aspect ratio label
  const getCurrentAspectRatioLabel = () => {
    const currentRatio = width / height;
    const matchingPreset = aspectRatios.find(
      (ar) => Math.abs(ar.ratio - currentRatio) < 0.01
    );
    return matchingPreset ? matchingPreset.label : "Custom";
  };

  // Calculate visual shape dimensions
  const getShapeStyle = (shape) => {
    const baseSize = 32;
    const shapes = {
      square: { width: baseSize, height: baseSize },
      portrait: { width: baseSize * 0.75, height: baseSize },
      landscape: { width: baseSize, height: baseSize * 0.75 },
      wide: { width: baseSize, height: baseSize * 0.56 },
      ultrawide: { width: baseSize, height: baseSize * 0.43 },
    };
    return shapes[shape] || shapes.square;
  };

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Maximize2 className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Resolution</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {width} × {height}
          </span>
          <button
            onClick={() => setLockAspectRatio(!lockAspectRatio)}
            className={`p-1.5 rounded transition-colors ${
              lockAspectRatio
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-400 hover:text-white"
            }`}
            title={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
          >
            {lockAspectRatio ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* Aspect Ratio Presets */}
        {showAspectRatioPresets && (
          <div>
            <label className="block text-xs text-gray-500 mb-2">Aspect Ratio</label>
            <div className="grid grid-cols-4 gap-2">
              {aspectRatios.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                const shapeStyle = getShapeStyle(preset.shape);
                
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyAspectRatioPreset(preset)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-purple-600/20 ring-2 ring-purple-500"
                        : "bg-gray-700/50 hover:bg-gray-700"
                    }`}
                  >
                    <div 
                      className={`rounded-sm mb-1.5 transition-colors ${
                        isSelected ? "bg-purple-400" : "bg-gray-500"
                      }`}
                      style={{ width: shapeStyle.width, height: shapeStyle.height }}
                    />
                    <span className={`text-xs font-medium ${isSelected ? "text-purple-300" : "text-gray-400"}`}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Sizes */}
        {showQuickSizes && (
          <div>
            <label className="block text-xs text-gray-500 mb-2">Quick Size</label>
            <div className="grid grid-cols-5 gap-2">
              {quickSizes.map((size) => {
                const isSelected = width === size.width && height === size.height;
                const Icon = size.icon;
                return (
                  <PresetCard
                    key={size.id}
                    icon={Icon}
                    label={size.label}
                    isSelected={isSelected}
                    onClick={() => applyQuickSize(size)}
                    bgColor="bg-blue-600/20"
                    borderColor="ring-blue-500"
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Visual Preview */}
        <div className="flex items-center justify-center py-2">
          <div
            className="border-2 border-dashed border-gray-600 rounded flex items-center justify-center bg-gray-800/30"
            style={{
              width: `${Math.min(80, 80 * (width / height))}px`,
              height: `${Math.min(80, 80 * (height / width))}px`,
              minWidth: "40px",
              minHeight: "40px",
            }}
          >
            <span className="text-xs text-gray-500">{getCurrentAspectRatioLabel()}</span>
          </div>
        </div>

        {/* Manual Resolution Controls */}
        <div className="space-y-3 pt-2 border-t border-gray-700">
          {/* Width/Height Number Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Width"
              value={width}
              onChange={handleWidthChange}
              min={minWidth}
              max={maxWidth}
            />
            <NumberInput
              label="Height"
              value={height}
              onChange={handleHeightChange}
              min={minHeight}
              max={maxHeight}
            />
          </div>

          {/* Sliders */}
          <SliderControl
            label="Width"
            value={width}
            onChange={handleWidthChange}
            min={minWidth}
            max={maxWidth}
            step={64}
            unit="px"
          />
          <SliderControl
            label="Height"
            value={height}
            onChange={handleHeightChange}
            min={minHeight}
            max={maxHeight}
            step={64}
            unit="px"
          />
        </div>
      </div>
    </div>
  );
}
