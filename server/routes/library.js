import express from "express";
import { requireApiKey } from "../middleware/auth.js";
import libraryService from "../services/library-service.js";

const router = express.Router();
router.use(requireApiKey);

function sanitizeName(name = "") {
  return String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function mimeToType(mime = "") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "project";
}

function inferMimeFromFileName(fileName = "") {
  const lower = String(fileName || "").toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
  };
  return map[ext] || "application/octet-stream";
}

function toBase64Payload(input = "") {
  const raw = String(input || "").trim();
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.*)$/i);
  if (dataUrlMatch) {
    return {
      mimeFromDataUrl: dataUrlMatch[1] || null,
      base64: dataUrlMatch[2] || "",
    };
  }
  return {
    mimeFromDataUrl: null,
    base64: raw,
  };
}

// GET /api/library/assets - List assets with pagination
router.get("/assets", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query?.limit) || 100));
    const offset = Math.max(0, Number(req.query?.offset) || 0);

    const result = libraryService.listAssets({
      type: req.query?.type || null,
      folderId: req.query?.folderId || null,
      tag: req.query?.tag || null,
      query: req.query?.query || null,
      limit,
      offset,
    });

    return res.json({
      success: true,
      items: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to list assets" });
  }
});

// POST /api/library/assets - Create asset
router.post("/assets", async (req, res) => {
  try {
    const asset = await libraryService.createAsset(req.body || {});
    return res.status(201).json({ success: true, asset });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to create asset" });
  }
});

// POST /api/library/upload - Upload file
router.post("/upload", async (req, res) => {
  try {
    const {
      fileName,
      fileBase64,
      mimeType,
      type: providedType,
      title,
      source,
      tags,
      folderId,
      metadata,
    } = req.body || {};

    if (!fileName || typeof fileName !== "string") {
      return res.status(400).json({ error: "fileName is required" });
    }

    if (!fileBase64 || typeof fileBase64 !== "string") {
      return res.status(400).json({ error: "fileBase64 is required" });
    }

    const { mimeFromDataUrl, base64 } = toBase64Payload(fileBase64);

    if (!base64) {
      return res.status(400).json({ error: "Invalid fileBase64 payload" });
    }

    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return res.status(400).json({ error: "fileBase64 is not valid base64" });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Decoded upload is empty" });
    }

    const resolvedMime =
      mimeType ||
      mimeFromDataUrl ||
      inferMimeFromFileName(fileName) ||
      "application/octet-stream";

    const assetType = ["image", "video", "audio", "project"].includes(
      providedType
    )
      ? providedType
      : mimeToType(resolvedMime);

    const safeTitle =
      title || sanitizeName(fileName) || `uploaded-${Date.now()}`;

    // Create asset - the library service will handle file storage
    const asset = await libraryService.createAsset({
      type: assetType,
      source: source || "upload",
      title: safeTitle,
      url: fileBase64, // Pass data URL, service will convert to file
      metadata: {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        mimeType: resolvedMime,
        originalFileName: fileName,
        sizeBytes: buffer.length,
      },
      tags: Array.isArray(tags) ? tags : [],
      folderId: folderId || null,
    });

    return res.status(201).json({
      success: true,
      asset,
      file: {
        mimeType: resolvedMime,
        sizeBytes: buffer.length,
        storage: "local",
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to upload file" });
  }
});

// GET /api/library/assets/:id - Get single asset
router.get("/assets/:id", async (req, res) => {
  try {
    const asset = libraryService.getAsset(req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }
    return res.json({ success: true, asset });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to get asset" });
  }
});

// PATCH /api/library/assets/:id - Update asset
router.patch("/assets/:id", async (req, res) => {
  try {
    const asset = await libraryService.updateAsset(
      req.params.id,
      req.body || {}
    );
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    return res.json({ success: true, asset });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to update asset" });
  }
});

// DELETE /api/library/assets/:id - Delete asset
router.delete("/assets/:id", async (req, res) => {
  try {
    const deleted = await libraryService.deleteAsset(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Asset not found" });
    return res.json({ success: true });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to delete asset" });
  }
});

// DELETE /api/library/assets - Delete multiple assets
router.delete("/assets", async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    const deleted = await libraryService.deleteAssets(ids);
    return res.json({ success: true, deleted });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to delete assets" });
  }
});

// POST /api/library/search - Search assets
router.post("/search", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.body?.limit) || 100));
    const offset = Math.max(0, Number(req.body?.offset) || 0);

    const result = libraryService.listAssets({
      query: req.body?.query || "",
      type: req.body?.type || null,
      folderId: req.body?.folderId || null,
      tag: req.body?.tag || null,
      limit,
      offset,
    });

    return res.json({
      success: true,
      items: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Search failed" });
  }
});

// POST /api/library/assets/:id/cache - Cache external asset locally
router.post("/assets/:id/cache", async (req, res) => {
  try {
    const asset = await libraryService.cacheExternalAsset(req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }
    return res.json({ success: true, asset });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to cache asset" });
  }
});

// POST /api/library/cleanup - Cleanup old assets
router.post("/cleanup", async (req, res) => {
  try {
    const maxAgeDays = Math.max(1, Math.min(365, Number(req.body?.maxAgeDays) || 30));
    const deleted = await libraryService.cleanupOldAssets(maxAgeDays);
    return res.json({ success: true, deleted });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Cleanup failed" });
  }
});

export default router;
