import express from "express";
import { requireApiKey } from "../middleware/auth.js";
import jobQueue, { JOB_STATUS } from "../services/jobQueue.js";

const router = express.Router();
router.use(requireApiKey);

const ALLOWED_TYPES = new Set(["chat", "image", "video", "music", "pipeline"]);

function normalizeType(value) {
  const type = String(value || "").trim().toLowerCase();
  return ALLOWED_TYPES.has(type) ? type : null;
}

function getRequestedBy(req) {
  return req.user?.id || req.user?.username || "anonymous";
}

function safePromptPreview(payload) {
  const prompt =
    payload?.prompt ||
    payload?.input_args?.prompt ||
    payload?.messages?.[0]?.content ||
    "";
  return typeof prompt === "string" ? prompt.slice(0, 200) : "";
}

// POST /api/jobs/enqueue
// Body:
// {
//   "type": "image|video|music|chat",
//   "payload": { ...request payload for that type... },
//   "priority": 0,
//   "metadata": { ...optional }
// }
router.post("/enqueue", async (req, res) => {
  try {
    const type = normalizeType(req.body?.type);
    const payload = req.body?.payload;

    if (!type) {
      return res.status(400).json({
        error: `Invalid type. Supported: ${Array.from(ALLOWED_TYPES).join(", ")}`,
      });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({
        error: "payload must be an object",
      });
    }

    const metadata = {
      ...(req.body?.metadata && typeof req.body.metadata === "object"
        ? req.body.metadata
        : {}),
      providerId: req.providerContext?.providerId || null,
      model: payload?.model || null,
      modelKey: payload?.modelKey || null,
      promptPreview: safePromptPreview(payload),
      ip: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      enqueuedVia: "api",
    };

    const job = await jobQueue.enqueue({
      type,
      payload,
      metadata,
      requestedBy: getRequestedBy(req),
      priority: Number(req.body?.priority) || 0,
      parentJobId: req.body?.parentJobId || null,
      pipelineId: req.body?.pipelineId || null,
      stepType: req.body?.stepType || null,
      dependsOn: Array.isArray(req.body?.dependsOn) ? req.body.dependsOn : [],
    });

    return res.status(202).json({
      success: true,
      job,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to enqueue job",
    });
  }
});

router.post("/pipeline", async (req, res) => {
  try {
    const root = await jobQueue.enqueue({
      type: "pipeline",
      payload: req.body?.payload || {},
      metadata: req.body?.metadata || {},
      requestedBy: getRequestedBy(req),
      priority: Number(req.body?.priority) || 1,
      pipelineId: req.body?.pipelineId || `pipeline_${Date.now()}`,
      stepType: "pipeline-root",
    });
    return res.status(202).json({ success: true, job: root });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to enqueue pipeline" });
  }
});

// GET /api/jobs
// Query: ?type=image&status=queued&limit=50&offset=0
router.get("/", async (req, res) => {
  try {
    const type = req.query?.type ? normalizeType(req.query.type) : null;
    if (req.query?.type && !type) {
      return res.status(400).json({
        error: `Invalid type. Supported: ${Array.from(ALLOWED_TYPES).join(", ")}`,
      });
    }

    const status = req.query?.status ? String(req.query.status).toLowerCase() : null;
    const allowedStatuses = Object.values(JOB_STATUS);
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Supported: ${allowedStatuses.join(", ")}`,
      });
    }

    const limit = Math.max(1, Math.min(1000, Number(req.query?.limit) || 100));
    const offset = Math.max(0, Number(req.query?.offset) || 0);

    const result = jobQueue.listJobs({
      type,
      status,
      requestedBy: req.query?.allUsers === "true" ? null : getRequestedBy(req),
      limit,
      offset,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to list jobs",
    });
  }
});

// GET /api/jobs/:id
router.get("/:id", async (req, res) => {
  try {
    const job = jobQueue.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.requestedBy && job.requestedBy !== getRequestedBy(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json({
      success: true,
      job,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to get job",
    });
  }
});

router.get("/:id/events", async (req, res) => {
  try {
    const job = jobQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.requestedBy && job.requestedBy !== getRequestedBy(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const events = jobQueue.getJobEvents(req.params.id) || [];
    return res.json({ success: true, events });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to fetch job events" });
  }
});

// POST /api/jobs/:id/cancel
router.post("/:id/cancel", async (req, res) => {
  try {
    const existing = jobQueue.getJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (existing.requestedBy && existing.requestedBy !== getRequestedBy(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const reason =
      (typeof req.body?.reason === "string" && req.body.reason.trim()) ||
      "Canceled by user";

    const updated = await jobQueue.cancelJob(req.params.id, reason);
    return res.json({
      success: true,
      job: updated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to cancel job",
    });
  }
});

export default router;
