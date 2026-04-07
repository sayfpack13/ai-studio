import { useState } from "react";
import { motion } from "framer-motion";

export function Tabs({ defaultValue, children, className = "" }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={className}>
      {children({ value, setValue })}
    </div>
  );
}

export function TabsList({ children, className = "" }) {
  return (
    <div
      className={`
        inline-flex items-center gap-1 p-1
        bg-gray-800 rounded-lg
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, currentValue, onClick, children }) {
  const isActive = value === currentValue;

  return (
    <button
      onClick={() => onClick(value)}
      className={`
        relative px-4 py-2 text-sm font-medium rounded-md
        transition-colors duration-200
        ${isActive ? "text-white" : "text-gray-400 hover:text-gray-200"}
      `}
    >
      {isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-gray-700 rounded-md"
          transition={{ type: "spring", duration: 0.3 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function TabsContent({ value, currentValue, children, className = "" }) {
  if (value !== currentValue) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
