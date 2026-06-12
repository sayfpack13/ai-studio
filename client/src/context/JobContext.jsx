/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  generateImage,
  generateVideo,
  generateMusic,
  streamGenerateRemix,
  getJobs,
  cancelServerJob,
  deleteServerJob,
  clearServerJobs,
} from "../services/api";
import { useApp } from "./AppContext";

const JobContext = createContext();

const JOBS_STORAGE_KEY = "blackbox_ai_jobs";
const MAX_COMPLETED_JOBS = 50; // Reduced from 200 to prevent quota issues
const COMPLETED_JOB_TTL = 24 * 60 * 60 * 1000; // 1 day for completed
const FAILED_JOB_TTL = 5 * 60 * 1000; // 5 minutes for failed (don't show old errors)
/** Running/pending jobs older than this are marked failed (page refresh, dropped SSE, etc.) */
const STALE_RUNNING_JOB_TTL = 12 * 60 * 1000;

function normalizeStaleRunningJob(job, now = Date.now()) {
  if (job.status !== "running" && job.status !== "pending") return job;
  const startedAt = job.createdAt || 0;
  if (now - startedAt < STALE_RUNNING_JOB_TTL) return job;
  return {
    ...job,
    status: "failed",
    error: job.error || "Generation timed out or was interrupted. Please retry.",
    completedAt: now,
    message: undefined,
  };
}

// Helper to load from localStorage
const loadJobsFromStorage = () => {
  try {
    const stored = localStorage.getItem(JOBS_STORAGE_KEY);
    if (!stored) return [];
    const jobs = JSON.parse(stored);
    // Filter out old jobs based on status
    const now = Date.now();
    return jobs
      .map((job) => normalizeStaleRunningJob(job, now))
      .filter((job) => {
      if (job.status === "failed") {
        return now - (job.completedAt || 0) < FAILED_JOB_TTL;
      }
      if (job.status === "completed") {
        return now - (job.completedAt || 0) < COMPLETED_JOB_TTL;
      }
      return true; // Keep pending/running jobs
    });
  } catch {
    return [];
  }
};

// Helper to save to localStorage with quota handling
const saveJobsToStorage = (jobs) => {
  try {
    // Strip any large data from jobs
    const cleaned = jobs.map((job) => {
      const { params, ...rest } = job;
      // Don't store full params (may contain base64 data)
      return {
        ...rest,
        params: params
          ? {
              prompt: params.prompt,
              model: params.model,
              imageId: params.imageId,
              videoId: params.videoId,
              musicId: params.musicId,
              remixHistoryId: params.remixHistoryId,
              remixMetadata: params.remixMetadata,
            }
          : undefined,
      };
    });

    const trimmedJobs = cleaned.slice(-MAX_COMPLETED_JOBS);
    const serialized = JSON.stringify(trimmedJobs);

    // Check size before saving
    if (serialized.length > 500000) {
      // 500KB limit
      console.warn("Jobs data too large, clearing old jobs");
      localStorage.setItem(
        JOBS_STORAGE_KEY,
        JSON.stringify(trimmedJobs.slice(-20)),
      );
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
  completedAt: serverJob.completedAt
    ? new Date(serverJob.completedAt).getTime()
    : null,
  error: serverJob.error?.message || serverJob.error || null,
  result: serverJob.result || null,
  params: serverJob.payload || {},
  isServerJob: true,
});

export function JobProvider({ children }) {
  const { saveRemix, refreshLibraryAssets } = useApp();
  const [jobs, setJobs] = useState(() => loadJobsFromStorage());
  const [serverJobs, setServerJobs] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const activeJobIdsRef = useRef(new Set());
  const abortControllersRef = useRef({});
  const saveFnsRef = useRef({ image: null, video: null, music: null, remix: null });
  const saveRemixRef = useRef(saveRemix);
  const refreshLibraryRef = useRef(refreshLibraryAssets);

  useEffect(() => {
    saveRemixRef.current = saveRemix;
  }, [saveRemix]);

  useEffect(() => {
    refreshLibraryRef.current = refreshLibraryAssets;
  }, [refreshLibraryAssets]);

  // Register remix save before job auto-process runs (avoids race on first paint)
  useEffect(() => {
    saveFnsRef.current.remix = (remixHistoryId, prompt, result, model, metadata) => {
      saveRemixRef.current?.(remixHistoryId, prompt, result, model, metadata);
    };
  }, []);

  const registerSaveFns = useCallback((type, fn) => {
    saveFnsRef.current[type] = fn;
  }, []);

  /** Register an external abort handler (e.g. remix SSE stream). */
  const registerJobAbort = useCallback((jobId, abortFn) => {
    if (!jobId || typeof abortFn !== "function") return;
    abortControllersRef.current[jobId] = { abort: abortFn };
  }, []);

  // Persist jobs to localStorage
  useEffect(() => {
    const serializable = jobs.map((job) => {
      const copy = { ...job };
      delete copy.onSave;
      return copy;
    });
    saveJobsToStorage(serializable);
  }, [jobs]);

  // Mark orphaned running jobs as failed (refresh mid-generation, lost SSE, etc.)
  useEffect(() => {
    const reconcile = () => {
      const now = Date.now();
      setJobs((prev) => {
        let changed = false;
        const next = prev.map((job) => {
          const normalized = normalizeStaleRunningJob(job, now);
          if (normalized !== job) changed = true;
          return normalized;
        });
        return changed ? next : prev;
      });
    };
    reconcile();
    const interval = setInterval(reconcile, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch server jobs on mount and periodically (adaptive polling)
  const hasActiveLocalJobs = jobs.some(
    (j) => j.status === "running" || j.status === "pending",
  );
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
    const pollInterval = hasActiveLocalJobs ? 5000 : 30000;
    const interval = setInterval(fetchServerJobs, pollInterval);
    return () => clearInterval(interval);
  }, [hasActiveLocalJobs]);

  // Get jobs by status
  const getActiveJobs = useCallback(() => {
    const localActive = jobs.filter((job) => job.status === "running");
    const serverActive = serverJobs.filter(
      (job) => job.status === "running" || job.status === "pending",
    );
    // Merge, preferring local jobs for duplicates
    const merged = [
      ...localActive,
      ...serverActive.filter((j) => !jobs.some((l) => l.id === j.id)),
    ];
    return merged;
  }, [jobs, serverJobs]);

  const getPendingJobs = useCallback(() => {
    const localPending = jobs.filter((job) => job.status === "pending");
    const serverPending = serverJobs.filter((job) => job.status === "pending");
    return [
      ...localPending,
      ...serverPending.filter((j) => !jobs.some((l) => l.id === j.id)),
    ];
  }, [jobs, serverJobs]);

  const getCompletedJobs = useCallback(() => {
    const localCompleted = jobs.filter(
      (job) =>
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled",
    );
    const serverCompleted = serverJobs.filter(
      (job) =>
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled",
    );
    // Merge, avoiding duplicates
    const merged = [...localCompleted];
    for (const sj of serverCompleted) {
      if (!merged.some((lj) => lj.id === sj.id)) {
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
        if (!merged.some((lj) => lj.id === sj.id)) {
          merged.push(sj);
        }
      }
      return merged;
    },
    [jobs, serverJobs],
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
      prev.map((job) => (job.id === jobId ? { ...job, ...updates } : job)),
    );
  }, []);

  // Cancel a job (works for both local and server jobs)
  const cancelJob = useCallback(
    async (jobId) => {
      // Check if it's a local job
      const localJob = jobs.find((j) => j.id === jobId);

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
              : job,
          ),
        );
      }

      // Check if it's a server job
      const serverJob = serverJobs.find((j) => j.id === jobId);
      if (
        serverJob &&
        (serverJob.status === "running" || serverJob.status === "pending")
      ) {
        try {
          await cancelServerJob(jobId);
          // Update local server jobs state
          setServerJobs((prev) =>
            prev.map((job) =>
              job.id === jobId
                ? { ...job, status: "cancelled", completedAt: Date.now() }
                : job,
            ),
          );
        } catch (error) {
          console.error("Failed to cancel server job:", error);
        }
      }
    },
    [jobs, serverJobs],
  );

  // Cancel all jobs of a specific type
  const cancelAllJobsByType = useCallback(
    async (type) => {
      const localJobsOfType = jobs.filter(
        (job) =>
          job.type === type &&
          (job.status === "running" || job.status === "pending"),
      );
      const serverJobsOfType = serverJobs.filter(
        (job) =>
          job.type === type &&
          (job.status === "running" || job.status === "pending"),
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
          job.type === type &&
          (job.status === "running" || job.status === "pending")
            ? { ...job, status: "cancelled", completedAt: Date.now() }
            : job,
        ),
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
          job.type === type &&
          (job.status === "running" || job.status === "pending")
            ? { ...job, status: "cancelled", completedAt: Date.now() }
            : job,
        ),
      );
    },
    [jobs, serverJobs],
  );

  // Retry a failed job (only works for local jobs)
  const retryJob = useCallback((jobId) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? { ...job, status: "pending", error: null, progress: 0 }
          : job,
      ),
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
          job.status !== "cancelled",
      ),
    );
    setServerJobs((prev) =>
      prev.filter(
        (job) =>
          job.status !== "completed" &&
          job.status !== "failed" &&
          job.status !== "cancelled",
      ),
    );
  }, []);

  // Remove a specific job (works for both local and server jobs)
  const removeJob = useCallback(
    async (jobId) => {
      // Abort if running
      if (abortControllersRef.current[jobId]) {
        abortControllersRef.current[jobId].abort();
        delete abortControllersRef.current[jobId];
      }
      activeJobIdsRef.current.delete(jobId);

      // Check if it's a server job and delete from server
      const serverJob = serverJobs.find((j) => j.id === jobId);
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
    },
    [serverJobs],
  );

  // Process a single job
  const processJob = useCallback(
    async (job, saveResult) => {
      const controller = new AbortController();
      if (job.type !== "remix") {
        abortControllersRef.current[job.id] = controller;
      }

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
        } else if (type === "remix") {
          if (!params.streamPayload) {
            return { error: "Remix payload missing — please start again from the remix page." };
          }

          const resultData = await new Promise((resolve, reject) => {
            let settled = false;
            let pendingMeta = null;

            const finish = (url) => {
              if (settled) return;
              settled = true;
              resolve({
                url,
                title: pendingMeta?.title,
                tags: pendingMeta?.tags,
                lyrics: pendingMeta?.lyrics,
                thumbnail: pendingMeta?.thumbnail,
              });
            };

            const abortStream = streamGenerateRemix(params.streamPayload, {
              onProgress: (value, message) => {
                updateJob(job.id, {
                  status: "running",
                  progress: value,
                  message: message || `Generating… ${value}%`,
                });
              },
              onResult: (data) => {
                pendingMeta = {
                  title: data.title,
                  tags: data.tags,
                  lyrics: data.lyrics,
                  thumbnail: data.thumbnail,
                };
                const candidate = data.url || data.audio;
                if (candidate && !String(candidate).startsWith("data:")) {
                  finish(candidate);
                }
              },
              onSaved: (savedUrl, savedUrls) => {
                if (!savedUrl) return;
                updateJob(job.id, { resultUrl: savedUrl, resultUrls: savedUrls });
                const result = { url: savedUrl };
                if (savedUrls?.length > 1) result.urls = savedUrls;
                finish(result);
              },
              onError: (msg) => {
                if (settled) return;
                settled = true;
                reject(new Error(msg));
              },
            });

            abortControllersRef.current[job.id] = { abort: abortStream };
            controller.signal.addEventListener("abort", () => {
              if (settled) return;
              settled = true;
              abortStream();
              reject(Object.assign(new Error("Canceled"), { name: "AbortError" }));
            });
          });

          if (controller.signal.aborted) {
            return { cancelled: true };
          }

          if (saveResult) {
            await saveResult(resultData);
          } else if (params.remixHistoryId) {
            saveRemixRef.current?.(
              params.remixHistoryId,
              params.prompt,
              resultData,
              params.model,
              params.remixMetadata,
            );
          }

          refreshLibraryRef.current?.({}).catch(() => {});

          return { result: resultData };
        }

        if (controller.signal.aborted) {
          return { cancelled: true };
        }

        if (result.error) {
          return { error: result.error };
        }

        // Check for success flag or URL presence
        const isSuccess = result.success === true || result.success === "true";

        // Extract result data
        let resultData;
        if (type === "image") {
          const imageUrl = result.data?.[0]?.url || result.image || result.url;
          if (!imageUrl && !isSuccess) {
            return { error: "No image URL in response" };
          }
          resultData = {
            url: imageUrl,
            revisedPrompt: result.data?.[0]?.revised_prompt || params.prompt,
          };
        } else if (type === "video") {
          const videoUrl = result.data?.[0]?.url || result.video || result.url;
          if (!videoUrl && !isSuccess) {
            return { error: "No video URL in response" };
          }
          resultData = {
            url: videoUrl,
            thumbnail: result.data?.[0]?.thumbnail || null,
            id: result.id,
          };
        } else if (type === "music") {
          const audioUrl = result.data?.[0]?.url || result.url || result.audio;
          if (!audioUrl && !isSuccess) {
            return { error: "No audio URL in response" };
          }
          resultData = {
            url: audioUrl,
          };
        }

        // Save to history (using registered save function)
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
    },
    [updateJob],
  );

  // Auto-process pending jobs with parallel execution
  useEffect(() => {
    const pendingJobs = jobs.filter((job) => job.status === "pending");
    const activeCount = activeJobIdsRef.current.size;

    if (pendingJobs.length === 0 || activeCount >= MAX_CONCURRENT_JOBS) return;

    const jobsToStart = pendingJobs.slice(0, MAX_CONCURRENT_JOBS - activeCount);

    jobsToStart.forEach((job) => {
      if (activeJobIdsRef.current.has(job.id)) return;

      // Skip client-side processing for jobs with serverJobId (processed on server)
      if (job.params?.serverJobId) {
        // Mark as running since server is processing it
        updateJob(job.id, { status: "running", progress: 10 });
        return;
      }

      activeJobIdsRef.current.add(job.id);

      // Build saveResult from registered save functions (for history - always called)
      let saveResult = null;
      const saveFn = saveFnsRef.current[job.type];
      if (saveFn) {
        if (job.type === "image") {
          saveResult = (data) =>
            saveFn(
              job.params.imageId,
              job.params.prompt,
              data,
              job.params.model,
              job.params.metadata,
            );
        } else if (job.type === "video") {
          saveResult = (data) =>
            saveFn(
              job.params.videoId,
              job.params.prompt,
              data,
              job.params.model,
              job.params.metadata,
            );
        } else if (job.type === "music") {
          saveResult = (data) =>
            saveFn(
              job.params.musicId,
              job.params.prompt,
              data,
              job.params.model,
            );
        } else if (job.type === "remix") {
          saveResult = (data) =>
            saveFn(
              job.params.remixHistoryId,
              job.params.prompt,
              data,
              job.params.model,
              job.params.remixMetadata,
            );
        }
      }

      // Process job asynchronously
      processJob(job, saveResult)
        .then(async (outcome) => {
          // Call job.onSave callback if exists (for UI updates like setGeneratedVideo, addLibraryAsset)
          if (job.onSave && outcome.result) {
            try {
              await job.onSave(outcome.result);
            } catch (err) {
              console.error("Error in job.onSave callback:", err);
            }
          }
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
              resultUrl: outcome.result?.url || job.resultUrl || null,
              progress: 100,
              completedAt: Date.now(),
            });
          }
        })
        .catch((err) => {
          console.error(`Unhandled error processing job ${job.id}:`, err);
          updateJob(job.id, {
            status: "failed",
            error: err.message || "Processing error",
            completedAt: Date.now(),
          });
        });
    });
  }, [jobs, processJob, updateJob]);

  // Combined jobs list for display
  const allJobs = [...jobs];
  for (const sj of serverJobs) {
    if (!allJobs.some((lj) => lj.id === sj.id)) {
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
    registerJobAbort,
    processQueue: () => {}, // Placeholder for future queue management
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
