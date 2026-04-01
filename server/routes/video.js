import express from "express";
import axios from "axios";
import { requireApiKey } from "../middleware/auth.js";
import { findModel } from "../utils/models.js";
import libraryService from "../services/library-service.js";

const router = express.Router();
router.use(requireApiKey);

const WAN_I2V_MODEL_ID = "chutes/Wan-AI/Wan2.2-I2V-14B-Fast";
const WAN_I2V_ENDPOINT =
  "https://chutes-wan-2-2-i2v-14b-fast.chutes.ai/generate";
const WAN_DEFAULT_NEGATIVE_PROMPT =
  "";

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
  const image = ensureString(body.image).trim();

  const fpsInput = toIntegerOrNull(body.wanFps ?? body.fps);
  const framesInput = toIntegerOrNull(body.wanFrames ?? body.frames);
  const seedInput = toIntegerOrNull(body.wanSeed ?? body.seed);
  const fastInput = body.wanFast ?? body.fast;
  const resolutionInput = ensureString(
    body.wanResolution ?? body.resolution ?? "480p",
  ).trim();
  const guidanceScaleInput = toNumberOrNull(
    body.wanGuidanceScale ?? body.guidance_scale,
  );
  const guidanceScale2Input = toNumberOrNull(
    body.wanGuidanceScale2 ?? body.guidance_scale_2,
  );
  const negativePromptInput = ensureString(
    body.wanNegativePrompt ??
    body.negative_prompt ??
    WAN_DEFAULT_NEGATIVE_PROMPT,
  );

  const fps = clamp(fpsInput ?? 16, 16, 24);
  const frames = clamp(framesInput ?? 81, 21, 140);
  const guidanceScale =
    guidanceScaleInput == null ? 1 : clamp(guidanceScaleInput, 0, 10);
  const guidanceScale2 =
    guidanceScale2Input == null ? 1 : clamp(guidanceScale2Input, 0, 10);

  const fast =
    typeof fastInput === "boolean"
      ? fastInput
      : fastInput == null
        ? true
        : String(fastInput).toLowerCase() !== "false";

  const args = {
    prompt,
    image,
    fps,
    fast,
    seed: seedInput == null ? null : seedInput,
    frames,
    resolution: resolutionInput === "720p" ? "720p" : "480p",
    guidance_scale: guidanceScale,
    negative_prompt: negativePromptInput || WAN_DEFAULT_NEGATIVE_PROMPT,
    guidance_scale_2: guidanceScale2,
  };

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

  const requestData = { args };

  const response = await axios.post(WAN_I2V_ENDPOINT, requestData, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout,
  });

  const result = response.data;
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
    const { prompt, model, modelKey, image, duration, fps } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;

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
      model: modelId,
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
      const output = result.choices[0].message.content;

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
