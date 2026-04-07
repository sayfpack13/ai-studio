import { motion } from "framer-motion";

export default function ProgressBar({
  value = 0,
  max = 100,
  label,
  showPercentage = true,
  size = "md",
  color = "blue",
  className = "",
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const sizes = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const colors = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    red: "bg-red-500",
    yellow: "bg-yellow-500",
    purple: "bg-purple-500",
  };

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1.5 text-sm">
          {label && <span className="text-gray-400">{label}</span>}
          {showPercentage && (
            <span className="text-gray-500 font-mono">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-800 rounded-full overflow-hidden ${sizes[size]}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`h-full rounded-full ${colors[color]}`}
        />
      </div>
    </div>
  );
}

export function CircularProgress({ value = 0, max = 100, size = 40, strokeWidth = 4, color = "#3b82f6" }) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <span className="absolute text-xs font-mono text-gray-400">
        {Math.round(percentage)}%
      </span>
    </div>
  );
}
