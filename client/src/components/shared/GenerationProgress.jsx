import { motion } from "framer-motion";
import { Loader2, CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import ProgressBar from "./ProgressBar";

const stages = {
  initializing: { label: "Initializing...", icon: Loader2, color: "text-gray-400" },
  preparing: { label: "Preparing request...", icon: Clock, color: "text-blue-400" },
  generating: { label: "Generating...", icon: Zap, color: "text-yellow-400" },
  processing: { label: "Processing response...", icon: Loader2, color: "text-purple-400" },
  complete: { label: "Complete!", icon: CheckCircle, color: "text-green-400" },
  error: { label: "Error", icon: XCircle, color: "text-red-400" },
};

export default function GenerationProgress({
  stage = "initializing",
  progress = 0,
  message,
  showProgress = true,
  estimatedTime,
  onCancel,
  className = "",
}) {
  const currentStage = stages[stage] || stages.initializing;
  const Icon = currentStage.icon;
  const isAnimating = stage !== "complete" && stage !== "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`
        bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-4
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${currentStage.color}`}>
          <Icon className={`w-5 h-5 ${isAnimating ? "animate-spin" : ""}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${currentStage.color}`}>
              {currentStage.label}
            </span>
            {estimatedTime && isAnimating && (
              <span className="text-xs text-gray-500">
                ~{estimatedTime}s remaining
              </span>
            )}
          </div>

          {showProgress && isAnimating && (
            <ProgressBar
              value={progress}
              max={100}
              showPercentage={false}
              size="sm"
              className="mb-2"
            />
          )}

          {message && (
            <p className="text-xs text-gray-500 truncate">{message}</p>
          )}

          {onCancel && isAnimating && (
            <button
              onClick={onCancel}
              className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Cancel generation
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function GenerationOverlay({ isVisible, children, className = "" }) {
  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`
        absolute inset-0 z-10
        bg-gray-900/80 backdrop-blur-sm
        flex items-center justify-center
        rounded-lg
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
