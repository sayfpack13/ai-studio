import { findModel } from './models.js';
import { isProviderConfigured } from './config.js';

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

  return {
    providerId,
    provider,
    configured: isProviderConfigured(provider)
  };
}
