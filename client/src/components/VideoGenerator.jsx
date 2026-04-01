import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { enqueuePipeline, generateVideo, getModels } from "../services/api";
import AssetPickerDialog from "./library/AssetPickerDialog";

// Generate unique video ID
const generateVideoId = () =>
  `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const VIDEO_SELECTED_MODEL_KEY = "blackbox_ai_video_selected_model";
const VIDEO_SELECTED_PROVIDER_KEY = "blackbox_ai_video_selected_provider";

const WAN_I2V_MODEL_ID = "chutes/Wan-AI/Wan2.2-I2V-14B-Fast";
const WAN_DEFAULT_NEGATIVE_PROMPT =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

export default function VideoGenerator() {
  const {
    isConfigured,
    saveVideo,
    providers,
    getVideo,
    addLibraryAsset,
    libraryAssets,
    refreshLibraryAssets,
  } = useApp();

  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(VIDEO_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [error, setError] = useState("");

  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(24);

  // Wan I2V controls
  const [wanImageData, setWanImageData] = useState("");
  const [wanImageSourceType, setWanImageSourceType] = useState("none"); // none | upload | library
  const [wanFrames, setWanFrames] = useState(81);
  const [wanFps, setWanFps] = useState(16);
  const [wanFast, setWanFast] = useState(true);
  const [wanSeed, setWanSeed] = useState("");
  const [wanResolution, setWanResolution] = useState("480p");
  const [wanGuidanceScale, setWanGuidanceScale] = useState(1);
  const [wanGuidanceScale2, setWanGuidanceScale2] = useState(1);
  const [wanNegativePrompt, setWanNegativePrompt] = useState(
    WAN_DEFAULT_NEGATIVE_PROMPT,
  );
  const [wanLibraryImageId, setWanLibraryImageId] = useState("");
  const [wanUploadingImage, setWanUploadingImage] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(VIDEO_SELECTED_PROVIDER_KEY) || "",
  );

  const searchInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const selectedModelInfo = useMemo(
    () => availableModels.find((m) => m.modelKey === selectedModel),
    [availableModels, selectedModel],
  );

  const isWanI2VSelected = selectedModelInfo?.id === WAN_I2V_MODEL_ID;

  const imageLibraryAssets = useMemo(
    () => (libraryAssets || []).filter((asset) => asset.type === "image"),
    [libraryAssets],
  );

  useEffect(() => {
    if (showModelSelector && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showModelSelector]);

  useEffect(() => {
    refreshLibraryAssets?.({ type: "image" });
  }, [refreshLibraryAssets]);

  useEffect(() => {
    const loadVideoModels = async () => {
      try {
        const result = await getModels({ category: "video", provider: "all" });
        const nextModels = result.models || [];

        const configuredGateways = providers
          .filter((provider) => provider.configured)
          .map((provider) => provider.id);

        const persistedProvider = localStorage.getItem(
          VIDEO_SELECTED_PROVIDER_KEY,
        );
        const persistedModelKey = localStorage.getItem(
          VIDEO_SELECTED_MODEL_KEY,
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
        console.error("Failed to load video models:", err);
      }
    };

    loadVideoModels();
  }, [providers]);

  useEffect(() => {
    if (!configuredProviderFilter) {
      setAvailableModels([]);
      return;
    }

    const loadGatewayModels = async () => {
      try {
        const result = await getModels({
          category: "video",
          provider: configuredProviderFilter,
        });
        setAvailableModels(result.models || []);
      } catch (err) {
        console.error("Failed to load gateway video models:", err);
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
      const search = modelSearch.toLowerCase();
      const matchesSearch =
        modelSearch === "" ||
        model.name.toLowerCase().includes(search) ||
        model.provider.toLowerCase().includes(search) ||
        (model.modelProvider || "").toLowerCase().includes(search) ||
        model.id.toLowerCase().includes(search);

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
      localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (configuredProviderFilter) {
      localStorage.setItem(
        VIDEO_SELECTED_PROVIDER_KEY,
        configuredProviderFilter,
      );
    }
  }, [configuredProviderFilter]);

  useEffect(() => {
    if (!isWanI2VSelected) return;

    setDuration(5);
    setFps(24);
  }, [isWanI2VSelected]);

  useEffect(() => {
    if (!wanLibraryImageId) return;
    const selected = imageLibraryAssets.find((a) => a.id === wanLibraryImageId);
    if (selected?.url) {
      setWanImageData(selected.url);
      setWanImageSourceType("library");
    }
  }, [wanLibraryImageId, imageLibraryAssets]);

  const handleAssetPickerSelect = (asset) => {
    if (asset?.url) {
      setWanImageData(asset.url);
      setWanLibraryImageId(asset.id);
      setWanImageSourceType("library");
    }
  };

  const handleWanImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setWanUploadingImage(true);
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      setWanImageData(dataUrl);
      setWanImageSourceType("upload");
      setWanLibraryImageId("");
    } catch (err) {
      setError(err.message || "Failed to process image file");
    } finally {
      setWanUploadingImage(false);
    }
  };

  const validateWanInputs = () => {
    if (!prompt.trim() || prompt.trim().length < 3) {
      return "Prompt must be at least 3 characters.";
    }
    if (!wanImageData) {
      return "Please upload an image or select one from library.";
    }
    if (
      !Number.isInteger(Number(wanFrames)) ||
      wanFrames < 21 ||
      wanFrames > 140
    ) {
      return "Frames must be an integer between 21 and 140.";
    }
    if (!Number.isInteger(Number(wanFps)) || wanFps < 16 || wanFps > 24) {
      return "FPS must be an integer between 16 and 24.";
    }
    if (Number(wanGuidanceScale) < 0 || Number(wanGuidanceScale) > 10) {
      return "Guidance Scale must be between 0 and 10.";
    }
    if (Number(wanGuidanceScale2) < 0 || Number(wanGuidanceScale2) > 10) {
      return "Guidance Scale 2 must be between 0 and 10.";
    }
    if (wanResolution !== "480p" && wanResolution !== "720p") {
      return "Resolution must be 480p or 720p.";
    }
    if (
      wanSeed !== "" &&
      (!Number.isInteger(Number(wanSeed)) || Number.isNaN(Number(wanSeed)))
    ) {
      return "Seed must be an integer or empty.";
    }
    return "";
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError("");
    setGeneratedVideo(null);

    const selectedInfo = availableModels.find(
      (m) => m.modelKey === selectedModel,
    );
    const effectiveProvider =
      configuredProviderFilter || selectedInfo?.provider;

    if (!selectedInfo || !effectiveProvider) {
      setError("Please select a gateway and model first");
      setLoading(false);
      return;
    }

    if (isWanI2VSelected) {
      const validationError = validateWanInputs();
      if (validationError) {
        setError(validationError);
        setLoading(false);
        return;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = {
        provider: effectiveProvider,
        modelKey: selectedInfo?.modelKey,
        signal: controller.signal,
      };

      if (isWanI2VSelected) {
        Object.assign(payload, {
          image: wanImageData,
          wanFrames: clamp(Number(wanFrames), 21, 140),
          wanFps: clamp(Number(wanFps), 16, 24),
          wanFast: Boolean(wanFast),
          wanSeed: wanSeed === "" ? null : Number(wanSeed),
          wanResolution: wanResolution === "720p" ? "720p" : "480p",
          wanGuidanceScale: clamp(Number(wanGuidanceScale), 0, 10),
          wanGuidanceScale2: clamp(Number(wanGuidanceScale2), 0, 10),
          wanNegativePrompt:
            wanNegativePrompt?.trim() || WAN_DEFAULT_NEGATIVE_PROMPT,
        });
      } else {
        Object.assign(payload, {
          duration,
          fps,
        });
      }

      const response = await generateVideo(prompt, selectedInfo?.id, payload);

      if (response.data || response.video || response.url) {
        const videoData = {
          url: response.data?.[0]?.url || response.video || response.url,
          id: response.id,
          raw: response.providerResponse || response.raw || null,
        };
        setGeneratedVideo(videoData);

        const videoId = generateVideoId();
        saveVideo(
          videoId,
          prompt,
          videoData,
          selectedInfo?.id || selectedModel,
        );

        await addLibraryAsset({
          type: "video",
          source: "video",
          title: prompt.slice(0, 80) || "Generated video",
          url: videoData.url,
          metadata: {
            model: selectedInfo?.id || selectedModel,
            provider: effectiveProvider,
            ...(isWanI2VSelected
              ? {
                  wan: {
                    frames: Number(wanFrames),
                    fps: Number(wanFps),
                    fast: Boolean(wanFast),
                    seed: wanSeed === "" ? null : Number(wanSeed),
                    resolution: wanResolution,
                    guidance_scale: Number(wanGuidanceScale),
                    guidance_scale_2: Number(wanGuidanceScale2),
                    negative_prompt:
                      wanNegativePrompt?.trim() || WAN_DEFAULT_NEGATIVE_PROMPT,
                    imageSourceType: wanImageSourceType,
                  },
                }
              : {}),
          },
        });
      } else if (response.error) {
        setError(response.error);
      } else {
        setError("Unexpected response format");
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setError("Video generation stopped.");
      } else {
        setError(err.message || "Failed to generate video");
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!generatedVideo?.url) return;
    const link = document.createElement("a");
    link.href = generatedVideo.url;
    link.download = `ai-video-${Date.now()}.mp4`;
    link.click();
  };

  const handleStopGeneration = () => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  };

  const handleMusicToEditorPipeline = async () => {
    if (!generatedVideo?.url) return;
    await enqueuePipeline("music-to-editor", {
      musicPayload: { prompt: "Background soundtrack for current video" },
      videoPayload: { sourceVideoUrl: generatedVideo.url },
    });
  };

  const handleModelSelect = (model) => {
    const resolvedProvider = model.provider || configuredProviderFilter || "";
    setSelectedModel(model.modelKey);
    setConfiguredProviderFilter(resolvedProvider);

    if (model.modelKey) {
      localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, model.modelKey);
    }
    if (resolvedProvider) {
      localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, resolvedProvider);
    }

    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleCloseModelSelector = () => {
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleVideoHistorySelected = useCallback(
    (e) => {
      const { videoId } = e.detail || {};
      if (!videoId) return;

      const videoItem = getVideo(videoId);
      if (!videoItem) return;

      setGeneratedVideo(videoItem.result || null);
      setPrompt(videoItem.prompt || "");
      setError("");
    },
    [getVideo],
  );

  useEffect(() => {
    window.addEventListener("videoHistorySelected", handleVideoHistorySelected);
    return () => {
      window.removeEventListener(
        "videoHistorySelected",
        handleVideoHistorySelected,
      );
    };
  }, [handleVideoHistorySelected]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-white">Video Generation</h2>
          <p className="text-sm text-gray-400">
            Model: {selectedModelInfo?.name || "Select a model"}
          </p>
          {isWanI2VSelected && (
            <p className="text-xs text-indigo-300 mt-1">
              Wan 2.2 I2V mode: image-to-video with advanced controls
            </p>
          )}
        </div>
        <button
          onClick={() => setShowModelSelector(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
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
                Select Video Model
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
                  className="w-full bg-gray-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {modelSearch && (
                  <button
                    onClick={() => setModelSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {gatewayProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => {
                    setConfiguredProviderFilter(provider);
                    localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, provider);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    configuredProviderFilter === provider
                      ? "bg-indigo-600 text-white"
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
                        ? "bg-indigo-600 text-white"
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
                  <button
                    onClick={() => setModelSearch("")}
                    className="mt-2 text-indigo-400 hover:text-indigo-300"
                  >
                    Clear filters
                  </button>
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
              placeholder={
                isWanI2VSelected
                  ? "Describe motion/style for your input image..."
                  : "Describe the video you want to generate..."
              }
              disabled={!isConfigured}
              className="w-full bg-gray-800 text-white p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
            />
          </div>

          {isWanI2VSelected ? (
            <div className="space-y-3 p-3 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-200">
                Wan 2.2 I2V Controls
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-sm text-gray-300">
                    Image Source
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setWanImageSourceType("upload");
                        setWanLibraryImageId("");
                      }}
                      className={`px-3 py-1.5 rounded text-sm ${
                        wanImageSourceType === "upload"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-700 text-gray-200"
                      }`}
                    >
                      Upload
                    </button>
                    <button
                      onClick={() => setWanImageSourceType("library")}
                      className={`px-3 py-1.5 rounded text-sm ${
                        wanImageSourceType === "library"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-700 text-gray-200"
                      }`}
                    >
                      From Library
                    </button>
                  </div>

                  {wanImageSourceType === "upload" && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleWanImageUpload}
                        className="w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white"
                      />
                      {wanUploadingImage && (
                        <p className="text-xs text-gray-400">
                          Processing image...
                        </p>
                      )}
                    </div>
                  )}

                  {wanImageSourceType === "library" && (
                    <button
                      onClick={() => setShowAssetPicker(true)}
                      className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {wanLibraryImageId
                        ? "Change Image from Library"
                        : "Select Image from Library"}
                    </button>
                  )}

                  {wanImageData && (
                    <div className="rounded border border-gray-700 overflow-hidden">
                      <img
                        src={wanImageData}
                        alt="Wan input preview"
                        className="w-full h-40 object-cover"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm text-gray-300">
                    Resolution
                  </label>
                  <select
                    value={wanResolution}
                    onChange={(e) => setWanResolution(e.target.value)}
                    className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="480p">480p</option>
                    <option value="720p">720p</option>
                  </select>

                  <label className="block text-sm text-gray-300 mt-2">
                    Seed (optional)
                  </label>
                  <input
                    type="number"
                    value={wanSeed}
                    onChange={(e) => setWanSeed(e.target.value)}
                    placeholder="null/random"
                    className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  <label className="inline-flex items-center gap-2 mt-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={wanFast}
                      onChange={(e) => setWanFast(e.target.checked)}
                    />
                    Fast mode
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Frames (21-140): {wanFrames}
                  </label>
                  <input
                    type="range"
                    min="21"
                    max="140"
                    value={wanFrames}
                    onChange={(e) => setWanFrames(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    FPS (16-24): {wanFps}
                  </label>
                  <input
                    type="range"
                    min="16"
                    max="24"
                    value={wanFps}
                    onChange={(e) => setWanFps(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Guidance Scale (0-10): {wanGuidanceScale}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={wanGuidanceScale}
                    onChange={(e) =>
                      setWanGuidanceScale(Number(e.target.value))
                    }
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Guidance Scale 2 (0-10): {wanGuidanceScale2}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={wanGuidanceScale2}
                    onChange={(e) =>
                      setWanGuidanceScale2(Number(e.target.value))
                    }
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Negative Prompt
                </label>
                <textarea
                  value={wanNegativePrompt}
                  onChange={(e) => setWanNegativePrompt(e.target.value)}
                  className="w-full bg-gray-700 text-white p-2 rounded resize-y min-h-[90px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="mt-3 space-y-3 p-3 bg-gray-800 rounded-lg">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Duration (seconds)
                    </label>
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      min="1"
                      max="60"
                      className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      FPS
                    </label>
                    <input
                      type="number"
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      min="12"
                      max="60"
                      className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-900/50 text-red-200 rounded-lg">
              {error}
            </div>
          )}

          {generatedVideo && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-gray-800">
                <video
                  src={generatedVideo.url}
                  controls
                  className="w-full h-auto"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
              {generatedVideo.id && (
                <p className="text-sm text-gray-400">
                  <span className="font-medium">Video ID:</span>{" "}
                  {generatedVideo.id}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Download Video
                </button>
                <button
                  onClick={handleMusicToEditorPipeline}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  Link Music Pipeline
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">Generating video...</p>
              <p className="text-sm text-gray-500 mt-2">
                This may take a while
              </p>
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
        <button
          onClick={loading ? handleStopGeneration : handleGenerate}
          disabled={
            !isConfigured ||
            (!loading &&
              (!prompt.trim() || (isWanI2VSelected && !wanImageData)))
          }
          className={`w-full px-6 py-3 text-white rounded-lg transition-colors disabled:opacity-50 font-medium ${
            loading
              ? "bg-red-600 hover:bg-red-700 disabled:hover:bg-red-600"
              : "bg-indigo-600 hover:bg-indigo-700 disabled:hover:bg-indigo-600"
          }`}
        >
          {loading ? "Stop Generation" : "Generate Video"}
        </button>
      </div>

      {/* Asset Picker Dialog */}
      <AssetPickerDialog
        open={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={handleAssetPickerSelect}
        type="image"
        title="Select Image for Wan I2V"
      />
    </div>
  );
}
