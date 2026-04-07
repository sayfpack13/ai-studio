import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  X,
  RefreshCw,
  Trash2,
  Image,
  Video,
  Music,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useJobs } from "../context/JobContext";

const TYPE_ICONS = {
  image: Image,
  video: Video,
  music: Music,
};

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: "text-gray-400",
    bg: "bg-gray-700/50",
    label: "Pending",
  },
  running: {
    icon: Loader2,
    color: "text-blue-400",
    bg: "bg-blue-900/30",
    label: "Running",
    animate: true,
  },
  completed: {
    icon: CheckCircle,
    color: "text-green-400",
    bg: "bg-green-900/30",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-900/30",
    label: "Failed",
  },
  cancelled: {
    icon: XCircle,
    color: "text-gray-500",
    bg: "bg-gray-800/50",
    label: "Cancelled",
  },
};

function JobItem({ job, onCancel, onRetry, onRemove }) {
  const config = STATUS_CONFIG[job.status];
  const Icon = config.icon;
  const TypeIcon = TYPE_ICONS[job.type] || Image;

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={`p-3 rounded-lg border border-gray-700 ${config.bg}`}
    >
      <div className="flex items-start gap-3">
        {/* Type Icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
          <TypeIcon className="w-4 h-4 text-gray-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon
              className={`w-4 h-4 ${config.color} ${
                config.animate ? "animate-spin" : ""
              }`}
            />
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
            {job.progress > 0 && job.status === "running" && (
              <span className="text-xs text-gray-500">{job.progress}%</span>
            )}
          </div>

          <p className="text-sm text-gray-200 truncate mb-1">
            {job.prompt || "No prompt"}
          </p>

          <p className="text-xs text-gray-500 truncate">
            {job.model || "Unknown model"}
          </p>

          {job.status === "failed" && job.error && (
            <p className="text-xs text-red-400 mt-1 truncate">{job.error}</p>
          )}

          {job.status === "completed" && job.completedAt && (
            <p className="text-xs text-gray-500 mt-1">
              {formatTime(job.completedAt)}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {job.status === "running" && (
            <button
              onClick={() => onCancel(job.id)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {job.status === "failed" && (
            <button
              onClick={() => onRetry(job.id)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Retry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {(job.status === "completed" ||
            job.status === "failed" ||
            job.status === "cancelled") && (
            <button
              onClick={() => onRemove(job.id)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function JobsPanel() {
  const {
    jobs,
    cancelJob,
    retryJob,
    removeJob,
    clearCompleted,
    getActiveJobs,
    getPendingJobs,
  } = useJobs();

  const [isExpanded, setIsExpanded] = useState(false);

  const activeJobs = getActiveJobs();
  const pendingJobs = getPendingJobs();
  const activeCount = activeJobs.length + pendingJobs.length;

  // Auto-expand when jobs start running
  useEffect(() => {
    if (activeCount > 0 && !isExpanded) {
      setIsExpanded(true);
    }
  }, [activeCount, isExpanded]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 20, height: 0 }}
            className="w-80 max-h-96 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-200">Jobs</h3>
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                    {activeCount} active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {jobs.some((j) => j.status === "completed" || j.status === "failed" || j.status === "cancelled") && (
                  <button
                    onClick={clearCompleted}
                    className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Jobs List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No jobs in queue
                </div>
              ) : (
                jobs
                  .sort((a, b) => {
                    // Running first, then pending, then completed/failed
                    const order = { running: 0, pending: 1, completed: 2, failed: 3, cancelled: 4 };
                    return (order[a.status] || 5) - (order[b.status] || 5);
                  })
                  .map((job) => (
                    <JobItem
                      key={job.id}
                      job={job}
                      onCancel={cancelJob}
                      onRetry={retryJob}
                      onRemove={removeJob}
                    />
                  ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-xl shadow-lg hover:bg-gray-800 transition-colors"
          >
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">Jobs</span>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full animate-pulse">
                {activeCount}
              </span>
            )}
            <ChevronUp className="w-4 h-4 text-gray-500" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
