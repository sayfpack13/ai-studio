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
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Button, Input } from '../ui';
import {
  deployHFSpace,
  getConfig,
  testProviderConnection,
  listHFSpaces,
  redeployHFSpace,
  listHFDeployTargets,
} from '../../services/api';

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

const HF_SETUP_TOKEN_KEY = 'ai_studio_hf_setup_token';
const ADMIN_SESSION_MSG = 'Admin session missing or expired. Please log in again.';

export default function HFSetupPage() {
  const [hfToken, setHfToken] = useState('');
  const [spaceList, setSpaceList] = useState([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState('');
  const [redeployingRepoId, setRedeployingRepoId] = useState('');
  const [manageMsg, setManageMsg] = useState('');
  const [deployTargets, setDeployTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState('');
  const [targetActionKey, setTargetActionKey] = useState('');

  const [spaceUrl, setSpaceUrl] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem(HF_SETUP_TOKEN_KEY) || '';
    if (savedToken) {
      setHfToken(savedToken);
    }
    loadStatus();
  }, []);

  useEffect(() => {
    if (hfToken.trim()) {
      localStorage.setItem(HF_SETUP_TOKEN_KEY, hfToken.trim());
    } else {
      localStorage.removeItem(HF_SETUP_TOKEN_KEY);
    }
  }, [hfToken]);

  async function loadStatus() {
    try {
      const cfg = await getConfig();
      const hf = (cfg.providers || []).find((p) => p.id === 'huggingface');
      if (hf) {
        setConfigured(hf.configured || false);
        setSpaceUrl(hf.apiBaseUrl || '');
      }
    } catch {
      // ignore
    }
  }

  async function handleListSpaces() {
    setSpacesLoading(true);
    setSpacesError('');
    setManageMsg('');
    try {
      const result = await listHFSpaces({ token: hfToken.trim() || undefined });
      if (result.error) {
        setSpacesError(result.error === 'No token provided' ? ADMIN_SESSION_MSG : result.error);
        setSpaceList([]);
      } else {
        setSpaceList(result.spaces || []);
      }
    } catch (err) {
      setSpacesError(err.message || 'Failed to list spaces');
      setSpaceList([]);
    } finally {
      setSpacesLoading(false);
    }
  }

  async function handleListDeployTargets() {
    setTargetsLoading(true);
    setTargetsError('');
    setManageMsg('');
    try {
      const result = await listHFDeployTargets({ token: hfToken.trim() || undefined });
      if (result.error) {
        setTargetsError(result.error === 'No token provided' ? ADMIN_SESSION_MSG : result.error);
        setDeployTargets([]);
      } else {
        const targets = result.targets || [];
        setDeployTargets(targets);
      }
    } catch (err) {
      setTargetsError(err.message || 'Failed to list backend deploy targets');
      setDeployTargets([]);
    } finally {
      setTargetsLoading(false);
    }
  }

  async function handleDeployTarget(target, mode) {
    const actionKey = `${mode}:${target.templateName}`;
    setTargetActionKey(actionKey);
    setTargetsError('');
    setManageMsg('');
    try {
      const token = hfToken.trim() || undefined;
      const result =
        mode === 'redeploy'
          ? await redeployHFSpace({
              token,
              repoId: target.suggestedRepoId,
              templateName: target.templateName,
            })
          : await deployHFSpace({
              token,
              spaceName: target.suggestedSpaceName,
              templateName: target.templateName,
            });

      if (result.error) {
        setTargetsError(result.error === 'No token provided' ? ADMIN_SESSION_MSG : result.error);
      } else {
        setManageMsg(`${mode === 'redeploy' ? 'Re-deployed' : 'Deployed'} ${result.repoId}`);
        setSpaceUrl(result.spaceUrl || '');
        await Promise.all([loadStatus(), handleListDeployTargets(), handleListSpaces()]);
      }
    } catch (err) {
      setTargetsError(err.message || 'Target deployment action failed');
    } finally {
      setTargetActionKey('');
    }
  }

  async function handleRedeploy(repoId) {
    setRedeployingRepoId(repoId);
    setManageMsg('');
    setSpacesError('');
    try {
      const result = await redeployHFSpace({
        token: hfToken.trim() || undefined,
        repoId,
      });

      if (result.error) {
        setSpacesError(result.error === 'No token provided' ? ADMIN_SESSION_MSG : result.error);
      } else {
        setManageMsg(`Re-deployed ${result.repoId}`);
        await handleListSpaces();
      }
    } catch (err) {
      setSpacesError(err.message || 'Re-deploy failed');
    } finally {
      setRedeployingRepoId('');
    }
  }

  async function handleSaveToken() {
    const token = hfToken.trim();
    if (!token) {
      setSaveMsg('Token is required.');
      return;
    }
    setSaveMsg('');
    localStorage.setItem(HF_SETUP_TOKEN_KEY, token);
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 3000);
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

      <Section number="1" title="Backend Deploy Targets" defaultOpen>
        <p className="text-sm text-gray-400">
          Local Space templates found in your backend workspace, with deployment status on HuggingFace.
        </p>

        <Input
          type="password"
          label="HuggingFace Token (persistent on this browser)"
          value={hfToken}
          onChange={(e) => setHfToken(e.target.value)}
          placeholder="Leave blank to use saved provider token"
        />

        <div className="flex items-center gap-3">
          <Button
            variant="success"
            onClick={handleSaveToken}
            disabled={!hfToken.trim()}
            leftIcon={<Check className="w-4 h-4" />}
          >
            Save Token
          </Button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg === 'Saved!' ? 'text-green-400' : 'text-red-400'}`}>
              {saveMsg}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleListDeployTargets}
            disabled={targetsLoading}
            leftIcon={targetsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          >
            {targetsLoading ? 'Scanning Targets...' : 'Scan Backend Targets'}
          </Button>
        </div>

        {targetsError && (
          <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded-lg text-sm flex items-center gap-2">
            <X className="w-4 h-4 flex-shrink-0" />
            {targetsError}
          </div>
        )}

        {deployTargets.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {deployTargets.map((target) => {
              const deployKey = `deploy:${target.templateName}`;
              const redeployKey = `redeploy:${target.templateName}`;
              const isDeploying = targetActionKey === deployKey;
              const isRedeploying = targetActionKey === redeployKey;
              return (
                <div key={target.templateName} className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {target.emoji ? `${target.emoji} ` : ''}{target.title || target.templateName}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {target.suggestedRepoId}
                      </div>
                      <div className="text-xs mt-1">
                        {target.ready ? (
                          <span className="text-green-400">Template ready</span>
                        ) : (
                          <span className="text-red-400">Missing files: {(target.missingFiles || []).join(', ')}</span>
                        )}
                        {' • '}
                        {target.deployed ? (
                          <span className="text-green-400">Already deployed</span>
                        ) : (
                          <span className="text-yellow-400">Not deployed</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                      {!target.deployed ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleDeployTarget(target, 'deploy')}
                          disabled={!target.ready || Boolean(targetActionKey)}
                          leftIcon={isDeploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                        >
                          {isDeploying ? 'Deploying...' : 'Deploy'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDeployTarget(target, 'redeploy')}
                          disabled={!target.ready || Boolean(targetActionKey)}
                          leftIcon={isRedeploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                        >
                          {isRedeploying ? 'Re-deploying...' : 'Re-deploy'}
                        </Button>
                      )}
                      {target.deployedSpace?.pageUrl && (
                        <a
                          href={target.deployedSpace.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Step 2: Manage */}
      <Section number="2" title="Manage Deployed Spaces" defaultOpen={configured}>
        <p className="text-sm text-gray-400">
          List your HuggingFace Spaces, re-deploy template files, and quickly set provider URL from an existing Space.
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleListSpaces}
            disabled={spacesLoading}
            leftIcon={spacesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          >
            {spacesLoading ? 'Loading Spaces...' : 'List My Spaces'}
          </Button>
          <span className="text-xs text-gray-500">
            Uses token from the field above, or saved HuggingFace provider token.
          </span>
        </div>

        {spacesError && (
          <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded-lg text-sm flex items-center gap-2">
            <X className="w-4 h-4 flex-shrink-0" />
            {spacesError}
          </div>
        )}

        {manageMsg && (
          <div className="p-3 bg-green-900/30 border border-green-800 text-green-300 rounded-lg text-sm flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            {manageMsg}
          </div>
        )}

        {spaceList.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {spaceList.map((space) => (
              <div key={space.repoId} className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-white font-medium truncate">{space.repoId}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {space.private ? 'Private' : 'Public'} • SDK: {space.sdk || 'unknown'} • Likes: {space.likes ?? 0}
                    </div>
                    {space.updatedAt && (
                      <div className="text-[11px] text-gray-500 mt-0.5">Updated: {new Date(space.updatedAt).toLocaleString()}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSpaceUrl(space.spaceUrl || '');
                        setManageMsg(`Selected ${space.repoId} URL in provider config form.`);
                      }}
                    >
                      Use URL
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRedeploy(space.repoId)}
                      disabled={redeployingRepoId === space.repoId}
                      leftIcon={
                        redeployingRepoId === space.repoId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Rocket className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {redeployingRepoId === space.repoId ? 'Re-deploying...' : 'Re-deploy'}
                    </Button>
                    <a
                      href={space.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
