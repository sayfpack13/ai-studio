/**
 * Chutes.ai API service for AI Studio frontend
 */

const API_BASE = '/api/chutes';

async function apiRequest(method, path, data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${API_BASE}${path}`, options);
  
  // Handle non-JSON responses (e.g., HTML error pages)
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Server returned non-JSON response (${response.status}): ${text.substring(0, 200)}`);
    }
    throw new Error(`Expected JSON response but got: ${contentType}`);
  }
  
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || `Request failed: ${response.status}`);
  }
  
  return result;
}

// === Credentials ===

export async function getCredentialsStatus() {
  return apiRequest('GET', '/credentials');
}

export async function testCredentials(apiKey, apiBaseUrl) {
  return apiRequest('POST', '/credentials/test', { apiKey, apiBaseUrl });
}

// === Deployed Chutes ===

export async function listChutes(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit);
  if (options.page) params.set('page', options.page);
  if (options.includePublic) params.set('includePublic', 'true');
  if (options.template) params.set('template', options.template);
  
  const query = params.toString();
  return apiRequest('GET', `/${query ? '?' + query : ''}`);
}

export async function getMyChutes() {
  return apiRequest('GET', '/my');
}

export async function getChute(chuteId) {
  return apiRequest('GET', `/${encodeURIComponent(chuteId)}`);
}

export async function deleteChute(chuteId, confirm) {
  return apiRequest('DELETE', `/${encodeURIComponent(chuteId)}?confirm=${encodeURIComponent(confirm || chuteId)}`);
}

export async function warmupChute(chuteId) {
  return apiRequest('POST', `/${encodeURIComponent(chuteId)}/warmup`);
}

export async function getChuteLogs(chuteId, tail = 50) {
  return apiRequest('GET', `/${encodeURIComponent(chuteId)}/logs?tail=${tail}`);
}

// === Local Configs ===

export async function listConfigs() {
  return apiRequest('GET', '/configs/list');
}

export async function getConfig(name) {
  return apiRequest('GET', `/configs/${encodeURIComponent(name)}`);
}

export async function createConfig(data) {
  return apiRequest('POST', '/configs', data);
}

export async function updateConfig(name, data) {
  return apiRequest('PUT', `/configs/${encodeURIComponent(name)}`, data);
}

export async function deleteConfig(name) {
  return apiRequest('DELETE', `/configs/${encodeURIComponent(name)}`);
}

// === YAML Raw ===

export async function getConfigYaml(name) {
  return apiRequest('GET', `/configs/${encodeURIComponent(name)}/yaml`);
}

export async function updateConfigYaml(name, yamlText) {
  return apiRequest('PUT', `/configs/${encodeURIComponent(name)}/yaml`, { yamlText });
}

// === Templates ===

export async function listTemplates() {
  return apiRequest('GET', '/templates/list');
}

export async function getTemplate(key) {
  return apiRequest('GET', `/templates/${encodeURIComponent(key)}`);
}

// === Build / Deploy ===

export async function generateChute(name) {
  return apiRequest('POST', `/generate/${encodeURIComponent(name)}`);
}

export async function buildChute(name) {
  return apiRequest('POST', `/build/${encodeURIComponent(name)}`);
}

export async function deployChute(name) {
  return apiRequest('POST', `/deploy/${encodeURIComponent(name)}`);
}

// === Platform API ===

export async function getPlatformChutes(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit);
  if (options.page) params.set('page', options.page);
  if (options.includePublic) params.set('includePublic', 'true');
  if (options.name) params.set('name', options.name);
  if (options.template) params.set('template', options.template);
  
  const query = params.toString();
  return apiRequest('GET', `/platform/chutes${query ? '?' + query : ''}`);
}

export async function getPlatformChuteDetail(chuteId) {
  return apiRequest('GET', `/platform/chutes/${encodeURIComponent(chuteId)}`);
}

export default {
  getCredentialsStatus,
  testCredentials,
  listChutes,
  getMyChutes,
  getChute,
  deleteChute,
  warmupChute,
  getChuteLogs,
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
  getPlatformChutes,
  getPlatformChuteDetail,
};
