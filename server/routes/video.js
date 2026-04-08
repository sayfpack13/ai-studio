import express from "express";
import axios from "axios";
import { requireApiKey } from "../middleware/auth.js";
import { findModel } from "../utils/models.js";
import libraryService from "../services/library-service.js";
import { saveBuffer } from "../services/file-storage.js";

const router = express.Router();
router.use(requireApiKey);

const WAN_I2V_MODEL_ID = "chutes/Wan-AI/Wan2.2-I2V-14B-Fast";
const WAN_I2V_ENDPOINT =
  "https://chutes-wan-2-2-i2v-14b-fast.chutes.ai/generate";
const WAN_DEFAULT_NEGATIVE_PROMPT =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

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
  if (!result || typeof result !== 'object') return false;
  
  const checkBinary = (value) => {
    if (typeof value === 'string') {
      // Check for MP4 signature (ftyp)
      if (value.includes('ftyp') || value.includes('\x00\x00\x00\x20ftyp')) return true;
      // Check for WebM signature
      if (value.includes('webm') || value.includes('\x1A\x45\xDF\xA3')) return true;
      // Check for other video signatures
      if (value.includes('\x00\x00\x00') && value.length > 100) return true; // Generic binary data check
    }
    return false;
  };
  
  // Check providerResponse for binary data
  if (result.providerResponse && checkBinary(result.providerResponse)) {
    return true;
  }
  
  // Check common response fields
  for (const field of ['video', 'data', 'result', 'content', 'b64_json', 'base64']) {
    if (result[field] && checkBinary(result[field])) {
      return true;
    }
  }
  
  return false;
}

async function saveBinaryVideoResponse(result, prompt, modelId, providerId) {
  try {
    const crypto = await import('crypto');
    const path = await import('path');
    
    // Find the binary data
    let binaryData = null;
    let mimeType = 'video/mp4'; // default
    
    if (result.providerResponse && typeof result.providerResponse === 'string') {
      binaryData = result.providerResponse;
      if (binaryData.includes('webm')) mimeType = 'video/webm';
    }
    
    if (!binaryData) return null;
    
    // Save to file
    const videoHash = crypto.createHash('md5').update(binaryData).digest('hex');
    const filename = `generated_video_${Date.now()}_${videoHash.substring(0, 8)}${mimeType === 'video/webm' ? '.webm' : '.mp4'}`;
    
    const buffer = Buffer.from(binaryData, 'base64');
    const saved = await saveBuffer(buffer, mimeType, 'generated_video');
    
    // Add to library
    await libraryService.createAsset({
      type: 'video',
      source: 'video',
      title: prompt.slice(0, 80) || 'Generated video',
      url: saved.url,
      filePath: saved.filepath,
      metadata: {
        model: modelId,
        provider: providerId,
        sizeBytes: saved.size,
        storage: 'local',
      },
    });
    
    return saved.url;
  } catch (err) {
    console.error('Failed to save binary video:', err.message);
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

function isWanI2VModel(modelId) {
  return normalizeModelId(modelId) === WAN_I2V_MODEL_ID;
}

function validateWanI2VInput({
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

function buildWanI2VArgs(body) {
  const prompt = ensureString(body.prompt).trim();
  let image = ensureString(body.image).trim();
  
  // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
  if (image.startsWith('data:')) {
    const commaIndex = image.indexOf(',');
    if (commaIndex !== -1) {
      image = image.substring(commaIndex + 1);
    }
  }

  const args = {
    prompt,
    image,
    frames: 81, // Always include frames with default (schema doesn't allow null)
  };

  // Only include optional parameters if explicitly provided
  const fpsInput = toIntegerOrNull(body.wanFps ?? body.fps);
  if (fpsInput != null) {
    args.fps = clamp(fpsInput, 16, 24);
  }

  const framesInput = toIntegerOrNull(body.wanFrames ?? body.frames);
  if (framesInput != null) {
    args.frames = clamp(framesInput, 21, 140);
  }

  const fastInput = body.wanFast ?? body.fast;
  if (fastInput != null) {
    args.fast = typeof fastInput === "boolean"
      ? fastInput
      : String(fastInput).toLowerCase() !== "false";
  }

  const seedInput = toIntegerOrNull(body.wanSeed ?? body.seed);
  if (seedInput != null) {
    args.seed = seedInput;
  }

  const resolutionInput = ensureString(body.wanResolution ?? body.resolution).trim();
  if (resolutionInput && (resolutionInput === "480p" || resolutionInput === "720p")) {
    args.resolution = resolutionInput;
  }

  const guidanceScaleInput = toNumberOrNull(body.wanGuidanceScale ?? body.guidance_scale);
  if (guidanceScaleInput != null) {
    args.guidance_scale = clamp(guidanceScaleInput, 0, 10);
  }

  const guidanceScale2Input = toNumberOrNull(body.wanGuidanceScale2 ?? body.guidance_scale_2);
  if (guidanceScale2Input != null) {
    args.guidance_scale_2 = clamp(guidanceScale2Input, 0, 10);
  }

  const negativePromptInput = ensureString(body.wanNegativePrompt ?? body.negative_prompt).trim();
  if (negativePromptInput) {
    args.negative_prompt = negativePromptInput;
  }

  return args;
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

  const requestData = args; // Send args directly, not wrapped in { args }

  const response = await axios.post(WAN_I2V_ENDPOINT, requestData, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout,
  });

  const result = response.data;
  console.log('[Wan I2V] Full response:', JSON.stringify(result, null, 2).slice(0, 2000));
  console.log('[Wan I2V] Response structure:', Object.keys(result));
  console.log('[Wan I2V] Has providerResponse:', !!result.providerResponse);
  console.log('[Wan I2V] Has data:', !!result.data);
  console.log('[Wan I2V] Has url:', !!(result.data?.[0]?.url || result.url));
  
  // Check if response contains binary video data in multiple possible locations
  let binaryData = null;
  
  // Check all string fields for potential binary data (base64 encoded video)
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.length > 5000) {
      console.log(`[Wan I2V] Large string field found: ${key}, length: ${value.length}, preview: ${value.slice(0, 100)}`);
      // Check if it looks like base64 video data
      if (value.startsWith('AAAA') || value.includes('ftyp') || /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 100))) {
        binaryData = value;
        console.log('[Wan I2V] Detected base64 video data in field:', key);
        break;
      }
    }
  }
  
  // Check providerResponse field specifically
  if (!binaryData && result.providerResponse && typeof result.providerResponse === 'string') {
    if (result.providerResponse.includes('ftyp') || result.providerResponse.length > 10000) {
      binaryData = result.providerResponse;
      console.log('[Wan I2V] Using providerResponse as binary data');
    }
  }
  
  // Check data field
  if (!binaryData && result.data && typeof result.data === 'string') {
    if (result.data.includes('ftyp') || result.data.length > 10000) {
      binaryData = result.data;
      console.log('[Wan I2V] Using data field as binary data');
    }
  }
  
  // Check if URL is videolan.org (indicates binary data was returned but URL extraction failed)
  const extractedUrl = extractVideoUrl(result);
  console.log('[Wan I2V] Extracted URL:', extractedUrl);
  
  if (!binaryData && extractedUrl && extractedUrl.includes('videolan.org')) {
    console.log('[Wan I2V] videolan.org URL detected, searching for binary data...');
    // Try to find binary data in other fields
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.length > 5000) {
        binaryData = value;
        console.log('[Wan I2V] Found potential binary data in field:', key, 'length:', value.length);
        break;
      }
    }
  }
  
  if (binaryData) {
    // Response contains binary video data, save it to a file
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');
    
    const videoHash = crypto.createHash('md5').update(binaryData).digest('hex');
    const filename = `wan_i2v_${Date.now()}_${videoHash.substring(0, 8)}.mp4`;
    const videosDir = path.join(process.cwd(), 'data', 'uploads', 'videos');
    
    // Ensure videos directory exists
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }
    
    const videoPath = path.join(videosDir, filename);
    const buffer = Buffer.from(binaryData, 'base64');
    fs.writeFileSync(videoPath, buffer);
    
    const videoUrl = `/uploads/videos/${filename}`;
    
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
      title: prompt.slice(0, 80) || "Generated video",
      url: videoUrl,
      metadata: {
        model: modelId,
        provider: providerId,
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
    const { prompt, model, modelKey, image, duration, fps, localOllamaUrl } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;

    const isLocalOllama = !!(localOllamaUrl && providerId === 'ollama');

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
        ["ollama", "blackboxai", "blackbox", "chutes", "nanogpt"].includes(
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

    const isOllamaNative =
      isLocalOllama || provider.apiType === "ollama-native" || providerId === "ollama";
    const effectiveBaseUrl = isLocalOllama
      ? localOllamaUrl.replace(/\/+$/, '')
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
        : { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

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
        const fileUrl = await saveBinaryVideoResponse(result, prompt, modelId, providerId);
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

router.post("/edit", async (req, res) => {
  try {
    const {
      sourceVideoUrl,
      edits = [],
      outputFormat = "mp4",
      fps = 30,
      resolution = "1920x1080",
    } = req.body || {};

    if (!sourceVideoUrl) {
      return res.status(400).json({ error: "sourceVideoUrl is required" });
    }

    return res.json({
      success: true,
      data: {
        sourceVideoUrl,
        outputFormat,
        fps,
        resolution,
        edits,
        status: "queued",
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Video edit request failed" });
  }
});

export default router;
