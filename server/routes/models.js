import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import { getModelsByCategory, groupModelsByProvider, loadAllModels } from '../utils/models.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const category = req.query.category?.toLowerCase();
    const provider = req.query.provider || 'all';
    const modelProvider = req.query.modelProvider || 'all';

    const models = await getModelsByCategory(req.config, category, provider, modelProvider);
    const groupedByProvider = groupModelsByProvider(models);
    const gateways = Object.values(req.config.providers || {})
      .filter((entry) => entry.enabled !== false)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        configured: Boolean(entry.apiKey && entry.apiBaseUrl),
        modelCount: groupedByProvider[entry.id]?.length || 0
      }));

    res.json({
      models,
      modelsByGateway: groupedByProvider,
      gateways,
      category: category || 'all',
      provider,
      modelProvider
    });
  } catch (error) {
    console.error('Models list error:', error);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const allModels = await loadAllModels(req.config);
    const byCategory = {
      chat: [],
      image: [],
      video: [],
      vision: [],
      music: []
    };

    for (const model of allModels) {
      for (const category of model.categories) {
        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category].push(model);
      }
    }

    res.json(byCategory);
  } catch (error) {
    console.error('Models categories error:', error);
    res.status(500).json({ error: 'Failed to load model categories' });
  }
});

// Fetch models from a local Ollama instance
router.post('/ollama-local', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Local Ollama URL is required' });
    }

    // Normalize URL (remove trailing slash)
    const baseUrl = url.replace(/\/+$/, '');

    const response = await axios.get(`${baseUrl}/api/tags`, {
      timeout: 10000,
    });

    const models = (response.data?.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      details: m.details || {},
    }));

    // Save URL to config if successful
    if (req.config.providers?.ollama) {
      req.config.providers.ollama.localUrl = baseUrl;
      await fs.writeFile(req.configPath, JSON.stringify(req.config, null, 2));
    }

    res.json({ success: true, url: baseUrl, models });
  } catch (error) {
    const status = error.response?.status;
    let message = 'Failed to connect to local Ollama';
    if (error.code === 'ECONNREFUSED') {
      message = 'Connection refused — is Ollama running locally?';
    } else if (status === 404) {
      message = 'Ollama API not found at this URL';
    } else if (error.message?.includes('timeout')) {
      message = 'Connection timed out';
    }
    res.status(502).json({ error: message, details: error.message });
  }
});

// Get saved local Ollama URL
router.get('/ollama-local-url', async (req, res) => {
  const localUrl = req.config.providers?.ollama?.localUrl || '';
  res.json({ url: localUrl });
});

export default router;
