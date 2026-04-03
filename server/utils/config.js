const DEFAULT_PROVIDER_TIMEOUT = {
  chat: 60000,
  image: 120000,
  video: 300000,
};

const DEFAULT_PROVIDERS = {
  blackbox: {
    id: "blackbox",
    name: "Blackbox AI",
    apiBaseUrl: "https://api.blackbox.ai/v1",
    apiKey: "",
    enabled: true,
    modelsFile: "blackbox",
  },
  chutes: {
    id: "chutes",
    name: "Chutes AI",
    apiBaseUrl: "https://chutes.ai/api/v1",
    apiKey: "",
    enabled: true,
    modelsFile: "chutes",
  },
  nanogpt: {
    id: "nanogpt",
    name: "NanoGPT",
    apiBaseUrl: "https://api.nanogpt.com/v1",
    apiKey: "",
    enabled: true,
    modelsFile: "nanogpt",
  },
  ollama: {
    id: "ollama",
    name: "Ollama Cloud",
    apiBaseUrl: "https://ollama.com",
    apiKey: "",
    enabled: true,
    modelsFile: "ollama",
    apiType: "ollama-native",
  },
};

function normalizeProvider(providerId, provider = {}) {
  const defaults = DEFAULT_PROVIDERS[providerId] || {
    id: providerId,
    name: providerId,
    apiBaseUrl: "",
    apiKey: "",
    enabled: false,
    modelsFile: providerId,
  };

  return {
    ...defaults,
    ...provider,
    id: providerId,
    timeout: {
      ...DEFAULT_PROVIDER_TIMEOUT,
      ...(provider.timeout || {}),
    },
    stats: {
      lastSuccess: null,
      lastError: null,
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      ...(provider.stats || {}),
    },
  };
}

export function normalizeConfig(config = {}) {
  const providers = { ...(config.providers || {}) };

  if (!config.providers && (config.apiKey || config.apiBaseUrl)) {
    providers.blackbox = {
      ...(providers.blackbox || {}),
      apiKey: config.apiKey || providers.blackbox?.apiKey || "",
      apiBaseUrl:
        config.apiBaseUrl ||
        providers.blackbox?.apiBaseUrl ||
        DEFAULT_PROVIDERS.blackbox.apiBaseUrl,
      enabled: true,
    };
  }

  for (const providerId of Object.keys(DEFAULT_PROVIDERS)) {
    providers[providerId] = normalizeProvider(
      providerId,
      providers[providerId],
    );
  }

  for (const providerId of Object.keys(providers)) {
    if (!DEFAULT_PROVIDERS[providerId]) {
      providers[providerId] = normalizeProvider(
        providerId,
        providers[providerId],
      );
    }
  }

  const defaultProvider =
    config.defaultProvider && providers[config.defaultProvider]
      ? config.defaultProvider
      : "blackbox";

  return {
    providers,
    defaultProvider,
    defaultModel: config.defaultModel || "blackboxai/z-ai/glm-5",
    adminPasswordHash: config.adminPasswordHash || "",
  };
}

export function getProviderById(config, providerId) {
  if (!providerId) return null;
  return config.providers?.[providerId] || null;
}

export function getConfiguredProviders(config) {
  return Object.values(config.providers || {}).filter(
    (provider) => provider.enabled && provider.apiBaseUrl && provider.apiKey,
  );
}

export function isProviderConfigured(provider) {
  return Boolean(provider?.enabled && provider?.apiBaseUrl && provider?.apiKey);
}

export function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••••••${value.slice(-4)}`;
}
