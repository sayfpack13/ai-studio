/**
 * Chutes.ai integration routes
 * 
 * Provides API endpoints for managing private chutes from AI Studio
 */

import express from 'express';
import {
  getCredentialsStatus,
  testCredentials,
  listChutes,
  getChute,
  deleteChute,
  warmupChute,
  listMyChutes,
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
  getConfigYaml,
  updateConfigYaml,
  listTemplates,
  getTemplate,
  generateChute,
  buildChute,
  deployChute,
  getChuteLogs,
  getPlatformChutes,
  getChuteDetail,
} from '../utils/chutes-bridge.js';

const router = express.Router();

// === Credentials ===

router.get('/credentials', async (req, res) => {
  try {
    const result = await getCredentialsStatus();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/credentials/test', async (req, res) => {
  try {
    const { apiKey, apiBaseUrl } = req.body;
    const result = await testCredentials(apiKey, apiBaseUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// === Deployed Chutes ===

router.get('/', async (req, res) => {
  try {
    const result = await listChutes({
      limit: parseInt(req.query.limit) || 50,
      page: parseInt(req.query.page) || 0,
      includePublic: req.query.includePublic === 'true',
      template: req.query.template || '',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    const result = await listMyChutes();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/:chuteId', async (req, res) => {
  try {
    const result = await getChute(req.params.chuteId);
    if (result.status === 404) {
      res.status(404).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete('/:chuteId', async (req, res) => {
  try {
    const confirm = req.query.confirm || req.params.chuteId;
    const result = await deleteChute(req.params.chuteId, confirm);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/:chuteId/warmup', async (req, res) => {
  try {
    const result = await warmupChute(req.params.chuteId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/:chuteId/logs', async (req, res) => {
  try {
    const tail = parseInt(req.query.tail) || 50;
    const result = await getChuteLogs(req.params.chuteId, tail);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// === Local Configs ===

router.get('/configs/list', async (req, res) => {
  try {
    const result = await listConfigs();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/configs/:name', async (req, res) => {
  try {
    const result = await getConfig(req.params.name);
    if (result.status === 404) {
      res.status(404).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/configs', async (req, res) => {
  try {
    const result = await createConfig(req.body);
    if (result.status === 400) {
      res.status(400).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.put('/configs/:name', async (req, res) => {
  try {
    const result = await updateConfig(req.params.name, req.body);
    if (result.status === 404) {
      res.status(404).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete('/configs/:name', async (req, res) => {
  try {
    const result = await deleteConfig(req.params.name);
    if (result.status === 404) {
      res.status(404).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// === YAML Raw ===

router.get('/configs/:name/yaml', async (req, res) => {
  try {
    const result = await getConfigYaml(req.params.name);
    if (result.status === 404) {
      res.status(404).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.put('/configs/:name/yaml', async (req, res) => {
  try {
    const { yamlText } = req.body;
    const result = await updateConfigYaml(req.params.name, yamlText);
    if (result.status === 400) {
      res.status(400).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// === Templates ===

router.get('/templates/list', async (req, res) => {
  try {
    const result = await listTemplates();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/templates/:key', async (req, res) => {
  try {
    const result = await getTemplate(req.params.key);
    if (result.status === 404) {
      res.status(404).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// === Build / Deploy ===

router.post('/build/:name', async (req, res) => {
  try {
    const result = await buildChute(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/generate/:name', async (req, res) => {
  try {
    const result = await generateChute(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/deploy/:name', async (req, res) => {
  try {
    const result = await deployChute(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// === Platform API ===

router.get('/platform/chutes', async (req, res) => {
  try {
    const result = await getPlatformChutes({
      limit: parseInt(req.query.limit) || 25,
      page: parseInt(req.query.page) || 0,
      includePublic: req.query.includePublic === 'true',
      name: req.query.name || '',
      template: req.query.template || '',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/platform/chutes/:chuteId', async (req, res) => {
  try {
    const result = await getChuteDetail(req.params.chuteId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
