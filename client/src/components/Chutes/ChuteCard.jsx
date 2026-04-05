import { useState } from 'react';
import { warmupChute, deleteChute, getChuteLogs } from '../../services/chutesService';

export default function ChuteCard({ chute, onRefresh }) {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);

  const isHot = chute.hot || chute.status === 'hot';
  const chuteUrl = chute.public_api_base || chute.api_base || `https://${chute.username}-${chute.name}.chutes.ai`;

  async function handleWarmup() {
    setLoading(true);
    try {
      await warmupChute(chute.chute_id || chute.name);
      onRefresh?.();
    } catch (err) {
      console.error('Warmup failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete chute "${chute.name}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await deleteChute(chute.chute_id || chute.name);
      onRefresh?.();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleShowLogs() {
    if (showLogs) {
      setShowLogs(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getChuteLogs(chute.chute_id || chute.name, 100);
      if (result.ok) {
        setLogs(result.stdout || result.stderr || 'No logs available');
        setShowLogs(true);
      }
    } catch (err) {
      setLogs(`Error fetching logs: ${err.message}`);
      setShowLogs(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isHot ? 'bg-green-500' : 'bg-gray-500'}`} />
            <h3 className="font-medium text-white truncate">{chute.name}</h3>
          </div>
          {chute.public && (
            <span className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-300 rounded">
              Public
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1 truncate">
          {chute.tagline || chute.standard_template || chute.chute_type || 'Custom chute'}
        </p>
      </div>

      {/* Details */}
      <div className="p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Type:</span>
          <span className="text-gray-200">{chute.chute_type || chute.standard_template || 'custom'}</span>
        </div>
        {chute.price_per_hour && (
          <div className="flex justify-between">
            <span className="text-gray-400">Price:</span>
            <span className="text-gray-200">${chute.price_per_hour}/hr</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-400">Status:</span>
          <span className={isHot ? 'text-green-400' : 'text-gray-400'}>
            {isHot ? 'Hot (Online)' : 'Cold'}
          </span>
        </div>
      </div>

      {/* URL */}
      <div className="px-4 pb-2">
        <a
          href={chuteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 truncate block"
        >
          {chuteUrl}
        </a>
      </div>

      {/* Actions */}
      <div className="p-4 flex gap-2 border-t border-gray-700">
        {!isHot && (
          <button
            onClick={handleWarmup}
            disabled={loading}
            className="flex-1 px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 rounded text-white disabled:opacity-50"
          >
            {loading ? 'Warming...' : 'Warm Up'}
          </button>
        )}
        <button
          onClick={handleShowLogs}
          disabled={loading}
          className="flex-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50"
        >
          {showLogs ? 'Hide Logs' : 'Logs'}
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {/* Logs */}
      {showLogs && (
        <div className="border-t border-gray-700 p-4">
          <pre className="text-xs text-gray-300 bg-gray-900 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap">
            {logs}
          </pre>
        </div>
      )}
    </div>
  );
}
