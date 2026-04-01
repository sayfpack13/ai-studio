import express from 'express';
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

export default router;
