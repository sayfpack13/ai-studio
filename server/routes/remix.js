import express from "express";
import {
  transcribeAudio,
  enhanceAudio,
  generateWithACEStep,
  streamGenerateWithACEStep,
  downloadGradioFile,
} from "../utils/gradio-client.js";
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

function normalizeCoverStrength(coverStrength, refAudioStrength) {
  if (coverStrength != null && Number(coverStrength) !== 1.0) {
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
      cover_strength: normalizeCoverStrength(coverStrength, refAudioStrength),
      negative_styles: negativeStyles ? String(negativeStyles) : null,
      ref_audio: refAudioBuf,
      audio_mime: sourceAudioMime,
    });

    const { audio, title, tags: generatedTags, lyrics: generatedLyrics, thumbnail } = result;

    let savedUrl = null;
    let savedThumbUrl = null;

    if (audio) {
      try {
        const isDataUrl = audio.startsWith("data:");
        let audioBuf;
        if (isDataUrl) {
          const base64Part = audio.replace(/^data:[^;]+;base64,/, "");
          audioBuf = Buffer.from(base64Part, "base64");
        } else {
          audioBuf = await downloadGradioFile(audio, null);
        }

        const displayTitle = title || description || tags || "remix";
        const slug = slugify(displayTitle);
        const saved = await saveBuffer(audioBuf, "audio/wav", `remix_${slug}`);
        savedUrl = saved.url;

        await libraryService.createAsset({
          type: "audio",
          source: "remix",
          title: String(displayTitle).slice(0, 80),
          url: savedUrl,
          filePath: saved.filepath,
          metadata: {
            mode: effectiveMode,
            tags: generatedTags || tags,
            lyrics: generatedLyrics || lyrics,
            description,
            duration: Number(duration) || 60,
            seed: Number(seed) || -1,
            space: "acemusic-api",
          },
        });
      } catch (saveErr) {
        console.warn("[remix/generate] Could not save audio file:", saveErr.message);
        savedUrl = audio;
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
        url: savedUrl || audio,
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
      cover_strength: normalizeCoverStrength(coverStrength, refAudioStrength),
      negative_styles: negativeStyles ? String(negativeStyles) : null,
      ref_audio: refAudioBuf,
      audio_mime: sourceAudioMime,
    };
    const stream = streamGenerateWithACEStep(payload);

    for await (const event of stream) {
      send(event);

      if (event.type === "result" && event.audio) {
        try {
          const isDataUrl = event.audio.startsWith("data:");
          let audioBuf;
          if (isDataUrl) {
            const base64Part = event.audio.replace(/^data:[^;]+;base64,/, "");
            audioBuf = Buffer.from(base64Part, "base64");
          } else {
            audioBuf = await downloadGradioFile(event.audio, null);
          }
          const displayTitle = event.title || description || tags || "remix";
          const slug = slugify(displayTitle);
          const saved = await saveBuffer(audioBuf, "audio/wav", `remix_${slug}`);

          await libraryService.createAsset({
            type: "audio",
            source: "remix",
            title: String(displayTitle).slice(0, 80),
            url: saved.url,
            filePath: saved.filepath,
            metadata: {
              mode: effectiveMode,
              tags: event.tags || tags,
              lyrics: event.lyrics || lyrics,
              description,
              duration: Number(duration) || 60,
              seed: Number(seed) || -1,
              space: "acemusic-api",
            },
          });

          send({ type: "saved", url: saved.url });
        } catch (saveErr) {
          console.warn("[remix/generate-stream] Could not save audio:", saveErr.message);
          send({ type: "saved", url: event.audio });
        }
      }
    }
  } catch (err) {
    console.error("Remix stream error:", err.message);
    send({ type: "error", message: err.message || "Stream generation failed" });
  }

  clearInterval(heartbeat);
  res.end();
});

export default router;
