import { InferenceClient } from "@huggingface/inference";

const _clientCache = new Map();

function normalizeToken(hfToken) {
  if (hfToken == null) return "";
  return String(hfToken).replace(/^Bearer\s+/i, "").trim();
}

function withoutPolicySuffix(model) {
  const modelText = String(model || "");
  const idx = modelText.lastIndexOf(":");
  if (idx === -1) return modelText;
  const suffix = modelText.slice(idx + 1).toLowerCase();
  if (["fastest", "cheapest", "preferred"].includes(suffix)) {
    return modelText.slice(0, idx);
  }
  return modelText;
}

function getClient(hfToken) {
  const token = normalizeToken(hfToken);
  if (!token) {
    throw new Error("HuggingFace token is required for Inference Providers");
  }

  if (_clientCache.has(token)) {
    return _clientCache.get(token);
  }

  const client = new InferenceClient(token);
  _clientCache.set(token, client);
  return client;
}

function toFiniteOrUndefined(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function toImageBuffer(result, fallbackMimeType = "image/png") {
  if (!result) {
    throw new Error("HuggingFace Inference returned no image data");
  }

  if (Buffer.isBuffer(result)) {
    return { buffer: result, mimeType: fallbackMimeType };
  }

  if (result instanceof Uint8Array) {
    return { buffer: Buffer.from(result), mimeType: fallbackMimeType };
  }

  if (typeof result === "string") {
    const trimmed = result.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      const response = await fetch(trimmed, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`Failed to download provider image URL: ${response.status}`);
      }
      const mimeType = response.headers.get("content-type") || fallbackMimeType;
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType,
      };
    }
    throw new Error("Received unsupported string response from Inference Providers");
  }

  const maybeUrl = result?.url || result?.image_url || result?.output_url;
  if (typeof maybeUrl === "string" && /^https?:\/\//i.test(maybeUrl)) {
    const response = await fetch(maybeUrl, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Failed to download provider image URL: ${response.status}`);
    }
    const mimeType = response.headers.get("content-type") || fallbackMimeType;
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType,
    };
  }

  if (typeof result.arrayBuffer === "function") {
    const mimeType = result?.type || fallbackMimeType;
    return {
      buffer: Buffer.from(await result.arrayBuffer()),
      mimeType,
    };
  }

  throw new Error("Received malformed response from text-to-image provider");
}

export async function generateImageViaInference(hfToken, options = {}) {
  const client = getClient(hfToken);

  const {
    prompt = "",
    model = "Tongyi-MAI/Z-Image-Turbo",
    provider = "replicate",
    width,
    height,
    num_inference_steps,
    guidance_scale,
    seed,
  } = options;

  const parameters = {
    ...(toFiniteOrUndefined(width) != null && { width: toFiniteOrUndefined(width) }),
    ...(toFiniteOrUndefined(height) != null && { height: toFiniteOrUndefined(height) }),
    ...(toFiniteOrUndefined(num_inference_steps) != null && {
      num_inference_steps: toFiniteOrUndefined(num_inference_steps),
    }),
    ...(toFiniteOrUndefined(guidance_scale) != null && {
      guidance_scale: toFiniteOrUndefined(guidance_scale),
    }),
    ...(toFiniteOrUndefined(seed) != null && { seed: toFiniteOrUndefined(seed) }),
  };

  const runCall = async (callProvider, callModel) => {
    return client.textToImage({
      provider: callProvider,
      model: callModel,
      inputs: String(prompt ?? ""),
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    });
  };

  let imageBlob;
  try {
    imageBlob = await runCall(provider, model);
  } catch (error) {
    const message = String(error?.message || error || "");
    const baseModel = withoutPolicySuffix(model);

    // Retry once without model policy suffix for text-to-image tasks.
    if (baseModel !== model) {
      try {
        imageBlob = await runCall(provider, baseModel);
      } catch {
        // Continue to next fallback.
      }
    }

    // If provider mapping fails under auto, retry with hf-inference provider.
    if (!imageBlob && provider === "auto") {
      try {
        imageBlob = await runCall("hf-inference", baseModel);
      } catch {
        // Keep original error message for clarity.
      }
    }

    if (!imageBlob) {
      if (/invalid username or password|401|unauthorized/i.test(message)) {
        throw new Error(
          "HuggingFace token is invalid or missing Inference Providers permission. " +
          "Create a new token with 'Make calls to Inference Providers' and update the HuggingFace API key."
        );
      }
      throw error;
    }
  }

  const { buffer, mimeType } = await toImageBuffer(imageBlob, "image/png");

  return {
    buffer,
    mimeType,
    model,
    provider,
  };
}
