import { useState, useEffect } from 'react';
import {
  listConfigs,
  listChutes,
  listTemplates,
  createConfig,
  deleteConfig,
  buildChute,
  deployChute,
  getChuteLogs,
} from '../../services/chutesService';
import ChuteCard from './ChuteCard';
import ChuteDeployWizard from './ChuteDeployWizard';
import ChuteConfigEditor from './ChuteConfigEditor';

export default function ChutesPage() {
  const [configs, setConfigs] = useState([]);
  const [deployedChutes, setDeployedChutes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('deployed');
  const [showWizard, setShowWizard] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deployingConfig, setDeployingConfig] = useState(null);
  const [deployStatus, setDeployStatus] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [configsResult, chutesResult, templatesResult] = await Promise.all([
        listConfigs(),
        listChutes({ limit: 50 }),
        listTemplates(),
      ]);
      
      if (configsResult.ok) setConfigs(configsResult.configs || []);
      if (chutesResult.ok) setDeployedChutes(chutesResult.data?.items || []);
      if (templatesResult.ok) setTemplates(templatesResult.templates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateConfig(data) {
    try {
      const result = await createConfig(data);
      if (result.ok) {
        setShowWizard(false);
        loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function handleDeleteConfig(name) {
    if (!confirm(`Delete config "${name}"?`)) return;
    try {
      await deleteConfig(name);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBuild(name) {
    setDeployingConfig(name);
    setDeployStatus({ step: 'build', status: 'running', message: 'Building chute...' });
    try {
      const result = await buildChute(name);
      if (result.ok) {
        setDeployStatus({ step: 'build', status: 'done', message: 'Build complete!' });
      } else {
        setDeployStatus({ step: 'build', status: 'error', message: result.error || 'Build failed' });
      }
    } catch (err) {
      setDeployStatus({ step: 'build', status: 'error', message: err.message });
    }
  }

  async function handleDeploy(name) {
    setDeployingConfig(name);
    setDeployStatus({ step: 'deploy', status: 'running', message: 'Deploying chute...' });
    try {
      const result = await deployChute(name);
      if (result.ok) {
        setDeployStatus({ step: 'deploy', status: 'done', message: 'Deployed successfully!' });
        loadData();
      } else {
        setDeployStatus({ step: 'deploy', status: 'error', message: result.error || 'Deploy failed' });
      }
    } catch (err) {
      setDeployStatus({ step: 'deploy', status: 'error', message: err.message });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Chutes.ai Private Deployments</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          + New Chute
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700 pb-2">
        <button
          onClick={() => setActiveTab('deployed')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'deployed'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Deployed ({deployedChutes.length})
        </button>
        <button
          onClick={() => setActiveTab('configs')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'configs'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Local Configs ({configs.length})
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'templates'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Templates
        </button>
      </div>

      {/* Content */}
      {activeTab === 'deployed' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {deployedChutes.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400">
              No deployed chutes found. Deploy your first chute from the Local Configs tab.
            </div>
          ) : (
            deployedChutes.map((chute) => (
              <ChuteCard
                key={chute.chute_id || chute.name}
                chute={chute}
                onRefresh={loadData}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'configs' && (
        <div className="grid gap-4">
          {configs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No local configs. Create one using the "New Chute" button.
            </div>
          ) : (
            configs.map((config) => (
              <div
                key={config.name}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">{config.name}</h3>
                    <p className="text-sm text-gray-400">
                      {config.chute_type} • {config.model}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingConfig(config.name)}
                      className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleBuild(config.name)}
                      className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-700 rounded text-white"
                      disabled={deployingConfig === config.name && deployStatus?.step === 'build'}
                    >
                      Build
                    </button>
                    <button
                      onClick={() => handleDeploy(config.name)}
                      className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 rounded text-white"
                      disabled={deployingConfig === config.name && deployStatus?.step === 'deploy'}
                    >
                      Deploy
                    </button>
                    <button
                      onClick={() => handleDeleteConfig(config.name)}
                      className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {deployingConfig === config.name && deployStatus && (
                  <div className={`mt-3 p-2 rounded text-sm ${
                    deployStatus.status === 'error' ? 'bg-red-900/50 text-red-200' :
                    deployStatus.status === 'done' ? 'bg-green-900/50 text-green-200' :
                    'bg-blue-900/50 text-blue-200'
                  }`}>
                    {deployStatus.message}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((group) => (
            <div key={group.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="font-medium text-white mb-2">{group.label}</h3>
              <p className="text-sm text-gray-400 mb-3">{group.blurb}</p>
              <div className="space-y-2">
                {group.options?.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setShowWizard({ template: opt.key })}
                    className="w-full text-left p-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    <div className="font-medium text-white">{opt.title}</div>
                    <div className="text-xs text-gray-400">{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wizard Modal */}
      {showWizard && (
        <ChuteDeployWizard
          templates={templates}
          initialTemplate={showWizard?.template}
          onSubmit={handleCreateConfig}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* Config Editor Modal */}
      {editingConfig && (
        <ChuteConfigEditor
          name={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSave={loadData}
        />
      )}
    </div>
  );
}
