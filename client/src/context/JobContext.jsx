/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { generateImage, generateVideo, generateMusic, getJobs, cancelServerJob, deleteServerJob, clearServerJobs } from "../services/api";

const JobContext = createContext();

const JOBS_STORAGE_KEY = "blackbox_ai_jobs";
const MAX_COMPLETED_JOBS = 50; // Reduced from 200 to prevent quota issues
const COMPLETED_JOB_TTL = 24 * 60 * 60 * 1000; // Reduced to 1 day

// Helper to load from localStorage
const loadJobsFromStorage = () => {
  try {
    const stored = localStorage.getItem(JOBS_STORAGE_KEY);
    if (!stored) return [];
    const jobs = JSON.parse(stored);
    // Filter out old completed jobs
    const now = Date.now();
    return jobs.filter(
      (job) =>
        job.status !== "completed" ||
        now - (job.completedAt || 0) < COMPLETED_JOB_TTL
    );
  } catch {
    return [];
  }
};

// Helper to save to localStorage with quota handling
const saveJobsToStorage = (jobs) => {
  try {
    // Strip any large data from jobs
    const cleaned = jobs.map(job => {
      const { params, ...rest } = job;
      // Don't store full params (may contain base64 data)
      return {
        ...rest,
        params: params ? {
          prompt: params.prompt,
          model: params.model,
          imageId: params.imageId,
          videoId: params.videoId,
          musicId: params.musicId,
        } : undefined,
      };
    });
    
    const trimmedJobs = cleaned.slice(-MAX_COMPLETED_JOBS);
    const serialized = JSON.stringify(trimmedJobs);
    
    // Check size before saving
    if (serialized.length > 500000) { // 500KB limit
      console.warn("Jobs data too large, clearing old jobs");
      localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(trimmedJobs.slice(-20)));
      return;
    }
    
    localStorage.setItem(JOBS_STORAGE_KEY, serialized);
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      console.warn("localStorage quota exceeded for jobs, clearing...");
      // Clear and save only essential data
      try {
        localStorage.removeItem(JOBS_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }
};

const MAX_CONCURRENT_JOBS = 3;

// Map server status to client status
const mapServerStatus = (status) => {
  const statusMap = {
    queued: "pending",
    processing: "running",
    completed: "completed",
    failed: "failed",
    canceled: "cancelled",
  };
  return statusMap[status] || status;
};

// Convert server job to client job format
const serverJobToClient = (serverJob) => ({
  id: serverJob.id,
  type: serverJob.type,
  status: mapServerStatus(serverJob.status),
  prompt: serverJob.metadata?.promptPreview || serverJob.payload?.prompt || "",
  model: serverJob.metadata?.model || "",
  progress: serverJob.progress || 0,
  createdAt: new Date(serverJob.createdAt).getTime(),
  completedAt: serverJob.completedAt ? new Date(serverJob.completedAt).getTime() : null,
  error: serverJob.error?.message || serverJob.error || null,
  result: serverJob.result || null,
  params: serverJob.payload || {},
  isServerJob: true,
});

export function JobProvider({ children}) {
  const [jobs, setJobs] = useState(() => {
    const loaded = loadJobsFromStorage();
    // Reset any stuck running jobs to pending on load
    // Also clear old "connection lost" errors from previous bug
    return loaded
      .map(job => {
        if (job.status === "running") {
          return { ...job, status: "pending", progress: 0 };
        }
        // Clear the old "Connection lost" error message from previous bug
        if (job.status === "failed" && job.error === "Connection lost - job interrupted") {
          return { ...job, status: "pending", error: null, progress: 0 };
        }
        return job;
      })
      .filter(job => {
        // Filter out jobs that are too old and still pending (stale jobs)
        const MAX_PENDING_AGE_MS = 5 * 60 * 1000; // 5 minutes
        if (job.status === "pending" && Date.now() - job.createdAt > MAX_PENDING_AGE_MS) {
          return false;
        }
        return true;
      });
  });
  const [serverJobs, setServerJobs] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const activeJobIdsRef = useRef(new Set());
  const abortControllersRef = useRef({});
  const processingRef = useRef(false);
  const saveFnsRef = useRef({ image: null, video: null, music: null });

  const registerSaveFns = useCallback((type, fn) => {
    saveFnsRef.current[type] = fn;
  }, []);

  // Persist jobs to localStorage
  useEffect(() => {
    const serializable = jobs.map(({ onSave, ...rest }) => rest);
    saveJobsToStorage(serializable);
  }, [jobs]);

  // Fetch server jobs on mount and periodically
  useEffect(() => {
    const fetchServerJobs = async () => {
      try {
        const result = await getJobs({ limit: 100 });
        if (result.success && result.items) {
          setServerJobs(result.items.map(serverJobToClient));
        }
      } catch (error) {
        console.error("Failed to fetch server jobs:", error);
      }
    };

    fetchServerJobs();
    const interval = setInterval(fetchServerJobs, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Get jobs by status
  const getActiveJobs = useCallback(() => {
    const localActive = jobs.filter((job) => job.status === "running");
    const serverActive = serverJobs.filter(
      (job) => job.status === "running" || job.status === "pending"
    );
    // Merge, preferring local jobs for duplicates
    const merged = [...localActive, ...serverActive.filter(j => !jobs.some(l => l.id === j.id))];
    return merged;
  }, [jobs, serverJobs]);

  const getPendingJobs = useCallback(() => {
    const localPending = jobs.filter((job) => job.status === "pending");
    const serverPending = serverJobs.filter((job) => job.status === "pending");
    return [...localPending, ...serverPending.filter(j => !jobs.some(l => l.id === j.id))];
  }, [jobs, serverJobs]);

  const getCompletedJobs = useCallback(() => {
    const localCompleted = jobs.filter(
      (job) => job.status === "completed" || job.status === "failed" || job.status === "cancelled"
    );
    const serverCompleted = serverJobs.filter(
      (job) => job.status === "completed" || job.status === "failed" || job.status === "cancelled"
    );
    // Merge, avoiding duplicates
    const merged = [...localCompleted];
    for (const sj of serverCompleted) {
      if (!merged.some(lj => lj.id === sj.id)) {
        merged.push(sj);
      }
    }
    // Sort by completedAt descending
    return merged.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }, [jobs, serverJobs]);

  const getJobsByType = useCallback(
    (type) => {
      const local = jobs.filter((job) => job.type === type);
      const server = serverJobs.filter((job) => job.type === type);
      // Merge, avoiding duplicates
      const merged = [...local];
      for (const sj of server) {
        if (!merged.some(lj => lj.id === sj.id)) {
          merged.push(sj);
        }
      }
      return merged;
    },
    [jobs, serverJobs]
  );

  // Enqueue a new job
  const enqueueJob = useCallback((type, params, onSave) => {
    const job = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      status: "pending",
      params,
      prompt: params.prompt || "",
      model: params.model || "",
      createdAt: Date.now(),
      progress: 0,
      onSave,
    };

    setJobs((prev) => [...prev, job]);
    return job.id;
  }, []);

  // Update job status
  const updateJob = useCallback((jobId, updates) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, ...updates } : job
      )
    );
  }, []);

  // Cancel a job (works for both local and server jobs)
  const cancelJob = useCallback(async (jobId) => {
    // Check if it's a local job
    const localJob = jobs.find(j => j.id === jobId);
    
    if (localJob) {
      // Abort if running
      if (abortControllersRef.current[jobId]) {
        abortControllersRef.current[jobId].abort();
        delete abortControllersRef.current[jobId];
      }
      activeJobIdsRef.current.delete(jobId);

      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, status: "cancelled", completedAt: Date.now() }
            : job
        )
      );
    }

    // Check if it's a server job
    const serverJob = serverJobs.find(j => j.id === jobId);
    if (serverJob && (serverJob.status === "running" || serverJob.status === "pending")) {
      try {
        await cancelServerJob(jobId);
        // Update local server jobs state
        setServerJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? { ...job, status: "cancelled", completedAt: Date.now() }
              : job
          )
        );
      } catch (error) {
        console.error("Failed to cancel server job:", error);
      }
    }
  }, [jobs, serverJobs]);

  // Cancel all jobs of a specific type
  const cancelAllJobsByType = useCallback(async (type) => {
    const localJobsOfType = jobs.filter(
      (job) => job.type === type && (job.status === "running" || job.status === "pending")
    );
    const serverJobsOfType = serverJobs.filter(
      (job) => job.type === type && (job.status === "running" || job.status === "pending")
    );

    // Cancel local jobs
    localJobsOfType.forEach((job) => {
      if (abortControllersRef.current[job.id]) {
        abortControllersRef.current[job.id].abort();
        delete abortControllersRef.current[job.id];
      }
      activeJobIdsRef.current.delete(job.id);
    });

    setJobs((prev) =>
      prev.map((job) =>
        job.type === type && (job.status === "running" || job.status === "pending")
          ? { ...job, status: "cancelled", completedAt: Date.now() }
          : job
      )
    );

    // Cancel server jobs
    for (const job of serverJobsOfType) {
      try {
        await cancelServerJob(job.id);
      } catch (error) {
        console.error("Failed to cancel server job:", error);
      }
    }
    setServerJobs((prev) =>
      prev.map((job) =>
        job.type === type && (job.status === "running" || job.status === "pending")
          ? { ...job, status: "cancelled", completedAt: Date.now() }
          : job
      )
    );
  }, [jobs, serverJobs]);

  // Retry a failed job (only works for local jobs)
  const retryJob = useCallback((jobId) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? { ...job, status: "pending", error: null, progress: 0 }
          : job
      )
    );
  }, []);

  // Clear completed jobs (both local and server)
  const clearCompleted = useCallback(async () => {
    // Clear from server
    try {
      await clearServerJobs();
    } catch (error) {
      console.error("Failed to clear server jobs:", error);
    }

    // Clear from local state
    setJobs((prev) =>
      prev.filter(
        (job) =>
          job.status !== "completed" &&
          job.status !== "failed" &&
          job.status !== "cancelled"
      )
    );
    setServerJobs((prev) =>
      prev.filter(
        (job) =>
          job.status !== "completed" &&
          job.status !== "failed" &&
          job.status !== "cancelled"
      )
    );
  }, []);

  // Remove a specific job (works for both local and server jobs)
  const removeJob = useCallback(async (jobId) => {
    // Abort if running
    if (abortControllersRef.current[jobId]) {
      abortControllersRef.current[jobId].abort();
      delete abortControllersRef.current[jobId];
    }
    activeJobIdsRef.current.delete(jobId);

    // Check if it's a server job and delete from server
    const serverJob = serverJobs.find(j => j.id === jobId);
    if (serverJob) {
      try {
        await deleteServerJob(jobId);
      } catch (error) {
        console.error("Failed to delete server job:", error);
      }
    }

    // Remove from local jobs
    setJobs((prev) => prev.filter((job) => job.id !== jobId));

    // Remove from server jobs
    setServerJobs((prev) => prev.filter((job) => job.id !== jobId));
  }, [serverJobs]);

  // Process a single job
  const processJob = useCallback(async (job, saveResult) => {
    const controller = new AbortController();
    abortControllersRef.current[job.id] = controller;

    try {
      updateJob(job.id, { status: "running", progress: 10 });

      let result;
      const { type, params } = job;

      if (type === "image") {
        result = await generateImage(params.prompt, params.model, {
          ...params.options,
          signal: controller.signal,
        });
      } else if (type === "video") {
        result = await generateVideo(params.prompt, params.model, {
          ...params.options,
          signal: controller.signal,
        });
      } else if (type === "music") {
        result = await generateMusic(params.prompt, params.model, {
          ...params.options,
          signal: controller.signal,
        });
      }

      if (controller.signal.aborted) {
        return { cancelled: true };
      }

      if (result.error) {
        return { error: result.error };
      }

      // Extract result data
      let resultData;
      if (type === "image") {
        resultData = {
          url: result.data?.[0]?.url || result.image || result.url,
          revisedPrompt: result.data?.[0]?.revised_prompt || params.prompt,
        };
      } else if (type === "video") {
        resultData = {
          url: result.data?.[0]?.url || result.video || result.url,
          id: result.id,
        };
      } else if (type === "music") {
        resultData = {
          url: result.data?.[0]?.url || result.url || result.audio,
        };
      }

      // Save to history
      if (resultData?.url && saveResult) {
        await saveResult(resultData);
      }

      return { result: resultData };
    } catch (err) {
      if (err?.name === "AbortError") {
        return { cancelled: true };
      }
      return { error: err.message || "Generation failed" };
    } finally {
      delete abortControllersRef.current[job.id];
    }
  }, [updateJob]);

  // Auto-process pending jobs with parallel execution
  useEffect(() => {
    const pendingJobs = jobs.filter((job) => job.status === "pending");
    const activeCount = activeJobIdsRef.current.size;

    if (pendingJobs.length === 0 || activeCount >= MAX_CONCURRENT_JOBS) return;

    const jobsToStart = pendingJobs.slice(0, MAX_CONCURRENT_JOBS - activeCount);
    const now = Date.now();
    const MAX_JOB_AGE_MS = 5 * 60 * 1000; // 5 minutes

    jobsToStart.forEach((job) => {
      if (activeJobIdsRef.current.has(job.id)) return;

      // Skip jobs that are too old (likely stale from a page refresh)
      // They will be marked as failed in the next poll
      if (now - job.createdAt > MAX_JOB_AGE_MS) {
        updateJob(job.id, {
          status: "failed",
          error: "Job timed out - refresh page to generate again",
          completedAt: now
        });
        return;
      }

      activeJobIdsRef.current.add(job.id);

      // Build saveResult from registered save functions (works after page reload)
      let saveResult = job.onSave || null;
      if (!saveResult) {
        const saveFn = saveFnsRef.current[job.type];
        if (saveFn) {
          if (job.type === "image") {
            saveResult = (data) =>
              saveFn(
                job.params.imageId,
                job.params.prompt,
                data,
                job.params.model,
                job.params.metadata
              );
          } else if (job.type === "video") {
            saveResult = (data) =>
              saveFn(
                job.params.videoId,
                job.params.prompt,
                data,
                job.params.model
              );
          } else if (job.type === "music") {
            saveResult = (data) =>
              saveFn(
                job.params.musicId,
                job.params.prompt,
                data,
                job.params.model
              );
          }
        }
      }

      // Process job asynchronously
      processJob(job, saveResult).then((outcome) => {
        activeJobIdsRef.current.delete(job.id);

        if (outcome.cancelled) {
          updateJob(job.id, { status: "cancelled", completedAt: Date.now() });
        } else if (outcome.error) {
          updateJob(job.id, {
            status: "failed",
            error: outcome.error,
            completedAt: Date.now(),
          });
        } else {
          updateJob(job.id, {
            status: "completed",
            result: outcome.result,
            progress: 100,
            completedAt: Date.now(),
          });
        }
      });
    });
  }, [jobs, processJob, updateJob]);

  // Combined jobs list for display
  const allJobs = [...jobs];
  for (const sj of serverJobs) {
    if (!allJobs.some(lj => lj.id === sj.id)) {
      allJobs.push(sj);
    }
  }

  const value = {
    jobs: allJobs,
    enqueueJob,
    cancelJob,
    cancelAllJobsByType,
    retryJob,
    removeJob,
    clearCompleted,
    getActiveJobs,
    getPendingJobs,
    getCompletedJobs,
    getJobsByType,
    updateJob,
    registerSaveFns,
    sidebarOpen,
    setSidebarOpen,
    selectedJob,
    setSelectedJob,
    maxConcurrentJobs: MAX_CONCURRENT_JOBS,
  };

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useJobs() {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error("useJobs must be used within JobProvider");
  }
  return context;
}
