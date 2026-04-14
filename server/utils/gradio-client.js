import { Client, handle_file } from "@gradio/client";

const _clientCacheBySpace = new Map();

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
    const match = resolution.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (match) {
      parsedWidth = toNumber(match[1], 1024);
      parsedHeight = toNumber(match[2], 1024);
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
    num_inference_steps = 25,
    seed = -1,
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
    payload = {
      input_image: imageRef,
      last_image: imageRef, // Fallback required per the API doc
      prompt: String(prompt || ""),
      steps: Number(num_inference_steps) || 6,
      negative_prompt: String(negative_prompt || ""),
      duration_seconds: 3.5, // Not mapped from current defaults natively, using the API default
      guidance_scale: Number(guidance_scale) || 1,
      guidance_scale_2: 1, 
      seed: Number(seed) === -1 ? 42 : Number(seed),
      randomize_seed: Number(seed) === -1,
      quality: 6,
      scheduler: "UniPCMultistep",
      flow_shift: 3,
      frame_multiplier: 16,
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
