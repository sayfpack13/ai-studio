import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { useJobs } from "../context/JobContext";
import { getModels } from "../services/api";
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { Button } from "./ui";
import { LoadingSpinner, MusicPresetPanel, MediaOutputPanel } from "./shared";
import { Music, Sparkles, Download, Settings } from "lucide-react";

const generateMusicId = () =>
  `mus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const MUSIC_SELECTED_MODEL_KEY = "blackbox_ai_music_selected_model";
const MUSIC_SELECTED_PROVIDER_KEY = "blackbox_ai_music_selected_provider";

export default function MusicGenerator() {
  const { 
    isConfigured, 
    saveMusic, 
    providers, 
    getMusic, 
    addLibraryAsset,
    musicHistory,
    getMusicIds,
    deleteMusic,
  } = useApp();

  const { enqueueJob, getJobsByType, processQueue, updateJob } = useJobs();
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(MUSIC_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedMusicId, setSelectedMusicId] = useState(null);
  const musicJobs = getJobsByType("music");
  const loading = musicJobs.some(job => job.status === "running" || job.status === "pending");
  const [generatedMusic, setGeneratedMusic] = useState(null);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState("");
  const [format, setFormat] = useState("mp3");
  const [duration, setDuration] = useState(30);
  const [musicStyle, setMusicStyle] = useState(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(MUSIC_SELECTED_PROVIDER_KEY) || "",
  );
  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const searchInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const isOllamaLocalActive =
    cloudFilter === "local" && configuredProviderFilter === "ollama";
  const ollamaLocal = useOllamaLocal(isOllamaLocalActive);

  useEffect(() => {
    if (showModelSelector && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showModelSelector]);

  useEffect(() => {
    if (providers.length === 0) return;

    const loadMusicModels = async () => {
      try {
        const result = await getModels({ category: "music", provider: "all" });
        const nextModels = result.models || [];

        const configuredGateways = providers
          .filter((provider) => provider.configured)
          .map((provider) => provider.id);

        const persistedProvider = localStorage.getItem(
          MUSIC_SELECTED_PROVIDER_KEY,
        );
        const persistedModelKey = localStorage.getItem(
          MUSIC_SELECTED_MODEL_KEY,
        );

        const isProviderMatch = (model, providerId) => 
          model.provider === providerId || model.configuredProvider === providerId;

        const persistedProviderValid =
          persistedProvider &&
          configuredGateways.includes(persistedProvider) &&
          nextModels.some((model) => isProviderMatch(model, persistedProvider));

        const firstGateway =
          (persistedProviderValid
            ? persistedProvider
            : configuredGateways.find((gatewayId) =>
                nextModels.some((model) => isProviderMatch(model, gatewayId)),
              )) ||
          nextModels[0]?.configuredProvider || nextModels[0]?.provider ||
          "";

        setConfiguredProviderFilter(firstGateway);

        const persistedModelForGateway =
          persistedModelKey &&
          nextModels.some(
            (model) =>
              isProviderMatch(model, firstGateway) &&
              model.modelKey === persistedModelKey,
          )
            ? persistedModelKey
            : "";

        const firstGatewayModel = nextModels.find(
          (model) => isProviderMatch(model, firstGateway),
        );
        setSelectedModel(
          persistedModelForGateway || firstGatewayModel?.modelKey || "",
        );
      } catch (err) {
        console.error("Failed to load music models:", err);
      }
    };

    loadMusicModels();
  }, [providers]);

  useEffect(() => {
    if (!configuredProviderFilter) {
      setAvailableModels([]);
      return;
    }

    const loadGatewayModels = async () => {
      try {
        const result = await getModels({
          category: "music",
          provider: configuredProviderFilter,
        });
        setAvailableModels(result.models || []);
      } catch (error) {
        console.error("Failed to load gateway music models:", error);
      }
    };

    loadGatewayModels();
  }, [configuredProviderFilter]);

  const gatewayProviders = useMemo(() => {
    return providers
      .filter((provider) => provider.configured)
      .map((p) => p.id)
      .sort();
  }, [providers]);

  const providerModels = useMemo(() => availableModels, [availableModels]);

  const filteredModels = useMemo(() => {
    return providerModels.filter((model) => {
      const matchesSearch =
        modelSearch === "" ||
        model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.provider.toLowerCase().includes(modelSearch.toLowerCase()) ||
        (model.modelProvider || "")
          .toLowerCase()
          .includes(modelSearch.toLowerCase()) ||
        model.id.toLowerCase().includes(modelSearch.toLowerCase());

      const matchesCloud =
        cloudFilter === "all" ||
        (cloudFilter === "cloud" && model.isCloud) ||
        (cloudFilter === "local" && !model.isCloud);

      return matchesSearch && matchesCloud;
    });
  }, [providerModels, modelSearch, cloudFilter]);

  const hasCloudModels = useMemo(
    () => providerModels.some((m) => m.isCloud),
    [providerModels],
  );
  const hasLocalModels = useMemo(
    () => providerModels.some((m) => !m.isCloud),
    [providerModels],
  );

  useEffect(() => {
    if (!configuredProviderFilter || !providerModels.length) {
      return;
    }

    if (!providerModels.some((model) => model.modelKey === selectedModel)) {
      setSelectedModel(providerModels[0].modelKey);
    }
  }, [configuredProviderFilter, providerModels, selectedModel]);

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem(MUSIC_SELECTED_MODEL_KEY, selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (configuredProviderFilter) {
      localStorage.setItem(
        MUSIC_SELECTED_PROVIDER_KEY,
        configuredProviderFilter,
      );
    }
  }, [configuredProviderFilter]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    
    setError("");
    setGeneratedMusic(null);

    const selectedModelInfo = availableModels.find(
      (m) => m.modelKey === selectedModel,
    );
    const effectiveProvider = isLocalModelSelected
      ? "ollama"
      : configuredProviderFilter || selectedModelInfo?.provider;

    if ((!selectedModelInfo && !isLocalModelSelected) || !effectiveProvider) {
      setError("Please select a gateway and model first");
      
      return;
    }

    const modelIdToSend = isLocalModelSelected ? selectedModel : selectedModelInfo?.id;
    const localOpts = isLocalModelSelected ? { localOllamaUrl: ollamaLocal.localUrl } : {};

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await generateMusic(prompt, modelIdToSend, {
        provider: effectiveProvider,
        modelKey: isLocalModelSelected ? undefined : selectedModelInfo?.modelKey,
        voice,
        format,
        signal: controller.signal,
        ...localOpts,
      });

      if (response.data || response.url || response.audio) {
        const musicData = {
          url: response.data?.[0]?.url || response.url || response.audio,
          raw: response.data?.[0]?.raw,
        };
        setGeneratedMusic(musicData);

        const musicId = generateMusicId();
        setSelectedMusicId(musicId);
        saveMusic(
          musicId,
          prompt,
          musicData,
          selectedModelInfo?.id || selectedModel,
        );
        await addLibraryAsset({
          type: "audio",
          source: "music",
          title: prompt.slice(0, 80) || "Generated music",
          url: musicData.url,
          metadata: {
            model: selectedModelInfo?.id || selectedModel,
            provider: effectiveProvider,
            format,
            voice,
          },
        });
      } else if (response.error) {
        setError(response.error);
      } else {
        setError("Unexpected response format");
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setError("Generation stopped");
      } else {
        setError(err.message || "Failed to generate music");
      }
    } finally {
      abortControllerRef.current = null;
      
    }
  };

  const handleDownload = () => {
    if (generatedMusic?.url) {
      const link = document.createElement("a");
      link.href = generatedMusic.url;
      link.download = `ai-music-${Date.now()}.${format || "mp3"}`;
      link.click();
    }
  };

  const handleModelSelect = (model) => {
    const resolvedProvider =
      model.configuredProvider ||
      model.provider ||
      configuredProviderFilter ||
      "";

    setSelectedModel(model.modelKey);
    setIsLocalModelSelected(false);
    setConfiguredProviderFilter(resolvedProvider);

    if (model.modelKey) {
      localStorage.setItem(MUSIC_SELECTED_MODEL_KEY, model.modelKey);
    }
    if (resolvedProvider) {
      localStorage.setItem(MUSIC_SELECTED_PROVIDER_KEY, resolvedProvider);
    }

    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleLocalModelSelect = (model) => {
    setSelectedModel(model.id);
    setIsLocalModelSelected(true);
    setConfiguredProviderFilter("ollama");
    localStorage.setItem(MUSIC_SELECTED_MODEL_KEY, model.id);
    localStorage.setItem(MUSIC_SELECTED_PROVIDER_KEY, "ollama");
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleCloseModelSelector = () => {
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleMusicHistorySelected = useCallback(
    (event) => {
      const musicId = event?.detail?.musicId;
      if (!musicId) return;

      const item = getMusic(musicId);
      if (!item) return;

      setSelectedMusicId(musicId);
      setPrompt(item.prompt || "");
      setGeneratedMusic(item.result || null);
      setError("");
    },
    [getMusic],
  );

  useEffect(() => {
    window.addEventListener("musicHistorySelected", handleMusicHistorySelected);
    return () => {
      window.removeEventListener(
        "musicHistorySelected",
        handleMusicHistorySelected,
      );
    };
  }, [handleMusicHistorySelected]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
    }
  };

  const selectedModelInfo = availableModels.find(
    (m) => m.modelKey === selectedModel,
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Music Generation</h2>
            <p className="text-xs text-gray-400">
              {isLocalModelSelected ? `${selectedModel} (Local)` : selectedModelInfo?.name || "Select a model"}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowModelSelector(true)}
          className="bg-emerald-600 hover:bg-emerald-500"
        >
          Change Model
        </Button>
      </div>

      {showModelSelector && (
        <div
          className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModelSelector();
          }}
        >
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden mx-4 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">
                Select Music Model
              </h3>
              <button
                onClick={handleCloseModelSelector}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models by name, provider, or ID..."
                  className="w-full bg-gray-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Cloud/Local Filter */}
            {hasCloudModels && hasLocalModels && (
              <div className="mb-3 flex gap-2">
                {["all", "cloud", "local"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setCloudFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      cloudFilter === filter
                        ? filter === "cloud"
                          ? "bg-purple-600 text-white"
                          : filter === "local"
                            ? "bg-emerald-600 text-white"
                            : "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {filter === "all" ? "All" : filter === "cloud" ? "☁ Cloud" : "💻 Local"}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2">
              {gatewayProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => {
                    setConfiguredProviderFilter(provider);
                    localStorage.setItem(MUSIC_SELECTED_PROVIDER_KEY, provider);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    configuredProviderFilter === provider
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {providers.find((p) => p.id === provider)?.name || provider}
                </button>
              ))}
            </div>

            {/* Local Ollama Panel */}
            {isOllamaLocalActive && (
              <LocalOllamaPanel
                localUrl={ollamaLocal.localUrl}
                setLocalUrl={ollamaLocal.setLocalUrl}
                localModels={ollamaLocal.localModels}
                localLoading={ollamaLocal.localLoading}
                localError={ollamaLocal.localError}
                fetchModels={ollamaLocal.fetchModels}
                onSelectModel={handleLocalModelSelect}
                selectedModelId={isLocalModelSelected ? selectedModel : ""}
              />
            )}

            {!isOllamaLocalActive && (
              <p className="text-sm text-gray-400 mb-3">
                {filteredModels.length} model
                {filteredModels.length !== 1 ? "s" : ""} found
              </p>
            )}

            {!isOllamaLocalActive && (
            <div className="flex-1 overflow-y-auto grid gap-2 min-h-0">
              {filteredModels.length > 0 ? (
                filteredModels.map((model) => (
                  <button
                    key={model.uniqueKey || model.id}
                    onClick={() => handleModelSelect(model)}
                    className={`p-3 rounded-lg text-left transition-colors ${
                      selectedModel === model.modelKey
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{model.name}</span>
                      <div className="flex items-center gap-2">
                        {model.isCloud ? (
                          <span className="text-xs px-2 py-0.5 bg-purple-600 rounded">
                            Cloud
                          </span>
                        ) : configuredProviderFilter === "ollama" ? (
                          <span className="text-xs px-2 py-0.5 bg-emerald-700 rounded">
                            Local
                          </span>
                        ) : null}
                        <span className="text-xs px-2 py-0.5 bg-gray-600 rounded">
                          {model.configuredProvider || model.provider}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-cyan-700 rounded">
                          {model.modelProvider || "unknown"}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 truncate block mt-1">
                      {model.id}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>No models found matching "{modelSearch}"</p>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-full lg:w-[45%] flex flex-col border-r border-gray-700">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the music you want to generate..."
                  disabled={!isConfigured}
                  className="w-full bg-gray-800 text-white p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[120px]"
                />
              </div>

              {/* Voice */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Voice (optional)
                </label>
                <input
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder="e.g. mellow-female"
                  className="w-full bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Music Settings Panel */}
              <MusicPresetPanel
                duration={duration}
                onDurationChange={setDuration}
                format={format}
                onFormatChange={setFormat}
                style={musicStyle}
                onStyleChange={setMusicStyle}
                minDuration={5}
                maxDuration={180}
              />

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-900/50 text-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Not Configured Warning */}
              {!isConfigured && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-medium">API Not Configured</span>
                  </div>
                  <p className="text-xs text-yellow-300/70 mt-1">
                    Configure API keys in Admin panel to generate music.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <div className="p-4 border-t border-gray-700">
            {loading ? (
              <Button
                variant="danger"
                onClick={handleStopGeneration}
                className="w-full"
              >
                Stop Generation
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleGenerate}
                disabled={!isConfigured || !prompt.trim()}
                leftIcon={<Sparkles className="w-4 h-4" />}
                className="w-full bg-emerald-600 hover:bg-emerald-500"
              >
                Generate Music
              </Button>
            )}
          </div>
        </div>

        {/* Right Panel - Output */}
        <div className="hidden lg:flex lg:w-[55%] flex-col">
          <MediaOutputPanel
            mediaType="music"
            generatedMedia={generatedMusic}
            mediaHistory={musicHistory}
            getMediaIds={getMusicIds}
            onDownload={handleDownload}
            onPreview={(music) => {
              // Just preview the music without loading prompt
              setGeneratedMusic({
                url: music.url,
                model: music.model,
              });
            }}
            onReloadPrompt={(music) => {
              // Load prompt and model for regeneration
              setPrompt(music.prompt || "");
              setGeneratedMusic({
                url: music.url,
                model: music.model,
                prompt: music.prompt,
                duration: music.duration,
              });
              if (music.model) {
                const model = availableModels.find((m) => m.id === music.model);
                if (model) {
                  setSelectedModel(model.modelKey);
                  localStorage.setItem(MUSIC_SELECTED_MODEL_KEY, model.modelKey);
                }
              }
            }}
            onDeleteMedia={deleteMusic}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
