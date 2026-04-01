import { findModel } from './models.js';
import { isProviderConfigured } from './config.js';

export async function resolveProviderContext(config, { requestedProvider, modelId, modelKey } = {}) {
  let providerId = requestedProvider;

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
