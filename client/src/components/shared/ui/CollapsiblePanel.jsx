import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { Button } from "../../ui";

export default function CollapsiblePanel({
  title,
  icon: Icon,
  badge,
  defaultExpanded = false,
  children,
  onReset,
  resetLabel = "Reset to Defaults",
  className = "",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-gray-300 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-purple-400" />}
          <span className="text-sm font-medium">{title}</span>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-600/30 text-purple-300 rounded">
              {badge}
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

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 space-y-3"
          >
            {children}

            {/* Reset Button */}
            {onReset && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                leftIcon={<RotateCcw className="w-3 h-3" />}
                className="w-full"
              >
                {resetLabel}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
