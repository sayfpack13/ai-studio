import express from 'express';
import axios from 'axios';
import { requireApiKey } from '../middleware/auth.js';
import { findModel } from '../utils/models.js';
import libraryService from '../services/library-service.js';

const router = express.Router();
router.use(requireApiKey);

// Video generation endpoint - uses chat completions endpoint with video models
router.post('/generate', async (req, res) => {
  try {
    const { prompt, model, modelKey, image, duration, fps } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }
    
    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;

    const modelInfo = await findModel(req.config, modelId, providerId, modelKey);
    if (!modelInfo || !modelInfo.categories.includes('video')) {
      return res.status(400).json({
        error: `Model ${modelId || modelKey} is not available for video generation on gateway ${providerId}`
      });
    }
    
    // Build the content array
    let content;
    
    if (image) {
      // Image-to-video: include the image
      content = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: image
          }
        }
      ];
    } else {
      // Text-to-video: just the prompt
      content = prompt;
    }
    
    const requestData = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: content
        }
      ],
      // Video-specific parameters (may be ignored by some models)
      ...(duration && { duration }),
      ...(fps && { fps })
    };
    
    const response = await axios.post(
      `${apiBaseUrl}/chat/completions`,
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout
      }
    );
    
    const result = response.data;
    
    // Transform response
    if (result.choices && result.choices[0]?.message?.content) {
      const content = result.choices[0].message.content;
      
      res.json({
        success: true,
        data: [{
          url: content,
          revised_prompt: prompt
        }],
        id: result.id
      });
      await libraryService.createAsset({
        type: 'video',
        source: 'video',
        title: String(prompt).slice(0, 80) || 'Generated video',
        url: content,
        metadata: { model: modelId, provider: providerId }
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('Video generation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || error.response?.data?.detail || 'Video generation failed'
    });
  }
});

// Get video status (for async generation)
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = req.providerContext.provider;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.video || 300000;
    
    const response = await axios.get(
      `${apiBaseUrl}/videos/generations/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Video status error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get video status'
    });
  }
});

router.post('/edit', async (req, res) => {
  try {
    const { sourceVideoUrl, edits = [], outputFormat = 'mp4', fps = 30, resolution = '1920x1080' } = req.body || {};
    if (!sourceVideoUrl) {
      return res.status(400).json({ error: 'sourceVideoUrl is required' });
    }

    return res.json({
      success: true,
      data: {
        sourceVideoUrl,
        outputFormat,
        fps,
        resolution,
        edits,
        status: 'queued'
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Video edit request failed' });
  }
});

export default router;
