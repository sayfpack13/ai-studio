import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import imageRoutes from "./routes/image.js";
import videoRoutes from "./routes/video.js";
import musicRoutes from "./routes/music.js";
import configRoutes from "./routes/config.js";
import modelsRoutes from "./routes/models.js";
import jobsRoutes from "./routes/jobs.js";
import libraryRoutes from "./routes/library.js";
import pipelinesRoutes from "./routes/pipelines.js";
import editorRoutes from "./routes/editor.js";
import chutesRoutes from "./routes/chutes.js";
import jobQueue from "./services/jobQueue.js";
import { normalizeConfig } from "./utils/config.js";
import { resolveProviderContext } from "./utils/provider-routing.js";
import libraryService from "./services/library-service.js";
import { findModel } from "./utils/models.js";
import {
  isWanI2VModel,
  WAN_I2V_ENDPOINT,
  buildWanI2VArgs,
  validateWanI2VInput,
  getWanI2VTimeoutMs,
  imageUrlToBase64,
  localFileToBase64,
  ensureJpegBase64,
} from "./routes/video.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "2gb" }));
app.use(express.urlencoded({ extended: true, limit: "2gb" }));
app.use("/uploads", express.static(join(__dirname, "data", "uploads")));

// Load config
const configPath = join(__dirname, "config.json");
let config = {};

async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, "utf-8");
    config = normalizeConfig(JSON.parse(data));
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    // Create default config if doesn't exist
    config = normalizeConfig({});
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }
}

loadConfig();

// Make config available to routes
app.use((req, res, next) => {
  req.config = config;
  req.configPath = configPath;
  next();
});

function getPromptFromPayload(payload = {}) {
  if (typeof payload?.prompt === "string" && payload.prompt.trim())
    return payload.prompt;
  if (
    typeof payload?.input_args?.prompt === "string" &&
    payload.input_args.prompt.trim()
  ) {
    return payload.input_args.prompt;
  }
  if (
    typeof payload?.messages?.[0]?.content === "string" &&
    payload.messages[0].content.trim()
  ) {
    return payload.messages[0].content;
  }
  return "";
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeChutesImageModel(modelId = "") {
  return String(modelId || "")
    .replace(/^chutes\//i, "")
    .trim();
}

function extractUrlFromText(text) {
  if (typeof text !== "string") return null;
  const direct = text.trim();
  if (
    direct.startsWith("http://") ||
    direct.startsWith("https://") ||
    direct.startsWith("data:image/")
  ) {
    return direct;
  }
  const match = direct.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function extractFirstImageUrl(value, depth = 0) {
  if (depth > 6 || value == null) return null;

  if (typeof value === "string") return extractUrlFromText(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstImageUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    const preferredKeys = [
      "url",
      "image_url",
      "image",
      "output_url",
      "src",
      "content",
    ];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = extractFirstImageUrl(value[key], depth + 1);
        if (found) return found;
      }
    }

    for (const nested of Object.values(value)) {
      const found = extractFirstImageUrl(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function toStandardImageResponse(result, prompt) {
  if (result?.data?.[0]?.url) {
    return {
      success: true,
      data: [
        {
          url: result.data[0].url,
          revised_prompt: result.data[0].revised_prompt || prompt,
        },
      ],
    };
  }

  if (result?.choices?.[0]?.message?.content) {
    const contentUrl = extractUrlFromText(result.choices[0].message.content);
    return {
      success: true,
      data: [
        {
          url: contentUrl || result.choices[0].message.content,
          revised_prompt: prompt,
        },
      ],
    };
  }

  const extractedUrl = extractFirstImageUrl(result);
  if (extractedUrl) {
    return {
      success: true,
      data: [
        {
          url: extractedUrl,
          revised_prompt: prompt,
        },
      ],
    };
  }

  return null;
}

function isOllamaProvider(providerContext) {
  return (
    providerContext.provider?.apiType === "ollama-native" ||
    providerContext.providerId === "ollama"
  );
}

function buildOllamaChatRequest(messages, model, options = {}) {
  return {
    model,
    messages: transformMessagesForOllamaVision(messages),
    stream: false,
    options: {
      temperature: options.temperature || 0.7,
      num_ctx: options.max_tokens || 4096,
      num_predict: options.max_tokens || 2048,
    },
  };
}

function transformOllamaToOpenAI(ollamaResponse, model) {
  return {
    id: `ollama-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: ollamaResponse.message?.role || "assistant",
          content: ollamaResponse.message?.content || "",
        },
        finish_reason: ollamaResponse.done ? "stop" : null,
      },
    ],
    usage: {
      prompt_tokens: ollamaResponse.prompt_eval_count || 0,
      completion_tokens: ollamaResponse.eval_count || 0,
      total_tokens:
        (ollamaResponse.prompt_eval_count || 0) +
        (ollamaResponse.eval_count || 0),
    },
  };
}

function transformMessagesForOllamaVision(messages) {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;

    let textParts = [];
    const images = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text || "");
      } else if (part.type === "image_url" && part.image_url?.url) {
        const url = part.image_url.url;
        if (url.startsWith("data:")) {
          const base64Match = url.match(/^data:[^;]+;base64,(.+)$/);
          if (base64Match) {
            images.push(base64Match[1]);
          }
        } else {
          images.push(url);
        }
      }
    }

    const transformed = {
      role: msg.role,
      content: textParts.join("\n") || "",
    };

    if (images.length > 0) {
      transformed.images = images;
    }

    return transformed;
  });
}

function buildAxiosError(error, fallbackMessage) {
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage;

  const wrapped = new Error(message);
  wrapped.status = error?.response?.status || 500;
  wrapped.cause = error;
  return wrapped;
}

async function processChatJob({ payload, setProgress, isCanceled }) {
  const prompt = getPromptFromPayload(payload);
  if (!prompt) throw new Error("Prompt required");

  await setProgress(5, { stage: "validating" });

  const providerContext = await resolveProviderContext(config, {
    requestedProvider: payload?.provider,
    modelId: payload?.model,
    modelKey: payload?.modelKey,
  });

  const modelId = payload?.model || config.defaultModel;
  const modelInfo = await findModel(
    config,
    modelId,
    providerContext.providerId,
    payload?.modelKey,
  );
  if (!modelInfo || !modelInfo.categories.includes("chat")) {
    throw new Error(
      `Model ${modelId || payload?.modelKey} is not available for chat on gateway ${providerContext.providerId}`,
    );
  }

  if (isCanceled()) throw new Error("Canceled");

  await setProgress(25, { stage: "requesting_provider" });

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

  try {
    if (isOllamaProvider(providerContext)) {
      const ollamaRequest = buildOllamaChatRequest(
        payload.messages,
        actualModelId,
        { temperature: payload?.temperature, max_tokens: payload?.max_tokens },
      );

      const response = await axios.post(
        `${providerContext.provider.apiBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: {
            Authorization: `Bearer ${providerContext.provider.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: providerContext.provider.timeout?.chat || 120000,
        },
      );

      await setProgress(100, { stage: "completed" });
      return transformOllamaToOpenAI(response.data, actualModelId);
    }

    const requestData = {
      messages: payload.messages,
      model: actualModelId,
      stream: false,
      ...Object.fromEntries(
        Object.entries(payload).filter(
          ([k]) => !["provider", "modelKey"].includes(k),
        ),
      ),
    };

    const response = await axios.post(
      `${providerContext.provider.apiBaseUrl}/chat/completions`,
      requestData,
      {
        headers: {
          Authorization: `Bearer ${providerContext.provider.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: providerContext.provider.timeout?.chat || 120000,
      },
    );

    await setProgress(100, { stage: "completed" });
    return response.data;
  } catch (error) {
    throw buildAxiosError(error, "Chat generation failed");
  }
}

async function processImageJob({ payload, setProgress, isCanceled }) {
  const prompt = getPromptFromPayload(payload);
  if (!prompt) throw new Error("Prompt required");

  await setProgress(5, { stage: "validating" });

  const providerContext = await resolveProviderContext(config, {
    requestedProvider: payload?.provider,
    modelId: payload?.model,
    modelKey: payload?.modelKey,
  });

  const modelId = payload?.model || config.defaultModel;
  const modelInfo = await findModel(
    config,
    modelId,
    providerContext.providerId,
    payload?.modelKey,
  );
  if (!modelInfo || !modelInfo.categories.includes("image")) {
    throw new Error(
      `Model ${modelId || payload?.modelKey} is not available for image generation on gateway ${providerContext.providerId}`,
    );
  }

  if (isCanceled()) throw new Error("Canceled");

  await setProgress(20, { stage: "requesting_provider" });

  if (providerContext.providerId === "chutes") {
    const chutesModel = normalizeChutesImageModel(modelInfo.id || modelId);
    let endpoint = null;
    let requestData = null;

    if (chutesModel === "hunyuan-image-3") {
      endpoint = "https://chutes-hunyuan-image-3.chutes.ai/generate";
      requestData = {
        input_args: {
          prompt,
          ...(payload?.input_args && typeof payload.input_args === "object"
            ? payload.input_args
            : {}),
        },
      };
    } else if (chutesModel === "z-image-turbo") {
      endpoint = "https://chutes-z-image-turbo.chutes.ai/generate";
      requestData = {
        prompt,
        ...(payload?.negativePrompt
          ? { negative_prompt: payload.negativePrompt }
          : {}),
        ...(toFiniteNumberOrNull(payload?.guidanceScale) != null
          ? { guidance_scale: Number(payload.guidanceScale) }
          : {}),
        ...(toFiniteNumberOrNull(payload?.width) != null
          ? { width: Number(payload.width) }
          : {}),
        ...(toFiniteNumberOrNull(payload?.height) != null
          ? { height: Number(payload.height) }
          : {}),
        ...(toFiniteNumberOrNull(payload?.numInferenceSteps) != null
          ? { num_inference_steps: Number(payload.numInferenceSteps) }
          : {}),
        ...(payload?.extraParams && typeof payload.extraParams === "object"
          ? payload.extraParams
          : {}),
      };
    } else if (
      chutesModel === "Qwen-Image-2512" ||
      chutesModel === "JuggernautXL"
    ) {
      endpoint = "https://image.chutes.ai/generate";
      requestData = {
        model: chutesModel,
        ...(payload?.input_args && typeof payload.input_args === "object"
          ? { input_args: payload.input_args }
          : { prompt }),
        ...(payload?.extraParams && typeof payload.extraParams === "object"
          ? payload.extraParams
          : {}),
      };
    } else {
      throw new Error(`Unsupported Chutes image model: ${chutesModel}`);
    }

    try {
      const response = await axios.post(endpoint, requestData, {
        headers: {
          Authorization: `Bearer ${providerContext.provider.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: providerContext.provider.timeout?.image || 120000,
      });

      const transformed = toStandardImageResponse(response.data, prompt);
      const out = transformed || response.data;
      const outUrl = out?.data?.[0]?.url || null;
      if (outUrl) {
        await libraryService.createAsset({
          type: "image",
          source: "image",
          title: payload?.prompt?.slice(0, 80) || "Generated image",
          url: outUrl,
          metadata: { model: modelId, provider: providerContext.providerId },
        });
      }
      await setProgress(100, { stage: "completed" });
      return out;
    } catch (error) {
      throw buildAxiosError(error, "Image generation failed");
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

  // Ollama Cloud uses /api/chat — it can describe images (vision) but not generate them
  if (isOllamaProvider(providerContext)) {
    const fullPrompt = payload?.negativePrompt
      ? `${prompt}. Avoid: ${payload.negativePrompt}`
      : prompt;

    const messages = [{ role: "user", content: fullPrompt }];
    const ollamaRequest = buildOllamaChatRequest(messages, actualModelId);

    try {
      const response = await axios.post(
        `${providerContext.provider.apiBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: {
            Authorization: `Bearer ${providerContext.provider.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: providerContext.provider.timeout?.image || 120000,
        },
      );

      const openaiResponse = transformOllamaToOpenAI(
        response.data,
        actualModelId,
      );
      const transformed = toStandardImageResponse(openaiResponse, prompt);
      const out = transformed || openaiResponse;
      await setProgress(100, { stage: "completed" });
      return out;
    } catch (error) {
      throw buildAxiosError(error, "Image generation failed (Ollama Cloud)");
    }
  }

  const fullPrompt = payload?.negativePrompt
    ? `${prompt}. Avoid: ${payload.negativePrompt}`
    : prompt;
  const requestData = {
    model: actualModelId,
    messages: [{ role: "user", content: fullPrompt }],
    ...(payload?.width ? { width: payload.width } : {}),
    ...(payload?.height ? { height: payload.height } : {}),
  };

  try {
    const response = await axios.post(
      `${providerContext.provider.apiBaseUrl}/chat/completions`,
      requestData,
      {
        headers: {
          Authorization: `Bearer ${providerContext.provider.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: providerContext.provider.timeout?.image || 120000,
      },
    );

    const transformed = toStandardImageResponse(response.data, prompt);
    const out = transformed || response.data;
    const outUrl = out?.data?.[0]?.url || null;
    if (outUrl) {
      await libraryService.createAsset({
        type: "image",
        source: "image",
        title: payload?.prompt?.slice(0, 80) || "Generated image",
        url: outUrl,
        metadata: { model: modelId, provider: providerContext.providerId },
      });
    }
    await setProgress(100, { stage: "completed" });
    return out;
  } catch (error) {
    throw buildAxiosError(error, "Image generation failed");
  }
}

async function processVideoJob({ payload, setProgress, isCanceled }) {
  const prompt = getPromptFromPayload(payload);
  if (!prompt) throw new Error("Prompt required");

  await setProgress(5, { stage: "validating" });

  const providerContext = await resolveProviderContext(config, {
    requestedProvider: payload?.provider,
    modelId: payload?.model,
    modelKey: payload?.modelKey,
  });

  const modelId = payload?.model || config.defaultModel;

  // ── Wan I2V special path ──────────────────────────────────────────
  if (isWanI2VModel(modelId)) {
    return await processWanI2VJob({
      payload,
      prompt,
      modelId,
      providerContext,
      setProgress,
      isCanceled,
    });
  }

  const modelInfo = await findModel(
    config,
    modelId,
    providerContext.providerId,
    payload?.modelKey,
  );
  if (!modelInfo || !modelInfo.categories.includes("video")) {
    throw new Error(
      `Model ${modelId || payload?.modelKey} is not available for video generation on gateway ${providerContext.providerId}`,
    );
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

  if (isCanceled()) throw new Error("Canceled");

  await setProgress(20, { stage: "requesting_provider" });

  // Ollama Cloud uses /api/chat — no native video generation
  if (isOllamaProvider(providerContext)) {
    const messages = [{ role: "user", content: prompt }];
    const ollamaRequest = buildOllamaChatRequest(messages, actualModelId);

    try {
      const response = await axios.post(
        `${providerContext.provider.apiBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: {
            Authorization: `Bearer ${providerContext.provider.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: providerContext.provider.timeout?.video || 300000,
        },
      );

      const openaiResponse = transformOllamaToOpenAI(
        response.data,
        actualModelId,
      );
      await setProgress(100, { stage: "completed" });
      return openaiResponse;
    } catch (error) {
      throw buildAxiosError(error, "Video generation failed (Ollama Cloud)");
    }
  }

  const content = payload?.image
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: payload.image } },
      ]
    : prompt;

  try {
    const response = await axios.post(
      `${providerContext.provider.apiBaseUrl}/chat/completions`,
      {
        model: actualModelId,
        messages: [{ role: "user", content }],
        ...(payload?.duration ? { duration: payload.duration } : {}),
        ...(payload?.fps ? { fps: payload.fps } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${providerContext.provider.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: providerContext.provider.timeout?.video || 300000,
      },
    );

    const result = response.data;
    const outputUrl = result?.choices?.[0]?.message?.content || null;
    if (outputUrl) {
      await libraryService.createAsset({
        type: "video",
        source: "video",
        title: prompt.slice(0, 80) || "Generated video",
        url: outputUrl,
        metadata: { model: modelId, provider: providerContext.providerId },
      });
    }
    await setProgress(100, { stage: "completed" });

    if (result.choices && result.choices[0]?.message?.content) {
      return {
        success: true,
        data: [
          {
            url: result.choices[0].message.content,
            revised_prompt: prompt,
          },
        ],
        id: result.id,
      };
    }

    return result;
  } catch (error) {
    throw buildAxiosError(error, "Video generation failed");
  }
}

/**
 * Process a Wan I2V video generation job through the dedicated Chutes endpoint.
 * This mirrors the logic in video.js handleWanI2VGeneration but works without
 * req/res objects so it can run inside the job queue processor.
 */
async function processWanI2VJob({
  payload,
  prompt,
  modelId,
  providerContext,
  setProgress,
  isCanceled,
}) {
  const providerTimeout = providerContext.provider?.timeout?.video || 300000;

  // Build & validate Wan I2V args from the job payload
  const args = buildWanI2VArgs(payload);
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
    throw new Error(validationError);
  }

  // The Chutes Wan 2.2 I2V API supports both URLs and base64 for the image field.
  // Pass URLs directly to avoid unnecessary base64 conversion (reduces payload size).
  // Local files and data URIs still need conversion to base64.
  let imageValue = args.image;
  if (args.image) {
    // Pass remote URLs directly — the API supports them natively
    if (args.image.startsWith("http://") || args.image.startsWith("https://")) {
      console.log("[Wan I2V Job] Passing remote image URL directly to API");
      imageValue = args.image;
    } else if (args.image.startsWith("/uploads/")) {
      console.log("[Wan I2V Job] Converting local file to base64...");
      try {
        const b64 = await localFileToBase64(args.image);
        console.log(
          "[Wan I2V Job] Local file converted, base64 length:",
          b64.length,
        );
        imageValue = b64;
      } catch (fetchError) {
        console.error(
          "[Wan I2V Job] Failed to read local file:",
          fetchError.message,
        );
        throw new Error(`Failed to read local file: ${fetchError.message}`);
      }
    } else if (
      args.image.length > 100 &&
      /^[A-Za-z0-9+/=]+$/.test(args.image)
    ) {
      console.log(
        "[Wan I2V Job] Image appears to be base64 already, length:",
        args.image.length,
      );
      imageValue = args.image;
    } else {
      console.log("[Wan I2V Job] Unknown image format, attempting to resolve...");
      try {
        if (args.image.startsWith("/") || args.image.startsWith(".")) {
          imageValue = await localFileToBase64(args.image);
        } else {
          // Try passing as URL — the API supports URLs natively
          imageValue = args.image;
        }
        console.log(
          "[Wan I2V Job] Image resolved, length:",
          typeof imageValue === "string" ? imageValue.length : "URL",
        );
      } catch (fetchError) {
        console.error(
          "[Wan I2V Job] Failed to process image:",
          fetchError.message,
        );
        throw new Error(
          "Invalid image format: expected base64, URL, or local file path",
        );
      }
    }
  }

  if (isCanceled()) throw new Error("Canceled");

  await setProgress(20, { stage: "requesting_provider" });

  // Convert non-JPEG images to JPEG (strips alpha channel, ensures RGB compatibility)
  if (imageValue && !imageValue.startsWith("http")) {
    const prefix = imageValue.substring(0, 20);
    const formatHint = prefix.startsWith("/9j/") ? "JPEG"
      : prefix.startsWith("iVBOR") ? "PNG"
      : prefix.startsWith("UklGR") ? "WEBP"
      : prefix.startsWith("R0lGO") ? "GIF"
      : `unknown (prefix: ${prefix.substring(0, 8)})`;
    console.log("[Wan I2V Job] Image format detected:", formatHint, "| base64 length:", imageValue.length);

    if (!prefix.startsWith("/9j/")) {
      try {
        const originalLen = imageValue.length;
        imageValue = await ensureJpegBase64(imageValue);
        console.log(`[Wan I2V Job] Converted ${formatHint} → JPEG | base64 length: ${originalLen} → ${imageValue.length}`);
      } catch (convErr) {
        console.error("[Wan I2V Job] Image conversion failed:", convErr.message);
      }
    }
  }

  // Chutes Wan 2.2 I2V API expects flat parameters (no "args" wrapper)
  const requestData = { ...args, image: imageValue };

  // Build headers — skip Authorization for public chutes
  const isPublicChute = providerContext.isPublicChute;
  const apiKey = providerContext.provider?.apiKey;
  const requestHeaders = { "Content-Type": "application/json" };
  if (!isPublicChute && apiKey && apiKey !== "public") {
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }

  // Retry logic for transient Chutes infrastructure errors (500 with "No infrastructure available" etc.)
  const MAX_WAN_RETRIES = 3;
  const RETRY_DELAYS = [15000, 30000, 60000]; // 15s, 30s, 60s exponential backoff
  let lastError = null;
  let response;

  for (let attempt = 0; attempt <= MAX_WAN_RETRIES; attempt++) {
    if (isCanceled()) throw new Error("Canceled");

    try {
      if (attempt > 0) {
        console.log(`[Wan I2V Job] Retry attempt ${attempt}/${MAX_WAN_RETRIES} after ${RETRY_DELAYS[attempt - 1] / 1000}s...`);
        await setProgress(20 + attempt * 5, { stage: "retrying", attempt });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
      }

      console.log("[Wan I2V Job] Sending request to:", WAN_I2V_ENDPOINT, attempt > 0 ? `(attempt ${attempt + 1})` : "");
      const debugArgs = { ...requestData, image: `<${typeof requestData.image === "string" ? (requestData.image.startsWith("http") ? "URL" : "base64") : "unknown"} len=${String(requestData.image || "").length}>`, prompt: `<len=${String(requestData.prompt || "").length}>` };
      console.log("[Wan I2V Job] Full args (redacted):", JSON.stringify(debugArgs));
      console.log("[Wan I2V Job] Frames:", args.frames);

      const wanTimeoutMs = getWanI2VTimeoutMs({
        providerTimeoutMs: providerTimeout,
        frames: args.frames,
      });

      response = await axios.post(WAN_I2V_ENDPOINT, requestData, {
        headers: requestHeaders,
        timeout: wanTimeoutMs,
        responseType: "arraybuffer",
      });

      // Success — break out of retry loop
      break;
    } catch (axiosError) {
      lastError = axiosError;

      // Parse error details
      let errorMessage = "Wan I2V generation failed";
      const networkErrors = [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "ECONNREFUSED",
        "ENETUNREACH",
        "EAI_AGAIN",
      ];
      if (networkErrors.includes(axiosError.code)) {
        errorMessage =
          "Network error: Unable to connect to the video generation service.";
      } else if (axiosError.code === "ECONNABORTED") {
        errorMessage =
          "Request timeout: The video generation service took too long to respond.";
      } else if (axiosError.response?.data) {
        try {
          const errorBuffer = Buffer.from(axiosError.response.data);
          const errorJson = JSON.parse(errorBuffer.toString("utf8"));
          errorMessage =
            errorJson.detail ||
            errorJson.error?.message ||
            errorJson.message ||
            errorMessage;
        } catch {
          try {
            const errorBuffer = Buffer.from(axiosError.response.data);
            errorMessage = errorBuffer.toString("utf8").slice(0, 500);
          } catch {
            // ignore
          }
        }
      }

      console.error("[Wan I2V Job] API error:", axiosError.message);
      if (axiosError.response?.data) {
        try {
          const rawBody = Buffer.from(axiosError.response.data).toString("utf8");
          console.error("[Wan I2V Job] Status:", axiosError.response?.status, "Response body:", rawBody);
        } catch {
          console.error("[Wan I2V Job] Status:", axiosError.response?.status, "Data length:", axiosError.response?.data?.length ?? 0);
        }
      }

      // Only retry on server errors that may be transient
      const isRetryable =
        axiosError.response?.status === 500 ||
        axiosError.response?.status === 502 ||
        axiosError.response?.status === 503;

      if (isRetryable && attempt < MAX_WAN_RETRIES) {
        console.warn(
          `[Wan I2V Job] Retriable error (${axiosError.response?.status}): "${errorMessage}". Will retry...`,
        );
        continue;
      }

      // Provide friendlier messages for common Chutes infrastructure errors
      if (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("infrastructure")) {
        errorMessage = "The video generation service is currently busy. Please try again in a few minutes.";
      }

      throw new Error(errorMessage);
    }
  }

  // Should not reach here, but guard against missing response
  if (!response) {
    throw new Error(lastError?.message || "Wan I2V generation failed — no response");
  }

  await setProgress(80, { stage: "processing_response" });

  // Parse the response — may be binary video data or JSON
  const buffer = Buffer.from(response.data);
  const isMp4Data =
    buffer.length > 12 &&
    (buffer.toString("ascii", 4, 8) === "ftyp" ||
      buffer.includes(Buffer.from("ftyp"), 4));

  let binaryBuffer = null;
  let result = null;

  if (isMp4Data || buffer.length > 100000) {
    const isJson =
      buffer.length > 0 && (buffer[0] === 0x7b || buffer[0] === 0x5b);
    if (!isJson) {
      binaryBuffer = buffer;
    } else {
      try {
        result = JSON.parse(buffer.toString("utf8"));
      } catch {
        binaryBuffer = buffer;
      }
    }
  } else {
    try {
      result = JSON.parse(buffer.toString("utf8"));
    } catch {
      binaryBuffer = buffer;
    }
  }

  // Handle array / array-like responses (chutes.ai sometimes returns video as byte arrays)
  if (!binaryBuffer && Array.isArray(result) && result.length > 10000) {
    try {
      binaryBuffer = Buffer.from(result);
    } catch {
      // ignore
    }
  }
  if (!binaryBuffer && typeof result === "object" && result !== null) {
    const keys = Object.keys(result);
    if (keys.length > 10000 && keys.every((k) => /^\d+$/.test(k))) {
      try {
        const values = keys
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((k) => result[k]);
        binaryBuffer = Buffer.from(values);
      } catch {
        // ignore
      }
    }
  }

  // Check for base64-encoded video in string fields
  let binaryData = null;
  if (!binaryBuffer && result) {
    for (const [, value] of Object.entries(result)) {
      if (typeof value === "string" && value.length > 5000) {
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
    if (!binaryData && result.data && typeof result.data === "string") {
      if (result.data.includes("ftyp") || result.data.length > 10000) {
        binaryData = result.data;
      }
    }
  }

  const providerId = providerContext.providerId;

  // ── Binary video data → save to disk ──────────────────────────────
  if (binaryBuffer || binaryData) {
    const fs = await import("fs");
    const path = await import("path");
    const crypto = await import("crypto");
    const { exec } = await import("child_process");

    const videoBuffer = binaryBuffer || Buffer.from(binaryData, "base64");
    const videoHash = crypto
      .createHash("md5")
      .update(videoBuffer)
      .digest("hex");
    const slug = String(prompt || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    const namePrefix = slug ? `wan_i2v_${slug}` : "wan_i2v";
    const filename = `${namePrefix}_${Date.now()}_${videoHash.substring(0, 8)}.mp4`;
    const thumbFilename = `${namePrefix}_${Date.now()}_${videoHash.substring(0, 8)}.jpg`;
    const videosDir = path.join(process.cwd(), "data", "uploads", "videos");

    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }

    const videoPath = path.join(videosDir, filename);
    const thumbPath = path.join(videosDir, thumbFilename);
    fs.writeFileSync(videoPath, videoBuffer);

    let thumbnailUrl = null;
    try {
      await new Promise((resolve) => {
        exec(
          `ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${thumbPath}"`,
          { timeout: 10000 },
          () => resolve(),
        );
      });
      if (fs.existsSync(thumbPath)) {
        thumbnailUrl = `/uploads/videos/${thumbFilename}`;
      }
    } catch {
      // thumbnail generation is optional
    }

    const videoUrl = `/uploads/videos/${filename}`;

    await libraryService.createAsset({
      type: "video",
      source: "video",
      title: prompt.slice(0, 80) || "Generated video",
      url: videoUrl,
      metadata: { model: modelId, provider: providerId },
    });

    await setProgress(100, { stage: "completed" });
    return {
      success: true,
      data: [
        {
          url: videoUrl,
          thumbnail: thumbnailUrl,
          revised_prompt: prompt,
        },
      ],
      id: result?.id || result?.job_id || result?.request_id || null,
    };
  }

  // ── JSON response with URL ────────────────────────────────────────
  let videoUrl = null;
  if (result) {
    // Try common URL fields
    videoUrl =
      result.url ||
      result.video_url ||
      result.output?.url ||
      result.data?.url ||
      null;

    // Try extracting URL from text content
    if (!videoUrl && typeof result.data === "string") {
      const urlMatch = result.data.match(/https?:\/\/[^\s"')\]]+/);
      if (urlMatch) videoUrl = urlMatch[0];
    }
    if (!videoUrl && result.choices?.[0]?.message?.content) {
      const content = result.choices[0].message.content;
      const urlMatch = content.match(/https?:\/\/[^\s"')\]]+/);
      if (urlMatch) videoUrl = urlMatch[0];
    }
    // Numeric keyed object — skip
  }

  if (!videoUrl) {
    throw new Error(
      "Wan I2V response did not include a video URL. Raw response: " +
        JSON.stringify(result).slice(0, 500),
    );
  }

  await libraryService.createAsset({
    type: "video",
    source: "video",
    title: String(prompt).slice(0, 80) || "Generated video",
    url: videoUrl,
    metadata: {
      model: modelId,
      provider: providerId,
      endpoint: "wan-i2v-fast",
    },
  });

  await setProgress(100, { stage: "completed" });
  return {
    success: true,
    data: [
      {
        url: videoUrl,
        revised_prompt: prompt,
      },
    ],
    id: result?.id || result?.job_id || result?.request_id || null,
  };
}

async function processMusicJob({ payload, setProgress, isCanceled }) {
  const prompt = getPromptFromPayload(payload);
  if (!prompt) throw new Error("Prompt required");

  await setProgress(5, { stage: "validating" });

  const providerContext = await resolveProviderContext(config, {
    requestedProvider: payload?.provider,
    modelId: payload?.model,
    modelKey: payload?.modelKey,
  });

  const modelId = payload?.model || config.defaultModel;
  const modelInfo = await findModel(
    config,
    modelId,
    providerContext.providerId,
    payload?.modelKey,
  );
  if (!modelInfo || !modelInfo.categories.includes("music")) {
    throw new Error(
      `Model ${modelId || payload?.modelKey} is not available for music generation on gateway ${providerContext.providerId}`,
    );
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

  if (isCanceled()) throw new Error("Canceled");

  await setProgress(20, { stage: "requesting_provider" });

  // Ollama Cloud uses /api/chat — no native music generation
  if (isOllamaProvider(providerContext)) {
    const messages = [{ role: "user", content: prompt }];
    const ollamaRequest = buildOllamaChatRequest(messages, actualModelId);

    try {
      const response = await axios.post(
        `${providerContext.provider.apiBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: {
            Authorization: `Bearer ${providerContext.provider.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: providerContext.provider.timeout?.video || 300000,
        },
      );

      const openaiResponse = transformOllamaToOpenAI(
        response.data,
        actualModelId,
      );
      await setProgress(100, { stage: "completed" });
      return openaiResponse;
    } catch (error) {
      throw buildAxiosError(error, "Music generation failed (Ollama Cloud)");
    }
  }

  try {
    const response = await axios.post(
      `${providerContext.provider.apiBaseUrl}/chat/completions`,
      {
        model: actualModelId,
        messages: [{ role: "user", content: prompt }],
        ...(payload?.voice ? { voice: payload.voice } : {}),
        ...(payload?.format ? { format: payload.format } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${providerContext.provider.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: providerContext.provider.timeout?.video || 300000,
      },
    );

    const result = response.data;
    const content = result?.choices?.[0]?.message?.content;

    if (!content) {
      await setProgress(100, { stage: "completed" });
      return result;
    }

    const urls = String(content)
      .split(/\s+/)
      .filter((part) => part.startsWith("http"));

    const outputUrl = urls[0] || content || null;
    if (outputUrl) {
      await libraryService.createAsset({
        type: "audio",
        source: "music",
        title: prompt.slice(0, 80) || "Generated music",
        url: outputUrl,
        metadata: { model: modelId, provider: providerContext.providerId },
      });
    }
    await setProgress(100, { stage: "completed" });

    return {
      success: true,
      data: [
        {
          url: urls[0] || content,
          raw: content,
          revised_prompt: prompt,
        },
      ],
    };
  } catch (error) {
    throw buildAxiosError(error, "Music generation failed");
  }
}

async function processPipelineJob({ payload, setProgress }) {
  await setProgress(20, { stage: "pipeline_enqueued" });
  await setProgress(100, {
    stage: "pipeline_tracking",
    type: payload?.pipelineType || "custom",
  });
  return {
    success: true,
    pipelineType: payload?.pipelineType || "custom",
    message: "Pipeline root job created",
  };
}

jobQueue.registerProcessor("chat", processChatJob);
jobQueue.registerProcessor("image", processImageJob);
jobQueue.registerProcessor("video", processVideoJob);
jobQueue.registerProcessor("music", processMusicJob);
jobQueue.registerProcessor("pipeline", processPipelineJob);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/image", imageRoutes);
app.use("/api/video", videoRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/config", configRoutes);
app.use("/api/models", modelsRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/pipelines", pipelinesRoutes);
app.use("/api/editor", editorRoutes);
app.use("/api/chutes", chutesRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Blackbox AI Backend running on port ${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api`);
});
