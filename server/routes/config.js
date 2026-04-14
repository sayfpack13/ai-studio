import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import fs from 'fs/promises';
import { normalizeConfig, maskSecret, isProviderConfigured } from '../utils/config.js';
import axios from 'axios';
import { getAutoModelForProvider } from '../utils/models.js';
import {
  deployHFSpace,
  redeployHFSpace,
  listHFSpaces,
  listBackendDeployTargets,
} from '../scripts/deploy-hf-space.js';

const router = express.Router();

// Get current configuration (requires JWT auth)
router.get('/get', requireAuth, async (req, res) => {
  try {
    const providers = Object.values(req.config.providers || {}).map((provider) => ({
      id: provider.id,
      name: provider.name,
      apiBaseUrl: provider.apiBaseUrl,
      apiKey: maskSecret(provider.apiKey),
      hasApiKey: !!provider.apiKey,
      enabled: provider.enabled,
      timeout: provider.timeout,
      modelsFile: provider.modelsFile,
      configured: isProviderConfigured(provider)
    }));

    const autoDefaultModel = await getAutoModelForProvider(req.config, req.config.defaultProvider, 'chat');

    res.json({
      providers,
      defaultProvider: req.config.defaultProvider,
      defaultModel: autoDefaultModel?.id || req.config.defaultModel || '',
      configured: providers.some((provider) => provider.configured)
    });
  } catch (error) {
    console.error('Config get error:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Test provider connection (requires JWT auth)
router.post('/test', requireAuth, async (req, res) => {
  try {
    const { providerId } = req.body;
    const provider = req.config.providers?.[providerId];

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    if (!provider.apiKey || !provider.apiBaseUrl) {
      return res.json({ 
        success: false, 
        error: 'API key or URL not configured' 
      });
    }

    // Test connection by fetching models
    const response = await axios.get(`${provider.apiBaseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`
      },
      timeout: 10000
    });

    res.json({ 
      success: true, 
      message: 'Connection successful',
      modelsCount: response.data?.data?.length || 0
    });
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || 
                         error.response?.data?.error || 
                         error.message || 
                         'Connection failed';
    res.json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// Update configuration (requires JWT auth)
router.post('/update', requireAuth, async (req, res) => {
  try {
    const { providers, defaultProvider } = req.body;

    if (providers && typeof providers === 'object') {
      for (const [providerId, update] of Object.entries(providers)) {
        const current = req.config.providers?.[providerId];
        if (!current) continue;

        if (update.apiBaseUrl !== undefined) current.apiBaseUrl = update.apiBaseUrl;
        if (update.apiKey !== undefined) current.apiKey = update.apiKey;
        if (update.enabled !== undefined) current.enabled = Boolean(update.enabled);
      }
    }

    if (defaultProvider && req.config.providers?.[defaultProvider]) {
      req.config.defaultProvider = defaultProvider;
    }

    const normalized = normalizeConfig(req.config);
    Object.keys(req.config).forEach((key) => {
      delete req.config[key];
    });
    Object.assign(req.config, normalized);
    await fs.writeFile(req.configPath, JSON.stringify(req.config, null, 2));

    const autoDefaultModel = await getAutoModelForProvider(req.config, req.config.defaultProvider, 'chat');
    req.config.defaultModel = autoDefaultModel?.id || req.config.defaultModel || '';
    await fs.writeFile(req.configPath, JSON.stringify(req.config, null, 2));

    const providerSummary = Object.values(req.config.providers || {}).map((provider) => ({
      id: provider.id,
      hasApiKey: !!provider.apiKey,
      apiBaseUrl: provider.apiBaseUrl,
      enabled: provider.enabled,
      configured: isProviderConfigured(provider)
    }));
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: {
        providers: providerSummary,
        defaultProvider: req.config.defaultProvider,
        defaultModel: autoDefaultModel?.id || req.config.defaultModel || '',
        configured: providerSummary.some((provider) => provider.configured)
      }
    });
  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Deploy HuggingFace Space from local template (requires JWT auth)
router.post('/deploy-hf-space', requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const spaceName = String(req.body?.spaceName || 'Z-Image-Turbo').trim();
    const templateName = String(req.body?.templateName || 'huggingface-space').trim();

    if (!token) {
      return res.status(400).json({ error: 'HuggingFace token is required.' });
    }

    if (!spaceName) {
      return res.status(400).json({ error: 'Space name is required.' });
    }

    const result = await deployHFSpace({ token, spaceName, templateName });

    // Persist deployed Space URL and token to provider config for convenience
    if (req.config.providers?.huggingface) {
      req.config.providers.huggingface.apiBaseUrl = result.spaceUrl;
      req.config.providers.huggingface.apiKey = token;
      req.config.providers.huggingface.enabled = true;
      const normalized = normalizeConfig(req.config);
      Object.keys(req.config).forEach((key) => delete req.config[key]);
      Object.assign(req.config, normalized);
      await fs.writeFile(req.configPath, JSON.stringify(req.config, null, 2));
    }

    res.json({
      success: true,
      ...result,
      message: 'Space deployed successfully. Set ZeroGPU hardware in Space settings before using it.',
    });
  } catch (error) {
    console.error('HF Space deploy error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to deploy HuggingFace Space.',
    });
  }
});

// List HuggingFace Spaces for current token (requires JWT auth)
router.get('/hf-spaces', requireAuth, async (req, res) => {
  try {
    const tokenFromQuery = String(req.query?.token || '').trim();
    const token = tokenFromQuery || req.config.providers?.huggingface?.apiKey || process.env.HF_TOKEN || '';

    if (!token) {
      return res.status(400).json({
        error: 'HuggingFace token is required. Provide token query param or configure HuggingFace provider API key.',
      });
    }

    const result = await listHFSpaces({ token });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('HF Spaces list error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to list HuggingFace Spaces.',
    });
  }
});

// List local backend deploy targets and deployment status on HuggingFace
router.get('/hf-deploy-targets', requireAuth, async (req, res) => {
  try {
    const tokenFromQuery = String(req.query?.token || '').trim();
    const token = tokenFromQuery || req.config.providers?.huggingface?.apiKey || process.env.HF_TOKEN || '';

    if (!token) {
      return res.status(400).json({
        error: 'HuggingFace token is required. Provide token query param or configure HuggingFace provider API key.',
      });
    }

    const result = await listBackendDeployTargets({ token });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('HF deploy targets error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to list backend deploy targets.',
    });
  }
});

// Re-deploy local template files to an existing HuggingFace Space (requires JWT auth)
router.post('/redeploy-hf-space', requireAuth, async (req, res) => {
  try {
    const tokenFromBody = String(req.body?.token || '').trim();
    const token = tokenFromBody || req.config.providers?.huggingface?.apiKey || process.env.HF_TOKEN || '';
    const repoId = String(req.body?.repoId || req.body?.spaceName || '').trim();
    const templateName = String(req.body?.templateName || 'huggingface-space').trim();

    if (!token) {
      return res.status(400).json({
        error: 'HuggingFace token is required. Provide token or configure HuggingFace provider API key.',
      });
    }

    if (!repoId) {
      return res.status(400).json({ error: 'repoId is required.' });
    }

    const result = await redeployHFSpace({ repoId, token, templateName });
    res.json({
      success: true,
      ...result,
      message: 'Space re-deployed successfully.',
    });
  } catch (error) {
    console.error('HF Space redeploy error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to re-deploy HuggingFace Space.',
    });
  }
});

// Check if API is configured (public)
router.get('/status', async (req, res) => {
  const providers = Object.values(req.config.providers || {}).map((provider) => ({
    id: provider.id,
    name: provider.name,
    enabled: provider.enabled,
    configured: isProviderConfigured(provider)
  }));

  const autoDefaultModel = await getAutoModelForProvider(req.config, req.config.defaultProvider, 'chat');

  res.json({
    configured: providers.some((provider) => provider.configured),
    defaultProvider: req.config.defaultProvider,
    defaultModel: autoDefaultModel?.id || req.config.defaultModel || '',
    providers
  });
});

export default router;
