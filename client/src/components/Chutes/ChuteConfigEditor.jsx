import { useState, useEffect } from 'react';
import { getConfig, getConfigYaml, updateConfigYaml } from '../../services/chutesService';

export default function ChuteConfigEditor({ name, onClose, onSave }) {
  const [yamlText, setYamlText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadConfig();
  }, [name]);

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const result = await getConfigYaml(name);
      if (result.ok) {
        setYamlText(result.yaml);
      } else {
        setError(result.error || 'Failed to load config');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const result = await updateConfigYaml(name, yamlText);
      if (result.ok) {
        setSuccess('Configuration saved successfully!');
        onSave?.();
      } else {
        setError(result.error || 'Failed to save config');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Edit Config: {name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="px-4 pt-4 flex-shrink-0">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded text-green-200 text-sm">
              {success}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <textarea
              value={yamlText}
              onChange={(e) => setYamlText(e.target.value)}
              className="w-full h-full min-h-[400px] font-mono text-sm bg-gray-900 border border-gray-600 rounded-lg p-4 text-gray-100 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="# YAML configuration..."
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-800 border-t border-gray-700 p-4 flex justify-between flex-shrink-0">
          <button
            onClick={loadConfig}
            disabled={loading}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50 transition-colors"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
