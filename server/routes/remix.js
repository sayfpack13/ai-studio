import express from "express";
import {
  transcribeAudio,
  enhanceAudio,
  generateWithACEStep,
  streamGenerateWithACEStep,
  downloadGradioFile,
} from "../utils/gradio-client.js";
import { fetchInternalAiToken } from "../utils/acestep-api.js";
import { saveBuffer } from "../services/file-storage.js";
import libraryService from "../services/library-service.js";

const router = express.Router();

const DEFAULT_WHISPER_SPACE = "openai/whisper";
const DEFAULT_SONICMASTER_SPACE = "amaai-lab/SonicMaster";

const ACESTEP_MODELS = ["acestep-v15-turbo", "acestep-v15-turbo-shift3", "acestep-v15-xl-turbo"];

function normalizeAceStepModel(model) {
  const value = String(model || "").trim();
  if (value === "acestep-v15-xl-turbo") return "acestep-v15-turbo";
  return ACESTEP_MODELS.includes(value) ? value : "acestep-v15-turbo";
}

function normalizeCoverStrength(coverStrength) {
  if (coverStrength != null) {
    return Number(coverStrength);
  }
  return null;
}

function slugify(value = "", maxLength = 48) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

function normalizeAudioInput(body) {
  const { audioBase64, audioUrl, audioMime } = body;
  if (audioUrl && String(audioUrl).startsWith("http")) {
    return { type: "url", value: audioUrl, mime: audioMime || "audio/mpeg" };
  }
  if (audioBase64) {
    const clean = String(audioBase64).replace(/^data:[^;]+;base64,/, "");
    return { type: "base64", value: clean, mime: audioMime || "audio/mpeg" };
  }
  return null;
}

async function audioInputToBuffer(input) {
  if (!input) return null;
  if (input.type === "url") {
    const buf = await downloadGradioFile(input.value, null);
    return buf;
  }
  return Buffer.from(input.value, "base64");
}

router.post("/transcribe", async (req, res) => {
  try {
    const spaceUrl = String(req.body?.spaceUrl || DEFAULT_WHISPER_SPACE).trim();
    const task = String(req.body?.task || "transcribe").trim();

    const audioInput = normalizeAudioInput(req.body);
    if (!audioInput) {
      return res.status(400).json({ error: "audioBase64 or audioUrl is required" });
    }

    const buf = await audioInputToBuffer(audioInput);
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "Could not read audio data" });
    }

    const result = await transcribeAudio(spaceUrl, buf, task);

    return res.json({ success: true, data: { text: result.text } });
  } catch (error) {
    console.error("Remix transcribe error:", error.message);
    return res.status(500).json({
      error: error.message || "Transcription failed",
    });
  }
});

router.post("/enhance", async (req, res) => {
  try {
    const spaceUrl = String(req.body?.spaceUrl || DEFAULT_SONICMASTER_SPACE).trim();
    const prompt = String(req.body?.prompt || "Enhance the input audio").trim();

    const audioInput = normalizeAudioInput(req.body);
    if (!audioInput) {
      return res.status(400).json({ error: "audioBase64 or audioUrl is required" });
    }

    const buf = await audioInputToBuffer(audioInput);
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "Could not read audio data" });
    }

    const result = await enhanceAudio(spaceUrl, buf, prompt);

    const outputUrl = result.url;
    let savedUrl = outputUrl;

    if (outputUrl && !outputUrl.startsWith("data:")) {
      try {
        const fileBuf = await downloadGradioFile(outputUrl, null);
        const saved = await saveBuffer(fileBuf, "audio/wav", "enhanced_audio");
        savedUrl = saved.url;
      } catch (dlErr) {
        console.warn("[remix/enhance] Could not download result, using raw URL:", dlErr.message);
      }
    }

    return res.json({ success: true, data: { url: savedUrl } });
  } catch (error) {
    console.error("Remix enhance error:", error.message);
    return res.status(500).json({
      error: error.message || "Audio enhancement failed",
    });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const {
      mode = "create",
      description = "",
      tags = "",
      lyrics = "",
      duration = 60,
      seed = -1,
      inferStep = 60,
      guidanceScale = 15.0,
      refAudioStrength = 0.5,
      model,
      thinking,
      bpm,
      keyScale,
      timeSignature,
      coverStrength,
      negativeStyles,
      refAudioBase64,
      refAudioMime,
      audioMime,
      remixHistoryId,
    } = req.body || {};

    const effectiveMode = String(mode).trim().toLowerCase();

    if (effectiveMode === "create" && !String(description || "").trim()) {
      return res.status(400).json({ error: "description is required for create mode" });
    }
    if (effectiveMode === "generate" && !String(tags || "").trim() && !String(description || "").trim()) {
      return res.status(400).json({ error: "tags or description is required for generate mode" });
    }

    // Build source audio buffer if provided
    const audioInput = normalizeAudioInput(req.body);
    const sourceAudioMime = String(audioMime || audioInput?.mime || "audio/mpeg");
    let srcAudioBuf = null;
    if (audioInput) {
      srcAudioBuf = await audioInputToBuffer(audioInput);
    }

    // Build reference audio buffer if provided (style transfer)
    let refAudioBuf = null;
    if (refAudioBase64) {
      const raw = String(refAudioBase64).replace(/^data:[^;]+;base64,/, "");
      refAudioBuf = Buffer.from(raw, "base64");
    }

    const result = await generateWithACEStep({
      mode: effectiveMode,
      description: String(description || ""),
      tags: String(tags || ""),
      lyrics: String(lyrics || ""),
      audio_duration: duration != null ? Number(duration) : null,
      infer_step: Number(inferStep) || 60,
      guidance_scale: Number(guidanceScale) || 15.0,
      seed: Number(seed) || -1,
      src_audio: srcAudioBuf,
      ref_audio_strength: Number(refAudioStrength) || 0.5,
      model: normalizeAceStepModel(model),
      thinking: thinking !== false,
      bpm: bpm ? Number(bpm) : null,
      key_scale: keyScale ? String(keyScale) : null,
      time_signature: timeSignature ? Number(timeSignature) : null,
      cover_strength: normalizeCoverStrength(coverStrength),
      negative_styles: negativeStyles ? String(negativeStyles) : null,
      ref_audio: refAudioBuf,
      audio_mime: sourceAudioMime,
    });

    const { audio, audios, title, tags: generatedTags, lyrics: generatedLyrics, thumbnail } = result;

    const audioList = Array.isArray(audios) && audios.length > 0 ? audios : audio ? [audio] : [];
    const savedUrls = [];
    let savedThumbUrl = null;

    for (const audioItem of audioList) {
      try {
        const isDataUrl = audioItem.startsWith("data:");
        let audioBuf;
        if (isDataUrl) {
          const base64Part = audioItem.replace(/^data:[^;]+;base64,/, "");
          audioBuf = Buffer.from(base64Part, "base64");
        } else {
          audioBuf = await downloadGradioFile(audioItem, null);
        }

        const displayTitle = title || description || tags || "remix";
        const slug = slugify(displayTitle);
        const saved = await saveBuffer(audioBuf, "audio/wav", `remix_${slug}_${savedUrls.length + 1}`);
        savedUrls.push(saved.url);

        await libraryService.createAsset({
          type: "remix",
          source: "remix",
          title: `${String(displayTitle).slice(0, 70)} ${savedUrls.length}`,
          url: saved.url,
          filePath: saved.filepath,
          metadata: {
            mode: effectiveMode,
            tags: generatedTags || tags,
            lyrics: generatedLyrics || lyrics,
            description,
            duration: Number(duration) || 60,
            seed: Number(seed) || -1,
            space: "acemusic-api",
            remixHistoryId: remixHistoryId || null,
          },
        });
      } catch (saveErr) {
        console.warn("[remix/generate] Could not save audio file:", saveErr.message);
        savedUrls.push(audioItem);
      }
    }

    if (thumbnail) {
      try {
        const isDataUrl = thumbnail.startsWith("data:");
        let thumbBuf;
        if (isDataUrl) {
          const base64Part = thumbnail.replace(/^data:[^;]+;base64,/, "");
          thumbBuf = Buffer.from(base64Part, "base64");
        } else {
          thumbBuf = await downloadGradioFile(thumbnail, null);
        }
        const savedThumb = await saveBuffer(thumbBuf, "image/png", "remix_thumb");
        savedThumbUrl = savedThumb.url;
      } catch (thumbErr) {
        console.warn("[remix/generate] Could not save thumbnail:", thumbErr.message);
      }
    }

    return res.json({
      success: true,
      data: {
        url: savedUrls[0] || audio || null,
        urls: savedUrls,
        title: title || "",
        tags: generatedTags || tags || "",
        lyrics: generatedLyrics || lyrics || "",
        thumbnail: savedThumbUrl || thumbnail || null,
      },
    });
  } catch (error) {
    console.error("Remix generate error:", error.message);
    return res.status(500).json({
      error: error.message || "Remix generation failed",
    });
  }
});

router.post("/generate-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  };

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
    if (typeof res.flush === "function") res.flush();
  }, 8000);

  const {
    mode = "create",
    description = "",
    tags = "",
    lyrics = "",
    duration = 60,
    seed = -1,
    inferStep = 60,
    guidanceScale = 15.0,
    refAudioStrength = 0.5,
    model,
    thinking,
    bpm,
    keyScale,
    timeSignature,
    coverStrength,
    negativeStyles,
    refAudioBase64,
    refAudioMime,
    audioMime,
    remixHistoryId,
    useInternalApi,
    internalBearerToken,
    internalAiToken,
    internalRouter,
  } = req.body || {};

  const effectiveMode = String(mode).trim().toLowerCase();

  if (effectiveMode === "create" && !String(description || "").trim()) {
    send({ type: "error", message: "description is required for create mode" });
    clearInterval(heartbeat);
    return res.end();
  }
  const tagsTrimmed = String(tags || "").trim();
  const descTrimmed = String(description || "").trim();
  if (effectiveMode === "generate" && !tagsTrimmed && !descTrimmed) {
    send({ type: "error", message: "tags or description is required for generate mode" });
    clearInterval(heartbeat);
    return res.end();
  }

  // Build source audio buffer if provided
  const audioInput = normalizeAudioInput(req.body);
  const sourceAudioMime = String(audioMime || audioInput?.mime || "audio/mpeg");
  let srcAudioBuf = null;
  if (audioInput) {
    try {
      srcAudioBuf = await audioInputToBuffer(audioInput);
    } catch (audioErr) {
      console.warn("[remix/generate-stream] Could not read audio input:", audioErr.message);
    }
  }

  // Build reference audio buffer if provided (style transfer)
  let refAudioBuf = null;
  if (refAudioBase64) {
    try {
      const raw = String(refAudioBase64).replace(/^data:[^;]+;base64,/, "");
      refAudioBuf = Buffer.from(raw, "base64");
    } catch (refErr) {
      console.warn("[remix/generate-stream] Could not read reference audio:", refErr.message);
    }
  }

  try {
    const payload = {
      mode: effectiveMode,
      description: String(description || ""),
      tags: String(tags || ""),
      lyrics: String(lyrics || ""),
      audio_duration: duration != null ? Number(duration) : null,
      infer_step: Number(inferStep) || 60,
      guidance_scale: Number(guidanceScale) || 15.0,
      seed: Number(seed) || -1,
      src_audio: srcAudioBuf,
      ref_audio_strength: Number(refAudioStrength) || 0.5,
      model: normalizeAceStepModel(model),
      thinking: thinking !== false,
      bpm: bpm ? Number(bpm) : null,
      key_scale: keyScale ? String(keyScale) : null,
      time_signature: timeSignature ? Number(timeSignature) : null,
      cover_strength: normalizeCoverStrength(coverStrength),
      negative_styles: negativeStyles ? String(negativeStyles) : null,
      ref_audio: refAudioBuf,
      audio_mime: sourceAudioMime,
      useInternalApi: Boolean(useInternalApi),
      internalBearerToken: internalBearerToken ? String(internalBearerToken) : undefined,
      internalAiToken: internalAiToken ? String(internalAiToken) : undefined,
      internalRouter: internalRouter ? String(internalRouter) : undefined,
    };
    const stream = streamGenerateWithACEStep(payload);

    for await (const event of stream) {
      if (event.type === "result" && (event.audio || event.audios)) {
        // Send metadata only — audio stays on server (avoids multi-MB SSE + data: URLs in client history)
        send({
          type: "result",
          title: event.title,
          tags: event.tags,
          lyrics: event.lyrics,
          thumbnail: event.thumbnail,
        });

        const audioList = Array.isArray(event.audios) && event.audios.length > 0 ? event.audios : event.audio ? [event.audio] : [];
        const savedUrls = [];
        let saveError = null;

        for (const audioItem of audioList) {
          try {
            const isDataUrl = audioItem.startsWith("data:");
            let audioBuf;
            if (isDataUrl) {
              const base64Part = audioItem.replace(/^data:[^;]+;base64,/, "");
              audioBuf = Buffer.from(base64Part, "base64");
            } else {
              audioBuf = await downloadGradioFile(audioItem, null);
            }
            const displayTitle = event.title || description || tags || "remix";
            const slug = slugify(displayTitle);
            const saved = await saveBuffer(audioBuf, "audio/wav", `remix_${slug}_${savedUrls.length + 1}`);
            savedUrls.push(saved.url);

            await libraryService.createAsset({
              type: "remix",
              source: "remix",
              title: `${String(displayTitle).slice(0, 70)} ${savedUrls.length}`,
              url: saved.url,
              filePath: saved.filepath,
              metadata: {
                mode: effectiveMode,
                tags: event.tags || tags,
                lyrics: event.lyrics || lyrics,
                description,
                duration: Number(duration) || 60,
                seed: Number(seed) || -1,
                model: normalizeAceStepModel(model),
                inferStep: Number(inferStep) || 60,
                guidanceScale: Number(guidanceScale) || 15.0,
                coverStrength: coverStrength != null ? Number(coverStrength) : null,
                refAudioStrength: Number(refAudioStrength) || 0.5,
                bpm: bpm ? Number(bpm) : null,
                keyScale: keyScale ? String(keyScale) : null,
                timeSignature: timeSignature ? Number(timeSignature) : null,
                negativeStyles: negativeStyles ? String(negativeStyles) : null,
                thinking: thinking !== false,
                space: "acemusic-api",
                remixHistoryId: remixHistoryId || null,
              },
            });
          } catch (itemSaveErr) {
            console.warn("[remix/generate-stream] Could not save audio:", itemSaveErr.message);
            saveError = itemSaveErr;
          }
        }

        if (savedUrls.length > 0) {
          send({ type: "saved", url: savedUrls[0], urls: savedUrls });
        } else if (saveError) {
          send({ type: "error", message: saveError.message || "Failed to save remix audio" });
        }
        continue;
      }

      send(event);
    }
  } catch (err) {
    console.error("Remix stream error:", err.message);
    send({ type: "error", message: err.message || "Stream generation failed" });
  }

  clearInterval(heartbeat);
  res.end();
});

// Verify a user-provided Bearer token by fetching the ai_token from AceMusic on the backend
// If no Bearer token is provided, uses the environment variable as fallback
router.post("/verify-internal-token", async (req, res) => {
  const { bearerToken } = req.body || {};
  const tokenToUse = bearerToken || process.env.ACEMUSIC_INTERNAL_BEARER || "";
  if (!tokenToUse) {
    return res.status(400).json({ ok: false, error: "Bearer token is required (provide in UI or set ACEMUSIC_INTERNAL_BEARER in .env)" });
  }
  try {
    const auth = await fetchInternalAiToken(tokenToUse);
    res.json({ ok: true, router: auth.router, expire: auth.expire, token: auth.token, bearerToken: tokenToUse });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

export default router;
