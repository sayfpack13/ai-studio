import { useState, useEffect } from 'react';
import { loginAdmin, verifyToken, getConfig, updateConfig, logoutAdmin, getToken, testProviderConnection } from '../services/api';

export default function AdminPanel({ onClose, onAuthChange }) {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialCheck, setInitialCheck] = useState(true);
  const [config, setConfig] = useState({
    providers: [],
    defaultProvider: 'blackbox'
  });
  const [success, setSuccess] = useState('');
  const [connectionStatus, setConnectionStatus] = useState({});
  const [testingProvider, setTestingProvider] = useState(null);

  const applyConfig = (configResult) => {
    const providers = (configResult.providers || []).map((provider) => ({
      id: provider.id,
      name: provider.name,
      apiBaseUrl: provider.apiBaseUrl || '',
      apiKey: '',
      hasApiKey: Boolean(provider.hasApiKey),
      enabled: provider.enabled !== false
    }));

    setConfig({
      providers,
      defaultProvider: configResult.defaultProvider || providers[0]?.id || 'blackbox'
    });
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const token = getToken();
      if (token) {
        try {
          const result = await verifyToken();
          if (result.valid) {
            // Token is valid, fetch config
            const configResult = await getConfig();
            applyConfig(configResult);
            setIsAuthenticated(true);
          }
        } catch (err) {
          console.error('Session check failed:', err);
        }
      }
      setInitialCheck(false);
    };
    checkSession();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await loginAdmin(password);
      
      if (result.success && result.token) {
        // Fetch config after successful login
        const configResult = await getConfig();
        applyConfig(configResult);
        setIsAuthenticated(true);
        setPassword('');
        if (onAuthChange) onAuthChange(true);
      } else {
        setError(result.error || 'Invalid password');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const providersPayload = {};

      for (const provider of config.providers) {
        providersPayload[provider.id] = {
          apiBaseUrl: provider.apiBaseUrl,
          enabled: provider.enabled
        };

        if (provider.apiKey.trim()) {
          providersPayload[provider.id].apiKey = provider.apiKey.trim();
        }
      }

      const result = await updateConfig({
        providers: providersPayload,
        defaultProvider: config.defaultProvider
      });
      
      if (result.success) {
        setSuccess('Configuration saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setIsAuthenticated(false);
    setConfig({
      providers: [],
      defaultProvider: 'blackbox'
    });
    if (onAuthChange) onAuthChange(false);
  };

  const updateProviderField = (providerId, key, value) => {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              [key]: value
            }
          : provider
      )
    }));
  };

  const handleTestConnection = async (providerId) => {
    setTestingProvider(providerId);
    setConnectionStatus((prev) => ({ ...prev, [providerId]: null }));

    try {
      const result = await testProviderConnection(providerId);
      setConnectionStatus((prev) => ({
        ...prev,
        [providerId]: result.success ? 'connected' : 'failed'
      }));
    } catch {
      setConnectionStatus((prev) => ({
        ...prev,
        [providerId]: 'failed'
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  // Show loading state while checking session
  if (initialCheck) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-8">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-400 mt-4 text-center">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Admin Panel</h2>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Logout
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4">
          {!isAuthenticated ? (
            // Login Form
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin password"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/50 text-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Login'}
              </button>

              <p className="text-sm text-gray-400 text-center">
                First time? Enter a new password to set up admin access.
              </p>
              
              <p className="text-xs text-gray-500 text-center">
                Session persists for 24 hours
              </p>
            </form>
          ) : (
            // Configuration Form
            <div className="space-y-4">
              {/* Session Info */}
              <div className="flex items-center justify-between p-3 bg-green-900/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-400">Session Active</span>
                </div>
                <span className="text-xs text-gray-400">Expires in 24h</span>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                {config.providers.map((provider) => (
                  <div key={provider.id} className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-200">{provider.name}</h3>
                        {/* API Key Status Indicator */}
                        {provider.hasApiKey && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded-full">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            Key Saved
                          </span>
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={provider.enabled}
                          onChange={(e) => updateProviderField(provider.id, 'enabled', e.target.checked)}
                        />
                        Enabled
                      </label>
                    </div>

                    {/* Connection Status */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={!provider.hasApiKey || testingProvider === provider.id}
                        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {testingProvider === provider.id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            Testing...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Test Connection
                          </>
                        )}
                      </button>
                      
                      {connectionStatus[provider.id] === 'connected' && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Connected
                        </span>
                      )}
                      {connectionStatus[provider.id] === 'failed' && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Failed
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        API Base URL
                      </label>
                      <input
                        type="text"
                        value={provider.apiBaseUrl}
                        onChange={(e) => updateProviderField(provider.id, 'apiBaseUrl', e.target.value)}
                        className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://provider-api/v1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Private API Key
                      </label>
                      <input
                        type="password"
                        value={provider.apiKey}
                        onChange={(e) => updateProviderField(provider.id, 'apiKey', e.target.value)}
                        className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={provider.hasApiKey ? 'Leave blank to keep current key' : 'Enter API key'}
                      />
                    </div>
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Default Provider
                  </label>
                  <select
                    value={config.defaultProvider}
                    onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value })}
                    className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {config.providers
                      .filter((provider) => provider.enabled)
                      .map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                  </select>
                </div>

                {error && (
                  <div className="p-3 bg-red-900/50 text-red-200 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-900/50 text-green-200 rounded-lg text-sm">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Configuration'}
                </button>

              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
