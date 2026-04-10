import express from "express";
import axios from "axios";
import { appendFile, mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { requireApiKey } from "../middleware/auth.js";
import { findModel } from "../utils/models.js";
import libraryService from "../services/library-service.js";
import { saveBuffer } from "../services/file-storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
router.use(requireApiKey);

const CHUTES_DIRECT_ENDPOINT_MODELS = {
  "z-image-turbo": "https://chutes-z-image-turbo.chutes.ai/generate",
  "hunyuan-image-3": "https://chutes-hunyuan-image-3.chutes.ai/generate",
};

const CHUTES_SHARED_IMAGE_MODELS = new Set(["Qwen-Image-2512", "JuggernautXL"]);

function normalizeChutesImageModel(modelId = "") {
  return String(modelId || "")
    .replace(/^chutes\//i, "")
    .trim();
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeProviderParams(params = {}) {
  return Object.entries(params).reduce((acc, [key, value]) => {
    if (value == null || value === "") return acc;
    if (typeof value === "number" && !Number.isFinite(value)) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function isImageUrlLike(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  );
}

function extractUrlFromText(text) {
  if (typeof text !== "string") return null;
  const direct = text.trim();
  if (isImageUrlLike(direct)) {
    return direct;
  }

  const match = direct.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function toDataImageUrl(base64) {
  if (typeof base64 !== "string") return null;
  const normalized = base64.trim();
  if (!normalized) return null;

  if (normalized.startsWith("data:image/")) {
    return normalized;
  }

  const likelyBase64 =
    /^[A-Za-z0-9+/=\r\n]+$/.test(normalized) && normalized.length > 100;
  if (!likelyBase64) {
    return null;
  }

  return `data:image/png;base64,${normalized.replace(/\s+/g, "")}`;
}

function extractFirstImageUrl(value, depth = 0) {
  if (depth > 6 || value == null) return null;

  if (typeof value === "string") {
    return extractUrlFromText(value);
  }

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

function sanitizeDebugValue(value, depth = 0) {
  if (depth > 3) return "[max-depth]";

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `[buffer ${value.length} bytes]`;
  }

  if (typeof value === "string") {
    if (value.length > 300) {
      return `${value.slice(0, 300)}... [truncated ${value.length - 300} chars]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 10)
      .map((item) => sanitizeDebugValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).slice(0, 25);
    return entries.reduce((acc, [key, item]) => {
      acc[key] = sanitizeDebugValue(item, depth + 1);
      return acc;
    }, {});
  }

  return value;
}

function parseChutesResponsePayload(response) {
  const contentType = String(
    response?.headers?.["content-type"] || "",
  ).toLowerCase();
  const data = response?.data;

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    if (contentType.startsWith("image/")) {
      const mimeType = contentType.split(";")[0] || "image/png";
      return {
        parsed: {
          success: true,
          data: [
            {
              url: `data:${mimeType};base64,${data.toString("base64")}`,
            },
          ],
        },
        contentType,
      };
    }

    const asText = data.toString("utf8");

    if (contentType.includes("application/json")) {
      try {
        return { parsed: JSON.parse(asText), contentType };
      } catch {
        return { parsed: asText, contentType };
      }
    }

    return { parsed: asText, contentType };
  }

  if (typeof data === "string") {
    if (contentType.includes("application/json")) {
      try {
        return { parsed: JSON.parse(data), contentType };
      } catch {
        return { parsed: data, contentType };
      }
    }

    return { parsed: data, contentType };
  }

  return { parsed: data, contentType };
}

function parseProviderErrorPayload(errorData) {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(errorData)) {
    const asText = errorData.toString("utf8");
    try {
      return JSON.parse(asText);
    } catch {
      return asText;
    }
  }

  if (typeof errorData === "string") {
    try {
      return JSON.parse(errorData);
    } catch {
      return errorData;
    }
  }

  return errorData;
}

function getErrorMessageFromPayload(payload) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  return payload?.error?.message || payload?.detail || payload?.message || null;
}

async function persistImageErrorLog(logEntry) {
  try {
    const logsDir = join(__dirname, "..", "logs");
    await mkdir(logsDir, { recursive: true });
    const filePath = join(logsDir, "image-generation-errors.log");
    const line = `${JSON.stringify(logEntry)}\n`;
    await appendFile(filePath, line, "utf8");
  } catch {
    // Do not fail request because logging failed
  }
}

function extractFirstBase64Image(value, depth = 0) {
  if (depth > 6 || value == null) return null;

  if (typeof value === "string") {
    return toDataImageUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstBase64Image(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    const preferredKeys = ["b64_json", "base64", "image_base64", "b64"];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = extractFirstBase64Image(value[key], depth + 1);
        if (found) return found;
      }
    }

    for (const nested of Object.values(value)) {
      const found = extractFirstBase64Image(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

// Detect if response contains binary image data (PNG, JPEG signatures)
function containsBinaryImageData(result) {
  if (!result || typeof result !== "object") return false;

  const checkBinary = (value) => {
    if (typeof value === "string") {
      // Check for PNG signature (89 50 4E 47 0D 0A 1A 0A)
      if (value.includes("\x89PNG") || value.startsWith("\x89PNG")) return true;
      // Check for JPEG signature (FF D8 FF)
      if (value.includes("\xFF\xD8\xFF") || value.startsWith("\xFF\xD8\xFF"))
        return true;
      // Check for GIF signature (GIF89a or GIF87a)
      if (value.includes("GIF89a") || value.includes("GIF87a")) return true;
      // Check for WebP signature (RIFF....WEBP)
      if (value.includes("RIFF") && value.includes("WEBP")) return true;
    }
    return false;
  };

  // Check providerResponse for binary data
  if (result.providerResponse && checkBinary(result.providerResponse)) {
    return true;
  }

  // Check common response fields
  for (const field of [
    "image",
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

async function saveBinaryImageResponse(result, prompt, modelId, providerId) {
  try {
    // Find the binary data
    let binaryData = null;
    let mimeType = "image/png"; // default

    if (
      result.providerResponse &&
      typeof result.providerResponse === "string"
    ) {
      binaryData = result.providerResponse;
      if (binaryData.includes("\xFF\xD8\xFF")) mimeType = "image/jpeg";
      else if (binaryData.includes("GIF")) mimeType = "image/gif";
      else if (binaryData.includes("WEBP")) mimeType = "image/webp";
    }

    if (!binaryData) return null;

    // Save to file
    const buffer = Buffer.from(binaryData, "base64");
    const slug = slugifyPrompt(prompt);
    const prefix = slug ? `image_${slug}` : "generated_image";
    const saved = await saveBuffer(buffer, mimeType, prefix);

    // Add to library
    await libraryService.createAsset({
      type: "image",
      source: "image",
      title: prompt.slice(0, 80) || "Generated image",
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
    console.error("Failed to save binary image:", err.message);
    return null;
  }
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

  const extractedBase64Image = extractFirstBase64Image(result);
  if (extractedBase64Image) {
    return {
      success: true,
      data: [
        {
          url: extractedBase64Image,
          revised_prompt: prompt,
        },
      ],
    };
  }

  return null;
}

// Image generation endpoint - uses same /chat/completions endpoint with image models
router.post("/generate", async (req, res) => {
  try {
    const {
      prompt,
      model,
      modelKey,
      input_args: inputArgs,
      negativePrompt,
      width,
      height,
      guidanceScale,
      numInferenceSteps,
      aspectRatio,
      provider: _requestedProvider,
      allowFallback,
      debug,
      extraParams,
      localOllamaUrl,
      ...additionalParams
    } = req.body;

    const mergedExtraParams = {
      ...(additionalParams || {}),
      ...(extraParams && typeof extraParams === "object" ? extraParams : {}),
    };
    const sanitizedExtraParams = sanitizeProviderParams(mergedExtraParams);

    const normalizedWidth = toFiniteNumberOrNull(width);
    const normalizedHeight = toFiniteNumberOrNull(height);
    const normalizedGuidanceScale = toFiniteNumberOrNull(guidanceScale);
    const normalizedNumInferenceSteps = toFiniteNumberOrNull(numInferenceSteps);
    const normalizedAspectRatio =
      typeof aspectRatio === "string" && aspectRatio.trim()
        ? aspectRatio.trim()
        : null;
    const fallbackEnabled = allowFallback !== false;
    const debugEnabled = Boolean(debug);

    const promptFromInputArgs =
      inputArgs && typeof inputArgs === "object" ? inputArgs.prompt : undefined;
    const effectivePrompt =
      typeof prompt === "string" && prompt.trim()
        ? prompt
        : typeof promptFromInputArgs === "string"
          ? promptFromInputArgs
          : "";

    if (!effectivePrompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.image || 120000;

    const isLocalOllama = !!(localOllamaUrl && providerId === "ollama");

    if (!isLocalOllama) {
      const modelInfo = await findModel(
        req.config,
        modelId,
        providerId,
        modelKey,
      );
      if (!modelInfo || !modelInfo.categories.includes("image")) {
        return res.status(400).json({
          error: `Model ${modelId || modelKey} is not available for image generation on gateway ${providerId}`,
        });
      }
    }

    if (providerId === "chutes") {
      const modelInfo = await findModel(
        req.config,
        modelId,
        providerId,
        modelKey,
      );
      const chutesModel = normalizeChutesImageModel(modelInfo.id || modelId);
      let endpoint = null;
      let requestData = null;

      // Declare z-image-turbo variables at higher scope for retry logic
      let zImageWidth = 1024;
      let zImageHeight = 1024;
      let zImageGuidanceScale = 0;
      let zImageNumInferenceSteps = 9;
      let zImageSeed = undefined;
      let zImageShift = undefined;
      let zImageMaxSeqLen = undefined;

      if (CHUTES_DIRECT_ENDPOINT_MODELS[chutesModel]) {
        endpoint = CHUTES_DIRECT_ENDPOINT_MODELS[chutesModel];

        if (chutesModel === "hunyuan-image-3") {
          // Hunyuan uses DIRECT parameters (NOT wrapped in input_args)
          // Same as z-image-turbo - Chutes API expects direct parameters
          const hunyuanInputArgsObj =
            inputArgs && typeof inputArgs === "object" ? inputArgs : {};

          requestData = {
            prompt: effectivePrompt,
            // Hunyuan uses size parameter (e.g., "1920x1080")
            // Hunyuan size format: can be "auto", "WxH", "W:H" (aspect ratio), or single number
            // Try aspect ratio format for widescreen: "16:9" instead of "1920x1080"
            size:
              hunyuanInputArgsObj.size != null
                ? (() => {
                    const sizeVal = String(hunyuanInputArgsObj.size);
                    // Convert WxH to aspect ratio if it's widescreen
                    if (sizeVal === "1920x1080" || sizeVal === "1280x720") {
                      return "16:9";
                    } else if (
                      sizeVal === "1080x1920" ||
                      sizeVal === "720x1280"
                    ) {
                      return "9:16";
                    } else if (sizeVal === "1920x1200") {
                      return "16:10";
                    }
                    return sizeVal;
                  })()
                : "1024x1024",
            steps:
              hunyuanInputArgsObj.steps != null
                ? Math.min(100, Math.max(10, Number(hunyuanInputArgsObj.steps)))
                : 20,
            ...(hunyuanInputArgsObj.seed != null &&
              hunyuanInputArgsObj.seed !== "" && {
                seed: Math.min(
                  4294967295,
                  Math.max(0, Number(hunyuanInputArgsObj.seed)),
                ),
              }),
          };

          console.log(
            "[hunyuan-image-3] Building request (NO input_args wrapper):",
          );
          console.log(
            "  - Final requestData:",
            JSON.stringify(requestData, null, 2),
          );
        } else if (chutesModel === "z-image-turbo") {
          // z-image-turbo uses input_args with width/height
          // guidance_scale max is 5, num_inference_steps max is 100
          // Read from inputArgs (sent by frontend) or fall back to top-level params
          const inputArgsObj =
            inputArgs && typeof inputArgs === "object" ? inputArgs : {};

          // Assign to higher-scoped let variables for retry logic access
          zImageWidth =
            inputArgsObj.width != null
              ? Math.min(2048, Math.max(576, Number(inputArgsObj.width)))
              : normalizedWidth != null
                ? Math.min(2048, Math.max(576, normalizedWidth))
                : 1024;
          zImageHeight =
            inputArgsObj.height != null
              ? Math.min(2048, Math.max(576, Number(inputArgsObj.height)))
              : normalizedHeight != null
                ? Math.min(2048, Math.max(576, normalizedHeight))
                : 1024;
          zImageGuidanceScale =
            inputArgsObj.guidance_scale != null
              ? Math.min(5, Math.max(0, Number(inputArgsObj.guidance_scale)))
              : normalizedGuidanceScale != null
                ? Math.min(5, Math.max(0, normalizedGuidanceScale))
                : 0;
          zImageNumInferenceSteps =
            inputArgsObj.num_inference_steps != null
              ? Math.min(
                  100,
                  Math.max(1, Number(inputArgsObj.num_inference_steps)),
                )
              : normalizedNumInferenceSteps != null
                ? Math.min(100, Math.max(1, normalizedNumInferenceSteps))
                : 9;
          zImageSeed =
            inputArgsObj.seed != null
              ? Math.min(4294967295, Math.max(0, Number(inputArgsObj.seed)))
              : sanitizedExtraParams.seed != null
                ? Math.min(4294967295, Math.max(0, sanitizedExtraParams.seed))
                : undefined;
          zImageShift =
            inputArgsObj.shift != null
              ? Math.min(10, Math.max(1, Number(inputArgsObj.shift)))
              : sanitizedExtraParams.shift != null
                ? Math.min(10, Math.max(1, sanitizedExtraParams.shift))
                : undefined;
          zImageMaxSeqLen =
            inputArgsObj.max_sequence_length != null
              ? Math.min(
                  2048,
                  Math.max(256, Number(inputArgsObj.max_sequence_length)),
                )
              : sanitizedExtraParams.max_sequence_length != null
                ? Math.min(
                    2048,
                    Math.max(256, sanitizedExtraParams.max_sequence_length),
                  )
                : undefined;

          // z-image-turbo uses DIRECT parameters (NOT wrapped in input_args)
          // See curl example: https://chutes-z-image-turbo.chutes.ai/generate with {"prompt": "..."}
          requestData = {
            prompt: effectivePrompt,
            width: zImageWidth,
            height: zImageHeight,
            guidance_scale: zImageGuidanceScale,
            num_inference_steps: zImageNumInferenceSteps,
            ...(zImageSeed !== undefined && { seed: zImageSeed }),
            ...(zImageShift !== undefined && { shift: zImageShift }),
            ...(zImageMaxSeqLen !== undefined && {
              max_sequence_length: zImageMaxSeqLen,
            }),
          };

          // Debug logging for z-image-turbo
          console.log(
            "[z-image-turbo] Building request (NO input_args wrapper):",
          );
          console.log(
            "  - inputArgs from frontend:",
            JSON.stringify(inputArgs, null, 2),
          );
          console.log(
            "  - Final requestData:",
            JSON.stringify(requestData, null, 2),
          );
        } else {
          // Other direct endpoint models
          requestData = {
            prompt: effectivePrompt,
            ...(negativePrompt && { negative_prompt: negativePrompt }),
            ...(normalizedGuidanceScale != null && {
              guidance_scale: normalizedGuidanceScale,
            }),
            ...(normalizedWidth != null && { width: normalizedWidth }),
            ...(normalizedHeight != null && { height: normalizedHeight }),
            ...(normalizedNumInferenceSteps != null && {
              num_inference_steps: normalizedNumInferenceSteps,
            }),
            ...sanitizedExtraParams,
          };
        }
      } else if (CHUTES_SHARED_IMAGE_MODELS.has(chutesModel)) {
        endpoint = "https://image.chutes.ai/generate";
        requestData =
          chutesModel === "Qwen-Image-2512"
            ? {
                model: chutesModel,
                input_args: {
                  prompt: effectivePrompt,
                  ...(inputArgs && typeof inputArgs === "object"
                    ? {
                        ...(inputArgs.seed !== undefined
                          ? { seed: inputArgs.seed }
                          : {}),
                        ...(inputArgs.width !== undefined
                          ? { width: inputArgs.width }
                          : {}),
                        ...(inputArgs.height !== undefined
                          ? { height: inputArgs.height }
                          : {}),
                        ...(inputArgs.true_cfg_scale !== undefined
                          ? { true_cfg_scale: inputArgs.true_cfg_scale }
                          : {}),
                        ...(inputArgs.negative_prompt !== undefined
                          ? { negative_prompt: inputArgs.negative_prompt }
                          : {}),
                        ...(inputArgs.num_inference_steps !== undefined
                          ? {
                              num_inference_steps:
                                inputArgs.num_inference_steps,
                            }
                          : {}),
                      }
                    : {}),
                  ...(negativePrompt && { negative_prompt: negativePrompt }),
                  ...(normalizedWidth != null && { width: normalizedWidth }),
                  ...(normalizedHeight != null && { height: normalizedHeight }),
                  ...(normalizedGuidanceScale != null && {
                    true_cfg_scale: normalizedGuidanceScale,
                  }),
                  ...(normalizedNumInferenceSteps != null && {
                    num_inference_steps: normalizedNumInferenceSteps,
                  }),
                },
                ...sanitizedExtraParams,
              }
            : {
                model: chutesModel,
                prompt: effectivePrompt,
                ...(negativePrompt && { negative_prompt: negativePrompt }),
                ...(normalizedGuidanceScale != null && {
                  guidance_scale: normalizedGuidanceScale,
                }),
                ...(normalizedWidth != null && { width: normalizedWidth }),
                ...(normalizedHeight != null && { height: normalizedHeight }),
                ...(normalizedNumInferenceSteps != null && {
                  num_inference_steps: normalizedNumInferenceSteps,
                }),
                ...sanitizedExtraParams,
              };
      } else {
        return res.status(400).json({
          error: `Unsupported Chutes image model: ${chutesModel}. Use z-image-turbo, hunyuan-image-3, Qwen-Image-2512, or JuggernautXL.`,
        });
      }

      let effectiveRequestData = requestData;
      let retryUsed = false;
      let fallbackUsed = false;
      let chutesResponse;

      // Debug logging before API call
      console.log("[Chutes API] Sending request to:", endpoint);
      console.log(
        "[Chutes API] Request payload:",
        JSON.stringify(effectiveRequestData, null, 2),
      );

      // Build headers - skip Authorization for public chutes
      const isPublicChute = req.providerContext?.isPublicChute;
      const requestHeaders = {
        "Content-Type": "application/json",
      };
      if (!isPublicChute && apiKey && apiKey !== "public") {
        requestHeaders.Authorization = `Bearer ${apiKey}`;
      }

      try {
        chutesResponse = await axios.post(endpoint, effectiveRequestData, {
          headers: requestHeaders,
          timeout,
          responseType: "arraybuffer",
          transformResponse: [(data) => data],
        });

        console.log("[Chutes API] Response status:", chutesResponse.status);
        console.log(
          "[Chutes API] Response content-type:",
          chutesResponse.headers["content-type"],
        );
      } catch (requestError) {
        console.log(
          "[Chutes API] Error status:",
          requestError.response?.status,
        );
        console.log(
          "[Chutes API] Error data:",
          requestError.response?.data?.toString?.() || requestError.message,
        );

        const parsedRequestError = parseProviderErrorPayload(
          requestError.response?.data,
        );
        const parsedRequestErrorMessage = String(
          getErrorMessageFromPayload(parsedRequestError) || "",
        ).toLowerCase();
        const requestErrorStatus = requestError.response?.status;
        const shouldRetryWithMinimalPayload =
          parsedRequestErrorMessage.includes("invalid input parameters") ||
          parsedRequestErrorMessage.includes("invalid request") ||
          parsedRequestErrorMessage.includes("bad request");

        const shouldRetryCapacity = requestErrorStatus === 429;

        if (shouldRetryCapacity) {
          retryUsed = true;
          const retryAfterHeader = Number(
            requestError.response?.headers?.["retry-after"],
          );
          const retryDelayMs =
            Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
              ? Math.min(retryAfterHeader, 5) * 1000
              : 1000;

          await waitMs(retryDelayMs);

          try {
            chutesResponse = await axios.post(endpoint, effectiveRequestData, {
              headers: requestHeaders,
              timeout,
              responseType: "arraybuffer",
              transformResponse: [(data) => data],
            });
          } catch (retryCapacityError) {
            const retryCapacityStatus = retryCapacityError.response?.status;
            if (
              retryCapacityStatus === 429 &&
              fallbackEnabled &&
              chutesModel !== "z-image-turbo"
            ) {
              fallbackUsed = true;
              endpoint = CHUTES_DIRECT_ENDPOINT_MODELS["z-image-turbo"];
              effectiveRequestData = { prompt };
              chutesResponse = await axios.post(
                endpoint,
                effectiveRequestData,
                {
                  headers: requestHeaders,
                  timeout,
                  responseType: "arraybuffer",
                  transformResponse: [(data) => data],
                },
              );
            } else {
              throw retryCapacityError;
            }
          }
        }

        if (!chutesResponse && !shouldRetryWithMinimalPayload) {
          throw requestError;
        }

        if (!chutesResponse && shouldRetryWithMinimalPayload) {
          retryUsed = true;

          const retryPayloadCandidates = CHUTES_SHARED_IMAGE_MODELS.has(
            chutesModel,
          )
            ? chutesModel === "Qwen-Image-2512"
              ? [
                  {
                    model: chutesModel,
                    input_args: {
                      prompt: effectivePrompt,
                      ...(inputArgs && typeof inputArgs === "object"
                        ? {
                            ...(inputArgs.seed !== undefined
                              ? { seed: inputArgs.seed }
                              : {}),
                            ...(inputArgs.width !== undefined
                              ? { width: inputArgs.width }
                              : {}),
                            ...(inputArgs.height !== undefined
                              ? { height: inputArgs.height }
                              : {}),
                            ...(inputArgs.true_cfg_scale !== undefined
                              ? { true_cfg_scale: inputArgs.true_cfg_scale }
                              : {}),
                            ...(inputArgs.negative_prompt !== undefined
                              ? { negative_prompt: inputArgs.negative_prompt }
                              : {}),
                            ...(inputArgs.num_inference_steps !== undefined
                              ? {
                                  num_inference_steps:
                                    inputArgs.num_inference_steps,
                                }
                              : {}),
                          }
                        : {}),
                    },
                  },
                ]
              : [{ model: chutesModel, prompt: effectivePrompt }]
            : chutesModel === "hunyuan-image-3"
              ? [
                  {
                    input_args: {
                      prompt: effectivePrompt,
                    },
                  },
                ]
              : chutesModel === "z-image-turbo"
                ? [
                    {
                      input_args: {
                        prompt: effectivePrompt,
                        width: zImageWidth,
                        height: zImageHeight,
                        guidance_scale: zImageGuidanceScale,
                        num_inference_steps: zImageNumInferenceSteps,
                        ...(zImageSeed !== undefined && { seed: zImageSeed }),
                        ...(zImageShift !== undefined && {
                          shift: zImageShift,
                        }),
                        ...(zImageMaxSeqLen !== undefined && {
                          max_sequence_length: zImageMaxSeqLen,
                        }),
                      },
                    },
                    {
                      input_args: {
                        prompt: effectivePrompt,
                        width: zImageWidth,
                        height: zImageHeight,
                      },
                    },
                    {
                      input_args: {
                        prompt: effectivePrompt,
                      },
                    },
                  ]
                : [{ prompt: effectivePrompt }];

          let lastRetryError = null;
          for (const candidate of retryPayloadCandidates) {
            effectiveRequestData = candidate;
            try {
              chutesResponse = await axios.post(
                endpoint,
                effectiveRequestData,
                {
                  headers: requestHeaders,
                  timeout,
                  responseType: "arraybuffer",
                  transformResponse: [(data) => data],
                },
              );
              break;
            } catch (candidateError) {
              lastRetryError = candidateError;
            }
          }

          if (!chutesResponse && lastRetryError) {
            throw lastRetryError;
          }
        }
      }

      const { parsed: chutesPayload, contentType } =
        parseChutesResponsePayload(chutesResponse);

      const transformed = toStandardImageResponse(
        chutesPayload,
        effectivePrompt,
      );
      if (transformed) {
        if (debugEnabled) {
          transformed.debug = {
            provider: providerId,
            model: chutesModel,
            endpoint,
            contentType,
            retryUsed,
            fallbackUsed,
            requestPayload: sanitizeDebugValue(effectiveRequestData),
            rawResponse: sanitizeDebugValue(chutesPayload),
          };
        }
        if (transformed?.data?.[0]?.url) {
          await libraryService.createAsset({
            type: "image",
            source: "image",
            title: effectivePrompt.slice(0, 80) || "Generated image",
            url: transformed.data[0].url,
            metadata: { model: modelId, provider: providerId },
          });
        }
        return res.json(transformed);
      }

      return res.status(502).json({
        error: "Chutes image API returned an unsupported response format",
        ...(debugEnabled
          ? {
              debug: {
                provider: providerId,
                model: chutesModel,
                endpoint,
                contentType,
                retryUsed,
                fallbackUsed,
                requestPayload: sanitizeDebugValue(effectiveRequestData),
                rawResponse: sanitizeDebugValue(chutesPayload),
              },
            }
          : {}),
      });
    }

    // Determine endpoint and request format
    const isOllamaNative =
      isLocalOllama ||
      provider.apiType === "ollama-native" ||
      providerId === "ollama";
    const effectiveBaseUrl = isLocalOllama
      ? localOllamaUrl.replace(/\/+$/, "")
      : apiBaseUrl;

    const fullPrompt = negativePrompt
      ? `${effectivePrompt}. Avoid: ${negativePrompt}`
      : effectivePrompt;

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

    let response;

    if (isOllamaNative) {
      // Ollama Cloud uses /api/chat with native format
      const ollamaRequest = {
        model: actualModelId,
        messages: [{ role: "user", content: fullPrompt }],
        stream: false,
        options: { temperature: 0.7 },
      };

      const ollamaHeaders = isLocalOllama
        ? { "Content-Type": "application/json" }
        : {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          };

      response = await axios.post(
        `${effectiveBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: ollamaHeaders,
          timeout,
        },
      );

      // Transform Ollama response to OpenAI format for downstream processing
      const ollamaData = response.data;
      response.data = {
        id: `ollama-${Date.now()}`,
        object: "chat.completion",
        model: actualModelId,
        choices: [
          {
            index: 0,
            message: {
              role: ollamaData.message?.role || "assistant",
              content: ollamaData.message?.content || "",
            },
            finish_reason: ollamaData.done ? "stop" : null,
          },
        ],
      };
    } else {
      const requestData = {
        model: actualModelId,
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
        // Some image models support these parameters
        ...(width && { width }),
        ...(height && { height }),
      };

      response = await axios.post(
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
    }

    const result = response.data;
    const transformed = toStandardImageResponse(result, effectivePrompt);
    if (transformed) {
      if (debugEnabled) {
        transformed.debug = {
          provider: providerId,
          model: actualModelId,
          endpoint: isOllamaNative
            ? `${apiBaseUrl}/api/chat`
            : `${apiBaseUrl}/chat/completions`,
          rawResponse: sanitizeDebugValue(result),
        };
      }
      if (transformed?.data?.[0]?.url) {
        // Check if response contains binary image data
        if (containsBinaryImageData(result)) {
          const fileUrl = await saveBinaryImageResponse(
            result,
            effectivePrompt,
            actualModelId,
            providerId,
          );
          if (fileUrl) {
            transformed.data[0].url = fileUrl;
          }
        }

        await libraryService.createAsset({
          type: "image",
          source: "image",
          title: effectivePrompt.slice(0, 80) || "Generated image",
          url: transformed.data[0].url,
          metadata: { model: modelId, provider: providerId },
        });
      }
      return res.json(transformed);
    }

    if (debugEnabled) {
      return res.status(502).json({
        error: "Image API returned an unsupported response format",
        debug: {
          provider: providerId,
          model: actualModelId,
          endpoint: isOllamaNative
            ? `${apiBaseUrl}/api/chat`
            : `${apiBaseUrl}/chat/completions`,
          rawResponse: sanitizeDebugValue(result),
        },
      });
    }

    return res.json(result);
  } catch (error) {
    const providerErrorPayload = parseProviderErrorPayload(
      error.response?.data,
    );
    const providerErrorMessage =
      getErrorMessageFromPayload(providerErrorPayload);

    console.error(
      "Image generation error:",
      providerErrorPayload || error.message,
    );

    await persistImageErrorLog({
      timestamp: new Date().toISOString(),
      route: "/api/image/generate",
      provider: req.providerContext?.providerId || null,
      model: req.body?.model || null,
      modelKey: req.body?.modelKey || null,
      promptPreview:
        typeof req.body?.prompt === "string"
          ? req.body.prompt.slice(0, 200)
          : null,
      status: error.response?.status || 500,
      upstreamError: sanitizeDebugValue(providerErrorPayload || error.message),
    });

    res.status(error.response?.status || 500).json({
      error: providerErrorMessage || "Image generation failed",
    });
  }
});

// Image editing endpoint
router.post("/edit", async (req, res) => {
  try {
    const {
      image,
      prompt,
      model,
      modelKey,
      provider: requestedProvider,
    } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: "Image and prompt required" });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext?.provider;
    const providerId = req.providerContext?.providerId;

    if (
      !provider ||
      (requestedProvider &&
        req.providerContext.providerId !== requestedProvider)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid provider context for image editing" });
    }

    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.image || 120000;

    const modelInfo = await findModel(
      req.config,
      modelId,
      providerId,
      modelKey,
    );
    if (!modelInfo || !modelInfo.categories.includes("image")) {
      return res.status(400).json({
        error: `Model ${modelId || modelKey} is not available for image editing on gateway ${providerId}`,
      });
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

    const isOllamaNative =
      provider.apiType === "ollama-native" || providerId === "ollama";

    let result;

    if (isOllamaNative) {
      // Ollama vision uses images[] field with base64 data
      const imageData = image.startsWith("data:")
        ? image.replace(/^data:[^;]+;base64,/, "")
        : image;

      const ollamaRequest = {
        model: actualModelId,
        messages: [
          {
            role: "user",
            content: prompt,
            images: [imageData],
          },
        ],
        stream: false,
        options: { temperature: 0.7 },
      };

      const response = await axios.post(
        `${apiBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        },
      );

      const ollamaData = response.data;
      result = {
        choices: [
          {
            message: {
              role: "assistant",
              content: ollamaData.message?.content || "",
            },
          },
        ],
      };
    } else {
      // For image editing, we send the image in messages (OpenAI format)
      const requestData = {
        model: actualModelId,
        messages: [
          {
            role: "user",
            content: [
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
            ],
          },
        ],
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

      result = response.data;
    }

    if (result.choices && result.choices[0]?.message?.content) {
      res.json({
        success: true,
        data: [
          {
            url: result.choices[0].message.content,
            revised_prompt: prompt,
          },
        ],
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error("Image edit error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || "Image edit failed",
    });
  }
});

export default router;
