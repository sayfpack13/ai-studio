const API_BASE_URL = "http://localhost:3001/api";

// Token management
const TOKEN_KEY = "blackbox_ai_admin_token";

export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

// Helper function to make authenticated requests
const authFetch = async (url, options = {}) => {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If token is invalid/expired, remove it
  if (response.status === 401) {
    removeToken();
  }

  return response;
};

export const checkApiStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/config/status`);
    return await response.json();
  } catch (error) {
    console.error("API status check failed:", error);
    return { configured: false };
  }
};

// Login with password and get JWT token
export const loginAdmin = async (password) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await response.json();

  if (data.success && data.token) {
    setToken(data.token);
  }

  return data;
};

// Verify current token is still valid
export const verifyToken = async () => {
  const token = getToken();
  if (!token) return { valid: false };

  const response = await authFetch(`${API_BASE_URL}/auth/verify`);
  return await response.json();
};

export const generateMusic = async (prompt, model, options = {}) => {
  const { provider, modelKey, signal, ...restOptions } = options;

  const response = await fetch(`${API_BASE_URL}/music/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      prompt,
      model,
      provider,
      modelKey,
      ...restOptions,
    }),
  });
  return await response.json();
};

export const uploadMusicSource = async ({
  fileName,
  audioBase64,
  mimeType,
}) => {
  const response = await fetch(`${API_BASE_URL}/music/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, audioBase64, mimeType }),
  });
  return await response.json();
};

export const getMusicVoices = async () => {
  const response = await fetch(`${API_BASE_URL}/music/voices`);
  return await response.json();
};

export const remixMusic = async (payload, options = {}) => {
  const { signal } = options;
  const response = await fetch(`${API_BASE_URL}/music/remix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const listLibraryAssets = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== "") params.set(key, String(value));
  });
  const response = await fetch(
    `${API_BASE_URL}/library/assets?${params.toString()}`,
  );
  return await response.json();
};

export const createLibraryAsset = async (asset) => {
  const response = await fetch(`${API_BASE_URL}/library/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(asset),
  });
  return await response.json();
};

export const updateLibraryAsset = async (assetId, patch) => {
  const response = await fetch(`${API_BASE_URL}/library/assets/${assetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return await response.json();
};

export const deleteLibraryAsset = async (assetId) => {
  const response = await fetch(`${API_BASE_URL}/library/assets/${assetId}`, {
    method: "DELETE",
  });
  return await response.json();
};

export const searchLibraryAssets = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/library/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return await response.json();
};

export const uploadLibraryFile = async ({
  fileName,
  fileBase64,
  mimeType,
  title,
  source = "upload",
  tags = [],
  folderId = null,
  metadata = {},
  type,
}) => {
  const response = await fetch(`${API_BASE_URL}/library/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName,
      fileBase64,
      mimeType,
      title,
      source,
      tags,
      folderId,
      metadata,
      type,
    }),
  });
  return await response.json();
};

export const enqueuePipeline = async (pipelineType, payload) => {
  const response = await fetch(`${API_BASE_URL}/pipelines/${pipelineType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return await response.json();
};

export const getJobs = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== "") params.set(key, String(value));
  });
  const response = await fetch(`${API_BASE_URL}/jobs?${params.toString()}`);
  return await response.json();
};

export const getJobEvents = async (jobId) => {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/events`);
  return await response.json();
};

export const getEditorTemplates = async () => {
  const response = await fetch(`${API_BASE_URL}/editor/templates`);
  return await response.json();
};

export const createEditorTemplate = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/editor/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return await response.json();
};

// Logout
export const logoutAdmin = async () => {
  removeToken();
  return { success: true };
};

// Get configuration (requires JWT)
export const getConfig = async () => {
  const response = await authFetch(`${API_BASE_URL}/config/get`);
  return await response.json();
};

// Update configuration (requires JWT)
export const updateConfig = async (config) => {
  const response = await authFetch(`${API_BASE_URL}/config/update`, {
    method: "POST",
    body: JSON.stringify(config),
  });
  return await response.json();
};

// Test provider connection (requires JWT)
export const testProviderConnection = async (providerId) => {
  const response = await authFetch(`${API_BASE_URL}/config/test`, {
    method: "POST",
    body: JSON.stringify({ providerId }),
  });
  return await response.json();
};

// Legacy functions for backwards compatibility
export const verifyAdmin = loginAdmin;

export const sendChatMessage = async (messages, model, options = {}) => {
  const { stream, onChunk, provider, modelKey, signal, ...restOptions } =
    options;

  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      messages,
      model,
      provider,
      modelKey,
      stream: stream || false,
      ...restOptions,
    }),
  });

  if (stream && onChunk) {
    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return { choices: [{ message: { content: result } }] };
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
              onChunk(content);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
    return { choices: [{ message: { content: result } }] };
  }

  return await response.json();
};

export const generateImage = async (prompt, model, options = {}) => {
  const { provider, modelKey, signal, ...restOptions } = options;

  const response = await fetch(`${API_BASE_URL}/image/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      prompt,
      model,
      provider,
      modelKey,
      ...restOptions,
    }),
  });
  return await response.json();
};

export const generateVideo = async (prompt, model, options = {}) => {
  const { provider, modelKey, signal, ...restOptions } = options;

  const response = await fetch(`${API_BASE_URL}/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      prompt,
      model,
      provider,
      modelKey,
      ...restOptions,
    }),
  });
  return await response.json();
};

export const getModels = async ({
  category,
  provider = "all",
  modelProvider = "all",
} = {}) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (provider) params.set("provider", provider);
  if (modelProvider) params.set("modelProvider", modelProvider);

  const response = await fetch(`${API_BASE_URL}/models?${params.toString()}`);
  return await response.json();
};

export const getModelCategories = async () => {
  const response = await fetch(`${API_BASE_URL}/models/categories`);
  return await response.json();
};

// Fetch models from a local Ollama instance
export const fetchOllamaLocalModels = async (url) => {
  const response = await fetch(`${API_BASE_URL}/models/ollama-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return await response.json();
};

// Get saved local Ollama URL
export const getOllamaLocalUrl = async () => {
  const response = await fetch(`${API_BASE_URL}/models/ollama-local-url`);
  return await response.json();
};
