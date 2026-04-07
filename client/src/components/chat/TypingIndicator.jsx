import { motion } from "framer-motion";

export default function TypingIndicator({ className = "" }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-gray-400 rounded-full"
          animate={{
            y: [0, -6, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function StreamingDots({ className = "" }) {
  return (
    <motion.div
      className={`inline-flex items-center gap-0.5 ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.span
        className="w-1.5 h-1.5 bg-blue-400 rounded-full"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: 0 }}
      />
      <motion.span
        className="w-1.5 h-1.5 bg-blue-400 rounded-full"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: 0.15 }}
      />
      <motion.span
        className="w-1.5 h-1.5 bg-blue-400 rounded-full"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: 0.3 }}
      />
    </motion.div>
  );
}
