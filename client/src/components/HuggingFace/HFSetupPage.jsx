import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Rocket,
  Settings,
  Zap,
  Check,
  X,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { Button, Input } from '../ui';
import { deployHFSpace, getConfig, updateConfig, testProviderConnection } from '../../services/api';

function Section({ number, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex-shrink-0">
          {number}
        </span>
        <span className="text-white font-medium flex-1">{title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">
        {text}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function HFSetupPage() {
  const [hfToken, setHfToken] = useState('');
  const [spaceName, setSpaceName] = useState('ai-studio-gpu');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [deployError, setDeployError] = useState('');

  const [spaceUrl, setSpaceUrl] = useState('');
  const [providerToken, setProviderToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [configured, setConfigured] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const cfg = await getConfig();
      const hf = (cfg.providers || []).find((p) => p.id === 'huggingface');
      if (hf) {
        setConfigured(hf.configured || false);
        setHasApiKey(hf.hasApiKey || false);
        setSpaceUrl(hf.apiBaseUrl || '');
      }
    } catch {
      // ignore
    }
  }

  async function handleDeploy() {
    if (!hfToken.trim()) {
      setDeployError('HuggingFace token is required.');
      return;
    }
    setDeploying(true);
    setDeployError('');
    setDeployResult(null);
    try {
      const result = await deployHFSpace({ token: hfToken.trim(), spaceName: spaceName.trim() });
      if (result.error) {
        setDeployError(result.error);
      } else {
        setDeployResult(result);
        setSpaceUrl(result.spaceUrl || '');
        await loadStatus();
      }
    } catch (err) {
      setDeployError(err.message || 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  }

  async function handleSaveProvider() {
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = {
        providers: {
          huggingface: {
            apiBaseUrl: spaceUrl.trim(),
            enabled: true,
            ...(providerToken.trim() ? { apiKey: providerToken.trim() } : {}),
          },
        },
      };
      const result = await updateConfig(payload);
      if (result.success) {
        setSaveMsg('Saved!');
        await loadStatus();
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg(result.error || 'Failed to save');
      }
    } catch (err) {
      setSaveMsg(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testProviderConnection('huggingface');
      setTestResult(result.success ? 'connected' : 'failed');
    } catch {
      setTestResult('failed');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Status Banner */}
      <div
        className={`flex items-center gap-3 p-4 rounded-xl border ${
          configured
            ? 'bg-green-900/20 border-green-800/50'
            : 'bg-yellow-900/20 border-yellow-800/50'
        }`}
      >
        {configured ? (
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
        ) : (
          <Settings className="w-5 h-5 text-yellow-400 flex-shrink-0" />
        )}
        <div>
          <p className={`text-sm font-medium ${configured ? 'text-green-300' : 'text-yellow-300'}`}>
            {configured
              ? 'HuggingFace provider is configured and ready.'
              : 'HuggingFace provider is not configured yet. Follow the steps below.'}
          </p>
          {configured && spaceUrl && (
            <p className="text-xs text-gray-400 mt-0.5">Space URL: {spaceUrl}</p>
          )}
        </div>
      </div>

      {/* Step 1: Deploy */}
      <Section number="1" title="Create & Deploy Space" defaultOpen={!configured}>
        <p className="text-sm text-gray-400">
          Deploy a HuggingFace Space with FLUX (image) and Wan 2.1 I2V (video) models.
          Requires a <a href="https://huggingface.co/subscribe/pro" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">HuggingFace Pro</a> account for ZeroGPU access.
        </p>

        <div className="space-y-3">
          <Input
            type="password"
            label="HuggingFace Token"
            value={hfToken}
            onChange={(e) => setHfToken(e.target.value)}
            placeholder="hf_xxxxxxxxxxxx"
          />
          <Input
            label="Space Name"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            placeholder="ai-studio-gpu"
          />

          <Button
            variant="primary"
            onClick={handleDeploy}
            disabled={deploying || !hfToken.trim()}
            leftIcon={deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          >
            {deploying ? 'Deploying...' : 'Deploy Space'}
          </Button>

          {deployError && (
            <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded-lg text-sm flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" />
              {deployError}
            </div>
          )}

          {deployResult && (
            <div className="p-3 bg-green-900/30 border border-green-800 text-green-300 rounded-lg text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">Space deployed successfully!</span>
              </div>
              <div className="text-xs space-y-1 text-gray-300">
                <p>
                  Repo:{' '}
                  <a
                    href={`https://huggingface.co/spaces/${deployResult.repoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    {deployResult.repoId}
                    <ExternalLink className="w-3 h-3 inline ml-1" />
                  </a>
                </p>
                <p>URL: {deployResult.spaceUrl}</p>
              </div>
              <p className="text-xs text-yellow-300 mt-1">
                Next: Go to Space Settings and select <strong>ZeroGPU</strong> hardware, then wait for the Space to build.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 pt-3 mt-2">
          <p className="text-xs text-gray-500 mb-2">Or deploy manually via CLI:</p>
          <CopyBlock text="cd server && npm run deploy:hf -- --name ai-studio-gpu --token hf_xxx" />
        </div>
      </Section>

      {/* Step 2: Configure */}
      <Section number="2" title="Configure Provider" defaultOpen={!configured}>
        <p className="text-sm text-gray-400">
          Set the Space URL and (optionally) your HF token for private Spaces.
        </p>

        <div className="space-y-3">
          <Input
            label="Space URL"
            value={spaceUrl}
            onChange={(e) => setSpaceUrl(e.target.value)}
            placeholder="https://username-ai-studio-gpu.hf.space"
          />
          <Input
            type="password"
            label="HF Token (optional for public Spaces)"
            value={providerToken}
            onChange={(e) => setProviderToken(e.target.value)}
            placeholder={hasApiKey ? 'Leave blank to keep current token' : 'hf_xxxxxxxxxxxx'}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="success"
              onClick={handleSaveProvider}
              disabled={saving || !spaceUrl.trim()}
              leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
            {saveMsg && (
              <span className={`text-sm ${saveMsg === 'Saved!' ? 'text-green-400' : 'text-red-400'}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Step 3: Test */}
      <Section number="3" title="Test Connection">
        <p className="text-sm text-gray-400">
          Verify that the Space is running and accessible. Make sure the Space has finished building first.
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={testing || !configured}
            leftIcon={testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          {testResult === 'connected' && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <Check className="w-4 h-4" /> Connected
            </span>
          )}
          {testResult === 'failed' && (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <X className="w-4 h-4" /> Failed - make sure the Space is running with ZeroGPU hardware
            </span>
          )}
        </div>
      </Section>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3 pt-2">
        <a
          href="https://huggingface.co/settings/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> HF Tokens
        </a>
        <a
          href="https://huggingface.co/spaces"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> My Spaces
        </a>
        <a
          href="https://huggingface.co/subscribe/pro"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> HF Pro Plan
        </a>
        <a
          href="https://huggingface.co/docs/hub/spaces-zerogpu"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> ZeroGPU Docs
        </a>
      </div>
    </div>
  );
}
