import express from "express";
import { requireApiKey } from "../middleware/auth.js";
import { enqueuePipeline } from "../services/pipeline-service.js";

const router = express.Router();
router.use(requireApiKey);

function getRequestedBy(req) {
  return req.user?.id || req.user?.username || "anonymous";
}

router.post("/image-to-video", async (req, res) => {
  try {
    const result = await enqueuePipeline({
      pipelineType: "image-to-video",
      payload: req.body || {},
      requestedBy: getRequestedBy(req),
      metadata: { enqueuedVia: "pipeline-api" },
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Pipeline failed" });
  }
});

router.post("/music-to-editor", async (req, res) => {
  try {
    const result = await enqueuePipeline({
      pipelineType: "music-to-editor",
      payload: req.body || {},
      requestedBy: getRequestedBy(req),
      metadata: { enqueuedVia: "pipeline-api" },
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Pipeline failed" });
  }
});

router.post("/remix-to-video", async (req, res) => {
  try {
    const result = await enqueuePipeline({
      pipelineType: "remix-to-video",
      payload: req.body || {},
      requestedBy: getRequestedBy(req),
      metadata: { enqueuedVia: "pipeline-api" },
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Pipeline failed" });
  }
});

export default router;
