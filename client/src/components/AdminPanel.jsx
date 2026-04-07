import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Key, Server, Check, X, Loader2, Eye, EyeOff, Plus, Trash2, Zap, Settings, LogOut, Lock } from 'lucide-react';
import { loginAdmin, verifyToken, getConfig, updateConfig, logoutAdmin, getToken, testProviderConnection } from '../services/api';
import { Button, Input, Modal } from './ui';
import { LoadingSpinner } from './shared';

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
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900 border border-gray-800 rounded-xl p-8"
        >
          <LoadingSpinner size="lg" className="mx-auto" />
          <p className="text-gray-400 mt-4 text-center">Checking session...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-gray-900 border border-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Admin Panel</h2>
              <p className="text-xs text-gray-400">Configure API providers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                leftIcon={<LogOut className="w-4 h-4" />}
              >
                Logout
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {!isAuthenticated ? (
            // Login Form
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div className="flex flex-col items-center py-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-1">Admin Authentication</h3>
                <p className="text-sm text-gray-400 text-center">Enter your admin password to continue</p>
              </div>

              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                autoFocus
                leftIcon={<Key className="w-4 h-4" />}
              />

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded-lg text-sm flex items-center gap-2"
                >
                  <X className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                disabled={!password}
                className="w-full"
              >
                {loading ? 'Authenticating...' : 'Login'}
              </Button>

              <p className="text-sm text-gray-400 text-center">
                First time? Enter a new password to set up admin access.
              </p>

              <p className="text-xs text-gray-500 text-center">
                Session persists for 24 hours
              </p>
            </motion.form>
          ) : (
            // Configuration Form
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Session Info */}
              <div className="flex items-center justify-between p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-400">Session Active</span>
                </div>
                <span className="text-xs text-gray-400">Expires in 24h</span>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-3">
                {config.providers.map((provider) => (
                  <motion.div
                    key={provider.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-white">{provider.name}</h3>
                        {provider.hasApiKey && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 border border-green-800/50 text-green-400 text-xs rounded-full">
                            <Check className="w-3 h-3" />
                            Key Saved
                          </span>
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={provider.enabled}
                          onChange={(e) => updateProviderField(provider.id, 'enabled', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                        />
                        Enabled
                      </label>
                    </div>

                    {/* Connection Status */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={!provider.hasApiKey || testingProvider === provider.id}
                        leftIcon={testingProvider === provider.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      >
                        {testingProvider === provider.id ? 'Testing...' : 'Test Connection'}
                      </Button>

                      {connectionStatus[provider.id] === 'connected' && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <Check className="w-4 h-4" />
                          Connected
                        </span>
                      )}
                      {connectionStatus[provider.id] === 'failed' && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <X className="w-4 h-4" />
                          Failed
                        </span>
                      )}
                    </div>

                    <Input
                      label="API Base URL"
                      value={provider.apiBaseUrl}
                      onChange={(e) => updateProviderField(provider.id, 'apiBaseUrl', e.target.value)}
                      placeholder="https://provider-api/v1"
                      leftIcon={<Server className="w-4 h-4" />}
                    />

                    <Input
                      type="password"
                      label="Private API Key"
                      value={provider.apiKey}
                      onChange={(e) => updateProviderField(provider.id, 'apiKey', e.target.value)}
                      placeholder={provider.hasApiKey ? 'Leave blank to keep current key' : 'Enter API key'}
                      leftIcon={<Key className="w-4 h-4" />}
                    />
                  </motion.div>
                ))}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Default Provider
                  </label>
                  <select
                    value={config.defaultProvider}
                    onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded-lg text-sm flex items-center gap-2"
                  >
                    <X className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}

                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-green-900/30 border border-green-800 text-green-300 rounded-lg text-sm flex items-center gap-2"
                  >
                    <Check className="w-4 h-4 flex-shrink-0" />
                    {success}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  variant="success"
                  loading={loading}
                  className="w-full"
                >
                  {loading ? 'Saving...' : 'Save Configuration'}
                </Button>

              </form>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
