/**
 * ACE-Step v1.5 HTTP async task API client.
 * Implements POST /release_task → POST /query_result → GET /v1/audio
 * per https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
 */

import { prepareCoverAudio, CLOUD_SAFE_UPLOAD_BYTES } from "./audio-prepare.js";

const ALLOWED_MODELS = ["acestep-v15-turbo", "acestep-v15-turbo-shift3"];

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeModel(model) {
  const value = String(model || "").trim();
  if (ALLOWED_MODELS.includes(value)) return value;
  // Legacy UI id → official API model name
  if (value === "acestep-v15-xl-turbo") return "acestep-v15-turbo";
  return "acestep-v15-turbo";
}

export function getAceStepConfig() {
  const apiKey = process.env.ACEMUSIC_API_KEY || process.env.ACESTEP_API_KEY || "";
  const baseUrl = (
    process.env.ACEMUSIC_BASE_URL ||
    process.env.ACESTEP_API_BASE_URL ||
    "https://api.acemusic.ai"
  ).replace(/\/+$/, "");
  return { apiKey: String(apiKey).trim(), baseUrl };
}

/**
 * AceMusic cloud (api.acemusic.ai) only exposes /v1/chat/completions.
 * Self-hosted ACE-Step servers use /release_task + /query_result (native mode).
 * Override with ACESTEP_API_MODE=completion|native
 */
export function resolveApiMode(baseUrl = getAceStepConfig().baseUrl) {
  const forced = String(process.env.ACESTEP_API_MODE || process.env.ACEMUSIC_API_MODE || "").trim().toLowerCase();
  if (forced === "native" || forced === "completion") return forced;
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname === "api.acemusic.ai") return "completion";
    if (hostname === "127.0.0.1" || hostname === "localhost") return "native";
  } catch {
    // fall through
  }
  return "native";
}

function normalizeCompletionModel(model) {
  const value = String(model || "").trim();
  const shortMap = {
    "acestep-v15-xl-turbo": "acestep-v15-turbo",
    "acestep-v15-turbo": "acestep-v15-turbo",
    "acestep-v15-turbo-shift3": "acestep-v15-turbo-shift3",
    "acemusic/acestep-v1.5-turbo": "acestep-v15-turbo",
    "acestep/ACE-Step-v1.5": "acestep-v15-turbo",
  };
  const short = shortMap[value] || (value.includes("/") ? value.split("/").pop() : value) || "acestep-v15-turbo";
  if (value.includes("/")) return value;
  return `acemusic/${short}`;
}

let _cachedCompletionModel = null;

async function fetchCompletionModel(baseUrl, apiKey, userModel) {
  if (userModel) return normalizeCompletionModel(userModel);
  if (_cachedCompletionModel) return _cachedCompletionModel;
  try {
    const resp = await fetch(`${baseUrl}/v1/models`, { headers: authHeaders(apiKey) });
    if (resp.ok) {
      const body = await resp.json();
      const id = body.data?.[0]?.id;
      if (id) {
        _cachedCompletionModel = id;
        return id;
      }
    }
  } catch (err) {
    console.warn("[ACE-Step Completion] Could not fetch /v1/models:", err.message);
  }
  return "acemusic/acestep-v15-turbo";
}

function detectAudioFormat(buffer, mimeHint = "") {
  const mime = String(mimeHint || "").toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  if (mime.includes("flac")) return "flac";
  if (!buffer || buffer.length < 4) return "mp3";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "wav";
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return "ogg";
  if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "m4a";
  }
  return "mp3";
}

function buildCaptionMessageContent(prompt, lyrics) {
  let text = `<prompt>${prompt}</prompt>`;
  const ly = String(lyrics || "").trim();
  if (ly && ly !== "[Instrumental]") {
    text += `<lyrics>${ly}</lyrics>`;
  } else {
    text += `<lyrics>[inst]</lyrics>`;
  }
  return text;
}

const MAX_COVER_AUDIO_BYTES = 8 * 1024 * 1024;

function buildCompletionPayload(options = {}, modelId) {
  const { fields, files, effectiveTags, lyricsText } = buildTaskFields(options);
  const messageText = buildCaptionMessageContent(effectiveTags, lyricsText);
  const audioConfig = {
    format: "mp3",
    vocal_language: "en",
  };

  if (fields.audio_duration != null) {
    audioConfig.duration = fields.audio_duration;
  }
  if (fields.bpm) audioConfig.bpm = fields.bpm;
  if (fields.key_scale) audioConfig.key_scale = fields.key_scale;
  if (fields.time_signature) audioConfig.time_signature = fields.time_signature;

  const payload = {
    model: modelId,
    thinking: fields.thinking,
    use_format: false,
    sample_mode: false,
    use_cot_caption: true,
    use_cot_language: false,
    stream: true,
    audio_config: audioConfig,
  };

  if (fields.seed != null) {
    payload.seed = fields.seed;
  }
  if (fields.guidance_scale != null) {
    payload.guidance_scale = fields.guidance_scale;
  }

  if (files.src_audio) {
    if (files.src_audio.length > MAX_COVER_AUDIO_BYTES) {
      throw new Error(
        `Source audio is too large (${Math.round(files.src_audio.length / 1024 / 1024)}MB). ` +
          "Use a shorter clip or let the server compress it (requires ffmpeg).",
      );
    }

    const audioFormat = detectAudioFormat(files.src_audio, options.audio_mime || options.audioMime);
    payload.task_type = "cover";
    payload.audio_cover_strength = fields.audio_cover_strength;
    payload.messages = [
      {
        role: "user",
        content: [
          { type: "text", text: messageText },
          {
            type: "input_audio",
            input_audio: {
              data: files.src_audio.toString("base64"),
              format: audioFormat,
            },
          },
        ],
      },
    ];
  } else {
    payload.messages = [{ role: "user", content: messageText }];
  }

  return { payload, effectiveTags, lyricsText };
}

function parseCompletionResponse(body) {
  const finishReason = body?.choices?.[0]?.finish_reason;
  if (finishReason === "error") {
    const content = body?.choices?.[0]?.message?.content;
    throw new Error(typeof content === "string" ? content : "AceMusic generation failed");
  }

  const audioArr = body?.choices?.[0]?.message?.audio;
  if (!Array.isArray(audioArr) || audioArr.length === 0) {
    throw new Error(body?.error?.message || body?.detail || "AceMusic API returned no audio");
  }

  const audioUrl = audioArr[0]?.audio_url?.url;
  if (!audioUrl) {
    throw new Error("AceMusic API returned no audio URL");
  }
  return audioUrl;
}

function parseApiErrorBody(status, errText) {
  try {
    const body = JSON.parse(errText);
    return body.detail || body.error?.message || body.error || errText.slice(0, 300);
  } catch {
    return errText.slice(0, 300) || `HTTP ${status}`;
  }
}

export function isAceStepApiConfigured() {
  return Boolean(getAceStepConfig().apiKey);
}

function friendlyAceStepError(rawMessage = "", prefix = "") {
  const msg = String(rawMessage || "");
  const withPrefix = (text) => (prefix ? `${prefix}: ${text}` : text);

  if (/abort|zerogpu worker error|task was aborted/i.test(msg)) {
    return (
      "The ACE-Step service ran out of GPU time. Try a shorter duration, turn off Thinking mode, " +
      "or use the faster turbo model."
    );
  }
  if (/quota|exceeded|rate limit|too many requests|429|queue is full/i.test(msg)) {
    return "ACE-Step queue is full or rate limited. Please wait and retry.";
  }
  if (/no gpu|gpu.*unavailable|waiting for a gpu|cuda|out of memory|oom/i.test(msg)) {
    return "ACE-Step could not get a GPU. Please retry shortly.";
  }
  if (/504|502|503|gateway timeout|cloudflare/i.test(msg)) {
    return (
      "AceMusic timed out (504). Long uploads often hit Cloudflare limits — the server auto-trims " +
      "large tracks for cloud. Retry, or set ACEMUSIC_MAX_COVER_SEC=120 in server env for a shorter clip."
    );
  }
  return withPrefix(msg || "ACE-Step generation failed");
}

/**
 * Map remix/generation options to ACE-Step API field names.
 * @returns {{ fields: object, files: { src_audio?: Buffer, reference_audio?: Buffer } }}
 */
export function buildTaskFields(options = {}) {
  const {
    description = "",
    tags = "",
    lyrics = "",
    audio_duration = null,
    infer_step = 8,
    guidance_scale = 7.0,
    seed = -1,
    src_audio = null,
    ref_audio = null,
    ref_audio_strength = 0.5,
    cover_strength = null,
    model = "acestep-v15-turbo",
    thinking = false,
    bpm = null,
    key_scale = null,
    time_signature = null,
    negative_styles = null,
  } = options;

  const effectiveTags = String(tags || "").trim() || String(description || "").trim();
  const hasSource = Boolean(src_audio);
  const lyricsText = String(lyrics || "").trim() || "[Instrumental]";

  const fields = {
    prompt: effectiveTags,
    lyrics: lyricsText,
    model: normalizeModel(model),
    inference_steps: toNumber(infer_step, 8),
    guidance_scale: toNumber(guidance_scale, 7),
    batch_size: 1,
    audio_format: "mp3",
    thinking: hasSource ? false : thinking !== false,
  };

  if (audio_duration != null) {
    fields.audio_duration = Math.min(Math.max(toNumber(audio_duration, 60), 10), 600);
  }

  const seedVal = toNumber(seed, -1);
  if (seedVal >= 0) {
    fields.seed = seedVal;
    fields.use_random_seed = false;
  }

  if (bpm) fields.bpm = toNumber(bpm, 120);
  if (key_scale) fields.key_scale = String(key_scale);
  if (time_signature != null && time_signature !== "") {
    fields.time_signature = String(time_signature);
  }
  if (negative_styles) fields.lm_negative_prompt = String(negative_styles);

  const files = {};

  if (hasSource) {
    fields.task_type = "cover";
    const effectiveCover =
      cover_strength != null ? toNumber(cover_strength, 1.0) : toNumber(ref_audio_strength, 0.5);
    fields.audio_cover_strength = effectiveCover;
    files.src_audio = Buffer.isBuffer(src_audio) ? src_audio : Buffer.from(src_audio, "base64");
  }

  if (ref_audio) {
    files.reference_audio = Buffer.isBuffer(ref_audio) ? ref_audio : Buffer.from(ref_audio, "base64");
  }

  return { fields, files, effectiveTags, lyricsText };
}

function authHeaders(apiKey, extra = {}) {
  const headers = { ...extra };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function unwrapResponse(body) {
  if (body && typeof body === "object" && "data" in body && ("code" in body || "error" in body)) {
    if (body.code != null && body.code !== 200) {
      throw new Error(body.error || `API error code ${body.code}`);
    }
    if (body.error) throw new Error(String(body.error));
    return body.data;
  }
  return body;
}

/**
 * Submit a generation task via /release_task (JSON or multipart).
 */
export async function releaseTask(baseUrl, apiKey, fields, files = {}) {
  const hasFiles = files.src_audio || files.reference_audio;

  let response;
  if (hasFiles) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value == null) continue;
      form.append(key, typeof value === "boolean" ? String(value) : String(value));
    }
    if (files.src_audio) {
      form.append(
        "src_audio",
        new Blob([files.src_audio], { type: "audio/mpeg" }),
        "source.mp3",
      );
    }
    if (files.reference_audio) {
      form.append(
        "reference_audio",
        new Blob([files.reference_audio], { type: "audio/mpeg" }),
        "reference.mp3",
      );
    }
    response = await fetch(`${baseUrl}/release_task`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: form,
    });
  } else {
    response = await fetch(`${baseUrl}/release_task`, {
      method: "POST",
      headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(fields),
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`release_task ${response.status}: ${errText.slice(0, 300)}`);
  }

  const body = await response.json();
  const data = unwrapResponse(body);
  const taskId = data?.task_id || body?.task_id;
  if (!taskId) {
    throw new Error("release_task returned no task_id");
  }
  return {
    taskId,
    queuePosition: data?.queue_position ?? null,
    status: data?.status ?? "queued",
  };
}

/**
 * Batch query task status via /query_result.
 */
export async function queryTasks(baseUrl, apiKey, taskIds) {
  const response = await fetch(`${baseUrl}/query_result`, {
    method: "POST",
    headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({ task_id_list: taskIds }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`query_result ${response.status}: ${errText.slice(0, 300)}`);
  }

  const body = await response.json();
  const data = unwrapResponse(body);
  if (Array.isArray(data)) return data;
  if (Array.isArray(body)) return body;
  return data ? [data] : [];
}

/**
 * Parse a single task row from /query_result into an audio file URL.
 * @returns {{ fileUrl: string|null, status: number, queuePosition: number|null, error: string|null, metas: object|null }}
 */
export function parseTaskResult(taskRow) {
  if (!taskRow) {
    return { fileUrl: null, status: -1, queuePosition: null, error: null, metas: null };
  }

  const status = taskRow.status ?? taskRow.task_status ?? -1;
  const queuePosition = taskRow.queue_position ?? taskRow.position ?? null;

  if (status === 2) {
    return {
      fileUrl: null,
      status,
      queuePosition,
      error: taskRow.error || taskRow.message || "Task failed",
      metas: null,
    };
  }

  if (status !== 1) {
    return { fileUrl: null, status, queuePosition, error: null, metas: null };
  }

  // Direct fields (some providers)
  let fileUrl = taskRow.file || taskRow.audio_url || taskRow.result?.file || null;

  // Official API: result is a JSON string array
  if (!fileUrl && taskRow.result) {
    let parsed = taskRow.result;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      const item = parsed.find((r) => r?.status === 1 && r?.file) || parsed[0];
      fileUrl = item?.file || null;
    } else if (parsed && typeof parsed === "object") {
      fileUrl = parsed.file || null;
    }
  }

  return {
    fileUrl,
    status,
    queuePosition,
    error: fileUrl ? null : "Task succeeded but returned no audio file URL",
    metas: null,
  };
}

/**
 * Download audio from /v1/audio?path=... or absolute URL.
 */
export async function downloadAudio(baseUrl, apiKey, filePathOrUrl) {
  let url = String(filePathOrUrl || "").trim();
  if (!url) throw new Error("No audio file URL");

  if (url.startsWith("/")) {
    url = `${baseUrl}${url}`;
  } else if (!url.startsWith("http")) {
    url = `${baseUrl}/v1/audio?path=${encodeURIComponent(url)}`;
  }

  const response = await fetch(url, {
    headers: authHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Audio download ${response.status}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  return { buffer: buf, mimeType: contentType.split(";")[0].trim() || "audio/mpeg" };
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200;
const COMPLETION_RETRY_STATUSES = new Set([502, 503, 504]);
const COMPLETION_RETRY_DELAYS_MS = [8000, 20000];

async function fetchWithRetry(url, init, { label = "request", retries = 2 } = {}) {
  let lastResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || !COMPLETION_RETRY_STATUSES.has(response.status) || attempt >= retries) {
        return response;
      }
      lastResponse = response;
      const errText = await response.text().catch(() => "");
      console.warn(
        `[ACE-Step Completion] ${label} HTTP ${response.status} (attempt ${attempt + 1}/${retries + 1}), retrying…`,
        errText.slice(0, 80),
      );
    } catch (err) {
      lastError = err;
      if (attempt >= retries || !/timeout|abort|ECONNRESET|fetch failed/i.test(err.message)) {
        throw err;
      }
      console.warn(
        `[ACE-Step Completion] ${label} failed (attempt ${attempt + 1}/${retries + 1}):`,
        err.message,
      );
    }

    await new Promise((r) => setTimeout(r, COMPLETION_RETRY_DELAYS_MS[attempt] ?? 20_000));
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error(`${label} failed after retries`);
}

/**
 * Read AceMusic /v1/chat/completions SSE stream (stream: true).
 * Yields { progress, audioUrl, finishReason, errorMessage } per chunk.
 */
async function* readCompletionSseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkIndex = 0;
  let audioUrl = null;
  let finishReason = null;
  let errorMessage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === "[DONE]") continue;

        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue;
        }

        chunkIndex += 1;
        const choice = parsed?.choices?.[0];
        const delta = choice?.delta || {};
        const message = choice?.message || {};

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }

        if (finishReason === "error") {
          const content = delta.content || message.content;
          if (typeof content === "string" && content.trim()) {
            errorMessage = content.trim();
          }
        }

        const audioArr = delta.audio || message.audio;
        if (Array.isArray(audioArr) && audioArr.length > 0) {
          const url = audioArr[0]?.audio_url?.url;
          if (url) audioUrl = url;
        }

        const progress = Math.min(92, 15 + Math.floor(chunkIndex * 1.5));
        yield {
          progress,
          audioUrl,
          finishReason,
          errorMessage,
          chunkIndex,
        };
      }
    }
  }

  yield {
    progress: audioUrl ? 95 : 15,
    audioUrl,
    finishReason,
    errorMessage,
    chunkIndex,
    done: true,
  };
}

async function prepareCompletionOptions(options = {}) {
  const next = { ...options };
  if (!next.src_audio) return next;

  const buf = Buffer.isBuffer(next.src_audio)
    ? next.src_audio
    : Buffer.from(next.src_audio, "base64");

  const forceTrimSec =
    options._forceTrimSec != null ? Number(options._forceTrimSec) : undefined;
  const prepared = await prepareCoverAudio(
    buf,
    next.audio_mime || next.audioMime || "audio/mpeg",
    forceTrimSec != null ? { maxDurationSec: forceTrimSec, force: true } : {},
  );

  next.src_audio = prepared.buffer;
  next.audio_mime = "audio/mpeg";
  next.audioMime = "audio/mpeg";
  next._coverTrimSec = prepared.trimSec;
  next._coverAutoTrimmed = prepared.autoTrimmed;

  return next;
}

/**
 * AceMusic cloud: /v1/chat/completions (non-streaming JSON response).
 * Cover/remix sends audio via messages[].content input_audio per official API.
 */
async function* streamAceStepCompletion(options = {}) {
  const { apiKey, baseUrl } = getAceStepConfig();

  if (!String(tagsOrDesc(options)).trim()) {
    yield { type: "error", message: "tags or description is required" };
    return;
  }

  yield { type: "progress", value: 5, message: "Submitting to AceMusic API…" };
  if (options.src_audio) {
    yield {
      type: "progress",
      value: 8,
      message: "Preparing source audio for upload…",
    };
  }

  let modelId;
  let payload;
  let effectiveTags;
  let lyricsText;
  let preparedOptions;
  try {
    preparedOptions = await prepareCompletionOptions(options);
    modelId = await fetchCompletionModel(baseUrl, apiKey, preparedOptions.model);
    ({ payload, effectiveTags, lyricsText } = buildCompletionPayload(preparedOptions, modelId));
  } catch (buildErr) {
    yield { type: "error", message: friendlyAceStepError(buildErr.message, "Invalid request") };
    return;
  }

  const isCover = payload.task_type === "cover";
  const srcAudioBytes =
    isCover && preparedOptions.src_audio
      ? (Buffer.isBuffer(preparedOptions.src_audio)
          ? preparedOptions.src_audio.length
          : Buffer.from(preparedOptions.src_audio, "base64").length)
      : 0;
  console.log(
    "[ACE-Step Completion] Starting, prompt:",
    effectiveTags.slice(0, 80),
    "cover:",
    isCover,
    "model:",
    modelId,
    "audio_bytes:",
    srcAudioBytes,
  );

  yield {
    type: "progress",
    value: 15,
    message: isCover ? "Generating remix… streaming from AceMusic" : "Generating music…",
  };

  if (preparedOptions._coverAutoTrimmed) {
    yield {
      type: "progress",
      value: 14,
      message: `Source auto-trimmed to ${preparedOptions._coverTrimSec || "?"}s for cloud upload`,
    };
  }

  const COVER_504_TRIM_STEPS = [120, 90, 60];

  try {
    let resp = null;

    for (let attempt = 0; attempt <= (isCover ? COVER_504_TRIM_STEPS.length : 1); attempt++) {
      if (attempt > 0 && isCover) {
        const trimSec = COVER_504_TRIM_STEPS[attempt - 1];
        yield {
          type: "progress",
          value: 12,
          message: `Gateway timeout — retrying with first ${trimSec}s of audio…`,
        };
        preparedOptions = await prepareCompletionOptions({ ...options, _forceTrimSec: trimSec });
        ({ payload, effectiveTags, lyricsText } = buildCompletionPayload(preparedOptions, modelId));
        console.log(
          "[ACE-Step Completion] 504 retry:",
          trimSec,
          "s, audio_bytes:",
          preparedOptions.src_audio?.length,
        );
      }

      const requestBody = JSON.stringify(payload);
      console.log(
        "[ACE-Step Completion] Request size:",
        `${(requestBody.length / 1024 / 1024).toFixed(2)}MB`,
        `(cloud safe ≤ ${(CLOUD_SAFE_UPLOAD_BYTES * 1.34 / 1024 / 1024).toFixed(2)}MB est.)`,
        "attempt",
        attempt + 1,
      );

      resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream, application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(660_000),
      });

      if (resp.ok) break;

      const errText = await resp.text().catch(() => "");
      const canRetryCover =
        isCover &&
        COMPLETION_RETRY_STATUSES.has(resp.status) &&
        attempt < COVER_504_TRIM_STEPS.length;

      if (canRetryCover) {
        console.warn(
          `[ACE-Step Completion] HTTP ${resp.status} (attempt ${attempt + 1}), will trim and retry…`,
          errText.slice(0, 80),
        );
        await new Promise((r) => setTimeout(r, COMPLETION_RETRY_DELAYS_MS[attempt] ?? 10_000));
        continue;
      }

      if (!isCover && COMPLETION_RETRY_STATUSES.has(resp.status) && attempt === 0) {
        console.warn(`[ACE-Step Completion] HTTP ${resp.status}, retrying once…`);
        await new Promise((r) => setTimeout(r, COMPLETION_RETRY_DELAYS_MS[0] ?? 8000));
        continue;
      }

      const detail = parseApiErrorBody(resp.status, errText);
      throw new Error(`AceMusic API ${resp.status}: ${detail}`);
    }

    if (!resp?.ok) {
      throw new Error("AceMusic API request failed after retries");
    }

    const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
    let audioUrl = null;

    if (contentType.includes("text/event-stream")) {
      let lastProgress = 15;
      for await (const chunk of readCompletionSseStream(resp)) {
        if (chunk.errorMessage) {
          throw new Error(chunk.errorMessage);
        }
        if (chunk.finishReason === "error") {
          throw new Error("AceMusic generation failed");
        }
        if (chunk.audioUrl) {
          audioUrl = chunk.audioUrl;
        }
        if (!chunk.done && chunk.progress > lastProgress) {
          lastProgress = chunk.progress;
          yield {
            type: "progress",
            value: chunk.progress,
            message: isCover
              ? `Generating remix… ${chunk.progress}%`
              : `Generating music… ${chunk.progress}%`,
          };
        }
      }
    } else {
      const body = await resp.json();
      audioUrl = parseCompletionResponse(body);
    }

    if (!audioUrl) {
      throw new Error("AceMusic API returned no audio");
    }

    let resultAudio = audioUrl;
    if (!audioUrl.startsWith("data:")) {
      const { buffer, mimeType } = await downloadAudio(baseUrl, apiKey, audioUrl);
      resultAudio = `data:${mimeType};base64,${buffer.toString("base64")}`;
    }

    console.log("[ACE-Step Completion] Success, audio size:", Math.round(resultAudio.length * 0.75), "bytes");
    yield { type: "progress", value: 95, message: "Audio ready!" };
    yield {
      type: "result",
      audio: resultAudio,
      title: effectiveTags.slice(0, 60),
      tags: effectiveTags,
      lyrics: lyricsText === "[Instrumental]" ? "" : lyricsText,
    };
  } catch (err) {
    console.error("[ACE-Step Completion] Error:", err.message);
    yield { type: "error", message: friendlyAceStepError(err.message, "AceMusic API error") };
  }
}

function tagsOrDesc(options) {
  return String(options.tags || "").trim() || String(options.description || "").trim();
}

/**
 * Self-hosted ACE-Step: async task queue via /release_task + /query_result.
 */
async function* streamAceStepNative(options = {}) {
  const { apiKey, baseUrl } = getAceStepConfig();
  if (!apiKey) {
    yield { type: "error", message: "ACEMUSIC_API_KEY is not configured" };
    return;
  }

  const { fields, files, effectiveTags, lyricsText } = buildTaskFields(options);
  if (!effectiveTags) {
    yield { type: "error", message: "tags or description is required" };
    return;
  }

  console.log(
    "[ACE-Step API] Releasing task, prompt:",
    effectiveTags.slice(0, 80),
    "cover:",
    Boolean(files.src_audio),
    "model:",
    fields.model,
  );

  yield { type: "progress", value: 5, message: "Submitting to ACE-Step…" };

  let taskId;
  let initialQueuePos = null;
  try {
    const released = await releaseTask(baseUrl, apiKey, fields, files);
    taskId = released.taskId;
    initialQueuePos = released.queuePosition;
    console.log("[ACE-Step API] Task released:", taskId, "queue:", initialQueuePos);
  } catch (err) {
    yield { type: "error", message: friendlyAceStepError(err.message, "Task submission failed") };
    return;
  }

  const queueMsg =
    initialQueuePos != null ? `Queued #${initialQueuePos + 1} · waiting for GPU…` : "Task queued, waiting for GPU…";
  yield { type: "progress", value: 10, message: queueMsg };

  let progress = 10;
  let lastStatus = -1;
  let lastQueuePos = initialQueuePos;

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let rows;
    try {
      rows = await queryTasks(baseUrl, apiKey, [taskId]);
    } catch (err) {
      console.warn("[ACE-Step API] query_result error:", err.message);
      continue;
    }

    const taskRow = rows.find((r) => r?.task_id === taskId) || rows[0];
    const parsed = parseTaskResult(taskRow);
    const { status, queuePosition, error: taskError, fileUrl } = parsed;

    if (status !== lastStatus || (queuePosition != null && queuePosition !== lastQueuePos)) {
      lastStatus = status;
      lastQueuePos = queuePosition;
      if (status === 0) {
        progress = Math.min(progress + 3, 90);
        const qMsg =
          queuePosition != null ? `Queued #${queuePosition + 1} · Generating… ${progress}%` : `Generating… ${progress}%`;
        yield { type: "progress", value: progress, message: qMsg };
      }
    }

    if (status === 2) {
      yield { type: "error", message: friendlyAceStepError(taskError, "ACE-Step generation failed") };
      return;
    }

    if (status === 1) {
      if (!fileUrl) {
        yield { type: "error", message: friendlyAceStepError(taskError || "No audio URL in result") };
        return;
      }

      yield { type: "progress", value: 92, message: "Downloading audio…" };

      try {
        const { buffer, mimeType } = await downloadAudio(baseUrl, apiKey, fileUrl);
        const base64 = buffer.toString("base64");
        console.log("[ACE-Step API] Success, audio bytes:", buffer.length);

        yield { type: "progress", value: 95, message: "Audio ready!" };
        yield {
          type: "result",
          audio: `data:${mimeType};base64,${base64}`,
          title: effectiveTags.slice(0, 60),
          tags: effectiveTags,
          lyrics: lyricsText === "[Instrumental]" ? "" : lyricsText,
        };
      } catch (dlErr) {
        yield { type: "error", message: friendlyAceStepError(dlErr.message, "Audio download failed") };
      }
      return;
    }
  }

  yield { type: "error", message: "ACE-Step task timed out after polling" };
}

/**
 * Route to cloud completion API or self-hosted native task queue.
 */
export async function* streamAceStepGeneration(options = {}) {
  const { apiKey, baseUrl } = getAceStepConfig();
  if (!apiKey) {
    yield { type: "error", message: "ACEMUSIC_API_KEY is not configured" };
    return;
  }

  const mode = resolveApiMode(baseUrl);
  console.log("[ACE-Step API] Using", mode, "mode at", baseUrl);

  if (mode === "completion") {
    yield* streamAceStepCompletion(options);
    return;
  }
  yield* streamAceStepNative(options);
}
