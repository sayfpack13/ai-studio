import { useState } from "react";
import { motion } from "framer-motion";
import { Sliders, RotateCcw } from "lucide-react";
import { Button } from "../ui";

const presets = {
  creative: { temperature: 0.9, topP: 0.95, maxTokens: 2048 },
  balanced: { temperature: 0.7, topP: 0.9, maxTokens: 2048 },
  precise: { temperature: 0.3, topP: 0.8, maxTokens: 2048 },
};

export default function ParameterControls({
  temperature = 0.7,
  maxTokens = 2048,
  topP = 0.9,
  onTemperatureChange,
  onMaxTokensChange,
  onTopPChange,
  showPresets = true,
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const applyPreset = (preset) => {
    const values = presets[preset];
    onTemperatureChange?.(values.temperature);
    onTopPChange?.(values.topP);
    onMaxTokensChange?.(values.maxTokens);
  };

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-gray-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4" />
          <span className="text-sm font-medium">Parameters</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            temp: {temperature.toFixed(1)} | tokens: {maxTokens}
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="text-gray-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.span>
        </div>
      </button>

      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-3 pb-3 space-y-4"
        >
          {/* Presets */}
          {showPresets && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Presets:</span>
              {Object.keys(presets).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`
                    px-2.5 py-1 text-xs rounded-md transition-colors
                    ${temperature === presets[preset].temperature
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }
                  `}
                >
                  {preset.charAt(0).toUpperCase() + preset.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Temperature Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-gray-400">Temperature</label>
              <span className="text-xs font-mono text-gray-500">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={temperature}
              onChange={(e) => onTemperatureChange?.(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Top P Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-gray-400">Top P</label>
              <span className="text-xs font-mono text-gray-500">{topP.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={topP}
              onChange={(e) => onTopPChange?.(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-gray-400">Max Tokens</label>
              <span className="text-xs font-mono text-gray-500">{maxTokens}</span>
            </div>
            <input
              type="range"
              min="256"
              max="8192"
              step="256"
              value={maxTokens}
              onChange={(e) => onMaxTokensChange?.(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>256</span>
              <span>8192</span>
            </div>
          </div>

          {/* Reset Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => applyPreset("balanced")}
            leftIcon={<RotateCcw className="w-3 h-3" />}
            className="w-full"
          >
            Reset to Defaults
          </Button>
        </motion.div>
      )}
    </div>
  );
}
