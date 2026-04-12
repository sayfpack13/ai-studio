import express from "express";
import axios from "axios";
import { requireApiKey } from "../middleware/auth.js";
import { findModel } from "../utils/models.js";

const router = express.Router();
router.use(requireApiKey);

// Transform OpenAI-style image_url content blocks to Ollama images[] format
function transformMessagesForOllamaVision(messages) {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;

    const textParts = [];
    const images = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text || "");
      } else if (part.type === "image_url" && part.image_url?.url) {
        const url = part.image_url.url;
        if (url.startsWith("data:")) {
          const base64Match = url.match(/^data:[^;]+;base64,(.+)$/);
          if (base64Match) {
            images.push(base64Match[1]);
          }
        } else {
          images.push(url);
        }
      }
    }

    const transformed = {
      role: msg.role,
      content: textParts.join("\n") || "",
    };

    if (images.length > 0) {
      transformed.images = images;
    }

    return transformed;
  });
}

// Transform OpenAI format request to Ollama format
function transformToOllamaRequest(requestData) {
  return {
    model: requestData.model,
    messages: transformMessagesForOllamaVision(requestData.messages),
    stream: requestData.stream || false,
    options: {
      temperature: requestData.temperature || 0.7,
      num_ctx: requestData.max_tokens || 4096,
      num_predict: requestData.max_tokens || 2048,
    },
  };
}

// Transform Ollama response to OpenAI format
function transformOllamaToOpenAIResponse(ollamaResponse, model) {
  return {
    id: `ollama-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: {
          role: ollamaResponse.message?.role || "assistant",
          content: ollamaResponse.message?.content || "",
        },
        finish_reason: ollamaResponse.done ? "stop" : null,
      },
    ],
    usage: {
      prompt_tokens: ollamaResponse.prompt_eval_count || 0,
      completion_tokens: ollamaResponse.eval_count || 0,
      total_tokens:
        (ollamaResponse.prompt_eval_count || 0) +
        (ollamaResponse.eval_count || 0),
    },
  };
}

// Handle Ollama streaming response
async function handleOllamaStream(response, res, model) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let buffer = "";

  response.data.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const ollamaChunk = JSON.parse(line);
          const openaiChunk = {
            id: `ollama-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
              {
                index: 0,
                delta: {
                  content: ollamaChunk.message?.content || "",
                },
                finish_reason: ollamaChunk.done ? "stop" : null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);

          if (ollamaChunk.done) {
            res.write("data: [DONE]\n\n");
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  });

  response.data.on("end", () => {
    res.end();
  });

  response.data.on("error", (err) => {
    console.error("Stream error:", err);
    res.end();
  });
}

// Test Ollama Cloud API connectivity
router.get("/test-ollama", async (req, res) => {
  try {
    const providerId = "ollama";
    const provider = req.config.providers?.[providerId];

    if (!provider) {
      return res.status(400).json({ error: "Ollama provider not configured" });
    }

    const { apiBaseUrl, apiKey } = provider;

    console.log(`[Ollama Test] Testing API connectivity...`);
    console.log(`[Ollama Test] Base URL: ${apiBaseUrl}`);
    console.log(
      `[Ollama Test] API Key: ${apiKey ? apiKey.substring(0, 20) + "..." : "NOT SET"}`,
    );

    // Test 1: List models
    console.log(`[Ollama Test] Testing /api/tags endpoint...`);
    let tagsResponse;
    try {
      tagsResponse = await axios.get(`${apiBaseUrl}/api/tags`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      });
      console.log(`[Ollama Test] /api/tags response: ${tagsResponse.status}`);
    } catch (tagsError) {
      console.log(
        `[Ollama Test] /api/tags error: ${tagsError.response?.status || tagsError.message}`,
      );
      tagsResponse = {
        error: true,
        status: tagsError.response?.status,
        data: tagsError.response?.data,
        message: tagsError.message,
      };
    }

    // Test 2: Simple chat request with gpt-oss model
    console.log(`[Ollama Test] Testing /api/chat endpoint with gpt-oss:20b...`);
    let chatResponse;
    try {
      chatResponse = await axios.post(
        `${apiBaseUrl}/api/chat`,
        {
          model: "gpt-oss:20b",
          messages: [{ role: "user", content: "Say 'Hello'" }],
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      );
      console.log(`[Ollama Test] /api/chat response: ${chatResponse.status}`);
    } catch (chatError) {
      const errorData = chatError.response?.data;
      let errorMessage = chatError.message;

      // Try to get more details from the error response
      if (typeof errorData === "string") {
        errorMessage = errorData;
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      }

      console.log(
        `[Ollama Test] /api/chat error: ${chatError.response?.status} - ${errorMessage}`,
      );
      chatResponse = {
        error: true,
        status: chatError.response?.status,
        data: errorData,
        message: errorMessage,
      };
    }

    // Return test results
    res.json({
      provider: {
        id: providerId,
        name: provider.name,
        apiBaseUrl: apiBaseUrl,
        apiKeySet: !!apiKey,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 20) + "..." : null,
      },
      tests: {
        tags: tagsResponse.error
          ? {
              success: false,
              status: tagsResponse.status,
              error: tagsResponse.message,
              data: tagsResponse.data,
            }
          : {
              success: true,
              status: tagsResponse.status,
              modelCount: tagsResponse.data?.models?.length || 0,
              models:
                tagsResponse.data?.models?.slice(0, 5).map((m) => m.name) || [],
            },
        chat: chatResponse.error
          ? {
              success: false,
              status: chatResponse.status,
              error: chatResponse.message,
              data: chatResponse.data,
            }
          : {
              success: true,
              status: chatResponse.status,
              response: chatResponse.data?.message?.content?.substring(0, 100),
            },
      },
      recommendations: getRecommendations(tagsResponse, chatResponse),
    });
  } catch (error) {
    console.error("[Ollama Test] Unexpected error:", error);
    res.status(500).json({
      error: "Test failed",
      message: error.message,
    });
  }
});

// Get recommendations based on test results
function getRecommendations(tagsResponse, chatResponse) {
  const recommendations = [];

  if (tagsResponse.error && tagsResponse.status === 404) {
    recommendations.push({
      issue: "API endpoint not found (404)",
      possibleCauses: [
        "Your API key may not have Ollama Cloud API access enabled",
        "The Ollama Cloud API may require activation in your account settings",
        "The API endpoint URL may have changed",
      ],
      suggestions: [
        "Go to ollama.com and sign in to your account",
        "Check if you have Cloud API access enabled",
        "Verify your API key was created for API access (not just CLI)",
        "Try creating a new API key from your account dashboard",
      ],
    });
  }

  if (tagsResponse.error && tagsResponse.status === 401) {
    recommendations.push({
      issue: "Authentication failed (401)",
      possibleCauses: [
        "Your API key is invalid or expired",
        "The API key format is incorrect",
      ],
      suggestions: [
        "Verify your API key is correct",
        "Create a new API key from your Ollama account",
      ],
    });
  }

  if (chatResponse.error && !tagsResponse.error) {
    recommendations.push({
      issue: "Chat endpoint failed but tags endpoint works",
      possibleCauses: [
        "The model name may not be valid for cloud",
        "Your account may not have access to the requested model",
      ],
      suggestions: [
        "Try using cloud-specific models like 'gpt-oss:20b' or 'gpt-oss:120b'",
        "Check your account for available cloud models",
      ],
    });
  }

  if (!tagsResponse.error && !chatResponse.error) {
    recommendations.push({
      issue: "All tests passed!",
      suggestions: [
        "Your Ollama Cloud API is working correctly",
        "Use cloud models like 'gpt-oss:20b' or 'gpt-oss:120b'",
      ],
    });
  }

  return recommendations;
}

// Chat completions endpoint
router.post("/completions", async (req, res) => {
  try {
    const {
      messages,
      model,
      modelKey,
      stream,
      temperature,
      maxTokens,
      localOllamaUrl,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array required" });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.chat || 60000;
    const apiType = provider.apiType || "openai";

    // Check if this is a local Ollama request
    const isLocalOllama = !!(localOllamaUrl && providerId === "ollama");

    if (!isLocalOllama) {
      const modelInfo = await findModel(
        req.config,
        modelId,
        providerId,
        modelKey,
      );
      if (!modelInfo) {
        return res.status(400).json({
          error: `Model ${modelId || modelKey} is not available for gateway ${providerId}`,
        });
      }
    }

    // Extract actual model name (remove gateway prefix if present)
    let actualModelId = modelId;
    if (modelId && modelId.includes("/")) {
      const parts = modelId.split("/");
      if (
        parts.length >= 2 &&
        ["ollama", "blackboxai", "blackbox", "chutes", "nanogpt", "huggingface"].includes(
          parts[0],
        )
      ) {
        actualModelId = parts.slice(1).join("/");
      }
    }

    // Prepare request data
    const requestData = {
      model: actualModelId,
      messages: messages,
      stream: stream || false,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 2048,
    };

    // Check if this is Ollama native API
    const isOllamaNative =
      isLocalOllama || apiType === "ollama-native" || providerId === "ollama";

    // Determine the actual base URL (local or cloud)
    const effectiveBaseUrl = isLocalOllama
      ? localOllamaUrl.replace(/\/+$/, "")
      : apiBaseUrl;

    console.log(
      `[Chat] Provider: ${providerId}, Model: ${actualModelId}, Stream: ${stream}${isLocalOllama ? " (LOCAL)" : ""}`,
    );
    console.log(
      `[Chat] API Type: ${isOllamaNative ? "Ollama Native" : "OpenAI Compatible"}`,
    );
    console.log(
      `[Chat] Endpoint: ${isOllamaNative ? effectiveBaseUrl + "/api/chat" : effectiveBaseUrl + "/chat/completions"}`,
    );

    if (isOllamaNative) {
      const ollamaRequest = transformToOllamaRequest(requestData);
      const endpoint = `${effectiveBaseUrl}/api/chat`;

      // Local Ollama doesn't need auth; cloud does
      const ollamaHeaders = isLocalOllama
        ? { "Content-Type": "application/json" }
        : {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          };

      try {
        if (stream) {
          const response = await axios({
            method: "POST",
            url: endpoint,
            data: ollamaRequest,
            headers: ollamaHeaders,
            responseType: "stream",
            timeout,
          });

          await handleOllamaStream(response, res, actualModelId);
        } else {
          const response = await axios.post(endpoint, ollamaRequest, {
            headers: ollamaHeaders,
            timeout,
          });

          const openaiResponse = transformOllamaToOpenAIResponse(
            response.data,
            actualModelId,
          );
          res.json(openaiResponse);
        }
      } catch (ollamaError) {
        const status = ollamaError.response?.status;
        const errorData = ollamaError.response?.data;

        let safeErrorData;
        try {
          safeErrorData =
            typeof errorData === "string"
              ? errorData
              : errorData != null
                ? JSON.stringify(errorData)
                : ollamaError.message;
        } catch {
          safeErrorData = ollamaError.message || "Unknown error";
        }

        console.error(`[Chat] Ollama API Error: ${status} — ${safeErrorData}`);

        // Handle specific error cases
        if (status === 404) {
          return res.status(404).json({
            error: `Model '${actualModelId}' is not available on Ollama Cloud (404). Only cloud models can be used with the Ollama Cloud API.`,
            details: {
              endpoint: endpoint,
              model: actualModelId,
              possibleCauses: [
                "The model '" + actualModelId + "' is a local-only model not hosted on Ollama Cloud",
                "Cloud models include: glm-5, glm-4.7, deepseek-v3.2, qwen3.5, kimi-k2.5, minimax-m2.7, etc.",
                "Local models like qwen3, llama3, gemma3 require a local Ollama install",
              ],
              suggestions: [
                "Use a cloud model (look for '(Cloud)' suffix in the model list)",
                "Visit ollama.com/search?c=cloud to see available cloud models",
                "Run the test endpoint: GET /api/chat/test-ollama",
              ],
            },
          });
        }

        if (status === 401) {
          return res.status(401).json({
            error: "Ollama Cloud API authentication failed (401)",
            details: {
              possibleCauses: [
                "Your API key is invalid or expired",
                "The API key format is incorrect",
              ],
              suggestions: [
                "Verify your API key is correct",
                "Create a new API key from your Ollama account dashboard",
              ],
            },
          });
        }

        // Generic error
        throw ollamaError;
      }
    } else {
      // Use OpenAI-compatible API format
      const endpoint = `${apiBaseUrl}/chat/completions`;

      if (stream) {
        const response = await axios({
          method: "POST",
          url: endpoint,
          data: requestData,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          responseType: "stream",
          timeout,
        });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        response.data.pipe(res);
      } else {
        const response = await axios.post(endpoint, requestData, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        });

        res.json(response.data);
      }
    }
  } catch (error) {
    console.error("[Chat] Error:", error.response?.data || error.message);

    const status = error.response?.status || 500;
    let errorMessage = "Chat request failed";

    if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === "string") {
        errorMessage = data;
      } else if (data.error?.message) {
        errorMessage = data.error.message;
      } else if (data.error) {
        errorMessage =
          typeof data.error === "string"
            ? data.error
            : JSON.stringify(data.error);
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(status).json({
      error: errorMessage,
      status: status,
    });
  }
});

// Get available models
router.get("/models", async (req, res) => {
  try {
    const providerId = req.query.provider || req.config.defaultProvider;
    const provider = req.config.providers?.[providerId];
    const modelKey = req.query.modelKey;

    if (modelKey) {
      const modelInfo = await findModel(req.config, null, providerId, modelKey);
      if (!modelInfo) {
        return res.status(404).json({ error: "Model not found for gateway" });
      }
      return res.json({ data: [modelInfo] });
    }

    if (!provider || !provider.apiKey || !provider.apiBaseUrl) {
      return res
        .status(400)
        .json({ error: `Provider not configured: ${providerId}` });
    }

    const isOllamaNative =
      provider.apiType === "ollama-native" || providerId === "ollama";
    const endpoint = isOllamaNative
      ? `${provider.apiBaseUrl}/api/tags`
      : `${provider.apiBaseUrl}/models`;

    console.log(`[Models] Fetching from: ${endpoint}`);

    try {
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
        },
        timeout: provider.timeout?.chat || 60000,
      });

      // Transform Ollama models response to OpenAI format if needed
      if (isOllamaNative && response.data.models) {
        const models = response.data.models.map((model) => ({
          id: `ollama/${model.name}`,
          object: "model",
          created: Math.floor(
            new Date(model.modified_at || Date.now()).getTime() / 1000,
          ),
          owned_by: "ollama",
        }));
        res.json({ data: models });
      } else {
        res.json(response.data);
      }
    } catch (fetchError) {
      console.error(
        `[Models] Fetch error:`,
        fetchError.response?.status,
        fetchError.message,
      );

      if (isOllamaNative && fetchError.response?.status === 404) {
        return res.status(404).json({
          error: "Ollama Cloud API endpoint not found",
          details: {
            endpoint: endpoint,
            possibleCauses: [
              "Your API key may not have Ollama Cloud API access",
              "The Ollama Cloud API may require activation",
            ],
            suggestions: [
              "Visit ollama.com and check your Cloud API access",
              "Run the test endpoint: GET /api/chat/test-ollama",
            ],
          },
        });
      }

      throw fetchError;
    }
  } catch (error) {
    console.error("[Models] Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: "Failed to fetch models",
    });
  }
});

export default router;
