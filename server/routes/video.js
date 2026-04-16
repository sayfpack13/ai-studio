import express from "express";
import axios from "axios";
import sharp from "sharp";
import { requireApiKey } from "../middleware/auth.js";
import { findModel } from "../utils/models.js";
import libraryService from "../services/library-service.js";
import { saveBuffer } from "../services/file-storage.js";
import {
  generateVideo as hfGenerateVideo,
  downloadGradioFile,
} from "../utils/gradio-client.js";

const router = express.Router();

// Stitch route does not need a provider — it's a local ffmpeg operation
router.post("/stitch", async (req, res) => {
  const fs = await import("fs");
  const fsp = await import("fs/promises");
  const path = await import("path");
  const crypto = await import("crypto");
  const { exec } = await import("child_process");

  const tempFiles = [];

  const cleanup = async () => {
    for (const f of tempFiles) {
      try {
        await fsp.unlink(f);
      } catch {}
    }
  };

  try {
    const { videoUrls } = req.body || {};

    if (!Array.isArray(videoUrls) || videoUrls.length < 2) {
      return res
        .status(400)
        .json({ error: "At least 2 video URLs are required" });
    }
    if (videoUrls.length > 20) {
      return res
        .status(400)
        .json({ error: "Maximum 20 videos can be stitched at once" });
    }

    const videosDir = path.join(process.cwd(), "data", "uploads", "videos");
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }

    const localPaths = [];
    for (const url of videoUrls) {
      if (url.startsWith("/uploads/")) {
        const localPath = path.join(process.cwd(), "data", url);
        if (!fs.existsSync(localPath)) {
          await cleanup();
          return res
            .status(400)
            .json({ error: `Local file not found: ${url}` });
        }
        localPaths.push(localPath);
      } else if (url.startsWith("http://") || url.startsWith("https://")) {
        const tmpName = `stitch_tmp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.mp4`;
        const tmpPath = path.join(videosDir, tmpName);
        tempFiles.push(tmpPath);
        try {
          const response = await (
            await import("axios")
          ).default.get(url, {
            responseType: "arraybuffer",
            timeout: 60000,
          });
          fs.writeFileSync(tmpPath, Buffer.from(response.data));
          localPaths.push(tmpPath);
        } catch (err) {
          await cleanup();
          return res
            .status(400)
            .json({ error: `Failed to download video: ${url}` });
        }
      } else {
        await cleanup();
        return res.status(400).json({ error: `Invalid video URL: ${url}` });
      }
    }

    const listName = `stitch_list_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.txt`;
    const listPath = path.join(videosDir, listName);
    tempFiles.push(listPath);
    const listContent = localPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContent);

    const outputName = `stitched_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.mp4`;
    const outputPath = path.join(videosDir, outputName);
    const thumbName = `stitched_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
    const thumbPath = path.join(videosDir, thumbName);

    const tryStitch = (reencode) => {
      return new Promise((resolve, reject) => {
        const codec = reencode
          ? "-c:v libx264 -c:a aac -movflags +faststart"
          : "-c copy";
        const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" ${codec} "${outputPath}"`;
        exec(cmd, { timeout: 120000 }, (error, _stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve();
        });
      });
    };

    try {
      await tryStitch(false);
    } catch {
      try {
        await tryStitch(true);
      } catch (err) {
        await cleanup();
        return res
          .status(500)
          .json({ error: "FFmpeg stitching failed: " + err.message });
      }
    }

    let thumbnailUrl = null;
    try {
      await new Promise((resolve) => {
        exec(
          `ffmpeg -y -i "${outputPath}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${thumbPath}"`,
          { timeout: 10000 },
          () => resolve(),
        );
      });
      if (fs.existsSync(thumbPath)) {
        thumbnailUrl = `/uploads/videos/${thumbName}`;
      }
    } catch {}

    const videoUrl = `/uploads/videos/${outputName}`;

    await libraryService.createAsset({
      type: "video",
      source: "video-stitch",
      title: `Stitched video (${videoUrls.length} clips)`,
      url: videoUrl,
      metadata: {
        clipCount: videoUrls.length,
        sourceUrls: videoUrls,
        stitchedAt: Date.now(),
        thumbnail: thumbnailUrl || null,
      },
    });

    await cleanup();

    return res.json({
      success: true,
      data: {
        url: videoUrl,
        thumbnail: thumbnailUrl,
        clipCount: videoUrls.length,
      },
    });
  } catch (error) {
    await cleanup();
    console.error("Video stitch error:", error.message);
    return res
      .status(500)
      .json({ error: "Video stitch failed: " + error.message });
  }
});

router.use(requireApiKey);

export const WAN_I2V_MODEL_ID = "chutes/Wan-AI/Wan2.2-I2V-14B-Fast";
export const WAN_I2V_ENDPOINT =
  "https://chutes-wan-2-2-i2v-14b-fast.chutes.ai/generate";
export const WAN_DEFAULT_NEGATIVE_PROMPT =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

export function getWanI2VTimeoutMs({ providerTimeoutMs, frames }) {
  const baseTimeout =
    typeof providerTimeoutMs === "number" && Number.isFinite(providerTimeoutMs)
      ? providerTimeoutMs
      : 300000;
  const frameCount =
    typeof frames === "number" && Number.isFinite(frames) ? frames : 0;
  const estimated = 120000 + Math.max(0, frameCount) * 3000;
  return Math.max(baseTimeout, estimated, 600000);
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntegerOrNull(value) {
  const parsed = toNumberOrNull(value);
  if (parsed == null) return null;
  return Number.isInteger(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeModelId(raw = "") {
  return String(raw || "").trim();
}

function ensureString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

// Detect if response contains binary video data (MP4, WebM signatures)
function containsBinaryVideoData(result) {
  if (!result || typeof result !== "object") return false;

  const checkBinary = (value) => {
    if (typeof value === "string") {
      // Check for MP4 signature (ftyp)
      if (value.includes("ftyp") || value.includes("\x00\x00\x00\x20ftyp"))
        return true;
      // Check for WebM signature
      if (value.includes("webm") || value.includes("\x1A\x45\xDF\xA3"))
        return true;
      // Check for other video signatures
      if (value.includes("\x00\x00\x00") && value.length > 100) return true; // Generic binary data check
    }
    return false;
  };

  // Check providerResponse for binary data
  if (result.providerResponse && checkBinary(result.providerResponse)) {
    return true;
  }

  // Check common response fields
  for (const field of [
    "video",
    "data",
    "result",
    "content",
    "b64_json",
    "base64",
  ]) {
    if (result[field] && checkBinary(result[field])) {
      return true;
    }
  }

  return false;
}

function slugifyPrompt(value = "", maxLength = 48) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "";
  return cleaned.slice(0, maxLength);
}

async function saveBinaryVideoResponse(result, prompt, modelId, providerId) {
  try {
    // Find the binary data
    let binaryData = null;
    let mimeType = "video/mp4"; // default

    if (
      result.providerResponse &&
      typeof result.providerResponse === "string"
    ) {
      binaryData = result.providerResponse;
      if (binaryData.includes("webm")) mimeType = "video/webm";
    }

    if (!binaryData) return null;

    // Save to file
    const buffer = Buffer.from(binaryData, "base64");
    const slug = slugifyPrompt(prompt);
    const prefix = slug ? `video_${slug}` : "generated_video";
    const saved = await saveBuffer(buffer, mimeType, prefix);

    // Add to library
    await libraryService.createAsset({
      type: "video",
      source: "video",
      title: prompt.slice(0, 80) || "Generated video",
      url: saved.url,
      filePath: saved.filepath,
      metadata: {
        prompt,
        model: modelId,
        provider: providerId,
        sizeBytes: saved.size,
        storage: "local",
      },
    });

    return saved.url;
  } catch (err) {
    console.error("Failed to save binary video:", err.message);
    return null;
  }
}

function extractVideoUrl(payload, depth = 0) {
  if (depth > 6 || payload == null) return null;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    const match = trimmed.match(/https?:\/\/\S+/i);
    return match ? match[0] : null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractVideoUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === "object") {
    const preferred = [
      "url",
      "video_url",
      "video",
      "output_url",
      "result_url",
      "playback_url",
      "content",
      "data",
      "result",
    ];

    for (const key of preferred) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        const found = extractVideoUrl(payload[key], depth + 1);
        if (found) return found;
      }
    }

    for (const value of Object.values(payload)) {
      const found = extractVideoUrl(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

export function isWanI2VModel(modelId) {
  return normalizeModelId(modelId) === WAN_I2V_MODEL_ID;
}

export function validateWanI2VInput({
  prompt,
  image,
  frames,
  fps,
  guidanceScale,
  guidanceScale2,
  seed,
  resolution,
}) {
  if (!prompt || String(prompt).trim().length < 3) {
    return "Prompt must be at least 3 characters for Wan I2V";
  }

  if (!image || typeof image !== "string") {
    return "Image is required for Wan I2V (URL or base64 data)";
  }

  const normalizedFrames = toIntegerOrNull(frames) ?? 81;
  if (normalizedFrames < 21 || normalizedFrames > 140) {
    return "Frames must be an integer between 21 and 140";
  }

  const normalizedFps = toIntegerOrNull(fps) ?? 16;
  if (normalizedFps < 16 || normalizedFps > 24) {
    return "FPS must be an integer between 16 and 24";
  }

  const normalizedGs = toNumberOrNull(guidanceScale);
  if (normalizedGs != null && (normalizedGs < 0 || normalizedGs > 10)) {
    return "guidance_scale must be between 0 and 10";
  }

  const normalizedGs2 = toNumberOrNull(guidanceScale2);
  if (normalizedGs2 != null && (normalizedGs2 < 0 || normalizedGs2 > 10)) {
    return "guidance_scale_2 must be between 0 and 10";
  }

  const normalizedSeed = toIntegerOrNull(seed);
  if (seed != null && seed !== "" && normalizedSeed == null) {
    return "Seed must be an integer or null";
  }

  if (
    resolution != null &&
    resolution !== "" &&
    !["480p", "720p"].includes(String(resolution))
  ) {
    return "Resolution must be 480p or 720p";
  }

  return null;
}

export function buildWanI2VArgs(body) {
  const prompt = ensureString(body.prompt).trim();
  let image = ensureString(body.image).trim();

  // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
  if (image.startsWith("data:")) {
    const commaIndex = image.indexOf(",");
    if (commaIndex !== -1) {
      image = image.substring(commaIndex + 1);
    }
  }

  // Chutes Wan 2.2 I2V API expects 'image' parameter with base64 or URL data.
  // See: https://chutes.ai/app/chute/4f82321e-3e58-55da-ba44-051686ddbfe5
  // The API wraps all parameters in an "args" object: { args: { prompt, image, ... } }
  const args = {
    prompt,
    image, // Supports both https URLs and base64 encoded data
  };

  // Only include optional parameters if explicitly provided
  const fpsInput = toIntegerOrNull(body.wanFps ?? body.fps);
  if (fpsInput != null) {
    args.fps = clamp(fpsInput, 16, 24);
  }

  const framesInput = toIntegerOrNull(body.wanFrames ?? body.frames);
  if (framesInput != null) {
    args.frames = clamp(framesInput, 21, 140);
  } else {
    // Always include frames with default value
    args.frames = 81;
  }

  const fastInput = body.wanFast ?? body.fast;
  if (fastInput != null) {
    args.fast =
      typeof fastInput === "boolean"
        ? fastInput
        : String(fastInput).toLowerCase() !== "false";
  }

  const seedInput = toIntegerOrNull(body.wanSeed ?? body.seed);
  if (seedInput != null) {
    args.seed = seedInput;
  }

  const resolutionInput = ensureString(
    body.wanResolution ?? body.resolution,
  ).trim();
  if (
    resolutionInput &&
    (resolutionInput === "480p" || resolutionInput === "720p")
  ) {
    args.resolution = resolutionInput;
  }

  const guidanceScaleInput = toNumberOrNull(
    body.wanGuidanceScale ?? body.guidance_scale,
  );
  if (guidanceScaleInput != null) {
    args.guidance_scale = clamp(guidanceScaleInput, 0, 10);
  }

  const guidanceScale2Input = toNumberOrNull(
    body.wanGuidanceScale2 ?? body.guidance_scale_2,
  );
  if (guidanceScale2Input != null) {
    args.guidance_scale_2 = clamp(guidanceScale2Input, 0, 10);
  }

  const negativePromptInput = ensureString(
    body.wanNegativePrompt ?? body.negative_prompt,
  ).trim();
  if (negativePromptInput) {
    args.negative_prompt = negativePromptInput;
  }

  return args;
}

// Convert image URL to base64
export async function imageUrlToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(response.data);
    const contentType = response.headers["content-type"] || "image/jpeg";
    return buffer.toString("base64");
  } catch (error) {
    throw new Error(`Failed to fetch image: ${error.message}`);
  }
}

// Convert local file path to base64
export async function localFileToBase64(filePath) {
  const fs = await import("fs/promises");
  const path = await import("path");

  // Handle /uploads/... paths
  let fullPath = filePath;
  if (filePath.startsWith("/uploads/")) {
    // process.cwd() is the server directory, so just add data
    fullPath = path.join(process.cwd(), "data", filePath);
  }

  try {
    const buffer = await fs.readFile(fullPath);
    return buffer.toString("base64");
  } catch (error) {
    throw new Error(`Failed to read local file: ${error.message}`);
  }
}

/**
 * Ensure base64 image data is JPEG (RGB, no alpha).
 * Non-JPEG formats (PNG, WEBP, GIF, etc.) are converted to JPEG via sharp.
 * Returns raw base64 string (no data URI prefix).
 */
export async function ensureJpegBase64(base64Data) {
  const isJpeg = base64Data.startsWith("/9j/");
  if (isJpeg) return base64Data;

  const inputBuffer = Buffer.from(base64Data, "base64");
  const jpegBuffer = await sharp(inputBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  return jpegBuffer.toString("base64");
}

async function handleWanI2VGeneration({
  req,
  res,
  prompt,
  modelId,
  providerId,
  apiKey,
  timeout,
}) {
  const args = buildWanI2VArgs(req.body || {});
  const validationError = validateWanI2VInput({
    prompt: args.prompt,
    image: args.image,
    frames: args.frames,
    fps: args.fps,
    guidanceScale: args.guidance_scale,
    guidanceScale2: args.guidance_scale_2,
    seed: args.seed,
    resolution: args.resolution,
  });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // The Chutes Wan 2.2 I2V API supports both URLs and base64 for the image field.
  // Pass URLs directly to avoid unnecessary base64 conversion (reduces payload size).
  // Local files and data URIs still need conversion to base64.
  let imageValue = args.image;

  if (args.image) {
    // Pass remote URLs directly — the API supports them natively
    if (args.image.startsWith("http://") || args.image.startsWith("https://")) {
      console.log("[Wan I2V] Passing remote image URL directly to API");
      imageValue = args.image;
    }
    // Check if it's a local file path (starts with /uploads/)
    else if (args.image.startsWith("/uploads/")) {
      console.log("[Wan I2V] Converting local file to base64...");
      try {
        const b64 = await localFileToBase64(args.image);
        console.log(
          "[Wan I2V] Local file converted, base64 length:",
          b64.length,
        );
        imageValue = b64;
      } catch (fetchError) {
        console.error(
          "[Wan I2V] Failed to read local file:",
          fetchError.message,
        );
        return res
          .status(400)
          .json({ error: `Failed to read local file: ${fetchError.message}` });
      }
    }
    // If it's already base64 (long string with no special chars), use it directly
    else if (args.image.length > 100 && /^[A-Za-z0-9+/=]+$/.test(args.image)) {
      console.log(
        "[Wan I2V] Image appears to be base64 already, length:",
        args.image.length,
      );
      imageValue = args.image;
    }
    // Otherwise, try to treat it as a URL or file path
    else {
      console.log(
        "[Wan I2V] Unknown image format, attempting to fetch...",
      );
      try {
        if (args.image.startsWith("/") || args.image.startsWith(".")) {
          imageValue = await localFileToBase64(args.image);
        } else {
          // Try passing as URL first — fallback to base64 conversion on failure
          imageValue = args.image;
        }
        console.log(
          "[Wan I2V] Image resolved, length:",
          typeof imageValue === "string" ? imageValue.length : "URL",
        );
      } catch (fetchError) {
        console.error("[Wan I2V] Failed to process image:", fetchError.message);
        return res.status(400).json({
          error: `Invalid image format: expected base64, URL, or local file path`,
        });
      }
    }
  }

  // Convert non-JPEG images to JPEG (strips alpha channel, ensures RGB)
  if (imageValue && !imageValue.startsWith("http")) {
    if (!imageValue.startsWith("/9j/")) {
      try {
        const originalLen = imageValue.length;
        imageValue = await ensureJpegBase64(imageValue);
        console.log(`[Wan I2V] Converted image → JPEG | base64 length: ${originalLen} → ${imageValue.length}`);
      } catch (convErr) {
        console.error("[Wan I2V] Image conversion failed:", convErr.message);
      }
    }
  }

  // Chutes Wan 2.2 I2V API expects flat parameters (no "args" wrapper)
  const requestData = { ...args, image: imageValue };

  // Build headers - skip Authorization for public chutes
  const isPublicChute = req.providerContext?.isPublicChute;
  const requestHeaders = {
    "Content-Type": "application/json",
  };
  if (!isPublicChute && apiKey && apiKey !== "public") {
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }

  // Retry logic for transient Chutes infrastructure errors (500, 502, 503)
  const MAX_WAN_RETRIES = 3;
  const RETRY_DELAYS = [15000, 30000, 60000]; // 15s, 30s, 60s exponential backoff
  let response;
  let lastAxiosError = null;

  for (let attempt = 0; attempt <= MAX_WAN_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Wan I2V] Retry attempt ${attempt}/${MAX_WAN_RETRIES} after ${RETRY_DELAYS[attempt - 1] / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
      }

      // Log request for debugging
      console.log("[Wan I2V] Sending request to:", WAN_I2V_ENDPOINT, attempt > 0 ? `(attempt ${attempt + 1})` : "");
      console.log("[Wan I2V] Request data keys:", Object.keys(requestData));
      console.log("[Wan I2V] Request keys:", Object.keys(requestData));
      console.log("[Wan I2V] Prompt length:", args.prompt?.length || 0);
      console.log(
        "[Wan I2V] Image type:",
        imageValue.startsWith("http") ? "URL" : "base64",
        "length:",
        imageValue?.length || 0,
      );
      console.log("[Wan I2V] Frames:", args.frames);

      const wanTimeoutMs = getWanI2VTimeoutMs({
        providerTimeoutMs: timeout,
        frames: args.frames,
      });

      response = await axios.post(WAN_I2V_ENDPOINT, requestData, {
        headers: requestHeaders,
        timeout: wanTimeoutMs,
        responseType: "arraybuffer", // Important: preserve binary data
      });

      // Success — break out of retry loop
      break;
    } catch (axiosError) {
      lastAxiosError = axiosError;

      // Handle error response - decode buffer if present
      let errorMessage = "Wan I2V generation failed";
      let errorDetail = null;

      // Detect network-related errors
      const networkErrors = [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "ECONNREFUSED",
        "ENETUNREACH",
        "EAI_AGAIN",
      ];
      const errorCode = axiosError.code;

      if (errorCode && networkErrors.includes(errorCode)) {
        errorMessage =
          "Network error: Unable to connect to the video generation service. Please check your internet connection and try again.";
        errorDetail = { code: errorCode, message: axiosError.message };
      } else if (axiosError.code === "ECONNABORTED") {
        errorMessage =
          "Request timeout: The video generation service took too long to respond. Please try again.";
        errorDetail = { code: errorCode, message: axiosError.message };
      } else if (axiosError.response?.data) {
        try {
          const errorBuffer = Buffer.from(axiosError.response.data);
          const errorJson = JSON.parse(errorBuffer.toString("utf8"));
          errorDetail = errorJson;
          errorMessage =
            errorJson.detail ||
            errorJson.error?.message ||
            errorJson.message ||
            errorMessage;
        } catch {
          // If not JSON, try to use as string
          try {
            const errorBuffer = Buffer.from(axiosError.response.data);
            errorMessage = errorBuffer.toString("utf8").slice(0, 500);
          } catch {
            // Ignore
          }
        }
      }

      console.error(
        "[Wan I2V] API error:",
        axiosError.message,
        "Status:",
        axiosError.response?.status,
        "Data length:",
        axiosError.response?.data?.length ?? 0,
        errorDetail || "",
      );

      // Only retry on server errors that may be transient
      const isRetryable =
        axiosError.response?.status === 500 ||
        axiosError.response?.status === 502 ||
        axiosError.response?.status === 503;

      if (isRetryable && attempt < MAX_WAN_RETRIES) {
        console.warn(
          `[Wan I2V] Retriable error (${axiosError.response?.status}): "${errorMessage}". Will retry...`,
        );
        continue;
      }

      // Provide friendlier messages for common Chutes infrastructure errors
      if (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("infrastructure")) {
        errorMessage = "The video generation service is currently busy. Please try again in a few minutes.";
      }

      return res.status(axiosError.response?.status || 500).json({
        error: errorMessage,
        detail: errorDetail,
      });
    }
  }

  // Guard against missing response
  if (!response) {
    return res.status(500).json({
      error: lastAxiosError?.message || "Wan I2V generation failed — no response",
    });
  }

  // Check if response is binary video data (arraybuffer)
  const buffer = Buffer.from(response.data);

  // Check if it looks like MP4 video data (starts with ftyp box)
  const isMp4Data =
    buffer.length > 12 &&
    (buffer.toString("ascii", 4, 8) === "ftyp" ||
      buffer.includes(Buffer.from("ftyp"), 4));

  let binaryBuffer = null;
  let result = null;

  // If it's binary video data, save directly
  if (isMp4Data || buffer.length > 100000) {
    // Check if this is actually video binary or JSON parsed as buffer
    const isJson =
      buffer.length > 0 && (buffer[0] === 0x7b || buffer[0] === 0x5b); // { or [
    if (!isJson) {
      binaryBuffer = buffer;
    } else {
      // Try to parse as JSON
      try {
        result = JSON.parse(buffer.toString("utf8"));
      } catch (e) {
        binaryBuffer = buffer;
      }
    }
  } else {
    // Small response, try to parse as JSON
    try {
      result = JSON.parse(buffer.toString("utf8"));
    } catch (e) {
      binaryBuffer = buffer;
    }
  }

  let binaryData = null;

  // Check if response is a large array (chutes.ai returns video as array of bytes)
  if (!binaryBuffer && Array.isArray(result) && result.length > 10000) {
    try {
      binaryBuffer = Buffer.from(result);
    } catch (e) {
      console.error("[Wan I2V] Failed to convert array to Buffer:", e.message);
    }
  }

  // Check if response is an object with numeric string keys (array-like object)
  if (!binaryBuffer && typeof result === "object" && result !== null) {
    const keys = Object.keys(result);
    const isNumericKeys =
      keys.length > 10000 && keys.every((k) => /^\d+$/.test(k));
    if (isNumericKeys) {
      try {
        const values = keys
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((k) => result[k]);
        binaryBuffer = Buffer.from(values);
      } catch (e) {
        console.error(
          "[Wan I2V] Failed to convert array-like object to Buffer:",
          e.message,
        );
      }
    }
  }

  // Check all string fields for potential binary data (base64 encoded video)
  if (!binaryBuffer) {
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "string" && value.length > 5000) {
        // Check if it looks like base64 video data
        if (
          value.startsWith("AAAA") ||
          value.includes("ftyp") ||
          /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 100))
        ) {
          binaryData = value;
          break;
        }
      }
    }

    // Check providerResponse field specifically
    if (
      !binaryData &&
      result.providerResponse &&
      typeof result.providerResponse === "string"
    ) {
      if (
        result.providerResponse.includes("ftyp") ||
        result.providerResponse.length > 10000
      ) {
        binaryData = result.providerResponse;
      }
    }

    // Check data field
    if (!binaryData && result.data && typeof result.data === "string") {
      if (result.data.includes("ftyp") || result.data.length > 10000) {
        binaryData = result.data;
      }
    }

    // Check if URL is videolan.org (indicates binary data was returned but URL extraction failed)
    const extractedUrl = extractVideoUrl(result);

    if (!binaryData && extractedUrl && extractedUrl.includes("videolan.org")) {
      // Try to find binary data in other fields
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === "string" && value.length > 5000) {
          binaryData = value;
          break;
        }
      }
    }
  }

  if (binaryBuffer || binaryData) {
    // Response contains binary video data, save it to a file
    const fs = await import("fs");
    const path = await import("path");
    const crypto = await import("crypto");
    const { exec } = await import("child_process");

    // Use binaryBuffer if available (from array), otherwise decode binaryData (from base64)
    const buffer = binaryBuffer || Buffer.from(binaryData, "base64");
    const videoHash = crypto.createHash("md5").update(buffer).digest("hex");
    const slug = slugifyPrompt(prompt);
    const namePrefix = slug ? `wan_i2v_${slug}` : "wan_i2v";
    const filename = `${namePrefix}_${Date.now()}_${videoHash.substring(0, 8)}.mp4`;
    const thumbFilename = `${namePrefix}_${Date.now()}_${videoHash.substring(0, 8)}.jpg`;
    const videosDir = path.join(process.cwd(), "data", "uploads", "videos");

    // Ensure videos directory exists
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }

    const videoPath = path.join(videosDir, filename);
    const thumbPath = path.join(videosDir, thumbFilename);
    fs.writeFileSync(videoPath, buffer);

    // Generate thumbnail using ffmpeg
    let thumbnailUrl = null;
    try {
      await new Promise((resolve, reject) => {
        exec(
          `ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${thumbPath}"`,
          { timeout: 10000 },
          (error) => {
            if (error)
              resolve(); // Don't fail if thumbnail generation fails
            else resolve();
          },
        );
      });
      if (fs.existsSync(thumbPath)) {
        thumbnailUrl = `/uploads/videos/${thumbFilename}`;
      }
    } catch {
      // Thumbnail generation failed, continue without it
    }

    const videoUrl = `/uploads/videos/${filename}`;

    res.json({
      success: true,
      data: [
        {
          url: videoUrl,
          thumbnail: thumbnailUrl,
          revised_prompt: prompt,
        },
      ],
      id: result?.id || result?.job_id || result?.request_id || null,
    });

    await libraryService.createAsset({
      type: "video",
      source: "video",
      title: prompt.slice(0, 80) || "Generated video",
      url: videoUrl,
      metadata: {
        model: modelId,
        provider: providerId,
        thumbnail: thumbnailUrl || null,
      },
    });

    return;
  }

  const videoUrl = extractVideoUrl(result);

  if (!videoUrl) {
    return res.status(502).json({
      error: "Wan I2V response did not include a video URL",
      raw: result,
    });
  }

  res.json({
    success: true,
    data: [
      {
        url: videoUrl,
        revised_prompt: prompt,
      },
    ],
    id: result?.id || result?.job_id || result?.request_id || null,
    providerResponse: result,
  });

  await libraryService.createAsset({
    type: "video",
    source: "video",
    title: String(prompt).slice(0, 80) || "Generated video",
    url: videoUrl,
    metadata: {
      model: modelId,
      provider: providerId,
      endpoint: "wan-i2v-fast",
      args,
    },
  });

  return null;
}

// Video generation endpoint - uses chat completions endpoint with video models
router.post("/generate", async (req, res) => {
  try {
    const { prompt, model, modelKey, image, duration, fps, localOllamaUrl } =
      req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;

    const isLocalOllama = !!(localOllamaUrl && providerId === "ollama");

    if (!isLocalOllama) {
      const modelInfo = await findModel(
        req.config,
        modelId,
        providerId,
        modelKey,
      );
      if (!modelInfo || !modelInfo.categories.includes("video")) {
        return res.status(400).json({
          error: `Model ${modelId || modelKey} is not available for video generation on gateway ${providerId}`,
        });
      }
    }

    // Strip gateway prefix for API call
    let actualModelId = modelId;
    if (modelId && modelId.includes("/")) {
      const parts = modelId.split("/");
      if (
        parts.length >= 2 &&
        ["ollama", "blackboxai", "blackbox", "chutes", "nanogpt", "huggingface"].includes(
          parts[0],
        )
      ) {
        actualModelId = parts.slice(1).join("/");
      }
    }

    if (isWanI2VModel(modelId)) {
      return await handleWanI2VGeneration({
        req,
        res,
        prompt,
        modelId,
        providerId,
        apiKey,
        timeout,
      });
    }

    // ── HuggingFace Gradio Space (video) ──────────────────────────────
    if (providerId === "huggingface") {
      const hfToken = apiKey || process.env.HF_TOKEN || undefined;
      const isSpace = actualModelId && actualModelId.includes("/");

      // Wan 2.2 I2V A14B uses a specific Space by default
      const isWanI2VA14B = /Wan2\.2-I2V-A14B/i.test(actualModelId || "");
      const DEFAULT_WAN_I2V_A14B_SPACE = "r3gm/wan2-2-fp8da-aoti-preview";
      const hfSpaceTarget = String(req.body?.hfSpaceTarget || "").toLowerCase();
      const hfCustomSpace = String(req.body?.hfCustomSpace || "").trim();

      let spaceUrl;
      if (isWanI2VA14B) {
        spaceUrl = hfSpaceTarget === "custom"
          ? hfCustomSpace || process.env.HF_WAN_I2V_A14B_SPACE_URL || DEFAULT_WAN_I2V_A14B_SPACE
          : DEFAULT_WAN_I2V_A14B_SPACE;
      } else {
        spaceUrl = isSpace ? actualModelId : (process.env.HF_VIDEO_SPACE_URL || provider.apiBaseUrl);
      }

      if (!spaceUrl) {
        return res.status(400).json({
          error: "HuggingFace video Space URL is not configured. Set HF_VIDEO_SPACE_URL or Admin → Providers → HuggingFace.",
        });
      }

      // Resolve image input
      let imageInput = req.body?.image || null;
      if (imageInput && imageInput.startsWith("/uploads/")) {
        const b64 = await localFileToBase64(imageInput);
        imageInput = Buffer.from(b64, "base64");
      } else if (imageInput && imageInput.startsWith("http")) {
        // URL — pass directly
      } else if (imageInput && imageInput.length > 100) {
        imageInput = Buffer.from(imageInput, "base64");
      }

      try {
        // Use AOTi-appropriate defaults for Wan 2.2 I2V A14B (Lightning LoRA)
        // which expects low step counts (4-8) and low guidance scale (~1.0)
        const aotiDefaults = isWanI2VA14B
          ? { num_inference_steps: 6, guidance_scale: 1.0, guidance_scale_2: 1, duration_seconds: 3.5, quality: 6, scheduler: "UniPCMultistep", flow_shift: 3, frame_multiplier: 16 }
          : { num_inference_steps: 25, guidance_scale: 5.0 };

        const result = await hfGenerateVideo(spaceUrl, hfToken, {
          image: imageInput,
          prompt,
          negative_prompt: req.body?.wanNegativePrompt || req.body?.negative_prompt || "",
          width: Number(req.body?.wanWidth) || 832,
          height: Number(req.body?.wanHeight) || 480,
          num_frames: Number(req.body?.wanFrames) || Number(req.body?.frames) || 81,
          guidance_scale: Number(req.body?.wanGuidanceScale) || req.body?.guidance_scale || aotiDefaults.guidance_scale,
          guidance_scale_2: Number(req.body?.wanGuidanceScale2) || aotiDefaults.guidance_scale_2 || 1,
          num_inference_steps: Number(req.body?.wanSteps) || req.body?.num_inference_steps || aotiDefaults.num_inference_steps,
          seed: req.body?.wanSeed != null ? Number(req.body.wanSeed) : (req.body?.seed != null ? Number(req.body.seed) : -1),
          duration_seconds: Number(req.body?.wanDurationSeconds) || aotiDefaults.duration_seconds || 3.5,
          quality: Number(req.body?.wanQuality) || aotiDefaults.quality || 6,
          scheduler: req.body?.wanScheduler || aotiDefaults.scheduler || "UniPCMultistep",
          flow_shift: Number(req.body?.wanFlowShift) || aotiDefaults.flow_shift || 3,
          frame_multiplier: Number(req.body?.wanFrameMultiplier) || aotiDefaults.frame_multiplier || 16,
        });

          const videoBuffer = await downloadGradioFile(result.url, hfToken);

        const fsMod = await import("fs");
        const pathMod = await import("path");
        const crypto = await import("crypto");
        const videoHash = crypto.createHash("md5").update(videoBuffer).digest("hex");
        const slug = String(prompt || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
        const namePrefix = slug ? `hf_video_${slug}` : "hf_video";
        const filename = `${namePrefix}_${Date.now()}_${videoHash.substring(0, 8)}.mp4`;
        const videosDir = pathMod.join(process.cwd(), "data", "uploads", "videos");
        if (!fsMod.existsSync(videosDir)) {
          fsMod.mkdirSync(videosDir, { recursive: true });
        }
        const filePath = pathMod.join(videosDir, filename);
        const fsp = await import("fs/promises");
        await fsp.writeFile(filePath, videoBuffer);

        const localUrl = `/uploads/videos/${filename}`;

        await libraryService.createAsset({
          type: "video",
          source: "video",
          title: String(prompt).slice(0, 80) || "Generated video",
          url: localUrl,
            metadata: { model: modelId, provider: "huggingface", mode: "space", spaceUrl },
        });
      } catch (error) {
        console.error("[HuggingFace] Video generation error:", error.message);
        return res.status(502).json({
          error: `HuggingFace video generation failed: ${error.message}`,
        });
      }
    }

    const isOllamaNative =
      isLocalOllama ||
      provider.apiType === "ollama-native" ||
      providerId === "ollama";
    const effectiveBaseUrl = isLocalOllama
      ? localOllamaUrl.replace(/\/+$/, "")
      : apiBaseUrl;

    // Ollama uses /api/chat — no native video generation
    if (isOllamaNative) {
      const ollamaRequest = {
        model: actualModelId,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.7 },
      };

      const ollamaHeaders = isLocalOllama
        ? { "Content-Type": "application/json" }
        : {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          };

      const response = await axios.post(
        `${effectiveBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: ollamaHeaders,
          timeout,
        },
      );

      const ollamaData = response.data;
      const content = ollamaData.message?.content || "";

      return res.json({
        id: `ollama-${Date.now()}`,
        object: "chat.completion",
        model: actualModelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: ollamaData.done ? "stop" : null,
          },
        ],
      });
    }

    let content;

    if (image) {
      content = [
        {
          type: "text",
          text: prompt,
        },
        {
          type: "image_url",
          image_url: {
            url: image,
          },
        },
      ];
    } else {
      content = prompt;
    }

    const requestData = {
      model: actualModelId,
      messages: [
        {
          role: "user",
          content,
        },
      ],
      ...(duration && { duration }),
      ...(fps && { fps }),
    };

    const response = await axios.post(
      `${apiBaseUrl}/chat/completions`,
      requestData,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout,
      },
    );

    const result = response.data;

    if (result.choices && result.choices[0]?.message?.content) {
      let output = result.choices[0].message.content;

      // Check if response contains binary video data
      if (containsBinaryVideoData(result)) {
        const fileUrl = await saveBinaryVideoResponse(
          result,
          prompt,
          modelId,
          providerId,
        );
        if (fileUrl) {
          output = fileUrl;
        }
      }

      res.json({
        success: true,
        data: [
          {
            url: output,
            revised_prompt: prompt,
          },
        ],
        id: result.id,
      });

      await libraryService.createAsset({
        type: "video",
        source: "video",
        title: String(prompt).slice(0, 80) || "Generated video",
        url: output,
        metadata: { model: modelId, provider: providerId },
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error(
      "Video generation error:",
      error.response?.data || error.message,
    );
    res.status(error.response?.status || 500).json({
      error:
        error.response?.data?.error?.message ||
        error.response?.data?.detail ||
        "Video generation failed",
    });
  }
});

router.get("/status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const provider = req.providerContext.provider;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;

    const response = await axios.get(`${apiBaseUrl}/videos/generations/${id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout,
    });

    res.json(response.data);
  } catch (error) {
    console.error("Video status error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to get video status",
    });
  }
});

export default router;
