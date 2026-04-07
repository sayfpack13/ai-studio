import fs from "fs/promises";
import { existsSync } from "fs";
import { dirname, join, extname, basename } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOADS_DIR = join(__dirname, "..", "data", "uploads");

// MIME type to extension mapping
const MIME_TO_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".weba",
};

// Ensure uploads directory exists
async function ensureUploadsDir() {
  if (!existsSync(UPLOADS_DIR)) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// Generate unique filename
function generateFilename(mimeType, prefix = "asset") {
  const ext = MIME_TO_EXT[mimeType] || "";
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString("hex");
  return `${prefix}_${timestamp}_${random}${ext}`;
}

// Save base64 data to file
async function saveBase64(base64Data, mimeType, prefix = "asset") {
  await ensureUploadsDir();

  // Remove data URL prefix if present
  const base64Match = base64Data.match(/^data:[^;]+;base64,(.+)$/);
  const cleanBase64 = base64Match ? base64Match[1] : base64Data;

  const filename = generateFilename(mimeType, prefix);
  const filepath = join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(cleanBase64, "base64");
  await fs.writeFile(filepath, buffer);

  return {
    filename,
    filepath,
    url: `/uploads/${filename}`,
    size: buffer.length,
  };
}

// Save buffer to file
async function saveBuffer(buffer, mimeType, prefix = "asset") {
  await ensureUploadsDir();

  const filename = generateFilename(mimeType, prefix);
  const filepath = join(UPLOADS_DIR, filename);

  await fs.writeFile(filepath, buffer);

  return {
    filename,
    filepath,
    url: `/uploads/${filename}`,
    size: buffer.length,
  };
}

// Download from URL and save to file
async function downloadAndSave(url, mimeType, prefix = "asset") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const detectedType = mimeType || response.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());

  return saveBuffer(buffer, detectedType, prefix);
}

// Delete file
async function deleteFile(filename) {
  const filepath = join(UPLOADS_DIR, filename);
  try {
    await fs.unlink(filepath);
    return true;
  } catch {
    return false;
  }
}

// Get file info
async function getFileInfo(filename) {
  const filepath = join(UPLOADS_DIR, filename);
  try {
    const stats = await fs.stat(filepath);
    return {
      exists: true,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
    };
  } catch {
    return { exists: false };
  }
}

// Check if URL is a data URL
function isDataUrl(url) {
  return url && url.startsWith("data:");
}

// Check if URL is a local file URL
function isLocalUrl(url) {
  return url && url.startsWith("/uploads/");
}

// Extract filename from URL
function getFilenameFromUrl(url) {
  if (isLocalUrl(url)) {
    return basename(url);
  }
  return null;
}

// Clean up old files
async function cleanupOldFiles(maxAgeMs) {
  await ensureUploadsDir();
  const files = await fs.readdir(UPLOADS_DIR);
  const now = Date.now();
  let deleted = 0;

  for (const file of files) {
    const filepath = join(UPLOADS_DIR, file);
    try {
      const stats = await fs.stat(filepath);
      const age = now - stats.birthtime.getTime();
      if (age > maxAgeMs) {
        await fs.unlink(filepath);
        deleted++;
      }
    } catch {
      // Skip files that can't be accessed
    }
  }

  return deleted;
}

export {
  saveBase64,
  saveBuffer,
  downloadAndSave,
  deleteFile,
  getFileInfo,
  isDataUrl,
  isLocalUrl,
  getFilenameFromUrl,
  cleanupOldFiles,
  UPLOADS_DIR,
};
