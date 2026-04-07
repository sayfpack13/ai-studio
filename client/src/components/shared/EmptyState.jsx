import { motion } from "framer-motion";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  className = "",
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        flex flex-col items-center justify-center py-12 px-4
        ${className}
      `}
    >
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      {title && (
        <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-gray-400 text-center max-w-sm mb-4">{description}</p>
      )}
      {action && actionLabel && (
        <button
          onClick={action}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        flex flex-col items-center justify-center py-12 px-4
        ${className}
      `}
    >
      <div className="w-16 h-16 rounded-2xl bg-red-600/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      {message && (
        <p className="text-gray-400 text-center max-w-sm mb-4">{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      )}
    </motion.div>
  );
}
