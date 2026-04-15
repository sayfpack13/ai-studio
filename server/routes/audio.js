import express from "express";
import { requireApiKey } from "../middleware/auth.js";
import { findModel } from "../utils/models.js";
import libraryService from "../services/library-service.js";
import { saveBuffer } from "../services/file-storage.js";
import {
  generateVideoToAudio as hfGenerateVideoToAudio,
  generateTextToAudio as hfGenerateTextToAudio,
  downloadGradioFile,
} from "../utils/gradio-client.js";

const router = express.Router();

const DEFAULT_MMAUDIO_SPACE = "hkchengrex/MMAudio";

router.use(requireApiKey);

/**
 * POST /api/audio/generate
 *
 * Generate audio from video (video-to-audio) or from text (text-to-audio)
 * using the MMAudio HuggingFace Space.
 *
 * Body:
 *   mode: "video_to_audio" | "text_to_audio" (default: "video_to_audio")
 *   prompt: string (audio description)
 *   negativePrompt: string (default: "music")
 *   seed: number (default: -1, random)
 *   numSteps: number (default: 25)
 *   cfgStrength: number (default: 4.5)
 *   duration: number (default: 8, seconds)
 *
 * For video_to_audio mode:
 *   videoUrl: string (URL to video)
 *   videoBase64: string (base64-encoded video data)
 *
 * For text_to_audio mode:
 *   prompt: string (required)
 */
router.post("/generate", async (req, res) => {
  const {
    mode = "video_to_audio",
    prompt = "",
    negativePrompt = "music",
    seed = -1,
    numSteps = 25,
    cfgStrength = 4.5,
    duration = 8,
    videoUrl,
    videoBase64,
    model,
    provider,
    modelKey,
    hfSpaceTarget,
    hfCustomSpace,
  } = req.body || {};

  const config = req.config;
  const isVideoToAudio = mode === "video_to_audio";

  // ── Validate inputs ────────────────────────────────────────────────
  if (isVideoToAudio && !videoUrl && !videoBase64) {
    return res.status(400).json({
      error: "videoUrl or videoBase64 is required for video-to-audio mode",
    });
  }

  if (!isVideoToAudio && !prompt.trim()) {
    return res.status(400).json({
      error: "Prompt is required for text-to-audio mode",
    });
  }

  // ── Resolve provider context ───────────────────────────────────────
  const { resolveProviderContext } = await import("../utils/provider-routing.js");
  let providerContext;
  try {
    providerContext = await resolveProviderContext(config, {
      requestedProvider: provider || "huggingface",
      modelId: model,
      modelKey,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const modelId = model || "huggingface/hkchengrex/MMAudio";
  const modelInfo = await findModel(
    config,
    modelId,
    providerContext.providerId,
    modelKey,
  );

  if (!modelInfo || !modelInfo.categories.includes("audio")) {
    return res.status(400).json({
      error: `Model ${modelId || modelKey} is not available for audio generation on gateway ${providerContext.providerId}`,
    });
  }

  // ── Determine Space URL ────────────────────────────────────────────
  const hfToken = providerContext.provider.apiKey || process.env.HF_TOKEN || undefined;
  const spaceTarget = String(hfSpaceTarget || "").toLowerCase();
  const customSpace = String(hfCustomSpace || "").trim();

  let spaceUrl;
  if (spaceTarget === "custom") {
    spaceUrl = customSpace || process.env.HF_MMAUDIO_SPACE_URL || DEFAULT_MMAUDIO_SPACE;
  } else {
    spaceUrl = DEFAULT_MMAUDIO_SPACE;
  }

  // ── Generate audio ─────────────────────────────────────────────────
  try {
    let result;

    if (isVideoToAudio) {
      // Resolve video input
      let videoInput;
      if (videoUrl && videoUrl.startsWith("/uploads/")) {
        // Local file — read and convert to buffer
        const fs = await import("fs/promises");
        const path = await import("path");
        const localPath = path.join(process.cwd(), "data", videoUrl);
        const buffer = await fs.readFile(localPath);
        videoInput = buffer;
      } else if (videoUrl && videoUrl.startsWith("http")) {
        videoInput = videoUrl;
      } else if (videoBase64) {
        const cleanBase64 = videoBase64.replace(/^data:[^;]+;base64,/, "");
        videoInput = Buffer.from(cleanBase64, "base64");
      } else {
        return res.status(400).json({ error: "Invalid video input" });
      }

      result = await hfGenerateVideoToAudio(spaceUrl, hfToken, {
        video: videoInput,
        prompt: String(prompt ?? ""),
        negative_prompt: String(negativePrompt ?? "music"),
        seed: Number(seed) || -1,
        num_steps: Number(numSteps) || 25,
        cfg_strength: Number(cfgStrength) || 4.5,
        duration: Number(duration) || 8,
      });
    } else {
      result = await hfGenerateTextToAudio(spaceUrl, hfToken, {
        prompt: String(prompt ?? ""),
        negative_prompt: String(negativePrompt ?? "music"),
        seed: Number(seed) || -1,
        num_steps: Number(numSteps) || 25,
        cfg_strength: Number(cfgStrength) || 4.5,
        duration: Number(duration) || 8,
      });
    }

    // ── Download and save result ──────────────────────────────────────
    const resultUrl = result.url;
    const resultBuffer = await downloadGradioFile(resultUrl, hfToken);

    // Determine MIME type based on mode
    // video_to_audio returns a video file with embedded audio (mp4)
    // text_to_audio returns an audio file (wav or mp3)
    const mimeType = isVideoToAudio ? "video/mp4" : "audio/wav";
    const prefix = isVideoToAudio ? "audio_video" : "audio_text";

    const saved = await saveBuffer(resultBuffer, mimeType, prefix);

    // Create library asset
    await libraryService.createAsset({
      type: isVideoToAudio ? "video" : "audio",
      source: "audio",
      title: prompt
        ? String(prompt).slice(0, 80)
        : isVideoToAudio
          ? "Video with generated audio"
          : "Generated audio",
      url: saved.url,
      filePath: saved.filepath,
      metadata: {
        model: modelId,
        provider: "huggingface",
        mode,
        prompt: String(prompt ?? ""),
        negativePrompt: String(negativePrompt ?? "music"),
        seed: Number(seed) || -1,
        numSteps: Number(numSteps) || 25,
        cfgStrength: Number(cfgStrength) || 4.5,
        duration: Number(duration) || 8,
        sizeBytes: saved.size,
      },
    });

    return res.json({
      success: true,
      data: {
        url: saved.url,
        mode,
        prompt: String(prompt ?? ""),
        seed: Number(seed) || -1,
      },
    });
  } catch (error) {
    console.error("[Audio Generate] Error:", error.message);

    // Provide helpful hint for GPU quota errors
    let errorMessage = error.message;
    if (/exceeded your gpu quota|gpu quota/i.test(errorMessage)) {
      errorMessage += " Use your own duplicated Space for dedicated quota (set HF_MMAUDIO_SPACE_URL or use a custom Space URL).";
    }

    return res.status(500).json({ error: errorMessage });
  }
});

export default router;