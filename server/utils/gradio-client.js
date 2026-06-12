import { Client, handle_file } from "@gradio/client";
import Replicate from "replicate";
import { isAceStepApiConfigured, streamAceStepGeneration } from "./acestep-api.js";

const _clientCacheBySpace = new Map();
const HF_ACESTEP_SPACE = process.env.HF_ACESTEP_SPACE_URL || "ACE-Step/ACE-Step-1.5";

/**
 * Get or create a Gradio client connection to the HuggingFace Space.
 * Reuses the connection if the Space URL and Token hasn't changed.
 */
async function getClient(spaceUrl, hfToken) {
  const cleanToken = hfToken ? String(hfToken).replace(/^Bearer\s+/i, "").trim() : null;
  const cacheKey = `${spaceUrl}|${cleanToken || ""}`;
  if (_clientCacheBySpace.has(cacheKey)) {
    return _clientCacheBySpace.get(cacheKey);
  }

  const opts = {};
  if (cleanToken) {
    // Note: The JS Gradio Client expects the property 'token', not 'hf_token'
    opts.token = cleanToken;
  }

  console.log("[HF Gradio] Connecting to Space:", spaceUrl, cleanToken ? "(with token)" : "(public)");
  const client = await Client.connect(spaceUrl, opts);
  _clientCacheBySpace.set(cacheKey, client);
  console.log("[HF Gradio] Connected successfully");
  return client;
}

/**
 * Reset the cached client (e.g. after config change).
 */
export function resetClient() {
  _clientCacheBySpace.clear();
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build the input payload for the official ACE-Step v1.5 Space
 * "/generation_wrapper" endpoint.
 *
 * The endpoint exposes 54 inputs. The first four are named parameters and the
 * rest are "param_N" (param_40 and param_50-53 are gr.State components with no
 * parameter_name, so they are intentionally omitted and use server defaults).
 *
 * @param {object} args
 * @param {string} args.effectiveTags      - Prompt / captions
 * @param {string} args.lyrics             - Lyrics text
 * @param {number} args.audio_duration     - Duration in seconds (-1 = auto)
 * @param {number} args.infer_step         - DiT inference steps
 * @param {number} args.guidance_scale     - Guidance scale
 * @param {number} args.seedVal            - Seed (-1 = random)
 * @param {*}      args.refAudioRef        - handle_file ref or null
 * @param {*}      args.srcAudioRef        - handle_file ref or null
 * @param {boolean} args.isCoverMode       - Whether this is a cover/remix
 * @param {number} args.ref_audio_strength - Audio cover strength (0-1)
 * @param {string} args.audioCodes         - Pre-computed audio codes from /process_source_audio_wrapper
 * @param {string} args.model              - Model variant (acestep-v15-xl-turbo | acestep-v15-turbo)
 * @param {boolean} args.thinking          - Enable LM "Thinking"/CoT phase (slower, higher quality)
 */
function buildACEStepPayload({
  effectiveTags,
  lyrics,
  audio_duration,
  infer_step,
  guidance_scale,
  seedVal,
  refAudioRef,
  srcAudioRef,
  isCoverMode,
  ref_audio_strength,
  audioCodes = "",
  model = "acestep-v15-xl-turbo",
  thinking = true,
}) {
  const taskType = isCoverMode ? "cover" : "text2music";
  const useThinking = thinking !== false;
  const allowedModels = ["acestep-v15-xl-turbo", "acestep-v15-turbo"];
  const selectedModel = allowedModels.includes(model) ? model : "acestep-v15-xl-turbo";
  return {
    selected_model: selectedModel,                     // models
    generation_mode: isCoverMode ? "cover" : "custom", // simple/custom/cover/repaint
    simple_query_input: "",                            // Song Description (simple mode only)
    simple_vocal_language: "unknown",                  // Vocal Language (simple mode only)
    param_4: String(effectiveTags),                    // Prompt (captions)
    param_5: String(lyrics || ""),                     // Lyrics
    param_6: 0,                                         // BPM (0 = auto)
    param_7: "",                                        // Key Signature
    param_8: "",                                        // Time Signature
    param_9: "unknown",                                 // Vocal Language
    param_10: toNumber(infer_step, 8),                 // DiT Inference Steps
    param_11: toNumber(guidance_scale, 7),             // Guidance Scale
    param_12: seedVal === -1,                          // Random Seed checkbox
    param_13: String(seedVal),                         // Seed
    param_14: refAudioRef,                             // Reference Audio
    param_15: toNumber(audio_duration, -1),            // Audio Duration (seconds)
    param_16: 1,                                        // batch size
    param_17: srcAudioRef,                             // Source Audio
    param_18: audioCodes,                              // Audio Codes (from /process_source_audio_wrapper)
    param_19: 0,                                        // Start (seconds)
    param_20: -1,                                       // End (seconds, -1 for end)
    param_21: "Fill the audio semantic mask based on the given conditions:", // instruction
    param_22: toNumber(ref_audio_strength, 1),         // audio_cover_strength
    param_23: taskType,                                // task_type (text2music/repaint/cover)
    param_24: false,                                    // use_adg
    param_25: 0,                                        // cfg_interval_start
    param_26: 1,                                        // cfg_interval_end
    param_27: 3,                                        // Shift
    param_28: "ode",                                    // Inference Method
    param_29: "",                                       // Custom Timesteps
    param_30: "mp3",                                    // Audio Format
    param_31: 0.85,                                     // LM Temperature
    param_32: useThinking,                              // Thinking (LM CoT phase)
    param_33: 2,                                        // LM CFG Scale
    param_34: 0,                                        // LM Top-K
    param_35: 0.9,                                       // LM Top-P
    param_36: "NO USER INPUT",                          // LM Negative Prompt
    param_37: useThinking,                              // use_cot_metas
    param_38: useThinking,                              // use_cot_caption
    param_39: useThinking,                              // use_cot_language
    param_41: false,                                    // constrained_decoding_debug
    param_42: true,                                     // allow_lm_batch
    param_43: false,                                    // Get Scores
    param_44: false,                                    // Get LRC
    param_45: 0.5,                                       // score_scale
    param_46: 8,                                         // lm_batch_chunk_size
    param_47: "woodwinds",                              // track_name
    param_48: [],                                        // complete_track_classes
    param_49: false,                                     // autogen checkbox
  };
}

/**
 * Translate raw ACE-Step / ZeroGPU errors into user-friendly guidance.
 * The public ACE-Step ZeroGPU Space aborts long GPU tasks (~3 min limit), surfaced
 * as "GPU task aborted" / "ZeroGPU worker error". Quota exhaustion is also common.
 *
 * @param {string} rawMessage - The error string from the Space.
 * @param {string} [prefix]   - Optional context prefix (e.g. "Failed to encode source audio").
 * @returns {string} A clear, actionable message for the UI.
 */
function friendlyAceStepError(rawMessage = "", prefix = "") {
  const msg = String(rawMessage || "");
  const withPrefix = (text) => (prefix ? `${prefix}: ${text}` : text);

  if (/abort|zerogpu worker error|task was aborted/i.test(msg)) {
    return (
      "The ACE-Step Space ran out of GPU time and aborted (public ZeroGPU Spaces cap a " +
      "single run at ~3 minutes). Try a shorter duration, turn off Thinking mode, or use " +
      "the faster model. For reliable results, point HF_ACESTEP_SPACE_URL at a dedicated-GPU " +
      "Space or set REPLICATE_API_TOKEN."
    );
  }
  if (/quota|exceeded|rate limit|too many requests|429/i.test(msg)) {
    return (
      "HuggingFace GPU quota reached for this token. Wait for the quota to reset, use a PRO " +
      "token, or switch to a dedicated-GPU Space / Replicate backend."
    );
  }
  if (/no gpu|gpu.*unavailable|waiting for a gpu|cuda|out of memory|oom/i.test(msg)) {
    return (
      "The ACE-Step Space could not get a GPU (the shared ZeroGPU pool is busy or out of memory). " +
      "Please retry shortly, or use a dedicated-GPU Space / Replicate backend for reliability."
    );
  }
  return withPrefix(msg || "ACE-Step generation failed");
}

function toGalleryFileRef(item) {
  if (!item) return null;

  if (Buffer.isBuffer(item)) {
    return handle_file(new Blob([item], { type: "image/jpeg" }));
  }

  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("data:image/")) {
      const [, base64 = ""] = trimmed.split(",", 2);
      if (!base64) return null;
      const buf = Buffer.from(base64, "base64");
      return handle_file(new Blob([buf], { type: "image/jpeg" }));
    }

    return handle_file(trimmed);
  }

  if (typeof item === "object") {
    if (item.image && typeof item.image === "string") {
      return toGalleryFileRef(item.image);
    }
    if (item.url && typeof item.url === "string") {
      return handle_file(item.url);
    }
    if (item.path && typeof item.path === "string") {
      return handle_file(item.path);
    }
  }

  return null;
}

/**
 * Generate an image via the FLUX.2-dev endpoint on the HF Space.
 *
 * Uses the /infer API which handles remote text encoding (CPU)
 * and only bills GPU for diffusion inference.
 *
 * @param {string} spaceUrl  - Full Space URL (e.g. "https://user-space.hf.space")
 * @param {string} hfToken   - HuggingFace API token (optional for public spaces)
 * @param {object} options
 * @param {string} options.prompt
 * @param {number} [options.width=1024]
 * @param {number} [options.height=1024]
 * @param {number} [options.num_inference_steps=30]
 * @param {number} [options.guidance_scale=4.0]
 * @param {number} [options.seed=-1]
 * @param {boolean} [options.randomize_seed=true]
 * @param {Array}  [options.input_images=[]] - Optional reference images for I2I editing
 * @returns {{ url: string }} Object with a data URL of the generated image
 */
export async function generateImage(spaceUrl, hfToken, options = {}) {
  const client = await getClient(spaceUrl, hfToken);

  const {
    prompt = "",
    width = 1024,
    height = 1024,
    num_inference_steps = 30,
    guidance_scale = 4.0,
    seed = -1,
    randomize_seed = true,
    input_images = [],
  } = options;

  const galleryRefs = Array.isArray(input_images)
    ? input_images.map(toGalleryFileRef).filter(Boolean)
    : [];

  console.log("[HF Gradio] Calling /infer with prompt length:", prompt.length);

  // Build the Gradio call parameters matching infer_image() signature:
  // prompt, input_images, seed, randomize_seed, width, height, steps, guidance
  const callParams = {
    prompt: String(prompt ?? ""),
    input_images: galleryRefs.length > 0 ? galleryRefs : null,
    seed: toNumber(seed, -1),
    randomize_seed: Boolean(randomize_seed),
    width: toNumber(width, 1024),
    height: toNumber(height, 1024),
    num_inference_steps: toNumber(num_inference_steps, 30),
    guidance_scale: toNumber(guidance_scale, 4.0),
  };

  // Gradio doesn't accept None as a value; use null for empty gallery
  if (galleryRefs.length === 0) {
    delete callParams.input_images;
  }

  const result = await client.predict("/infer", callParams);

  // /infer returns [image, seed] — extract the image
  const imageData = result?.data?.[0];
  if (!imageData) {
    throw new Error("HuggingFace Space returned no image data");
  }

  // Gradio returns { url: "..." } for image outputs
  const imageUrl = typeof imageData === "string" ? imageData : imageData?.url;
  if (!imageUrl) {
    throw new Error("HuggingFace Space returned unexpected image format");
  }

  return { url: imageUrl };
}

function extractImageUrlFromTongyiGallery(galleryData) {
  if (!galleryData) return null;

  if (typeof galleryData === "string") {
    return galleryData;
  }

  if (Array.isArray(galleryData)) {
    for (const item of galleryData) {
      if (typeof item === "string") return item;
      if (item?.url) return item.url;
      if (item?.image?.url) return item.image.url;
      if (item?.image?.path) return item.image.path;
      if (item?.path) return item.path;
      if (Array.isArray(item) && item[0]?.url) return item[0].url;
    }
  }

  if (galleryData?.url) return galleryData.url;
  if (galleryData?.image?.url) return galleryData.image.url;

  return null;
}

/**
 * Normalizes a requested resolution string to the closest allowed choice in Tongyi Space.
 */
function normalizeTongyiResolution(resString) {
  const allowed = [
    "1024x1024 ( 1:1 )", "1152x896 ( 9:7 )", "896x1152 ( 7:9 )", "1152x864 ( 4:3 )",
    "864x1152 ( 3:4 )", "1248x832 ( 3:2 )", "832x1248 ( 2:3 )", "1280x720 ( 16:9 )",
    "720x1280 ( 9:16 )", "1344x576 ( 21:9 )", "576x1344 ( 9:21 )", "1280x1280 ( 1:1 )",
    "1440x1120 ( 9:7 )", "1120x1440 ( 7:9 )", "1472x1104 ( 4:3 )", "1104x1472 ( 3:4 )",
    "1536x1024 ( 3:2 )", "1024x1536 ( 2:3 )", "1536x864 ( 16:9 )", "864x1536 ( 9:16 )",
    "1680x720 ( 21:9 )", "720x1680 ( 9:21 )", "1536x1536 ( 1:1 )", "1728x1344 ( 9:7 )",
    "1344x1728 ( 7:9 )", "1728x1296 ( 4:3 )", "1296x1728 ( 3:4 )", "1872x1248 ( 3:2 )",
    "1248x1872 ( 2:3 )", "2048x1152 ( 16:9 )", "1152x2048 ( 9:16 )", "2016x864 ( 21:9 )",
    "864x2016 ( 9:21 )"
  ];
  if (allowed.includes(resString)) return resString;

  const fallbackMap = {
    "4:3": "1152x864 ( 4:3 )",
    "3:4": "864x1152 ( 3:4 )",
    "16:9": "1280x720 ( 16:9 )",
    "9:16": "720x1280 ( 9:16 )",
    "1:1": "1024x1024 ( 1:1 )",
    "21:9": "1344x576 ( 21:9 )",
    "9:21": "576x1344 ( 9:21 )",
    "3:2": "1248x832 ( 3:2 )",
    "2:3": "832x1248 ( 2:3 )",
  };

  for (const [ratio, validForm] of Object.entries(fallbackMap)) {
    if (resString && resString.includes(`( ${ratio} )`)) {
      return validForm;
    }
  }
  return "1024x1024 ( 1:1 )";
}

/**
 * Generate image via Tongyi Z-Image Turbo Space API.
 * Endpoint: /generate or /generate_image (mrfakename)
 * Params follow official Space docs.
 */
export async function generateTongyiZImage(spaceUrl, hfToken, options = {}) {
  const client = await getClient(spaceUrl, hfToken);

  const {
    prompt = "",
    resolution = "1024x1024 ( 1:1 )",
    seed = 42,
    steps = 8,
    shift = 3,
    random_seed = true,
    gallery_images = [],
  } = options;

  console.log("[HF Gradio] Calling Tongyi Z-Image with prompt length:", prompt.length);

  // Support alternative mrfakename space signature
  const isMrFakeName = spaceUrl && spaceUrl.toLowerCase().includes("mrfakename/z-image-turbo");

  let parsedWidth = 1024;
  let parsedHeight = 1024;
  if (isMrFakeName && resolution) {
    // Use normalizeTongyiResolution to get a valid resolution string,
    // then extract dimensions from it. This ensures we always send
    // dimensions that the Z-Image model supports (divisible by 16).
    const normalized = normalizeTongyiResolution(resolution);
    const match = normalized.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (match) {
      parsedWidth = toNumber(match[1], 1024);
      parsedHeight = toNumber(match[2], 1024);
    }
    if (resolution !== normalized) {
      console.warn(
        `[HF Gradio] Z-Image: mapped resolution "${resolution}" → "${normalized}" (${parsedWidth}x${parsedHeight})`
      );
    }
  }

  let result;
  if (isMrFakeName) {
    result = await client.predict("/generate_image", {
      prompt: String(prompt ?? ""),
      height: parsedHeight,
      width: parsedWidth,
      num_inference_steps: toNumber(steps, 9),
      seed: toNumber(seed, 42),
      randomize_seed: Boolean(random_seed),
    });
  } else {
    result = await client.predict("/generate", {
      prompt: String(prompt ?? ""),
        resolution: normalizeTongyiResolution(String(resolution ?? "1024x1024 ( 1:1 )")),
      random_seed: Boolean(random_seed),
      gallery_images: Array.isArray(gallery_images) ? gallery_images : [],
    });
  }

  // Expected return shape: [gallery, seed_used, seed]
  // or for mrfakename: [image_url, seed_used]
  let imageUrl = null;
  let seedUsed = null;
  let finalSeed = null;

  if (isMrFakeName) {
    imageUrl = typeof result?.data?.[0] === "string" ? result.data[0] : result?.data?.[0]?.url;
    seedUsed = result?.data?.[1];
    finalSeed = seedUsed;
    if (!imageUrl) throw new Error("MrFakeName Space returned no image URL");
  } else {
    const gallery = result?.data?.[0];
    seedUsed = result?.data?.[1];
    finalSeed = result?.data?.[2];

    imageUrl = extractImageUrlFromTongyiGallery(gallery);
    if (!imageUrl) {
      throw new Error("Tongyi Space returned no image URL in gallery output");
    }
  }

  return {
    url: imageUrl,
    seedUsed: seedUsed != null ? String(seedUsed) : undefined,
    seed: finalSeed,
  };
}

/**
 * Generate a video via the Wan I2V endpoint on the HF Space.
 *
 * @param {string} spaceUrl  - Full Space URL
 * @param {string} hfToken   - HuggingFace API token
 * @param {object} options
 * @param {Buffer|string} options.image - Image as Buffer or URL string
 * @param {string} options.prompt
 * @param {string} [options.negative_prompt]
 * @param {number} [options.width=832]
 * @param {number} [options.height=480]
 * @param {number} [options.num_frames=81]
 * @param {number} [options.guidance_scale=5.0]
 * @param {number} [options.num_inference_steps=25]
 * @param {number} [options.seed=-1]
 * @returns {{ url: string }} Object with URL to the generated video
 */
export async function generateVideo(spaceUrl, hfToken, options = {}) {
  const client = await getClient(spaceUrl, hfToken);

  const {
    image,
    prompt = "",
    negative_prompt = "",
    width = 832,
    height = 480,
    num_frames = 81,
    guidance_scale = 5.0,
    guidance_scale_2 = 1,
    num_inference_steps = 25,
    seed = -1,
    // AOTi-specific parameters (used when spaceUrl matches r3gm/wan2-2-fp8da-aoti-preview)
    duration_seconds = 3.5,
    quality = 6,
    scheduler = "UniPCMultistep",
    flow_shift = 3,
    frame_multiplier = 16,
  } = options;

  if (!image) {
    throw new Error("Image is required for video generation");
  }

  // Convert image to a Gradio-compatible file reference
  let imageRef;
  if (Buffer.isBuffer(image)) {
    imageRef = handle_file(new Blob([image], { type: "image/jpeg" }));
  } else if (typeof image === "string" && image.startsWith("http")) {
    imageRef = handle_file(image);
  } else if (typeof image === "string") {
    // Assume base64 — convert to Buffer then Blob
    const buf = Buffer.from(image, "base64");
    imageRef = handle_file(new Blob([buf], { type: "image/jpeg" }));
  } else {
    throw new Error("Image must be a Buffer, URL string, or base64 string");
  }

  console.log("[HF Gradio] Calling /generate_video with prompt length:", prompt.length);

  // If this is the specific r3gm Space, format the parameters to its required payload schema
  const isAOTiPreview = spaceUrl && spaceUrl.toLowerCase().includes("r3gm/wan2-2-fp8da-aoti-preview");
  
  let payload;
  if (isAOTiPreview) {
    // AOTi Space uses a different parameter schema:
    // - steps: 4-8 recommended (Lightning LoRA fast inference)
    // - guidance_scale: typically 1.0 for I2V
    // - quality: 1-10 (controls output quality, not steps)
    // - frame_multiplier: 16/32/64 (fps enhancement)
    // - flow_shift: controls motion dynamics (3-6 typical)
    // Map from caller params, capping steps to the Space's optimal range
    const aotiSteps = Math.min(Math.max(Number(num_inference_steps) || 6, 4), 50);
    const aotiGuidanceScale = Number(guidance_scale) > 0 ? Number(guidance_scale) : 1;

    payload = {
      input_image: imageRef,
      last_image: imageRef, // Fallback required per the API doc
      prompt: String(prompt || ""),
      steps: aotiSteps,
      negative_prompt: String(negative_prompt || ""),
      duration_seconds: Number(duration_seconds) || 3.5,
      guidance_scale: aotiGuidanceScale,
      guidance_scale_2: Number(guidance_scale_2) || 1,
      seed: Number(seed) === -1 ? 42 : Number(seed),
      randomize_seed: Number(seed) === -1,
      quality: Number(quality) || 6,
      scheduler: String(scheduler) || "UniPCMultistep",
      flow_shift: Number(flow_shift) || 3,
      frame_multiplier: Number(frame_multiplier) || 16,
      video_component: true,
    };
  } else {
    payload = {
      image: imageRef,
      prompt,
      negative_prompt,
      width,
      height,
      num_frames,
      guidance_scale,
      num_inference_steps,
      seed,
    };
  }

  const result = await client.predict("/generate_video", payload);

  const videoData = result?.data?.[0];
  if (!videoData) {
    throw new Error("HuggingFace Space returned no video data");
  }

  // Gradio returns { video: { url: "..." } } or { url: "..." } for video outputs
  const videoUrl =
    typeof videoData === "string"
      ? videoData
      : videoData?.video?.url || videoData?.url;

  if (!videoUrl) {
    throw new Error("HuggingFace Space returned unexpected video format");
  }

  return { url: videoUrl };
}

/**
 * Download a file from a Gradio result URL and return it as a Buffer.
 */
export async function downloadGradioFile(url, hfToken) {
  const { default: axios } = await import("axios");
  const response = await axios.get(url, {
    headers: hfToken
      ? {
          Authorization: `Bearer ${String(hfToken).replace(/^Bearer\s+/i, "").trim()}`,
        }
      : undefined,
    responseType: "arraybuffer",
    timeout: 120000,
  });
  return Buffer.from(response.data);
}

/**
 * Generate audio from a video using the MMAudio Space on HuggingFace.
 *
 * @param {string} spaceUrl  - Full Space URL (e.g. "hkchengrex/MMAudio")
 * @param {string} hfToken   - HuggingFace API token (optional for public spaces)
 * @param {object} options
 * @param {Buffer|string} options.video - Video as Buffer or URL string
 * @param {string} [options.prompt] - Audio description prompt (e.g. "waves, seagulls")
 * @param {string} [options.negative_prompt="music"] - Negative prompt
 * @param {number} [options.seed=-1] - Random seed (-1 for random)
 * @param {number} [options.num_steps=25] - Number of inference steps
 * @param {number} [options.cfg_strength=4.5] - CFG guidance strength
 * @param {number} [options.duration=8] - Duration in seconds
 * @returns {{ url: string }} Object with URL to the generated video-with-audio
 */
export async function generateVideoToAudio(spaceUrl, hfToken, options = {}) {
  const client = await getClient(spaceUrl, hfToken);

  const {
    video,
    prompt = "",
    negative_prompt = "music",
    seed = -1,
    num_steps = 25,
    cfg_strength = 4.5,
    duration = 8,
  } = options;

  if (!video) {
    throw new Error("Video is required for video-to-audio generation");
  }

  // Convert video to a Gradio-compatible file reference
  let videoRef;
  if (Buffer.isBuffer(video)) {
    videoRef = handle_file(new Blob([video], { type: "video/mp4" }));
  } else if (typeof video === "string" && video.startsWith("http")) {
    videoRef = handle_file(video);
  } else if (typeof video === "string") {
    // Assume base64 — convert to Buffer then Blob
    const buf = Buffer.from(video, "base64");
    videoRef = handle_file(new Blob([buf], { type: "video/mp4" }));
  } else {
    throw new Error("Video must be a Buffer, URL string, or base64 string");
  }

  console.log("[HF Gradio] Calling /video_to_audio with prompt:", prompt || "(none)");

  const result = await client.predict("/video_to_audio", {
    video: videoRef,
    prompt: String(prompt ?? ""),
    negative_prompt: String(negative_prompt ?? "music"),
    seed: toNumber(seed, -1),
    num_steps: toNumber(num_steps, 25),
    cfg_strength: toNumber(cfg_strength, 4.5),
    duration: toNumber(duration, 8),
  });

  const outputData = result?.data?.[0];
  if (!outputData) {
    throw new Error("MMAudio Space returned no video-to-audio data");
  }

  // Gradio returns { video: { url: "..." } } or { url: "..." } for video outputs
  const outputUrl =
    typeof outputData === "string"
      ? outputData
      : outputData?.video?.url || outputData?.url;

  if (!outputUrl) {
    throw new Error("MMAudio Space returned unexpected video-to-audio format");
  }

  return { url: outputUrl };
}

/**
 * Generate an image via the Nano Banana Space on HuggingFace.
 *
 * The Nano Banana Space (multimodalart/nano-banana) uses a Gradio interface with:
 * - API endpoint: /unified_image_generator
 * - Inputs: gallery (images), prompt, model (radio), aspect_ratio (dropdown), resolution (dropdown)
 * - Model choices: "Nano Banana", "Nano Banana 2", "Nano Banana PRO"
 * - Aspect ratio choices: "Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"
 * - Resolution choices: "1K", "2K", "4K"
 * - Output: image
 *
 * NOTE: This Space requires a HuggingFace PRO subscription.
 *
 * @param {string} spaceUrl  - Full Space URL (e.g. "multimodalart/nano-banana")
 * @param {string} hfToken   - HuggingFace API token (REQUIRED — PRO subscription needed)
 * @param {object} options
 * @param {string} options.prompt - Text prompt for image generation
 * @param {string} [options.model="Nano Banana"] - Model variant: "Nano Banana", "Nano Banana 2", or "Nano Banana PRO"
 * @param {string} [options.aspectRatio="Auto"] - Aspect ratio
 * @param {string} [options.resolution="1K"] - Resolution: "1K", "2K", or "4K"
 * @param {Array}  [options.input_images=[]] - Optional reference images for editing
 * @returns {{ url: string }} Object with URL of the generated image
 */
export async function generateNanoBanana(spaceUrl, hfToken, options = {}) {
  const client = await getClient(spaceUrl, hfToken);

  const {
    prompt = "",
    model = "Nano Banana",
    aspectRatio = "Auto",
    resolution = "1K",
    input_images = [],
  } = options;

  const validModels = ["Nano Banana", "Nano Banana 2", "Nano Banana PRO"];
  const nanoBananaModel = validModels.includes(model) ? model : "Nano Banana";

  const validAspectRatios = ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"];
  const nanoBananaAspectRatio = validAspectRatios.includes(aspectRatio) ? aspectRatio : "Auto";

  const validResolutions = ["1K", "2K", "4K"];
  const nanoBananaResolution = validResolutions.includes(resolution) ? resolution : "1K";

  const galleryRefs = Array.isArray(input_images)
    ? input_images.map(toGalleryFileRef).filter(Boolean)
    : [];

  console.log("[HF Gradio] Calling /unified_image_generator with prompt length:", prompt.length, "model:", nanoBananaModel);

  // Use positional (array) arguments because the Gradio client's keyword argument
  // mapping may not match the actual parameter names exposed by this Space's API.
  // Input order from the Space config: prompt, gallery, state, state, aspect_ratio, model, resolution, manual_token
  // The manual_token field (component 27) is used by the Space to verify HF PRO subscription.
  // Pass the HF token here so the Space can authenticate PRO access.
  const manualToken = hfToken || null;

  const result = await client.predict("/unified_image_generator", [
    String(prompt ?? ""),                        // prompt (textbox)
    galleryRefs.length > 0 ? galleryRefs : null, // gallery (images)
    null,                                        // state (internal)
    null,                                        // state (internal)
    nanoBananaAspectRatio,                       // aspect_ratio (dropdown)
    nanoBananaModel,                              // model (radio)
    nanoBananaResolution,                        // resolution (dropdown)
    manualToken,                                  // manual_token (textbox — HF PRO token)
  ]);

  // The output is an image component — extract the URL
  const imageData = result?.data?.[0];
  if (!imageData) {
    throw new Error("Nano Banana Space returned no image data");
  }

  const imageUrl = typeof imageData === "string" ? imageData : imageData?.url;
  if (!imageUrl) {
    throw new Error("Nano Banana Space returned unexpected image format");
  }

  return { url: imageUrl };
}

/**
 * Transcribe audio using the OpenAI Whisper Space on HuggingFace.
 *
 * @param {string} spaceUrl - Space ID (e.g. "openai/whisper")
 * @param {Buffer|string} audioInput - Audio as Buffer, base64 string, or URL
 * @param {string} [task="transcribe"] - "transcribe" or "translate"
 * @returns {{ text: string }} Transcript text
 */
export async function transcribeAudio(spaceUrl, audioInput, task = "transcribe") {
  const hfToken = process.env.HF_TOKEN || null;
  const client = await getClient(spaceUrl, hfToken);

  let audioRef;
  if (Buffer.isBuffer(audioInput)) {
    audioRef = handle_file(new Blob([audioInput], { type: "audio/mpeg" }));
  } else if (typeof audioInput === "string" && audioInput.startsWith("http")) {
    audioRef = handle_file(audioInput);
  } else if (typeof audioInput === "string") {
    const cleanBase64 = audioInput.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(cleanBase64, "base64");
    audioRef = handle_file(new Blob([buf], { type: "audio/mpeg" }));
  } else {
    throw new Error("audioInput must be a Buffer, URL string, or base64 string");
  }

  console.log("[HF Gradio] Calling Whisper /predict for transcription...");
  const result = await client.predict("/predict", {
    inputs: audioRef,
    task,
  });

  const text = result?.data?.[0];
  if (typeof text !== "string") {
    throw new Error("Whisper Space returned unexpected transcription format");
  }

  return { text: text.trim() };
}

/**
 * Enhance / restore / master an audio file using the SonicMaster Space.
 *
 * @param {string} spaceUrl - Space ID (e.g. "amaai-lab/SonicMaster")
 * @param {Buffer|string} audioInput - Audio as Buffer, base64 string, or URL
 * @param {string} [prompt="Enhance the input audio"] - Text prompt describing enhancement
 * @returns {{ url: string }} Object with URL to the enhanced audio
 */
export async function enhanceAudio(spaceUrl, audioInput, prompt = "Enhance the input audio") {
  const hfToken = process.env.HF_TOKEN || null;
  const client = await getClient(spaceUrl, hfToken);

  let audioRef;
  if (Buffer.isBuffer(audioInput)) {
    audioRef = handle_file(new Blob([audioInput], { type: "audio/mpeg" }));
  } else if (typeof audioInput === "string" && audioInput.startsWith("http")) {
    audioRef = handle_file(audioInput);
  } else if (typeof audioInput === "string") {
    const cleanBase64 = audioInput.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(cleanBase64, "base64");
    audioRef = handle_file(new Blob([buf], { type: "audio/mpeg" }));
  } else {
    throw new Error("audioInput must be a Buffer, URL string, or base64 string");
  }

  console.log("[HF Gradio] Calling SonicMaster enhance_audio_ui, prompt:", prompt);
  const result = await client.predict("/predict", {
    audio_path: audioRef,
    prompt: String(prompt || "Enhance the input audio"),
  });

  const outputData = result?.data?.[0];
  if (!outputData) {
    throw new Error("SonicMaster Space returned no audio data");
  }

  const outputUrl =
    typeof outputData === "string"
      ? outputData
      : outputData?.url || (Array.isArray(outputData) ? outputData[1] : null);

  if (!outputUrl) {
    throw new Error("SonicMaster Space returned unexpected audio format");
  }

  return { url: outputUrl };
}

/**
 * Generate music using the ACE-Step Space on HuggingFace.
 *
 * Two modes:
 *  - mode "create": description → LLM composes tags+lyrics → generates WAV
 *    Returns { audio (base64 data URL), title, tags, lyrics, thumbnail? }
 *  - mode "generate": explicit tags + lyrics → generates WAV directly
 *    Returns { audio (base64 data URL) }
 *
 * Supports audio2audio remixing when src_audio is provided.
 *
 * @param {string} spaceUrl - Space ID (e.g. "ACE-Step/ACE-Step" or "victor/ace-step-jam")
 * @param {object} options
 * @param {string} [options.mode="create"] - "create" or "generate"
 * @param {string} [options.description] - Natural language song description (create mode)
 * @param {string} [options.tags] - Genre/mood tags e.g. "lo-fi, rainy, guitar" (generate mode)
 * @param {string} [options.lyrics] - Lyrics with [verse]/[chorus] markers (generate mode)
 * @param {number} [options.audio_duration=60] - Duration in seconds
 * @param {number} [options.infer_step=60] - Inference steps
 * @param {number} [options.guidance_scale=15.0] - Guidance scale
 * @param {number} [options.seed=-1] - Random seed
 * @param {Buffer|null} [options.src_audio=null] - Reference audio buffer for audio2audio remix
 * @param {number} [options.ref_audio_strength=0.5] - How strongly output matches reference (0-1)
 * @returns {{ audio: string, title?: string, tags?: string, lyrics?: string, thumbnail?: string }}
 */
export async function generateWithACEStep(options = {}) {
  if (isAceStepApiConfigured()) {
    console.log("[ACE-Step] Using ACE-Step task API (ACEMUSIC_API_KEY set)");
    let result = null;
    for await (const event of streamAceStepGeneration(options)) {
      if (event.type === "result") result = event;
      if (event.type === "error") throw new Error(event.message);
    }
    if (!result) throw new Error("ACE-Step API returned no result");
    return result;
  }
  const hfToken = process.env.HF_TOKEN || null;
  const spaceUrl = HF_ACESTEP_SPACE;
  const client = await getClient(spaceUrl, hfToken);

  const {
    mode = "create",
    description = "",
    tags = "",
    lyrics = "",
    audio_duration = 60,
    infer_step = 60,
    guidance_scale = 15.0,
    seed = -1,
    src_audio = null,
    ref_audio_strength = 0.5,
    model = "acestep-v15-xl-turbo",
    thinking = true,
  } = options;

  console.log("[HF Gradio] ACE-Step mode:", mode, "duration:", audio_duration, "audio2audio:", !!src_audio, "model:", model, "thinking:", thinking);

  // Detect if this is the simplified victor/ace-step-jam space (no audio2audio support)
  const isSimplifiedSpace = spaceUrl && spaceUrl.toLowerCase().includes("victor/ace-step-jam");

  if (isSimplifiedSpace && mode === "create") {
    if (!description.trim()) {
      throw new Error("description is required for ACE-Step create mode");
    }

    const result = await client.predict("/create", {
      description: String(description),
      audio_duration: toNumber(audio_duration, 60),
      seed: toNumber(seed, -1),
    });

    const raw = result?.data?.[0];
    if (!raw) {
      throw new Error("ACE-Step /create returned no data");
    }

    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      parsed = { audio: raw };
    }

    if (!parsed.audio) {
      throw new Error("ACE-Step /create returned no audio field");
    }

    return {
      audio: parsed.audio,
      title: parsed.title || "",
      tags: parsed.tags || "",
      lyrics: parsed.lyrics || "",
      thumbnail: parsed.thumbnail || null,
    };
  }

  if (isSimplifiedSpace) {
    // Simplified space /generate endpoint
    const effectiveTags = tags.trim() || description.trim();
    if (!effectiveTags) {
      throw new Error("tags or description is required for ACE-Step generate mode");
    }

    const result = await client.predict("/generate", {
      prompt: String(effectiveTags),
      lyrics: String(lyrics || ""),
      audio_duration: toNumber(audio_duration, 60),
      infer_step: toNumber(infer_step, 8),
      guidance_scale: toNumber(guidance_scale, 7.0),
      seed: toNumber(seed, -1),
    });

    const audioData = result?.data?.[0];
    if (!audioData) {
      throw new Error("ACE-Step /generate returned no audio data");
    }

    const audioValue = typeof audioData === "string" ? audioData : audioData?.url;
    if (!audioValue) {
      throw new Error("ACE-Step /generate returned unexpected audio format");
    }

    return { audio: audioValue, tags: effectiveTags, lyrics };
  }

  // ── Official ACE-Step v1.5 Space (full featured with audio2audio / cover) ──
  const effectiveTags = tags.trim() || description.trim();
  if (!effectiveTags) {
    throw new Error("tags or description is required for ACE-Step generate mode");
  }

  // Build audio blobs if provided (for cover/remix mode)
  let srcAudioRef = null;
  let refAudioRef = null;
  let audioCodes = "";
  const isCoverMode = !!src_audio;
  if (isCoverMode) {
    const audioBuf = Buffer.isBuffer(src_audio) ? src_audio : Buffer.from(src_audio, "base64");
    const blob = new Blob([audioBuf], { type: "audio/mpeg" });
    srcAudioRef = handle_file(blob);
    refAudioRef = handle_file(blob);

    // Pre-process source audio to get audio codes (required for cover mode)
    console.log("[ACE-Step] calling /process_source_audio_wrapper to get audio codes…");
    const codeResult = await client.predict("/process_source_audio_wrapper", {
      src: handle_file(new Blob([audioBuf], { type: "audio/mpeg" })),
      debug: false,
    });
    audioCodes = codeResult?.data?.[0] || "";
    console.log("[ACE-Step] got audio codes, length:", audioCodes.length);
  }

  const seedVal = toNumber(seed, -1);

  const result = await client.predict("/generation_wrapper", buildACEStepPayload({
    effectiveTags,
    lyrics,
    audio_duration,
    infer_step,
    guidance_scale,
    seedVal,
    refAudioRef,
    srcAudioRef,
    isCoverMode,
    ref_audio_strength,
    audioCodes,
    model,
    thinking,
  }));

  // /generation_wrapper returns 38 elements — first 8 are audio samples
  const audioData = result?.data?.[0];
  if (!audioData) {
    throw new Error("ACE-Step v1.5 returned no audio data");
  }

  const audioValue = typeof audioData === "string" ? audioData : audioData?.url;
  if (!audioValue) {
    throw new Error("ACE-Step v1.5 returned unexpected audio format");
  }

  return { audio: audioValue, tags: effectiveTags, lyrics };
}

/**
 * Stream ACE-Step generation via Replicate API (lucataco/ace-step).
 * Used when REPLICATE_API_TOKEN is set. Much more reliable than ZeroGPU.
 * ~$0.03/run on dedicated L40S GPU, typically completes in 6-30 seconds.
 */
async function* streamGenerateWithReplicate(options = {}) {
  const {
    description = "",
    tags = "",
    lyrics = "",
    audio_duration = 60,
    infer_step = 60,
    guidance_scale = 15.0,
    seed = -1,
    src_audio = null,
    ref_audio_strength = 0.5,
  } = options;

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

  const effectiveTags = tags.trim() || description.trim();
  if (!effectiveTags) {
    yield { type: "error", message: "tags or description is required" };
    return;
  }

  const input = {
    tags: effectiveTags,
    lyrics: String(lyrics || "[Instrumental]"),
    duration: Math.min(Math.max(toNumber(audio_duration, 60), 5), 240),
    infer_step: toNumber(infer_step, 60),
    guidance_scale: toNumber(guidance_scale, 15),
    seed: toNumber(seed, -1),
  };

  // Add source audio for cover/remix mode
  if (src_audio) {
    const audioBuf = Buffer.isBuffer(src_audio) ? src_audio : Buffer.from(src_audio, "base64");
    const base64Audio = audioBuf.toString("base64");
    input.src_audio = `data:audio/mpeg;base64,${base64Audio}`;
    input.audio2audio_strength = toNumber(ref_audio_strength, 0.5);
  }

  console.log("[ACE-Step Replicate] Starting generation, tags:", effectiveTags.slice(0, 80), "duration:", input.duration);
  yield { type: "progress", value: 5, message: "Submitting to Replicate…" };

  try {
    let prediction = await replicate.predictions.create({
      model: "lucataco/ace-step",
      input,
    });

    console.log("[ACE-Step Replicate] Prediction created:", prediction.id, "status:", prediction.status);
    yield { type: "progress", value: 10, message: "Queued on Replicate…" };

    // Poll for completion
    const startTime = Date.now();
    const MAX_WAIT_MS = 300_000; // 5 minutes max

    while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
      if (Date.now() - startTime > MAX_WAIT_MS) {
        try { await replicate.predictions.cancel(prediction.id); } catch {}
        yield { type: "error", message: "Replicate prediction timed out after 5 minutes" };
        return;
      }

      await new Promise(r => setTimeout(r, 2000));
      prediction = await replicate.predictions.get(prediction.id);

      if (prediction.status === "processing") {
        const elapsed = (Date.now() - startTime) / 1000;
        const pct = Math.min(Math.round(10 + (elapsed / (input.duration * 0.5)) * 80), 90);
        yield { type: "progress", value: pct, message: `Generating… ${pct}%` };
      } else if (prediction.status === "starting") {
        yield { type: "progress", value: 8, message: "GPU starting…" };
      }
    }

    if (prediction.status === "failed") {
      console.error("[ACE-Step Replicate] Failed:", prediction.error);
      yield { type: "error", message: prediction.error || "Replicate generation failed" };
      return;
    }

    if (prediction.status === "canceled") {
      yield { type: "error", message: "Generation was canceled" };
      return;
    }

    // Success — extract audio URL
    const output = prediction.output;
    let audioUrl = null;

    if (typeof output === "string") {
      audioUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      audioUrl = typeof output[0] === "string" ? output[0] : output[0]?.url;
    } else if (output?.url) {
      audioUrl = output.url;
    }

    if (!audioUrl) {
      console.error("[ACE-Step Replicate] Unexpected output format:", JSON.stringify(output).slice(0, 200));
      yield { type: "error", message: "Replicate returned no audio URL" };
      return;
    }

    console.log("[ACE-Step Replicate] Success! Audio URL:", audioUrl.slice(0, 100));
    yield { type: "progress", value: 95, message: "Audio ready!" };
    yield {
      type: "result",
      audio: audioUrl,
      title: effectiveTags.slice(0, 60),
      tags: effectiveTags,
      lyrics: lyrics || "",
    };
  } catch (err) {
    console.error("[ACE-Step Replicate] Error:", err.message);
    yield { type: "error", message: `Replicate error: ${err.message}` };
  }
}

/**
/**
 * Stream ACE-Step generation — yields progress events via an async generator.
 * Each yielded value is one of:
 *   { type: "progress", value: number (0-100), message: string }
 *   { type: "result",   audio, title, tags, lyrics, thumbnail }
 *   { type: "error",    message: string }
 *
 * Supports audio2audio remixing when src_audio is provided.
 * Priority: AceMusic API > Replicate > HuggingFace Gradio Space.
 *
 * @param {object} options  — same shape as generateWithACEStep
 */
export async function* streamGenerateWithACEStep(options = {}) {
  if (isAceStepApiConfigured()) {
    console.log("[ACE-Step] Using ACE-Step task API (ACEMUSIC_API_KEY set)");
    const events = [];
    let lastError = null;
    for await (const event of streamAceStepGeneration(options)) {
      events.push(event);
      if (event.type === "error") {
        lastError = event;
      }
    }
    // If AceMusic 504'd and Replicate is available, fall back silently
    if (lastError?.message?.includes("504") && process.env.REPLICATE_API_TOKEN) {
      console.log("[ACE-Step] AceMusic API 504 — falling back to Replicate…");
      yield { type: "progress", value: 5, message: "AceMusic overloaded, switching to Replicate…" };
      yield* streamGenerateWithReplicate(options);
      return;
    }
    // Otherwise yield all buffered events normally
    for (const event of events) yield event;
    return;
  }
  // Then Replicate if token is available (no ZeroGPU timeouts)
  if (process.env.REPLICATE_API_TOKEN) {
    console.log("[ACE-Step] Using Replicate backend (REPLICATE_API_TOKEN set)");
    yield* streamGenerateWithReplicate(options);
    return;
  }
  const hfToken = process.env.HF_TOKEN || null;
  const spaceUrl = HF_ACESTEP_SPACE;
  const client = await getClient(spaceUrl, hfToken);

  const {
    mode = "create",
    description = "",
    tags = "",
    lyrics = "",
    audio_duration = 60,
    infer_step = 60,
    guidance_scale = 15.0,
    seed = -1,
    src_audio = null,
    ref_audio_strength = 0.5,
    model = "acestep-v15-xl-turbo",
    thinking = true,
  } = options;

  console.log("[HF Gradio] ACE-Step stream mode:", mode, "duration:", audio_duration, "audio2audio:", !!src_audio, "model:", model, "thinking:", thinking);

  // Detect if this is the simplified victor/ace-step-jam space
  const isSimplifiedSpace = spaceUrl && spaceUrl.toLowerCase().includes("victor/ace-step-jam");

  let endpoint;
  let payload;

  if (isSimplifiedSpace) {
    endpoint = mode === "create" ? "/create" : "/generate";
    payload =
      mode === "create"
        ? {
            description: String(description),
            audio_duration: toNumber(audio_duration, 60),
            seed: toNumber(seed, -1),
          }
        : {
            prompt: String(tags.trim() || description.trim()),
            lyrics: String(lyrics || ""),
            audio_duration: toNumber(audio_duration, 60),
            infer_step: toNumber(infer_step, 8),
            guidance_scale: toNumber(guidance_scale, 7.0),
            seed: toNumber(seed, -1),
          };
  } else {
    // Official ACE-Step v1.5 space — full generation with cover/remix support
    endpoint = "/generation_wrapper";
    const effectiveTags = tags.trim() || description.trim();
    const isCoverMode = !!src_audio;

    let srcAudioRef = null;
    let refAudioRef = null;
    let audioCodes = "";
    if (isCoverMode) {
      const audioBuf = Buffer.isBuffer(src_audio) ? src_audio : Buffer.from(src_audio, "base64");
      const blob = new Blob([audioBuf], { type: "audio/mpeg" });
      srcAudioRef = handle_file(blob);
      refAudioRef = handle_file(blob);

      // Pre-process source audio to get audio codes (required for cover mode)
      yield { type: "progress", value: 0, message: "Encoding source audio…" };
      try {
        console.log("[ACE-Step stream] calling /process_source_audio_wrapper to get audio codes…");
        const codeResult = await client.predict("/process_source_audio_wrapper", {
          src: handle_file(new Blob([audioBuf], { type: "audio/mpeg" })),
          debug: false,
        });
        audioCodes = codeResult?.data?.[0] || "";
        console.log("[ACE-Step stream] got audio codes, length:", audioCodes.length);
      } catch (codeErr) {
        console.error("[ACE-Step stream] /process_source_audio_wrapper failed:", codeErr.message);
        yield { type: "error", message: friendlyAceStepError(codeErr.message, "Failed to encode source audio") };
        return;
      }
    }

    const seedVal = toNumber(seed, -1);

    payload = buildACEStepPayload({
      effectiveTags,
      lyrics,
      audio_duration,
      infer_step,
      guidance_scale,
      seedVal,
      refAudioRef,
      srcAudioRef,
      isCoverMode,
      ref_audio_strength,
      audioCodes,
      model,
      thinking,
    });
  }

  yield { type: "progress", value: 0, message: "Submitting to ACE-Step…" };

  console.log("[ACE-Step stream] submitting to endpoint:", endpoint, "payload keys:", Object.keys(payload));
  let job;
  try {
    job = client.submit(endpoint, payload, null, null, true);
    console.log("[ACE-Step stream] submit returned (all_events=true), job type:", typeof job, "has asyncIterator:", typeof job?.[Symbol.asyncIterator] === "function");
  } catch (submitErr) {
    console.error("[ACE-Step stream] submit threw:", submitErr.message);
    yield { type: "error", message: `Submit failed: ${submitErr.message}` };
    return;
  }

  let lastValue = 0;
  let resultEmitted = false;
  let eventCount = 0;

  const TIMEOUT_MS = 180_000;
  const timeoutId = setTimeout(() => {
    console.error(`[ACE-Step stream] No events for ${TIMEOUT_MS / 1000}s — aborting`);
    try { job.cancel?.(); } catch {}
  }, TIMEOUT_MS);

  try {
    for await (const event of job) {
      eventCount++;
      if (!event) {
        console.log(`[ACE-Step stream] event #${eventCount} is null/undefined`);
        continue;
      }

      if (eventCount === 1) clearTimeout(timeoutId);

      console.log(`[ACE-Step stream] event #${eventCount}:`, JSON.stringify(event).slice(0, 400));

    // ── Helper: extract audio from a data array ──────────────────────────
    const extractAudio = (dataArr) => {
      const raw = Array.isArray(dataArr) ? dataArr[0] : dataArr;
      if (!raw) return null;
      let parsed;
      try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { parsed = { audio: raw }; }
      return parsed?.audio
        || (typeof parsed === "string" ? parsed : null)
        || parsed?.url
        || (typeof raw === "object" ? raw?.url : null)
        || null;
    };

    // ── status events ────────────────────────────────────────────────────
    if (event.type === "status") {
      const stage = event.stage || "";
      const progress = event.progress_data;
      const queueSize = event.queue_size;

      // Real progress_data from Gradio tqdm steps
      if (Array.isArray(progress) && progress.length > 0) {
        const p = progress[0];
        let pct;
        if (p?.index != null && p?.length != null && p.length > 0) {
          pct = Math.round((p.index / p.length) * 95);
        } else if (p?.progress != null && p.progress > 0) {
          pct = Math.round(p.progress * 95);
        } else {
          pct = lastValue;
        }
        lastValue = Math.max(lastValue, pct);
        const desc = p?.desc ? ` — ${p.desc}` : "";
        yield { type: "progress", value: lastValue, message: `Generating… ${lastValue}%${desc}` };
      } else if (stage === "pending" || stage === "in_queue") {
        const queueMsg = queueSize != null && queueSize > 0
          ? `Queued — position ${queueSize}, waiting for GPU…`
          : "Queued — waiting for GPU (Space may be waking up)…";
        yield { type: "progress", value: lastValue, message: queueMsg };
      } else if (stage === "generating" || stage === "process_generating" || stage === "process_starts") {
        if (lastValue === 0) lastValue = 5;
        else lastValue = Math.min(lastValue + 5, 90);
        yield { type: "progress", value: lastValue, message: `Generating… ${lastValue}%` };
      } else if (stage === "complete" || stage === "process_completed") {
        // Some spaces return the result inside the status event's output
        const output = event.output?.data ?? event.data;
        console.log(`[ACE-Step stream] complete status — output keys:`, Object.keys(event.output || {}), "output.data type:", typeof event.output?.data, "event.data type:", typeof event.data);
        const audioValue = extractAudio(output);
        console.log(`[ACE-Step stream] complete status — audioValue:`, audioValue ? audioValue.slice(0, 100) : null);
        if (audioValue) {
          yield { type: "progress", value: 100, message: "Finalizing…" };
          yield {
            type: "result",
            audio: audioValue,
            title: "",
            tags: tags || "",
            lyrics: lyrics || "",
            thumbnail: null,
          };
          resultEmitted = true;
        } else {
          yield { type: "progress", value: 98, message: "Almost done…" };
        }
      } else if (stage === "error") {
        const msg = event.message || event.code || "Space returned an error";
        yield { type: "error", message: friendlyAceStepError(msg) };
      }
      continue;
    }

    // ── data events ──────────────────────────────────────────────────────
    if (event.type === "data") {
      console.log(`[ACE-Step stream] data event — data[0] type:`, typeof event.data?.[0], "isArray:", Array.isArray(event.data), "data length:", event.data?.length);
      const audioValue = extractAudio(event.data);
      if (!audioValue) {
        console.log(`[ACE-Step stream] data event — no audio extracted from data[0] =`, JSON.stringify(event.data?.[0]).slice(0, 200));
        continue;
      }

      let parsed;
      try { parsed = typeof event.data?.[0] === "string" ? JSON.parse(event.data[0]) : event.data?.[0]; }
      catch { parsed = {}; }

      yield { type: "progress", value: 100, message: "Finalizing…" };
      yield {
        type: "result",
        audio: audioValue,
        title: parsed?.title || "",
        tags: parsed?.tags || tags || "",
        lyrics: parsed?.lyrics || lyrics || "",
        thumbnail: parsed?.thumbnail || null,
      };
      resultEmitted = true;
      continue;
    }

    // Log unrecognized event types
    console.log(`[ACE-Step stream] unrecognized event type:`, event.type, "keys:", Object.keys(event));
  }
  } catch (loopErr) {
    clearTimeout(timeoutId);
    console.error(`[ACE-Step stream] for-await loop threw after ${eventCount} events:`, loopErr.message);
    yield { type: "error", message: friendlyAceStepError(loopErr.message, "Stream broke") };
    return;
  }

  clearTimeout(timeoutId);

  console.log(`[ACE-Step stream] loop ended after ${eventCount} events, resultEmitted:`, resultEmitted);

  if (!resultEmitted) {
    yield { type: "error", message: "Generation ended without producing audio" };
  }
}

/**
 * Generate audio from text using the MMAudio Space on HuggingFace
 * @param {string} spaceUrl  - Full Space URL (e.g. "hkchengrex/MMAudio")
 * @param {string} hfToken   - HuggingFace API token (optional for public spaces)
 * @param {object} options
 * @param {string} options.prompt - Audio description prompt
 * @param {string} [options.negative_prompt="music"] - Negative prompt
 * @param {number} [options.seed=-1] - Random seed (-1 for random)
 * @param {number} [options.num_steps=25] - Number of inference steps
 * @param {number} [options.cfg_strength=4.5] - CFG guidance strength
 * @param {number} [options.duration=8] - Duration in seconds
 * @returns {{ url: string }} Object with URL to the generated audio file
 */
export async function generateTextToAudio(spaceUrl, hfToken, options = {}) {
  const client = await getClient(spaceUrl, hfToken);

  const {
    prompt = "",
    negative_prompt = "music",
    seed = -1,
    num_steps = 25,
    cfg_strength = 4.5,
    duration = 8,
  } = options;

  if (!prompt) {
    throw new Error("Prompt is required for text-to-audio generation");
  }

  console.log("[HF Gradio] Calling /text_to_audio with prompt:", prompt);

  const result = await client.predict("/text_to_audio", {
    prompt: String(prompt ?? ""),
    negative_prompt: String(negative_prompt ?? "music"),
    seed: toNumber(seed, -1),
    num_steps: toNumber(num_steps, 25),
    cfg_strength: toNumber(cfg_strength, 4.5),
    duration: toNumber(duration, 8),
  });

  const outputData = result?.data?.[0];
  if (!outputData) {
    throw new Error("MMAudio Space returned no text-to-audio data");
  }

  // Gradio returns { url: "..." } for audio outputs
  const outputUrl =
    typeof outputData === "string"
      ? outputData
      : outputData?.url;

  if (!outputUrl) {
    throw new Error("MMAudio Space returned unexpected text-to-audio format");
  }

  return { url: outputUrl };
}
