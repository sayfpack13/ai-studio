import express from "express";
import { requireApiKey } from "../middleware/auth.js";
import libraryService from "../services/library-service.js";

const router = express.Router();
router.use(requireApiKey);

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB

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

function buildDataUrl(mimeType, base64) {
  return `data:${mimeType};base64,${base64}`;
}

router.get("/assets", async (req, res) => {
  try {
    const assets = libraryService.listAssets({
      type: req.query?.type || null,
      folderId: req.query?.folderId || null,
      tag: req.query?.tag || null,
      query: req.query?.query || null,
    });
    return res.json({ success: true, assets });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to list assets" });
  }
});

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

/**
 * Upload endpoint that stores content directly as data URL in asset.url
 * Body:
 * {
 *   "fileName": "example.png",
 *   "fileBase64": "<base64 or data URL>",
 *   "mimeType": "image/png",            // optional
 *   "type": "image|video|audio|project",// optional
 *   "title": "Optional title",          // optional
 *   "source": "upload",                 // optional
 *   "tags": ["tag1"],                   // optional
 *   "folderId": "folder_x",             // optional
 *   "metadata": { "foo": "bar" }        // optional
 * }
 */
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

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: `File too large. Max ${Math.floor(
          MAX_UPLOAD_BYTES / (1024 * 1024),
        )}MB`,
      });
    }

    const resolvedMime =
      mimeType ||
      mimeFromDataUrl ||
      inferMimeFromFileName(fileName) ||
      "application/octet-stream";

    const assetType = ["image", "video", "audio", "project"].includes(
      providedType,
    )
      ? providedType
      : mimeToType(resolvedMime);

    const safeTitle =
      title || sanitizeName(fileName) || `uploaded-${Date.now()}`;
    const dataUrl = buildDataUrl(resolvedMime, base64);

    const asset = await libraryService.createAsset({
      type: assetType,
      source: source || "upload",
      title: safeTitle,
      url: dataUrl,
      metadata: {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        mimeType: resolvedMime,
        originalFileName: fileName,
        sizeBytes: buffer.length,
        storage: "data-url",
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
        mode: "data-url",
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to upload file" });
  }
});

router.patch("/assets/:id", async (req, res) => {
  try {
    const asset = await libraryService.updateAsset(
      req.params.id,
      req.body || {},
    );
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    return res.json({ success: true, asset });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Failed to update asset" });
  }
});

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

router.post("/search", async (req, res) => {
  try {
    const assets = libraryService.listAssets({
      query: req.body?.query || "",
      type: req.body?.type || null,
      folderId: req.body?.folderId || null,
      tag: req.body?.tag || null,
    });
    return res.json({ success: true, assets });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Search failed" });
  }
});

export default router;
