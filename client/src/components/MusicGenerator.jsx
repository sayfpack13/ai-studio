import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { generateMusic, getModels } from "../services/api";

const generateMusicId = () =>
  `mus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const MUSIC_SELECTED_MODEL_KEY = "blackbox_ai_music_selected_model";
const MUSIC_SELECTED_PROVIDER_KEY = "blackbox_ai_music_selected_provider";

export default function MusicGenerator() {
  const { isConfigured, saveMusic, providers, getMusic, addLibraryAsset } =
    useApp();
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(MUSIC_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedMusicId, setSelectedMusicId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatedMusic, setGeneratedMusic] = useState(null);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState("");
  const [format, setFormat] = useState("mp3");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(MUSIC_SELECTED_PROVIDER_KEY) || "",
  );
  const searchInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (showModelSelector && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showModelSelector]);

  useEffect(() => {
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

        const persistedProviderValid =
          persistedProvider &&
          configuredGateways.includes(persistedProvider) &&
          nextModels.some((model) => model.provider === persistedProvider);

        const firstGateway =
          (persistedProviderValid
            ? persistedProvider
            : configuredGateways.find((gatewayId) =>
                nextModels.some((model) => model.provider === gatewayId),
              )) ||
          nextModels[0]?.provider ||
          "";

        setConfiguredProviderFilter(firstGateway);

        const persistedModelForGateway =
          persistedModelKey &&
          nextModels.some(
            (model) =>
              model.provider === firstGateway &&
              model.modelKey === persistedModelKey,
          )
            ? persistedModelKey
            : "";

        const firstGatewayModel = nextModels.find(
          (model) => model.provider === firstGateway,
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

      return matchesSearch;
    });
  }, [providerModels, modelSearch]);

  useEffect(() => {
    if (!configuredProviderFilter || !providerModels.length) {
      setSelectedModel("");
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
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError("");
    setGeneratedMusic(null);

    const selectedModelInfo = availableModels.find(
      (m) => m.modelKey === selectedModel,
    );
    const effectiveProvider =
      configuredProviderFilter || selectedModelInfo?.provider;

    if (!selectedModelInfo || !effectiveProvider) {
      setError("Please select a gateway and model first");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await generateMusic(prompt, selectedModelInfo?.id, {
        provider: effectiveProvider,
        modelKey: selectedModelInfo?.modelKey,
        voice,
        format,
        signal: controller.signal,
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
      setLoading(false);
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
      setLoading(false);
    }
  };

  const selectedModelInfo = availableModels.find(
    (m) => m.modelKey === selectedModel,
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-white">Music Generation</h2>
          <p className="text-sm text-gray-400">
            Model: {selectedModelInfo?.name || "Select a model"}
          </p>
        </div>
        <button
          onClick={() => setShowModelSelector(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          Change Model
        </button>
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

            <p className="text-sm text-gray-400 mb-3">
              {filteredModels.length} model
              {filteredModels.length !== 1 ? "s" : ""} found
            </p>

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
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the music you want to generate..."
              disabled={!isConfigured}
              className="w-full bg-gray-800 text-white p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full bg-gray-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="ogg">OGG</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 text-red-200 rounded-lg">
              {error}
            </div>
          )}

          {generatedMusic && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">
                {selectedMusicId ? `History ID: ${selectedMusicId}` : "Preview"}
              </div>
              <audio src={generatedMusic.url} controls className="w-full" />
              {generatedMusic.raw && (
                <p className="text-sm text-gray-400 break-all">
                  {generatedMusic.raw}
                </p>
              )}
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                Download Audio
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">Generating music...</p>
            </div>
          )}

          {!isConfigured && (
            <div className="text-center py-8">
              <p className="text-yellow-400 mb-2">API not configured</p>
              <p className="text-gray-500">
                Please ask admin to configure the API key
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-700">
        {loading ? (
          <button
            onClick={handleStopGeneration}
            className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
          >
            Stop Generation
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!isConfigured || !prompt.trim()}
            className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-emerald-600 font-medium"
          >
            Generate Music
          </button>
        )}
      </div>
    </div>
  );
}
