import express from 'express';
import axios from 'axios';
import { requireApiKey } from '../middleware/auth.js';
import { findModel } from '../utils/models.js';
import { getDefaultVoices, remixTrack } from '../services/remix-service.js';
import libraryService from '../services/library-service.js';

const router = express.Router();
router.use(requireApiKey);

router.post('/generate', async (req, res) => {
  try {
    const { prompt, model, modelKey, voice, format, localOllamaUrl } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;

    const isLocalOllama = !!(localOllamaUrl && providerId === 'ollama');

    if (!isLocalOllama) {
      const modelInfo = await findModel(req.config, modelId, providerId, modelKey);
      if (!modelInfo || !modelInfo.categories.includes('music')) {
        return res.status(400).json({
          error: `Model ${modelId || modelKey} is not available for music generation on gateway ${providerId}`
        });
      }
    }

    // Strip gateway prefix for API call
    let actualModelId = modelId;
    if (modelId && modelId.includes('/')) {
      const parts = modelId.split('/');
      if (
        parts.length >= 2 &&
        ['ollama', 'blackboxai', 'blackbox', 'chutes', 'nanogpt'].includes(parts[0])
      ) {
        actualModelId = parts.slice(1).join('/');
      }
    }

    const isOllamaNative =
      isLocalOllama || provider.apiType === 'ollama-native' || providerId === 'ollama';
    const effectiveBaseUrl = isLocalOllama
      ? localOllamaUrl.replace(/\/+$/, '')
      : apiBaseUrl;

    // Ollama uses /api/chat — no native music generation
    if (isOllamaNative) {
      const ollamaRequest = {
        model: actualModelId,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.7 }
      };

      const ollamaHeaders = isLocalOllama
        ? { 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

      const response = await axios.post(
        `${effectiveBaseUrl}/api/chat`,
        ollamaRequest,
        {
          headers: ollamaHeaders,
          timeout
        }
      );

      const ollamaData = response.data;
      return res.json({
        id: `ollama-${Date.now()}`,
        object: 'chat.completion',
        model: actualModelId,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: ollamaData.message?.content || ''
            },
            finish_reason: ollamaData.done ? 'stop' : null
          }
        ]
      });
    }

    const requestData = {
      model: actualModelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      ...(voice ? { voice } : {}),
      ...(format ? { format } : {})
    };

    const response = await axios.post(
      `${apiBaseUrl}/chat/completions`,
      requestData,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout
      }
    );

    const result = response.data;
    const content = result?.choices?.[0]?.message?.content;

    if (!content) {
      return res.json(result);
    }

    const urls = String(content)
      .split(/\s+/)
      .filter((part) => part.startsWith('http'));

    const payload = {
      success: true,
      data: [
        {
          url: urls[0] || content,
          raw: content,
          revised_prompt: prompt
        }
      ]
    };
    if (payload.data?.[0]?.url) {
      await libraryService.createAsset({
        type: 'audio',
        source: 'music',
        title: String(prompt).slice(0, 80) || 'Generated music',
        url: payload.data[0].url,
        metadata: { model: modelId, provider: providerId }
      });
    }
    return res.json(payload);
    
  } catch (error) {
    console.error('Music generation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || error.response?.data?.detail || 'Music generation failed'
    });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const { fileName, audioBase64, mimeType } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    const safeMime = mimeType || 'audio/mpeg';
    return res.json({
      success: true,
      data: {
        fileName: fileName || `upload-${Date.now()}.mp3`,
        mimeType: safeMime,
        url: `data:${safeMime};base64,${audioBase64}`
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Audio upload failed' });
  }
});

router.get('/voices', async (req, res) => {
  return res.json({
    success: true,
    data: getDefaultVoices()
  });
});

router.post('/remix', async (req, res) => {
  try {
    const {
      model,
      modelKey,
      sourceAudioUrl,
      sourceAudioBase64,
      prompt,
      style,
      genre,
      tempo,
      weirdness,
      influence,
      preserveVocals,
      voice,
      format
    } = req.body || {};

    const modelId = model || req.config.defaultModel;
    const providerId = req.providerContext.providerId;
    const modelInfo = await findModel(req.config, modelId, providerId, modelKey);
    if (!modelInfo || !modelInfo.categories.includes('music')) {
      return res.status(400).json({
        error: `Model ${modelId || modelKey} is not available for music remix on gateway ${providerId}`
      });
    }

    const result = await remixTrack({
      providerContext: req.providerContext,
      modelId,
      sourceAudioUrl,
      sourceAudioBase64,
      remixOptions: {
        prompt,
        style,
        genre,
        tempo,
        weirdness,
        influence,
        preserveVocals,
        voice,
        format
      }
    });

    if (result?.data?.[0]?.url) {
      await libraryService.createAsset({
        type: 'audio',
        source: 'remix',
        title: String(prompt || 'Remix output').slice(0, 80),
        url: result.data[0].url,
        metadata: { model: modelId, provider: providerId }
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('Music remix error:', error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || error.response?.data?.detail || error.message || 'Music remix failed'
    });
  }
});

export default router;
