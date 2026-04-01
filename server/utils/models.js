import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATEGORIES = new Set(['chat', 'image', 'video', 'vision', 'music']);

const GATEWAY_PREFIXES = new Set(['blackboxai', 'blackbox', 'chutes', 'nanogpt']);

const ROOT_PROVIDER_MODEL_FILES = {
  blackbox: 'blackbox models.txt',
  chutes: 'chutes ai models.txt',
  nanogpt: 'nanogpt models.txt'
};

const PROVIDER_DEFAULT_GATEWAY_PREFIX = {
  blackbox: 'blackboxai',
  chutes: 'chutes',
  nanogpt: 'nanogpt'
};

const PROVIDER_ALLOWED_PREFIXES = {
  blackbox: new Set(['blackboxai', 'blackbox']),
  chutes: new Set(['chutes']),
  nanogpt: new Set(['nanogpt'])
};

function prettifyName(modelId) {
  const parts = modelId.split('/');
  const raw = parts[parts.length - 1] || modelId;
  return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getGatewayPrefix(modelId) {
  const first = String(modelId || '').split('/')[0]?.trim().toLowerCase();
  if (!first) return null;
  return GATEWAY_PREFIXES.has(first) ? first : null;
}

function normalizeModelIdForProvider(modelId, providerId) {
  const normalizedId = String(modelId || '').trim();
  if (!normalizedId) return normalizedId;

  if (getGatewayPrefix(normalizedId)) {
    return normalizedId;
  }

  const providerPrefix = PROVIDER_DEFAULT_GATEWAY_PREFIX[providerId] || providerId;
  if (!providerPrefix) return normalizedId;

  return `${providerPrefix}/${normalizedId}`;
}

function extractActualProvider(modelId) {
  const parts = modelId.split('/').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3 && GATEWAY_PREFIXES.has(parts[0].toLowerCase())) {
    return parts[1].toLowerCase();
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2].toLowerCase();
  }

  return 'unknown';
}

function inferAdditionalCategories(modelId) {
  const normalized = String(modelId || '').toLowerCase();
  const inferred = new Set();

  if (
    normalized.includes('audio') ||
    normalized.includes('music') ||
    normalized.includes('tts') ||
    normalized.includes('speech')
  ) {
    inferred.add('music');
  }

  if (
    normalized.includes('veo') ||
    normalized.includes('sora') ||
    normalized.includes('video') ||
    normalized.includes('cogvideox') ||
    normalized.includes('animatediff') ||
    normalized.includes('/svd') ||
    normalized.includes('mochi') ||
    normalized.includes('/ray-2')
  ) {
    inferred.add('video');
  }

  if (
    normalized.includes('imagen') ||
    normalized.includes('flux') ||
    normalized.includes('stable-diffusion') ||
    normalized.includes('ideogram') ||
    normalized.includes('recraft') ||
    normalized.includes('photon') ||
    normalized.includes('seedream') ||
    normalized.includes('sana') ||
    normalized.includes('dreamshaper') ||
    normalized.includes('image-01') ||
    normalized.includes('/edit') ||
    normalized.includes('gpt-image')
  ) {
    inferred.add('image');
  }

  if (
    normalized.includes('vision') ||
    normalized.includes('-vl') ||
    normalized.includes('/vl-') ||
    normalized.includes('internvl') ||
    normalized.includes('molmo')
  ) {
    inferred.add('vision');
  }

  return [...inferred];
}

export function toModelKey(providerId, modelId) {
  if (!providerId || !modelId) return null;
  return `${providerId}:${modelId}`;
}

export function parseModelKey(modelKey) {
  if (!modelKey || typeof modelKey !== 'string') {
    return { providerId: null, modelId: null };
  }

  const separator = modelKey.indexOf(':');
  if (separator < 0) {
    return { providerId: null, modelId: modelKey };
  }

  return {
    providerId: modelKey.slice(0, separator).trim() || null,
    modelId: modelKey.slice(separator + 1).trim() || null
  };
}

function parseLine(line, providerId) {
  const [metaPart, explicitName] = line.split('|').map((v) => v?.trim());

  if (!metaPart) return null;

  const categoryPrefixMatch = metaPart.match(/^([a-z,]+):(.*)$/i);
  const colonIndex = categoryPrefixMatch ? metaPart.indexOf(':') : -1;
  let categoryPart = 'chat';
  let modelId = metaPart;

  if (colonIndex > -1) {
    categoryPart = metaPart.slice(0, colonIndex).trim();
    modelId = metaPart.slice(colonIndex + 1).trim();
  }

  if (!modelId) return null;

  const normalizedModelId = normalizeModelIdForProvider(modelId, providerId);

  const categories = categoryPart
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => CATEGORIES.has(item));

  if (providerId === 'nanogpt') {
    categories.length = 0;
    categories.push('chat');
  } else if (categories.length === 0) {
    categories.push('chat');
  }

  if (providerId !== 'nanogpt') {
    const inferredCategories = inferAdditionalCategories(normalizedModelId);
    for (const inferred of inferredCategories) {
      if (!categories.includes(inferred)) {
        categories.push(inferred);
      }
    }
  }

  // Create a unique key combining provider and model ID for React rendering
  const uniqueKey = toModelKey(providerId, normalizedModelId);

  return {
    id: normalizedModelId,
    modelKey: uniqueKey,
    uniqueKey,
    name: explicitName || prettifyName(normalizedModelId),
    provider: providerId,
    configuredProvider: providerId,
    modelProvider: extractActualProvider(normalizedModelId),
    categories
  };
}

export async function loadModelsFromProviderFile(provider) {
  if (!provider?.modelsFile) {
    return [];
  }

  const rootModelsFile = ROOT_PROVIDER_MODEL_FILES[provider.id];
  const rootFilePath = rootModelsFile
    ? join(__dirname, '..', '..', rootModelsFile)
    : null;
  const bundledFilePath = join(__dirname, '..', 'data', 'models', `${provider.modelsFile}.txt`);
  const fileCandidates = [bundledFilePath, rootFilePath].filter(Boolean);

  try {
    let data = null;
    for (const candidate of fileCandidates) {
      try {
        data = await fs.readFile(candidate, 'utf-8');
        break;
      } catch {
        // Try next candidate path
      }
    }

    if (data == null) {
      return [];
    }

    const lines = data.split(/\r?\n/);

    const models = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const parsed = parseLine(line, provider.id);
      if (parsed) {
        models.push(parsed);
      }
    }

    return models;
  } catch {
    return [];
  }
}

export async function loadAllModels(config) {
  const providerEntries = Object.entries(config.providers || {});
  const all = [];

  for (const [, provider] of providerEntries) {
    if (!provider.enabled) continue;
    const providerModels = await loadModelsFromProviderFile(provider);
    all.push(...providerModels);
  }

  return all;
}

export async function getModelsByCategory(
  config,
  category,
  providerFilter = 'all',
  modelProviderFilter = 'all'
) {
  const allModels = await loadAllModels(config);
  const allowedPrefixes = providerFilter === 'all'
    ? null
    : (PROVIDER_ALLOWED_PREFIXES[providerFilter] || null);

  return allModels.filter((model) => {
    const categoryMatch = !category || model.categories.includes(category);
    const providerMatch = providerFilter === 'all' || model.provider === providerFilter;
    const modelGatewayPrefix = getGatewayPrefix(model.id);
    const gatewayPrefixMatch =
      !allowedPrefixes || (modelGatewayPrefix && allowedPrefixes.has(modelGatewayPrefix));
    const modelProviderMatch =
      modelProviderFilter === 'all' || model.modelProvider === modelProviderFilter;
    return categoryMatch && providerMatch && gatewayPrefixMatch && modelProviderMatch;
  });
}

export async function getAutoModelForProvider(config, providerId, category = 'chat') {
  const models = await getModelsByCategory(config, category, providerId, 'all');
  if (!models.length) return null;
  return models[0];
}

export function groupModelsByProvider(models = []) {
  return models.reduce((acc, model) => {
    const providerId = model.provider || 'unknown';
    if (!acc[providerId]) {
      acc[providerId] = [];
    }
    acc[providerId].push(model);
    return acc;
  }, {});
}

export async function findModel(config, modelId, providerId = null, modelKey = null) {
  if (!modelId && !modelKey) return null;
  const allModels = await loadAllModels(config);

  const keyParts = parseModelKey(modelKey);
  const effectiveProviderId = providerId || keyParts.providerId;
  const effectiveModelId = modelId || keyParts.modelId;

  return (
    allModels.find((model) => {
      if (effectiveProviderId && model.provider !== effectiveProviderId) {
        return false;
      }
      return model.id === effectiveModelId;
    }) || null
  );
}
