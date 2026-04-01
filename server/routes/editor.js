import express from "express";
import { requireApiKey } from "../middleware/auth.js";
import editorService from "../services/editor-service.js";

const router = express.Router();
router.use(requireApiKey);

router.get("/templates", async (_req, res) => {
  try {
    const templates = await editorService.listTemplates();
    return res.json({ success: true, templates });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load templates" });
  }
});

router.post("/templates", async (req, res) => {
  try {
    const template = await editorService.createTemplate(req.body || {});
    return res.status(201).json({ success: true, template });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create template" });
  }
});

export default router;
