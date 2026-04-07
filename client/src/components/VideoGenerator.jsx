import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { useJobs } from "../context/JobContext";
import { enqueuePipeline, getModels } from "../services/api";
import AssetPickerDialog from "./library/AssetPickerDialog";
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { Button } from "./ui";
import { LoadingSpinner, VideoPresetPanel, MediaOutputPanel } from "./shared";
import { Film, Sparkles, Download, Music, Settings, X } from "lucide-react";

// Generate unique video ID
const generateVideoId = () =>
  `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const VIDEO_SELECTED_MODEL_KEY = "blackbox_ai_video_selected_model";
const VIDEO_SELECTED_PROVIDER_KEY = "blackbox_ai_video_selected_provider";

const WAN_I2V_MODEL_ID = "chutes/Wan-AI/Wan2.2-I2V-14B-Fast";
const WAN_DEFAULT_NEGATIVE_PROMPT =
  "";

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
    videoHistory,
    getVideoIds,
    deleteVideo,
  } = useApp();

  const { enqueueJob, getJobsByType, processQueue, updateJob, selectedJob, setSelectedJob, cancelAllJobsByType, cancelJob, removeJob, maxConcurrentJobs } = useJobs();

  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(VIDEO_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const videoJobs = getJobsByType("video");
  const runningJobs = videoJobs.filter(job => job.status === "running");
  const pendingJobs = videoJobs.filter(job => job.status === "pending");
  const failedJobs = videoJobs.filter(job => job.status === "failed");
  const runningCount = runningJobs.length;
  const pendingCount = pendingJobs.length;
  const hasActiveJobs = runningCount > 0 || pendingCount > 0;
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [localError, setLocalError] = useState("");
  const [selectedRunningJobId, setSelectedRunningJobId] = useState(null);

  // Get the most recent failed job error
  const latestFailedJob = failedJobs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
  const jobError = latestFailedJob?.error || "";
  const error = localError || jobError;

  // Get the selected running job for progress display
  const selectedRunningJob = videoJobs.find(job => job.id === selectedRunningJobId);
  const selectedJobProgress = selectedRunningJob?.progress || 0;

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
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(VIDEO_SELECTED_PROVIDER_KEY) || "",
  );

  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const searchInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const isOllamaLocalActive =
    cloudFilter === "local" && configuredProviderFilter === "ollama";
  const ollamaLocal = useOllamaLocal(isOllamaLocalActive);

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
    if (providers.length === 0) return;

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

  // Load prompt data from selected job
  useEffect(() => {
    if (selectedJob && selectedJob.type === "video") {
      setPrompt(selectedJob.prompt || "");

      // Handle failed job - show error
      if (selectedJob.status === "failed") {
        setLocalError(selectedJob.error || "Generation failed");
        setGeneratedVideo(null);
        setSelectedRunningJobId(null);
      } else if (selectedJob.status === "running" || selectedJob.status === "pending") {
        // Track running/pending job to show progress
        setSelectedRunningJobId(selectedJob.id);
        setLocalError("");
        setGeneratedVideo(null);

        const metadata = selectedJob.params?.metadata;
        const options = selectedJob.params?.options || {};
        const resolvedProvider = metadata?.provider || options.provider || "";

        // Prioritize modelKey from metadata, then check job.model
        let resolvedModelKey = metadata?.modelKey || "";

        // If no modelKey, try to find modelKey from availableModels using model ID
        if (!resolvedModelKey && selectedJob.model) {
          const matchingModel = availableModels.find(m => m.id === selectedJob.model);
          if (matchingModel) {
            resolvedModelKey = matchingModel.modelKey;
          } else {
            resolvedModelKey = selectedJob.model;
          }
        }

        // Set provider
        if (resolvedProvider) {
          setConfiguredProviderFilter(resolvedProvider);
          localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, resolvedProvider);
        }

        // Set model
        if (resolvedModelKey) {
          setSelectedModel(resolvedModelKey);
          localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, resolvedModelKey);
        }

        // Load options
        if (options.duration != null) {
          setDuration(Number(options.duration));
        }
        if (options.fps != null) {
          setFps(Number(options.fps));
        }

        // Load Wan-specific params
        if (options.wan) {
          if (options.wan.frames != null) setWanFrames(Number(options.wan.frames));
          if (options.wan.fps != null) setWanFps(Number(options.wan.fps));
          if (options.wan.fast != null) setWanFast(Boolean(options.wan.fast));
          if (options.wan.seed != null) setWanSeed(String(options.wan.seed));
          if (options.wan.resolution) setWanResolution(options.wan.resolution);
          if (options.wan.guidance_scale != null) setWanGuidanceScale(Number(options.wan.guidance_scale));
          if (options.wan.guidance_scale_2 != null) setWanGuidanceScale2(Number(options.wan.guidance_scale_2));
          if (options.wan.negative_prompt) setWanNegativePrompt(options.wan.negative_prompt);
        }
      } else {
        setLocalError("");
        setSelectedRunningJobId(null);

        const metadata = selectedJob.params?.metadata;
        const options = selectedJob.params?.options || {};
        const resolvedProvider = metadata?.provider || options.provider || "";

        // Prioritize modelKey from metadata, then check job.model
        let resolvedModelKey = metadata?.modelKey || "";

        // If no modelKey, try to find modelKey from availableModels using model ID
        if (!resolvedModelKey && selectedJob.model) {
          const matchingModel = availableModels.find(m => m.id === selectedJob.model);
          if (matchingModel) {
            resolvedModelKey = matchingModel.modelKey;
          } else {
            resolvedModelKey = selectedJob.model;
          }
        }

        // Set provider
        if (resolvedProvider) {
          setConfiguredProviderFilter(resolvedProvider);
          localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, resolvedProvider);
        }

        // Set model
        if (resolvedModelKey) {
          setSelectedModel(resolvedModelKey);
          localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, resolvedModelKey);
        }

        // Load options
        if (options.duration != null) {
          setDuration(Number(options.duration));
        }
        if (options.fps != null) {
          setFps(Number(options.fps));
        }

        // Load Wan-specific params
        if (options.wan) {
          if (options.wan.frames != null) setWanFrames(Number(options.wan.frames));
          if (options.wan.fps != null) setWanFps(Number(options.wan.fps));
          if (options.wan.fast != null) setWanFast(Boolean(options.wan.fast));
          if (options.wan.seed != null) setWanSeed(String(options.wan.seed));
          if (options.wan.resolution) setWanResolution(options.wan.resolution);
          if (options.wan.guidance_scale != null) setWanGuidanceScale(Number(options.wan.guidance_scale));
          if (options.wan.guidance_scale_2 != null) setWanGuidanceScale2(Number(options.wan.guidance_scale_2));
          if (options.wan.negative_prompt) setWanNegativePrompt(options.wan.negative_prompt);
        }

        // If job is completed, try to load result from history
        if (selectedJob.status === "completed" && selectedJob.params?.videoId) {
          const historyItem = getVideo(selectedJob.params.videoId);
          if (historyItem) {
            setGeneratedVideo(historyItem.result || null);
          }
        } else {
          setGeneratedVideo(null);
        }
      }

      // Clear selected job after loading
      setSelectedJob(null);
    }
  }, [selectedJob, setSelectedJob, getVideo, availableModels]);

  // Auto-load result when selected running job completes
  useEffect(() => {
    if (selectedRunningJobId) {
      const job = videoJobs.find(j => j.id === selectedRunningJobId);
      if (!job) {
        // Job was removed
        setSelectedRunningJobId(null);
        return;
      }

      if (job.status === "completed") {
        // Load the result from history
        if (job.params?.videoId) {
          const historyItem = getVideo(job.params.videoId);
          if (historyItem) {
            setGeneratedVideo(historyItem.result || null);
          }
        }
        setSelectedRunningJobId(null);
      } else if (job.status === "failed" || job.status === "cancelled") {
        // Show error or clear
        if (job.status === "failed") {
          setLocalError(job.error || "Generation failed");
        }
        setSelectedRunningJobId(null);
      }
    }
  }, [selectedRunningJobId, videoJobs, getVideo]);

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
    setLocalError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      setWanImageData(dataUrl);
      setWanImageSourceType("upload");
      setWanLibraryImageId("");
    } catch (err) {
      setLocalError(err.message || "Failed to process image file");
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
    if (!prompt.trim()) return;

    
    setLocalError("");
    setGeneratedVideo(null);

    const selectedInfo = availableModels.find(
      (m) => m.modelKey === selectedModel,
    );
    const effectiveProvider = isLocalModelSelected
      ? "ollama"
      : configuredProviderFilter || selectedInfo?.provider;

    if ((!selectedInfo && !isLocalModelSelected) || !effectiveProvider) {
      setLocalError("Please select a gateway and model first");
      
      return;
    }

    if (isWanI2VSelected) {
      const validationError = validateWanInputs();
      if (validationError) {
        setLocalError(validationError);
        
        return;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const modelIdToSend = isLocalModelSelected ? selectedModel : selectedInfo?.id;
      const localOpts = isLocalModelSelected ? { localOllamaUrl: ollamaLocal.localUrl } : {};

      const payload = {
        provider: effectiveProvider,
        modelKey: isLocalModelSelected ? undefined : selectedInfo?.modelKey,
        signal: controller.signal,
        ...localOpts,
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

      const response = await generateVideo(prompt, modelIdToSend, payload);

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
        setLocalError(response.error);
      } else {
        setLocalError("Unexpected response format");
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setLocalError("Video generation stopped.");
      } else {
        setLocalError(err.message || "Failed to generate video");
      }
    } finally {
      abortControllerRef.current = null;
      
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
    setIsLocalModelSelected(false);
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

  const handleLocalModelSelect = (model) => {
    setSelectedModel(model.id);
    setIsLocalModelSelected(true);
    setConfiguredProviderFilter("ollama");
    localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, model.id);
    localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, "ollama");
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
      setLocalError("");

      const metadata = videoItem?.metadata && typeof videoItem.metadata === "object"
        ? videoItem.metadata
        : null;
      const legacyModel = videoItem?.model || "";
      const legacyProvider =
        typeof legacyModel === "string" && legacyModel.includes(":")
          ? legacyModel.split(":")[0]
          : "";

      // Resolve modelKey - prioritize metadata.modelKey, then look up from availableModels
      let resolvedModelKey = "";
      const rawModelKey = metadata?.modelKey || legacyModel || "";

      if (rawModelKey && rawModelKey.includes(":")) {
        // Already a full modelKey with provider prefix
        resolvedModelKey = rawModelKey;
      } else if (rawModelKey) {
        // Just a model ID - look up the modelKey from availableModels
        const matchingModel = availableModels.find(m => m.id === rawModelKey || m.modelKey === rawModelKey);
        if (matchingModel) {
          resolvedModelKey = matchingModel.modelKey;
        } else {
          resolvedModelKey = rawModelKey;
        }
      }

      const resolvedProvider =
        (metadata && typeof metadata.provider === "string"
          ? metadata.provider
          : "") ||
        legacyProvider ||
        "";

      if (resolvedProvider) {
        setConfiguredProviderFilter(resolvedProvider);
        localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, resolvedProvider);
      }

      if (resolvedModelKey) {
        setSelectedModel(resolvedModelKey);
        localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, resolvedModelKey);
      }
    },
    [getVideo, availableModels],
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
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Video Generation</h2>
            <p className="text-xs text-gray-400">
              {isLocalModelSelected ? `${selectedModel} (Local)` : selectedModelInfo?.name || "Select a model"}
            </p>
            {isWanI2VSelected && (
              <p className="text-xs text-indigo-400 mt-0.5">
                Wan 2.2 I2V mode: image-to-video
              </p>
            )}
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowModelSelector(true)}
          className="bg-indigo-600 hover:bg-indigo-500"
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
                    localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, provider);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${configuredProviderFilter === provider
                      ? "bg-indigo-600 text-white"
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
                    className={`p-3 rounded-lg text-left transition-colors ${selectedModel === model.modelKey
                        ? "bg-indigo-600 text-white"
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
                  <button
                    onClick={() => setModelSearch("")}
                    className="mt-2 text-indigo-400 hover:text-indigo-300"
                  >
                    Clear filters
                  </button>
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
                  placeholder={
                    isWanI2VSelected
                      ? "Describe motion/style for your input image..."
                      : "Describe the video you want to generate..."
                  }
                  disabled={!isConfigured}
                  className="w-full bg-gray-800 text-white p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px]"
                />
              </div>

              {/* Wan I2V Controls or Video Preset Panel */}
              {isWanI2VSelected ? (
                <div className="space-y-3 p-3 bg-gray-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Wan 2.2 I2V Controls
                  </h3>

                  <div className="grid grid-cols-1 gap-3">
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
                          className={`px-3 py-1.5 rounded text-sm ${wanImageSourceType === "upload"
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-700 text-gray-200"
                            }`}
                        >
                          Upload
                        </button>
                        <button
                          onClick={() => setWanImageSourceType("library")}
                          className={`px-3 py-1.5 rounded text-sm ${wanImageSourceType === "library"
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
                            className="w-full h-32 object-cover"
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Resolution</label>
                        <select
                          value={wanResolution}
                          onChange={(e) => setWanResolution(e.target.value)}
                          className="w-full bg-gray-700 text-white p-2 rounded text-sm"
                        >
                          <option value="480p">480p</option>
                          <option value="720p">720p</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Frames: {wanFrames}</label>
                        <input
                          type="range"
                          min="25"
                          max="200"
                          value={wanFrames}
                          onChange={(e) => setWanFrames(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">FPS: {wanFps}</label>
                        <input
                          type="range"
                          min="8"
                          max="24"
                          value={wanFps}
                          onChange={(e) => setWanFps(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Guidance: {wanGuidanceScale}</label>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.1"
                          value={wanGuidanceScale}
                          onChange={(e) => setWanGuidanceScale(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
                      <input
                        type="text"
                        value={wanSeed}
                        onChange={(e) => setWanSeed(e.target.value)}
                        placeholder="Random"
                        className="w-full bg-gray-700 text-white p-2 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <VideoPresetPanel
                  duration={duration}
                  onDurationChange={setDuration}
                  fps={fps}
                  onFpsChange={setFps}
                  minDuration={1}
                  maxDuration={60}
                  minFps={12}
                  maxFps={60}
                />
              )}

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
                    Configure API keys in Admin panel to generate videos.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <div className="p-4 border-t border-gray-700">
            {/* Queue Status */}
            {hasActiveJobs && (
              <div className="mb-3 p-2 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {runningCount > 0 && (
                      <span className="flex items-center gap-1">
                        <LoadingSpinner size="sm" />
                        {runningCount} running
                      </span>
                    )}
                    {runningCount > 0 && pendingCount > 0 && <span className="mx-1">,</span>}
                    {pendingCount > 0 && (
                      <span className="text-gray-500">{pendingCount} queued</span>
                    )}
                  </span>
                  <button
                    onClick={() => cancelAllJobsByType("video")}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Stop All
                  </button>
                </div>
                {runningJobs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {runningJobs.slice(0, 3).map(job => (
                      <div key={job.id} className="flex items-center justify-between text-xs text-gray-500">
                        <span className="truncate max-w-[180px]">{job.prompt?.slice(0, 40) || "Generating..."}</span>
                        <div className="flex items-center gap-2">
                          <span>{job.progress || 10}%</span>
                          <button
                            onClick={() => cancelJob(job.id)}
                            className="text-red-400 hover:text-red-300"
                            title="Stop this job"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {pendingJobs.length > 0 && runningJobs.length < 3 && (
                  <div className="mt-1 text-xs text-gray-600">
                    Next: {pendingJobs.slice(0, 2).map(j => j.prompt?.slice(0, 30) || "Queued").join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Generate Button - Always available */}
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={!isConfigured || !prompt.trim() || (isWanI2VSelected && !wanImageData)}
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="w-full bg-indigo-600 hover:bg-indigo-500"
            >
              Generate Video
              {hasActiveJobs && pendingCount >= maxConcurrentJobs - runningCount && (
                <span className="ml-2 text-xs opacity-75">(Queued)</span>
              )}
            </Button>
          </div>
        </div>

        {/* Right Panel - Output */}
        <div className="hidden lg:flex lg:w-[55%] flex-col">
          <MediaOutputPanel
            mediaType="video"
            generatedMedia={generatedVideo}
            mediaHistory={videoHistory}
            getMediaIds={getVideoIds}
            onDownload={handleDownload}
            onPreview={(video) => {
              // Just preview the video without loading prompt
              setGeneratedVideo({
                url: video.url,
                model: video.model,
              });
            }}
            onReloadPrompt={(video) => {
              // Load prompt and model for regeneration
              setPrompt(video.prompt || "");
              setGeneratedVideo({
                url: video.url,
                model: video.model,
                prompt: video.prompt,
                duration: video.duration,
              });
              if (video.model) {
                const model = availableModels.find((m) => m.id === video.model);
                if (model) {
                  setSelectedModel(model.modelKey);
                  localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, model.modelKey);
                }
              }
            }}
            onDeleteMedia={deleteVideo}
            loading={hasActiveJobs || selectedRunningJobId !== null}
            error={error}
            progress={selectedRunningJobId !== null ? selectedJobProgress : null}
            onClearError={() => {
              setLocalError("");
              if (latestFailedJob) {
                removeJob(latestFailedJob.id);
              }
            }}
          />
        </div>
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
