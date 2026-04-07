import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  ExternalLink,
} from "lucide-react";
import { useJobs } from "../context/JobContext";

const TYPE_ROUTES = {
  image: "/image",
  video: "/video",
  music: "/music",
};

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

const TABS = [
  { id: "in-progress", label: "In Progress", statuses: ["running", "pending"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "failed", label: "Failed", statuses: ["failed", "cancelled"] },
];

function JobItem({ job, onCancel, onRetry, onRemove, onClick }) {
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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`p-3 rounded-lg border border-gray-700 ${config.bg} cursor-pointer hover:border-gray-600 transition-colors group`}
      onClick={() => onClick?.(job)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
          <TypeIcon className="w-4 h-4 text-gray-400" />
        </div>

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
            <ExternalLink className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
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

        <div className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {(job.status === "running" || job.status === "pending") && (
            <button
              onClick={() => onCancel(job.id)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title={job.status === "running" ? "Stop" : "Cancel"}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {job.status === "failed" && !job.isServerJob && (
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
  const navigate = useNavigate();
  const {
    jobs,
    cancelJob,
    retryJob,
    removeJob,
    clearCompleted,
    getActiveJobs,
    getPendingJobs,
    sidebarOpen,
    setSidebarOpen,
    setSelectedJob,
  } = useJobs();

  const [activeTab, setActiveTab] = useState("in-progress");

  const activeJobs = getActiveJobs();
  const pendingJobs = getPendingJobs();
  const activeCount = activeJobs.length + pendingJobs.length;

  // Count jobs per tab
  const tabCounts = TABS.reduce((acc, tab) => {
    acc[tab.id] = jobs.filter((j) => tab.statuses.includes(j.status)).length;
    return acc;
  }, {});

  // Filter jobs by active tab
  const filteredJobs = jobs.filter((job) =>
    TABS.find((t) => t.id === activeTab)?.statuses.includes(job.status)
  );

  // Track if user manually closed the sidebar
  const userClosedRef = useRef(false);

  // Reset manual close flag when no active jobs
  useEffect(() => {
    if (activeCount === 0) {
      userClosedRef.current = false;
    }
  }, [activeCount]);

  // Auto-open sidebar when jobs start running (only if user hasn't manually closed)
  useEffect(() => {
    if (activeCount > 0 && !sidebarOpen && !userClosedRef.current) {
      setSidebarOpen(true);
    }
  }, [activeCount, sidebarOpen, setSidebarOpen]);

  // Handle manual close
  const handleClose = () => {
    userClosedRef.current = true;
    setSidebarOpen(false);
  };

  // Handle job click - navigate to generator page
  const handleJobClick = (job) => {
    const route = TYPE_ROUTES[job.type];
    if (route) {
      userClosedRef.current = true; // Prevent sidebar from reopening
      setSelectedJob(job);
      setSidebarOpen(false);
      navigate(route);
    }
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-200">Jobs</h3>
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full animate-pulse">
                    {activeCount} active
                  </span>
                )}
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2.5 px-2 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? "text-white"
                      : "text-gray-400 hover:text-gray-300"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {tab.label}
                    {tabCounts[tab.id] > 0 && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          activeTab === tab.id
                            ? "bg-gray-600 text-gray-200"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {tabCounts[tab.id]}
                      </span>
                    )}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Clear button - only show for completed/failed tabs */}
            {(activeTab === "completed" || activeTab === "failed") &&
              tabCounts[activeTab] > 0 && (
                <div className="px-4 py-2 border-b border-gray-700">
                  <button
                    onClick={clearCompleted}
                    className="w-full py-2 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                  >
                    Clear {activeTab === "completed" ? "completed" : "failed & cancelled"}
                  </button>
                </div>
              )}

            {/* Jobs List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredJobs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {activeTab === "in-progress"
                      ? "No jobs in progress"
                      : activeTab === "completed"
                      ? "No completed jobs"
                      : "No failed jobs"}
                  </p>
                  {activeTab === "in-progress" && (
                    <p className="text-xs mt-1">Generate something to see jobs here</p>
                  )}
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredJobs
                    .sort((a, b) => {
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
                        onClick={handleJobClick}
                      />
                    ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
