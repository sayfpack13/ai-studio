import { findModel } from './models.js';
import { isProviderConfigured } from './config.js';

// Chutes models that use direct public endpoints (no API key required)
// Note: Most chutes models require API key authentication
const CHUTES_PUBLIC_MODELS = new Set([
  // Wan I2V video models may work without auth in some cases
  'Wan-2.2-I2V-14B-Fast',
  'Wan-2.2-I2V-14B',
  'Wan-2.1-I2V-14B',
]);

export async function resolveProviderContext(config, { requestedProvider, modelId, modelKey } = {}) {
  let providerId = requestedProvider;

  // Handle chutes-private provider (user's private chutes)
  if (providerId === 'chutes-private' || (modelId && modelId.startsWith('chutes-private/'))) {
    const model = await findModel(config, modelId, null, modelKey);
    return {
      providerId: 'chutes-private',
      provider: {
        id: 'chutes-private',
        name: 'Private Chutes',
        apiBaseUrl: model?.baseUrl || '',
        apiKey: config.providers?.chutes?.apiKey || '',
        enabled: true,
      },
      configured: !!(model?.baseUrl && config.providers?.chutes?.apiKey),
      baseUrl: model?.baseUrl,
      isPrivateChute: true,
      modelData: model,
    };
  }

  if (!providerId && (modelId || modelKey)) {
    const model = await findModel(config, modelId, null, modelKey);
    providerId = model?.provider;
  }

  if (!providerId) {
    providerId = config.defaultProvider || 'blackbox';
  }

  const provider = config.providers?.[providerId] || null;

  // Check if this is a chutes public model that doesn't need API key
  const normalizedModelId = modelId?.replace(/^chutes\//, '') || '';
  const isChutesPublicModel = providerId === 'chutes' && CHUTES_PUBLIC_MODELS.has(normalizedModelId);

  if (isChutesPublicModel && provider) {
    // Allow public chutes models without API key
    return {
      providerId,
      provider: {
        ...provider,
        apiKey: provider.apiKey || 'public', // Use placeholder for public models
      },
      configured: true,
      isPublicChute: true,
    };
  }

  // HuggingFace can use either Inference Providers (apiKey) or Gradio Space (apiBaseUrl)
  if (providerId === 'huggingface' && provider) {
    return {
      providerId,
      provider: {
        ...provider,
        apiKey: provider.apiKey || '',
      },
      configured: !!(provider.enabled && (provider.apiKey || provider.apiBaseUrl)),
    };
  }

  return {
    providerId,
    provider,
    configured: isProviderConfigured(provider)
  };
}
