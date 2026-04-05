/**
 * Bridge to Python Chutes.ai API
 * 
 * Proxies requests to the Python FastAPI dashboard running on port 8765
 */

import axios from 'axios';

const CHUTES_PYTHON_API = process.env.CHUTES_PYTHON_API || 'http://127.0.0.1:8765';

/**
 * Make a request to the Python chutes API
 */
async function bridgeRequest(method, path, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${CHUTES_PYTHON_API}${path}`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };
    
    if (data) {
      config.data = data;
    }
    if (params) {
      config.params = params;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      // Return error response from Python API
      return {
        ok: false,
        error: error.response.data?.error || error.response.data?.detail || 'Request failed',
        status: error.response.status,
      };
    }
    return {
      ok: false,
      error: error.message || 'Failed to connect to Chutes Python API',
      status: 503,
    };
  }
}

// === Credentials ===

export async function getCredentialsStatus() {
  return bridgeRequest('GET', '/bridge/credentials');
}

export async function testCredentials(apiKey, apiBaseUrl) {
  return bridgeRequest('POST', '/bridge/credentials/test', { api_key: apiKey, api_base_url: apiBaseUrl });
}

// === Deployed Chutes ===

export async function listChutes(options = {}) {
  const params = {
    limit: options.limit || 50,
    page: options.page || 0,
    include_public: options.includePublic || false,
  };
  if (options.template) {
    params.template = options.template;
  }
  return bridgeRequest('GET', '/bridge/chutes', null, params);
}

export async function getChute(chuteId) {
  return bridgeRequest('GET', `/bridge/chutes/${encodeURIComponent(chuteId)}`);
}

export async function deleteChute(chuteId, confirm) {
  return bridgeRequest('DELETE', `/bridge/chutes/${encodeURIComponent(chuteId)}?confirm=${encodeURIComponent(confirm)}`);
}

export async function warmupChute(chuteId) {
  return bridgeRequest('GET', `/bridge/chutes/${encodeURIComponent(chuteId)}/warmup`);
}

// === My Private Chutes (for model discovery) ===

export async function listMyChutes() {
  return bridgeRequest('GET', '/bridge/my-chutes');
}

// === Local Configs ===

export async function listConfigs() {
  return bridgeRequest('GET', '/bridge/configs');
}

export async function getConfig(name) {
  return bridgeRequest('GET', `/bridge/configs/${encodeURIComponent(name)}`);
}

export async function createConfig(data) {
  return bridgeRequest('POST', '/bridge/configs', data);
}

export async function updateConfig(name, data) {
  return bridgeRequest('PUT', `/bridge/configs/${encodeURIComponent(name)}`, data);
}

export async function deleteConfig(name) {
  return bridgeRequest('DELETE', `/bridge/configs/${encodeURIComponent(name)}`);
}

// === YAML Raw ===

export async function getConfigYaml(name) {
  return bridgeRequest('GET', `/bridge/configs/${encodeURIComponent(name)}/yaml`);
}

export async function updateConfigYaml(name, yamlText) {
  return bridgeRequest('PUT', `/bridge/configs/${encodeURIComponent(name)}/yaml`, yamlText);
}

// === Templates ===

export async function listTemplates() {
  return bridgeRequest('GET', '/bridge/templates');
}

export async function getTemplate(key) {
  return bridgeRequest('GET', `/bridge/templates/${encodeURIComponent(key)}`);
}

// === Build / Deploy (proxied to existing dashboard endpoints) ===

export async function generateChute(name) {
  return bridgeRequest('POST', `/api/generate/${encodeURIComponent(name)}`);
}

export async function buildChute(name) {
  return bridgeRequest('POST', `/api/build/${encodeURIComponent(name)}`);
}

export async function deployChute(name) {
  return bridgeRequest('POST', `/api/deploy/${encodeURIComponent(name)}`);
}

export async function getChuteStatus(name) {
  return bridgeRequest('GET', `/api/status?name=${encodeURIComponent(name)}`);
}

export async function getChuteLogs(chuteName, tail = 50) {
  return bridgeRequest('GET', `/api/cli/logs?chute_name=${encodeURIComponent(chuteName)}&tail=${tail}`);
}

// === Platform API (direct Chutes API) ===

export async function getPlatformChutes(options = {}) {
  const params = {
    limit: options.limit || 25,
    page: options.page || 0,
    include_public: options.includePublic || false,
  };
  if (options.name) params.name = options.name;
  if (options.template) params.template = options.template;
  return bridgeRequest('GET', '/api/platform/chutes', null, params);
}

export async function getPlatformImages(options = {}) {
  const params = {
    limit: options.limit || 25,
    page: options.page || 0,
  };
  if (options.name) params.name = options.name;
  if (options.tag) params.tag = options.tag;
  return bridgeRequest('GET', '/api/platform/images', null, params);
}

export async function getChuteDetail(chuteId) {
  return bridgeRequest('GET', `/api/platform/chutes/detail/${encodeURIComponent(chuteId)}`);
}

export default {
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
  getChuteStatus,
  getChuteLogs,
  getPlatformChutes,
  getPlatformImages,
  getChuteDetail,
};
