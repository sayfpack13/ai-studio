/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { generateImage, generateVideo, generateMusic } from "../services/api";

const JobContext = createContext();

const JOBS_STORAGE_KEY = "blackbox_ai_jobs";
const MAX_COMPLETED_JOBS = 50;
const COMPLETED_JOB_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

// Helper to save to localStorage
const saveJobsToStorage = (jobs) => {
  try {
    // Keep only recent completed jobs
    const trimmedJobs = jobs.slice(-MAX_COMPLETED_JOBS);
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(trimmedJobs));
  } catch (error) {
    console.error("Failed to save jobs to localStorage:", error);
  }
};

export function JobProvider({ children }) {
  const [jobs, setJobs] = useState(() => loadJobsFromStorage());
  const processingRef = useRef(false);
  const abortControllersRef = useRef({});

  // Persist jobs to localStorage
  useEffect(() => {
    saveJobsToStorage(jobs);
  }, [jobs]);

  // Get jobs by status
  const getActiveJobs = useCallback(() => {
    return jobs.filter((job) => job.status === "running");
  }, [jobs]);

  const getPendingJobs = useCallback(() => {
    return jobs.filter((job) => job.status === "pending");
  }, [jobs]);

  const getCompletedJobs = useCallback(() => {
    return jobs.filter((job) => job.status === "completed" || job.status === "failed");
  }, [jobs]);

  const getJobsByType = useCallback(
    (type) => {
      return jobs.filter((job) => job.type === type);
    },
    [jobs]
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

  // Cancel a job
  const cancelJob = useCallback((jobId) => {
    // Abort if running
    if (abortControllersRef.current[jobId]) {
      abortControllersRef.current[jobId].abort();
      delete abortControllersRef.current[jobId];
    }
    
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? { ...job, status: "cancelled", completedAt: Date.now() }
          : job
      )
    );
  }, []);

  // Retry a failed job
  const retryJob = useCallback((jobId) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? { ...job, status: "pending", error: null, progress: 0 }
          : job
      )
    );
  }, []);

  // Clear completed jobs
  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((job) => job.status !== "completed" && job.status !== "failed" && job.status !== "cancelled"));
  }, []);

  // Remove a specific job
  const removeJob = useCallback((jobId) => {
    if (abortControllersRef.current[jobId]) {
      abortControllersRef.current[jobId].abort();
      delete abortControllersRef.current[jobId];
    }
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
  }, []);

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

  // Job processor loop
  const processQueue = useCallback(
    async (saveImage, saveVideo, saveMusic) => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        while (true) {
          // Get next pending job
          const pendingJobs = jobs.filter((job) => job.status === "pending");
          if (pendingJobs.length === 0) break;

          const job = pendingJobs[0];

          // Get the appropriate save function
          let saveResult;
          if (job.type === "image") {
            saveResult = (data) => saveImage(job.params.imageId, job.params.prompt, data, job.params.model, job.params.metadata);
          } else if (job.type === "video") {
            saveResult = (data) => saveVideo(job.params.videoId, job.params.prompt, data, job.params.model);
          } else if (job.type === "music") {
            saveResult = (data) => saveMusic(job.params.musicId, job.params.prompt, data, job.params.model);
          }

          const outcome = await processJob(job, saveResult);

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
        }
      } finally {
        processingRef.current = false;
      }
    },
    [jobs, processJob, updateJob]
  );

  // Auto-process pending jobs
  useEffect(() => {
    const pendingJobs = jobs.filter((job) => job.status === "pending");
    if (pendingJobs.length === 0 || processingRef.current) return;

    const processNextJob = async () => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        const job = jobs.find((j) => j.status === "pending");
        if (!job) return;

        const outcome = await processJob(job, job.onSave);

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
      } finally {
        processingRef.current = false;
      }
    };

    processNextJob();
  }, [jobs, processJob, updateJob]);

  const value = {
    jobs,
    enqueueJob,
    cancelJob,
    retryJob,
    removeJob,
    clearCompleted,
    getActiveJobs,
    getPendingJobs,
    getCompletedJobs,
    getJobsByType,
    updateJob,
    processQueue,
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
