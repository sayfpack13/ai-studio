import fs from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "data");
const JOBS_PATH = join(DATA_DIR, "generation-jobs.json");
const JOB_RESULTS_DIR = join(DATA_DIR, "job-results");

const DEFAULT_MAX_HISTORY = 1000;

// Threshold for storing data in separate files (100KB)
const LARGE_DATA_THRESHOLD = 100 * 1024;

// Check if data is considered "large" and should be stored separately
function isLargeData(data) {
  if (!data) return false;
  try {
    const serialized = JSON.stringify(data);
    return serialized.length > LARGE_DATA_THRESHOLD;
  } catch {
    return false;
  }
}

const STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
};

class JobQueueService {
  constructor() {
    this.jobs = new Map();
    this.order = [];
    this.processors = new Map();
    this.isProcessing = false;
    this.maxHistory = DEFAULT_MAX_HISTORY;
    this.writeInFlight = false;
    this.pendingWrite = false;
    this.ready = this.#loadFromDisk();
  }

  async #ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(JOB_RESULTS_DIR, { recursive: true });
  }

  // Save large data to a separate file and return a reference
  async #saveLargeData(jobId, dataType, data) {
    await this.#ensureDataDir();
    const filename = `${jobId}_${dataType}.json`;
    const filepath = join(JOB_RESULTS_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(data), "utf-8");
    return { __fileRef: true, filename, dataType };
  }

  // Load large data from a separate file
  async #loadLargeData(ref) {
    if (!ref || !ref.__fileRef || !ref.filename) return ref;
    const filepath = join(JOB_RESULTS_DIR, ref.filename);
    try {
      const raw = await fs.readFile(filepath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Delete large data file
  async #deleteLargeData(ref) {
    if (!ref || !ref.__fileRef || !ref.filename) return;
    const filepath = join(JOB_RESULTS_DIR, ref.filename);
    try {
      await fs.unlink(filepath);
    } catch {
      // Ignore errors
    }
  }

  #generateId(prefix = "job") {
    const rand = crypto.randomBytes(6).toString("hex");
    return `${prefix}_${Date.now()}_${rand}`;
  }

  #clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  #sanitizeError(err) {
    if (!err) return { message: "Unknown error" };
    return {
      message: err.message || String(err),
      name: err.name || "Error",
      code: err.code || undefined,
      stack: typeof err.stack === "string" ? err.stack.slice(0, 2000) : undefined,
    };
  }

  async #loadFromDisk() {
    await this.#ensureDataDir();
    try {
      const raw = await fs.readFile(JOBS_PATH, "utf-8");
      const parsed = JSON.parse(raw);

      const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
      this.order = [];
      this.jobs.clear();

      for (const job of jobs) {
        if (!job?.id) continue;
        
        // Load large data from files if referenced
        if (job.result?.__fileRef) {
          job.result = await this.#loadLargeData(job.result);
        }
        if (job.payload?.__fileRef) {
          job.payload = await this.#loadLargeData(job.payload);
        }
        if (job.error?.__fileRef) {
          job.error = await this.#loadLargeData(job.error);
        }
        
        this.jobs.set(job.id, job);
        this.order.push(job.id);
      }

      this.#trimHistory();
    } catch {
      await this.#persist();
    }
  }

  async #persist() {
    if (this.writeInFlight) {
      this.pendingWrite = true;
      return;
    }

    this.writeInFlight = true;
    try {
      await this.#ensureDataDir();
      
      // Extract large data and save to separate files
      const jobsToSave = [];
      for (const id of this.order) {
        const job = this.jobs.get(id);
        if (!job) continue;
        
        const jobCopy = this.#clone(job);
        
        // Extract large result data
        if (isLargeData(jobCopy.result)) {
          const ref = await this.#saveLargeData(id, 'result', jobCopy.result);
          jobCopy.result = ref;
        }
        
        // Extract large payload data
        if (isLargeData(jobCopy.payload)) {
          const ref = await this.#saveLargeData(id, 'payload', jobCopy.payload);
          jobCopy.payload = ref;
        }
        
        // Extract large error data
        if (isLargeData(jobCopy.error)) {
          const ref = await this.#saveLargeData(id, 'error', jobCopy.error);
          jobCopy.error = ref;
        }
        
        jobsToSave.push(jobCopy);
      }
      
      const payload = {
        updatedAt: new Date().toISOString(),
        jobs: jobsToSave,
      };
      await fs.writeFile(JOBS_PATH, JSON.stringify(payload, null, 2), "utf-8");
    } finally {
      this.writeInFlight = false;
      if (this.pendingWrite) {
        this.pendingWrite = false;
        await this.#persist();
      }
    }
  }

  #trimHistory() {
    if (this.order.length <= this.maxHistory) return;

    const removableCount = this.order.length - this.maxHistory;
    let removed = 0;
    const nextOrder = [];

    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (!job) continue;

      const terminal =
        job.status === STATUS.COMPLETED ||
        job.status === STATUS.FAILED ||
        job.status === STATUS.CANCELED;

      if (removed < removableCount && terminal) {
        // Clean up large data files asynchronously
        this.#cleanupJobLargeData(job);
        this.jobs.delete(id);
        removed++;
        continue;
      }

      nextOrder.push(id);
    }

    this.order = nextOrder;
  }

  // Clean up large data files for a job
  async #cleanupJobLargeData(job) {
    if (!job) return;
    const { id } = job;
    
    // Delete large data files if they exist
    const dataTypes = ['result', 'payload', 'error'];
    for (const dataType of dataTypes) {
      const ref = { __fileRef: true, filename: `${id}_${dataType}.json`, dataType };
      await this.#deleteLargeData(ref);
    }
  }

  registerProcessor(type, processorFn) {
    if (typeof processorFn !== "function") {
      throw new Error(`Processor for "${type}" must be a function`);
    }
    this.processors.set(type, processorFn);
  }

  async enqueue({
    type,
    payload = {},
    metadata = {},
    requestedBy = null,
    priority = 0,
    parentJobId = null,
    pipelineId = null,
    stepType = null,
    dependsOn = [],
  }) {
    await this.ready;

    if (!this.processors.has(type)) {
      throw new Error(`No processor registered for job type "${type}"`);
    }

    const now = new Date().toISOString();
    const id = this.#generateId(type);

    const job = {
      id,
      type,
      status: STATUS.QUEUED,
      progress: 0,
      priority: Number.isFinite(priority) ? Number(priority) : 0,
      parentJobId,
      pipelineId,
      stepType,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      payload: this.#clone(payload),
      metadata: this.#clone(metadata),
      requestedBy: requestedBy || null,
      result: null,
      error: null,
      cancelRequested: false,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      failedAt: null,
      history: [
        {
          at: now,
          event: "enqueued",
          details: {
            parentJobId,
            pipelineId,
            stepType,
            dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
          },
        },
      ],
    };

    this.jobs.set(id, job);
    this.order.push(id);
    this.#sortQueueByPriority();

    await this.#persist();
    this.#kickProcessor();
    return this.#clone(job);
  }

  getJobEvents(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this.#clone(job.history || []);
  }

  #sortQueueByPriority() {
    const queued = this.order
      .map((id) => this.jobs.get(id))
      .filter((j) => j && j.status === STATUS.QUEUED);

    queued.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const queuedIds = new Set(queued.map((j) => j.id));
    const nonQueued = this.order.filter((id) => !queuedIds.has(id));

    this.order = [...queued.map((j) => j.id), ...nonQueued];
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    return job ? this.#clone(job) : null;
  }

  listJobs({
    type = null,
    status = null,
    requestedBy = null,
    limit = 100,
    offset = 0,
  } = {}) {
    let items = this.order
      .map((id) => this.jobs.get(id))
      .filter(Boolean);

    if (type) items = items.filter((j) => j.type === type);
    if (status) items = items.filter((j) => j.status === status);
    if (requestedBy) items = items.filter((j) => j.requestedBy === requestedBy);

    const safeOffset = Math.max(0, Number(offset) || 0);
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));

    return {
      total: items.length,
      items: items.slice(safeOffset, safeOffset + safeLimit).map((j) => this.#clone(j)),
    };
  }

  async cancelJob(jobId, reason = "Canceled by user") {
    await this.ready;
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const now = new Date().toISOString();

    if (job.status === STATUS.COMPLETED || job.status === STATUS.FAILED || job.status === STATUS.CANCELED) {
      return this.#clone(job);
    }

    if (job.status === STATUS.QUEUED) {
      job.status = STATUS.CANCELED;
      job.cancelRequested = true;
      job.progress = 0;
      job.canceledAt = now;
      job.updatedAt = now;
      job.history.push({ at: now, event: "canceled", details: { reason } });
      await this.#persist();
      return this.#clone(job);
    }

    if (job.status === STATUS.PROCESSING) {
      job.cancelRequested = true;
      job.updatedAt = now;
      job.history.push({ at: now, event: "cancel_requested", details: { reason } });
      await this.#persist();
      return this.#clone(job);
    }

    return this.#clone(job);
  }

  async deleteJob(jobId) {
    await this.ready;
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Clean up large data files
    await this.#cleanupJobLargeData(job);

    // Remove from jobs map
    this.jobs.delete(jobId);

    // Remove from order array
    const index = this.order.indexOf(jobId);
    if (index > -1) {
      this.order.splice(index, 1);
    }

    await this.#persist();
    return true;
  }

  async deleteJobs(jobIds) {
    await this.ready;
    let deleted = 0;
    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job) {
        // Clean up large data files
        await this.#cleanupJobLargeData(job);
        this.jobs.delete(jobId);
        const index = this.order.indexOf(jobId);
        if (index > -1) {
          this.order.splice(index, 1);
        }
        deleted++;
      }
    }
    if (deleted > 0) {
      await this.#persist();
    }
    return deleted;
  }

  async clearCompletedJobs() {
    await this.ready;
    const terminalStatuses = [STATUS.COMPLETED, STATUS.FAILED, STATUS.CANCELED];
    const toDelete = [];

    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (job && terminalStatuses.includes(job.status)) {
        toDelete.push({ id, job });
      }
    }

    for (const { id, job } of toDelete) {
      // Clean up large data files
      await this.#cleanupJobLargeData(job);
      this.jobs.delete(id);
    }

    this.order = this.order.filter((id) => !toDelete.some(t => t.id === id));

    if (toDelete.length > 0) {
      await this.#persist();
    }

    return toDelete.length;
  }

  async updateProgress(jobId, progress = 0, details = null) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== STATUS.PROCESSING) return null;

    const now = new Date().toISOString();
    const normalized = Math.max(0, Math.min(100, Number(progress) || 0));

    job.progress = normalized;
    job.updatedAt = now;
    job.history.push({ at: now, event: "progress", details: details || { progress: normalized } });

    await this.#persist();
    return this.#clone(job);
  }

  isCancelRequested(jobId) {
    const job = this.jobs.get(jobId);
    return Boolean(job?.cancelRequested);
  }

  async #setJobStatus(job, status, { result = null, error = null, details = null } = {}) {
    const now = new Date().toISOString();
    job.status = status;
    job.updatedAt = now;

    if (status === STATUS.PROCESSING) {
      job.startedAt = now;
      job.progress = Math.max(job.progress, 1);
      job.history.push({ at: now, event: "started", details: details || null });
    } else if (status === STATUS.COMPLETED) {
      job.completedAt = now;
      job.progress = 100;
      job.result = result;
      job.history.push({ at: now, event: "completed", details: details || null });
    } else if (status === STATUS.FAILED) {
      job.failedAt = now;
      job.error = error;
      job.history.push({ at: now, event: "failed", details: details || null });
    } else if (status === STATUS.CANCELED) {
      job.canceledAt = now;
      job.history.push({ at: now, event: "canceled", details: details || null });
    }

    await this.#persist();
  }

  #nextQueuedJob() {
    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (!job) continue;
      if (job.status !== STATUS.QUEUED) continue;
      if (Array.isArray(job.dependsOn) && job.dependsOn.length > 0) {
        const blocked = job.dependsOn.some((dependencyId) => {
          const dep = this.jobs.get(dependencyId);
          return !dep || dep.status !== STATUS.COMPLETED;
        });
        if (blocked) continue;
      }
      return job;
    }
    return null;
  }

  #kickProcessor() {
    if (this.isProcessing) return;
    this.#processLoop().catch(() => {
      this.isProcessing = false;
    });
  }

  async #processLoop() {
    this.isProcessing = true;
    try {
      while (true) {
        const job = this.#nextQueuedJob();
        if (!job) break;

        const processor = this.processors.get(job.type);
        if (!processor) {
          await this.#setJobStatus(job, STATUS.FAILED, {
            error: { message: `Missing processor for type "${job.type}"` },
          });
          continue;
        }

        if (job.cancelRequested) {
          await this.#setJobStatus(job, STATUS.CANCELED, {
            details: { reason: "Canceled before execution" },
          });
          continue;
        }

        job.attempts += 1;
        await this.#setJobStatus(job, STATUS.PROCESSING);

        const context = {
          jobId: job.id,
          payload: this.#clone(job.payload),
          metadata: this.#clone(job.metadata),
          requestedBy: job.requestedBy,
          setProgress: async (value, details = null) => this.updateProgress(job.id, value, details),
          isCanceled: () => this.isCancelRequested(job.id),
        };

        try {
          const result = await processor(context);

          if (this.isCancelRequested(job.id)) {
            await this.#setJobStatus(job, STATUS.CANCELED, {
              details: { reason: "Canceled during processing" },
            });
          } else {
            await this.#setJobStatus(job, STATUS.COMPLETED, {
              result: this.#clone(result),
            });
          }
        } catch (err) {
          if (this.isCancelRequested(job.id)) {
            await this.#setJobStatus(job, STATUS.CANCELED, {
              details: { reason: "Canceled during processing" },
            });
          } else {
            await this.#setJobStatus(job, STATUS.FAILED, {
              error: this.#sanitizeError(err),
            });
          }
        }

        this.#trimHistory();
        await this.#persist();
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

const jobQueue = new JobQueueService();

export {
  jobQueue,
  STATUS as JOB_STATUS,
};
export default jobQueue;
