import express from 'express';
import axios from 'axios';
import { requireApiKey } from '../middleware/auth.js';
import { findModel } from '../utils/models.js';

const router = express.Router();
router.use(requireApiKey);

// Chat completions endpoint
router.post('/completions', async (req, res) => {
  try {
    const { messages, model, modelKey, stream, temperature, maxTokens } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    
    const modelId = model || req.config.defaultModel;
    const provider = req.providerContext.provider;
    const providerId = req.providerContext.providerId;
    const apiKey = req.apiKey;
    const apiBaseUrl = provider.apiBaseUrl;
    const timeout = provider.timeout?.chat || 60000;

    const modelInfo = await findModel(req.config, modelId, providerId, modelKey);
    if (!modelInfo) {
      return res.status(400).json({
        error: `Model ${modelId || modelKey} is not available for gateway ${providerId}`
      });
    }
    
    // Prepare request to Blackbox AI
    const requestData = {
      model: modelId,
      messages: messages,
      stream: stream || false,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 2048
    };
    
    if (stream) {
      // Handle streaming response
      const response = await axios({
        method: 'POST',
        url: `${apiBaseUrl}/chat/completions`,
        data: requestData,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout
      });
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      response.data.pipe(res);
    } else {
      // Regular response
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
      
      res.json(response.data);
    }
  } catch (error) {
    console.error('Chat error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || 'Chat request failed'
    });
  }
});

// Get available models
router.get('/models', async (req, res) => {
  try {
    const providerId = req.query.provider || req.config.defaultProvider;
    const provider = req.config.providers?.[providerId];
    const modelKey = req.query.modelKey;

    if (modelKey) {
      const modelInfo = await findModel(req.config, null, providerId, modelKey);
      if (!modelInfo) {
        return res.status(404).json({ error: 'Model not found for gateway' });
      }
      return res.json({ data: [modelInfo] });
    }

    if (!provider || !provider.apiKey || !provider.apiBaseUrl) {
      return res.status(400).json({ error: `Provider not configured: ${providerId}` });
    }
    
    const response = await axios.get(
      `${provider.apiBaseUrl}/models`,
      {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`
        },
        timeout: provider.timeout?.chat || 60000
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Models fetch error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch models'
    });
  }
});

export default router;
