import { Client, handle_file } from "@gradio/client";

let _clientCache = null;
let _cachedSpaceUrl = null;

/**
 * Get or create a Gradio client connection to the HuggingFace Space.
 * Reuses the connection if the Space URL hasn't changed.
 */
async function getClient(spaceUrl, hfToken) {
  if (_clientCache && _cachedSpaceUrl === spaceUrl) {
    return _clientCache;
  }

  const opts = {};
  if (hfToken) {
    opts.hf_token = hfToken;
  }

  console.log("[HF Gradio] Connecting to Space:", spaceUrl, hfToken ? "(with token)" : "(public)");
  _clientCache = await Client.connect(spaceUrl, opts);
  _cachedSpaceUrl = spaceUrl;
  console.log("[HF Gradio] Connected successfully");
  return _clientCache;
}

/**
 * Reset the cached client (e.g. after config change).
 */
export function resetClient() {
  _clientCache = null;
  _cachedSpaceUrl = null;
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

  console.log("[HF Gradio] Calling /infer with prompt length:", prompt.length);

  // Build the Gradio call parameters matching infer_image() signature:
  // prompt, input_images, seed, randomize_seed, width, height, steps, guidance
  const callParams = {
    prompt,
    input_images: input_images.length > 0 ? input_images : null,
    seed,
    randomize_seed,
    width,
    height,
    num_inference_steps,
    guidance_scale,
  };

  // Gradio doesn't accept None as a value; use null for empty gallery
  if (input_images.length === 0) {
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

  const result = await client.predict("/generate_video", {
    image: imageRef,
    prompt,
    negative_prompt,
    width,
    height,
    num_frames,
    guidance_scale,
    num_inference_steps,
    seed,
  });

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
export async function downloadGradioFile(url) {
  const { default: axios } = await import("axios");
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
  });
  return Buffer.from(response.data);
}
