import express from 'express';
import axios from 'axios';
import { requireApiKey } from '../middleware/auth.js';
import { findModel } from '../utils/models.js';
import { getDefaultVoices, remixTrack } from '../services/remix-service.js';
import libraryService from '../services/library-service.js';
import { saveBuffer } from '../services/file-storage.js';

const router = express.Router();
router.use(requireApiKey);

// Detect if response contains binary audio data (MP3, WAV signatures)
function containsBinaryAudioData(result) {
  if (!result || typeof result !== 'object') return false;
  
  const checkBinary = (value) => {
    if (typeof value === 'string') {
      // Check for MP3 signature (ID3 or FF FB)
      if (value.startsWith('ID3') || value.includes('\xFF\xFB')) return true;
      // Check for WAV signature (RIFF....WAVE)
      if (value.includes('RIFF') && value.includes('WAVE')) return true;
      // Check for OGG signature (OggS)
      if (value.includes('OggS')) return true;
      // Check for generic binary data
      if (value.includes('\x00\x00\x00') && value.length > 100) return true;
    }
    return false;
  };
  
  // Check providerResponse for binary data
  if (result.providerResponse && checkBinary(result.providerResponse)) {
    return true;
  }
  
  // Check common response fields
  for (const field of ['audio', 'data', 'result', 'content', 'b64_json', 'base64']) {
    if (result[field] && checkBinary(result[field])) {
      return true;
    }
  }
  
  return false;
}

async function saveBinaryAudioResponse(result, prompt, modelId, providerId) {
  try {
    const crypto = await import('crypto');
    
    // Find the binary data
    let binaryData = null;
    let mimeType = 'audio/mpeg'; // default
    
    if (result.providerResponse && typeof result.providerResponse === 'string') {
      binaryData = result.providerResponse;
      if (binaryData.includes('RIFF') && binaryData.includes('WAVE')) mimeType = 'audio/wav';
      else if (binaryData.includes('OggS')) mimeType = 'audio/ogg';
    }
    
    if (!binaryData) return null;
    
    // Save to file
    const audioHash = crypto.createHash('md5').update(binaryData).digest('hex');
    const filename = `generated_audio_${Date.now()}_${audioHash.substring(0, 8)}${mimeType === 'audio/wav' ? '.wav' : mimeType === 'audio/ogg' ? '.ogg' : '.mp3'}`;
    
    const buffer = Buffer.from(binaryData, 'base64');
    const saved = await saveBuffer(buffer, mimeType, 'generated_audio');
    
    // Add to library
    await libraryService.createAsset({
      type: 'audio',
      source: 'music',
      title: prompt.slice(0, 80) || 'Generated audio',
      url: saved.url,
      filePath: saved.filepath,
      metadata: {
        model: modelId,
        provider: providerId,
        sizeBytes: saved.size,
        storage: 'local',
      },
    });
    
    return saved.url;
  } catch (err) {
    console.error('Failed to save binary audio:', err.message);
    return null;
  }
}

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

    let audioUrl = urls[0] || content;

    // Check if response contains binary audio data
    if (containsBinaryAudioData(response.data)) {
      const fileUrl = await saveBinaryAudioResponse(response.data, prompt, modelId, providerId);
      if (fileUrl) {
        audioUrl = fileUrl;
      }
    }

    const payload = {
      success: true,
      data: [
        {
          url: audioUrl,
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
