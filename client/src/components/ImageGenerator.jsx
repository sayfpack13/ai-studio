import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useJobs } from "../context/JobContext";
import { enqueuePipeline, getModels } from "../services/api";
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { Button } from "./ui";
import { LoadingSpinner, GenerationProgress, ImagePresetPanel, MediaOutputPanel, getModelConfig } from "./shared";
import { Image, Sparkles, Download, RefreshCw, Film, Settings, X } from "lucide-react";

// Generate unique image ID
const generateImageId = () =>
  `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// LocalStorage keys for image page model persistence
const IMAGE_SELECTED_MODEL_KEY = "blackbox_ai_image_selected_model";
const IMAGE_SELECTED_PROVIDER_KEY = "blackbox_ai_image_selected_provider";

export default function ImageGenerator() {
  const navigate = useNavigate();
  const { 
    isConfigured, 
    saveImage, 
    providers, 
    getImage, 
    addLibraryAsset,
    imageHistory,
    getImageIds,
    deleteImage,
    clearAllImages,
  } = useApp();
  const { enqueueJob, getJobsByType, processQueue, updateJob, selectedJob, setSelectedJob, cancelAllJobsByType, cancelJob, removeJob, registerSaveFns, maxConcurrentJobs } = useJobs();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(IMAGE_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const imageJobs = getJobsByType("image");
  const runningJobs = imageJobs.filter(job => job.status === "running");
  const pendingJobs = imageJobs.filter(job => job.status === "pending");
  const failedJobs = imageJobs.filter(job => job.status === "failed");
  const runningCount = runningJobs.length;
  const pendingCount = pendingJobs.length;
  const hasActiveJobs = runningCount > 0 || pendingCount > 0;
  const [generatedImage, setGeneratedImage] = useState(null);
  const [localError, setLocalError] = useState("");
  const [selectedRunningJobId, setSelectedRunningJobId] = useState(null);

  // Get the most recent failed job error, only if recent
  const latestFailedJob = failedJobs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
  const latestCompletedJob = imageJobs
    .filter(job => job.status === "completed")
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
  const FIVE_MINUTES = 5 * 60 * 1000;
  const isRecentFailure = latestFailedJob && (Date.now() - (latestFailedJob.completedAt || 0)) < FIVE_MINUTES;
  const shouldShowFailedError = isRecentFailure && (
    !latestCompletedJob ||
    (latestFailedJob.completedAt || 0) > (latestCompletedJob.completedAt || 0)
  );
  const jobError = shouldShowFailedError ? (latestFailedJob?.error || "") : "";
  const error = localError || jobError;

  // Get the selected running job for progress display
  const selectedRunningJob = imageJobs.find(job => job.id === selectedRunningJobId);
  const selectedJobProgress = selectedRunningJob?.progress || 0;

  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [debugMode, setDebugMode] = useState(false);
  const [customParamsText, setCustomParamsText] = useState("");
  const [debugDetails, setDebugDetails] = useState(null);
  const [hunyuanParams, setHunyuanParams] = useState({
    seed: "",
    size: "1024x1024",
    steps: 20,
  });
  const [qwenImageParams, setQwenImageParams] = useState({
    seed: "",
    width: 1024,
    height: 1024,
    trueCfgScale: 4,
    negativePrompt: "",
    numInferenceSteps: 30,
  });
  const [zImageParams, setZImageParams] = useState({
    seed: "",
    shift: 3,
    guidanceScale: 0,
    maxSequenceLength: 512,
    numInferenceSteps: 9,
    width: 1024,
    height: 1024,
  });
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(IMAGE_SELECTED_PROVIDER_KEY) || "",
  );
  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const searchInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const isOllamaLocalActive =
    cloudFilter === "local" && configuredProviderFilter === "ollama";
  const ollamaLocal = useOllamaLocal(isOllamaLocalActive);

  const modelParameterHints = useMemo(
    () => ({
      "chutes/z-image-turbo": [
        "input_args.prompt",
        "input_args.seed",
        "input_args.width",
        "input_args.height",
        "input_args.shift",
        "input_args.guidance_scale",
        "input_args.max_sequence_length",
        "input_args.num_inference_steps",
      ],
      "chutes/hunyuan-image-3": [
        "input_args.prompt",
        "input_args.seed",
        "input_args.size",
        "input_args.steps",
      ],
      "chutes/Qwen-Image-2512": [
        "input_args.prompt",
        "input_args.seed",
        "input_args.width",
        "input_args.height",
        "input_args.true_cfg_scale",
        "input_args.negative_prompt",
        "input_args.num_inference_steps",
      ],
      "chutes/JuggernautXL": [
        "model",
        "prompt",
        "negative_prompt",
        "guidance_scale",
        "width",
        "height",
        "num_inference_steps",
      ],
    }),
    [],
  );

  // Focus search input when modal opens
  useEffect(() => {
    if (showModelSelector && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showModelSelector]);

  // Load models on mount
  useEffect(() => {
    if (providers.length === 0) return;

    const loadImageModels = async () => {
      try {
        const result = await getModels({ category: "image", provider: "all" });
        const nextModels = result.models || [];

        const configuredGateways = providers
          .filter((provider) => provider.configured)
          .map((provider) => provider.id);

        const persistedProvider = localStorage.getItem(
          IMAGE_SELECTED_PROVIDER_KEY,
        );
        const persistedModelKey = localStorage.getItem(
          IMAGE_SELECTED_MODEL_KEY,
        );

        const isProviderMatch = (model, providerId) =>
          model.provider === providerId ||
          model.configuredProvider === providerId;

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
          nextModels[0]?.configuredProvider ||
          nextModels[0]?.provider ||
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

        const firstGatewayModel = nextModels.find((model) =>
          isProviderMatch(model, firstGateway),
        );
        setSelectedModel(
          persistedModelForGateway || firstGatewayModel?.modelKey || "",
        );
      } catch (err) {
        console.error("Failed to load image models:", err);
      }
    };

    loadImageModels();
  }, [providers]);

  useEffect(() => {
    if (!configuredProviderFilter) {
      setAvailableModels([]);
      return;
    }

    const loadGatewayModels = async () => {
      try {
        const result = await getModels({
          category: "image",
          provider: configuredProviderFilter,
        });
        setAvailableModels(result.models || []);
      } catch (error) {
        console.error("Failed to load gateway image models:", error);
      }
    };

    loadGatewayModels();
  }, [configuredProviderFilter]);

  // Gateway providers from AppContext (these are the configured gateways)
  const gatewayProviders = useMemo(() => {
    return providers
      .filter((provider) => provider.configured)
      .map((p) => p.id)
      .sort();
  }, [providers]);

  const providerModels = useMemo(() => availableModels, [availableModels]);

  // Filter models based on search, selected gateway, and cloud/local filter
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
      localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, selectedModel);
    }
  }, [selectedModel]);

  // Register save function so jobs can save results after page reload
  useEffect(() => {
    registerSaveFns("image", saveImage);
  }, [registerSaveFns, saveImage]);

  useEffect(() => {
    if (configuredProviderFilter) {
      localStorage.setItem(
        IMAGE_SELECTED_PROVIDER_KEY,
        configuredProviderFilter,
      );
    }
  }, [configuredProviderFilter]);

  // Load prompt data from selected job
  useEffect(() => {
    if (selectedJob && selectedJob.type === "image") {
      setPrompt(selectedJob.prompt || "");
      setDebugDetails(null);

      // Handle failed job - show error
      if (selectedJob.status === "failed") {
        setLocalError(selectedJob.error || "Generation failed");
        setGeneratedImage(null);
        setSelectedRunningJobId(null);
      } else if (selectedJob.status === "running" || selectedJob.status === "pending") {
        // Track running/pending job to show progress
        setSelectedRunningJobId(selectedJob.id);
        setLocalError("");
        setGeneratedImage(null);

        const metadata = selectedJob.params?.metadata;
        const resolvedProvider = metadata?.provider || "";
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
          localStorage.setItem(IMAGE_SELECTED_PROVIDER_KEY, resolvedProvider);
        }

        // Set model
        if (resolvedModelKey) {
          setSelectedModel(resolvedModelKey);
          localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, resolvedModelKey);
        }

        // Load all metadata params
        if (metadata) {
          if (typeof metadata.negativePrompt === "string") {
            setNegativePrompt(metadata.negativePrompt);
          }

          if (metadata.width != null) {
            setWidth(Number(metadata.width));
          }

          if (metadata.height != null) {
            setHeight(Number(metadata.height));
          }

          if (metadata.hunyuanParams && typeof metadata.hunyuanParams === "object") {
            setHunyuanParams((prev) => ({ ...prev, ...metadata.hunyuanParams }));
          }

          if (metadata.qwenImageParams && typeof metadata.qwenImageParams === "object") {
            setQwenImageParams((prev) => ({ ...prev, ...metadata.qwenImageParams }));
          }

          if (metadata.zImageParams && typeof metadata.zImageParams === "object") {
            setZImageParams((prev) => ({ ...prev, ...metadata.zImageParams }));
          }

          if (typeof metadata.customParamsText === "string") {
            setCustomParamsText(metadata.customParamsText);
          }
        }
      } else {
        setLocalError("");
        setSelectedRunningJobId(null);

        const metadata = selectedJob.params?.metadata;
        const resolvedProvider = metadata?.provider || "";
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
          localStorage.setItem(IMAGE_SELECTED_PROVIDER_KEY, resolvedProvider);
        }

        // Set model
        if (resolvedModelKey) {
          setSelectedModel(resolvedModelKey);
          localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, resolvedModelKey);
        }

        // Load all metadata params
        if (metadata) {
          if (typeof metadata.negativePrompt === "string") {
            setNegativePrompt(metadata.negativePrompt);
          }

          if (metadata.width != null) {
            setWidth(Number(metadata.width));
          }

          if (metadata.height != null) {
            setHeight(Number(metadata.height));
          }

          if (metadata.hunyuanParams && typeof metadata.hunyuanParams === "object") {
            setHunyuanParams((prev) => ({ ...prev, ...metadata.hunyuanParams }));
          }

          if (metadata.qwenImageParams && typeof metadata.qwenImageParams === "object") {
            setQwenImageParams((prev) => ({ ...prev, ...metadata.qwenImageParams }));
          }

          if (metadata.zImageParams && typeof metadata.zImageParams === "object") {
            setZImageParams((prev) => ({ ...prev, ...metadata.zImageParams }));
          }

          if (typeof metadata.customParamsText === "string") {
            setCustomParamsText(metadata.customParamsText);
          }
        }

        // If job is completed, try to load result
        if (selectedJob.status === "completed") {
          // Use result directly from job (more reliable than history lookup)
          if (selectedJob.result?.url) {
            setGeneratedImage({
              url: selectedJob.result.url,
              revisedPrompt: selectedJob.result.revisedPrompt || selectedJob.params?.prompt,
            });
          } else if (selectedJob.params?.imageId) {
            // Fallback to history lookup
            const historyItem = getImage(selectedJob.params.imageId);
            if (historyItem) {
              setGeneratedImage(historyItem.result || null);
            }
          }
        } else {
          setGeneratedImage(null);
        }
      }

      // Clear selected job after loading
      setSelectedJob(null);
    }
  }, [selectedJob, setSelectedJob, getImage, availableModels]);

  // Auto-load result when selected running job completes
  useEffect(() => {
    if (selectedRunningJobId) {
      const job = imageJobs.find(j => j.id === selectedRunningJobId);
      if (!job) {
        // Job was removed
        setSelectedRunningJobId(null);
        return;
      }

      if (job.status === "completed") {
        // Use result directly from job (more reliable than history lookup)
        if (job.result?.url) {
          setGeneratedImage({
            url: job.result.url,
            revisedPrompt: job.result.revisedPrompt || job.params?.prompt,
          });
        } else if (job.params?.imageId) {
          // Fallback to history lookup
          const historyItem = getImage(job.params.imageId);
          if (historyItem) {
            setGeneratedImage(historyItem.result || null);
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
  }, [selectedRunningJobId, imageJobs, getImage]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setLocalError("");

    const selectedModelInfo = availableModels.find(
      (m) => m.modelKey === selectedModel,
    );
    const effectiveProvider = isLocalModelSelected
      ? "ollama"
      : configuredProviderFilter || selectedModelInfo?.provider;

    if ((!selectedModelInfo && !isLocalModelSelected) || !effectiveProvider) {
      setLocalError("Please select a gateway and model first");
      return;
    }

    let parsedCustomParams = {};
    if (customParamsText.trim()) {
      try {
        const parsed = JSON.parse(customParamsText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setLocalError("Custom parameters must be a JSON object");
          return;
        }
        parsedCustomParams = parsed;
      } catch {
        setLocalError("Custom parameters JSON is invalid");
        return;
      }
    }

    const zImageExtraParams = {};
    const isZImageTurbo = selectedModelInfo?.id === "chutes/z-image-turbo";

    if (isZImageTurbo) {
      if (zImageParams.seed !== "" && zImageParams.seed != null) {
        zImageExtraParams.seed = Number(zImageParams.seed);
      }
      if (zImageParams.shift !== "" && zImageParams.shift != null) {
        zImageExtraParams.shift = Number(zImageParams.shift);
      }
      if (
        zImageParams.maxSequenceLength !== "" &&
        zImageParams.maxSequenceLength != null
      ) {
        zImageExtraParams.max_sequence_length = Number(
          zImageParams.maxSequenceLength,
        );
      }
      // z-image-turbo uses aspect_ratio instead of width/height
      if (zImageParams.width) {
        zImageExtraParams.width = Number(zImageParams.width);
      }
      if (zImageParams.height) {
        zImageExtraParams.height = Number(zImageParams.height);
      }
    }

    if (selectedModelInfo?.id === "chutes/hunyuan-image-3") {
      const normalizedSteps = Number(hunyuanParams.steps);
      if (
        !Number.isInteger(normalizedSteps) ||
        normalizedSteps < 10 ||
        normalizedSteps > 100
      ) {
        setLocalError("Hunyuan steps must be an integer between 10 and 100");
        return;
      }

      const seedRaw = hunyuanParams.seed;
      const hasSeed = seedRaw !== "" && seedRaw != null;
      const normalizedSeed = hasSeed ? Number(seedRaw) : null;
      const maxSeed = 4294967295;

      if (hasSeed) {
        if (
          !Number.isInteger(normalizedSeed) ||
          normalizedSeed < 0 ||
          normalizedSeed > maxSeed
        ) {
          setLocalError(
            "Hunyuan seed must be an integer between 0 and 4294967295, or empty for random",
          );
          return;
        }
      }

      const normalizedSize =
        String(hunyuanParams.size || "").trim() || "1024x1024";

      const sizePattern = /^(auto|\d+x\d+|\d+:\d+|\d+)$/i;
      if (!sizePattern.test(normalizedSize)) {
        setLocalError(
          "Hunyuan size must be one of: 'auto', 'WxH' (e.g. 1280x768), 'W:H' (e.g. 16:9), or square pixels (e.g. 1024)",
        );
        return;
      }
    }

    const isHunyuanImage3 = selectedModelInfo?.id === "chutes/hunyuan-image-3";
    const isQwenImage2512 = selectedModelInfo?.id === "chutes/Qwen-Image-2512";

    const hunyuanInputArgs = isHunyuanImage3
      ? {
          prompt,
          size: String(hunyuanParams.size || "").trim() || "1024x1024",
          steps: Number(hunyuanParams.steps),
          seed:
            hunyuanParams.seed === "" || hunyuanParams.seed == null
              ? null
              : Number(hunyuanParams.seed),
        }
      : undefined;

    if (isQwenImage2512) {
      const seedRaw = qwenImageParams.seed;
      const hasSeed = seedRaw !== "" && seedRaw != null;
      const normalizedSeed = hasSeed ? Number(seedRaw) : null;
      const maxSeed = 4294967295;

      if (hasSeed) {
        if (
          !Number.isInteger(normalizedSeed) ||
          normalizedSeed < 0 ||
          normalizedSeed > maxSeed
        ) {
          setLocalError(
            "Qwen seed must be an integer between 0 and 4294967295, or empty for random",
          );
          return;
        }
      }

      const normalizedWidth = Number(qwenImageParams.width);
      if (
        !Number.isInteger(normalizedWidth) ||
        normalizedWidth < 128 ||
        normalizedWidth > 2048
      ) {
        setLocalError("Qwen width must be an integer between 128 and 2048");
        return;
      }

      const normalizedHeight = Number(qwenImageParams.height);
      if (
        !Number.isInteger(normalizedHeight) ||
        normalizedHeight < 128 ||
        normalizedHeight > 2048
      ) {
        setLocalError("Qwen height must be an integer between 128 and 2048");
        return;
      }

      const normalizedTrueCfgScale = Number(qwenImageParams.trueCfgScale);
      if (
        !Number.isFinite(normalizedTrueCfgScale) ||
        normalizedTrueCfgScale < 0 ||
        normalizedTrueCfgScale > 10
      ) {
        setLocalError("Qwen true_cfg_scale must be between 0 and 10");
        return;
      }

      const normalizedNumInferenceSteps = Number(
        qwenImageParams.numInferenceSteps,
      );
      if (
        !Number.isInteger(normalizedNumInferenceSteps) ||
        normalizedNumInferenceSteps < 5 ||
        normalizedNumInferenceSteps > 75
      ) {
        setLocalError(
          "Qwen num_inference_steps must be an integer between 5 and 75",
        );
        return;
      }
    }

    const qwenInputArgs = isQwenImage2512
      ? {
          prompt,
          seed:
            qwenImageParams.seed === "" || qwenImageParams.seed == null
              ? null
              : Number(qwenImageParams.seed),
          width: Number(qwenImageParams.width),
          height: Number(qwenImageParams.height),
          true_cfg_scale: Number(qwenImageParams.trueCfgScale),
          negative_prompt: String(qwenImageParams.negativePrompt || ""),
          num_inference_steps: Number(qwenImageParams.numInferenceSteps),
        }
      : undefined;

    // Determine if model supports width/height parameters
    const supportsWidthHeight =
      !isHunyuanImage3 && !isQwenImage2512 && !isZImageTurbo;

    const modelIdToSend = isLocalModelSelected ? selectedModel : selectedModelInfo?.id;
    const localOpts = isLocalModelSelected ? { localOllamaUrl: ollamaLocal.localUrl } : {};

    // Prepare job parameters
    const imageId = generateImageId();
    const jobParams = {
      prompt,
      model: modelIdToSend,
      imageId,
      options: {
        provider: effectiveProvider,
        modelKey: isLocalModelSelected ? undefined : selectedModelInfo?.modelKey,
        ...localOpts,
        negativePrompt:
          isHunyuanImage3 || isQwenImage2512 || isZImageTurbo
            ? undefined
            : negativePrompt,
        width: supportsWidthHeight ? width : undefined,
        height: supportsWidthHeight ? height : undefined,
        guidanceScale: isZImageTurbo
          ? Number(zImageParams.guidanceScale)
          : undefined,
        numInferenceSteps: isZImageTurbo
          ? Number(zImageParams.numInferenceSteps)
          : undefined,
        input_args: isHunyuanImage3
          ? hunyuanInputArgs
          : isQwenImage2512
            ? qwenInputArgs
            : isZImageTurbo
              ? {
                  prompt,
                  width: Number(zImageParams.width) || 1024,
                  height: Number(zImageParams.height) || 1024,
                  shift: Number(zImageParams.shift) || 3,
                  guidance_scale: Number(zImageParams.guidanceScale) || 0,
                  max_sequence_length:
                    Number(zImageParams.maxSequenceLength) || 512,
                  num_inference_steps:
                    Number(zImageParams.numInferenceSteps) || 9,
                  ...(zImageParams.seed &&
                    zImageParams.seed !== "" && {
                      seed: Number(zImageParams.seed),
                    }),
                }
              : undefined,
        debug: debugMode,
        extraParams: {
          ...zImageExtraParams,
          ...parsedCustomParams,
        },
      },
      metadata: {
        modelKey: selectedModelInfo?.modelKey || selectedModel,
        provider: effectiveProvider,
        negativePrompt: negativePrompt || "",
        width,
        height,
        hunyuanParams:
          selectedModelInfo?.id === "chutes/hunyuan-image-3"
            ? { ...hunyuanParams }
            : undefined,
        qwenImageParams:
          selectedModelInfo?.id === "chutes/Qwen-Image-2512"
            ? { ...qwenImageParams }
            : undefined,
        zImageParams:
          selectedModelInfo?.id === "chutes/z-image-turbo"
            ? { ...zImageParams }
            : undefined,
        customParamsText: customParamsText || "",
      },
    };

    // Enqueue the job with save callback
    const jobId = enqueueJob("image", jobParams, (result) => {
      saveImage(imageId, prompt, result, modelIdToSend, jobParams.metadata);
      addLibraryAsset({
        type: "image",
        source: "image",
        title: prompt.slice(0, 80) || "Generated image",
        url: result.url,
        metadata: {
          model: modelIdToSend,
          provider: effectiveProvider,
        },
      });
    });
    
    // Track this job to show result when complete
    setSelectedRunningJobId(jobId);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleHistorySelected = useCallback(
    (e) => {
      const imageId = e?.detail?.imageId;
      if (!imageId) return;

      const historyItem = getImage(imageId);
      if (!historyItem) return;

      setPrompt(historyItem.prompt || "");
      setGeneratedImage(historyItem.result || null);
      setLocalError("");
      setDebugDetails(null);

      const metadata =
        historyItem?.metadata && typeof historyItem.metadata === "object"
          ? historyItem.metadata
          : null;
      const legacyModel = historyItem?.model || "";
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
        localStorage.setItem(IMAGE_SELECTED_PROVIDER_KEY, resolvedProvider);
      }

      if (resolvedModelKey) {
        setSelectedModel(resolvedModelKey);
        localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, resolvedModelKey);
      }

      if (metadata) {
        if (typeof metadata.negativePrompt === "string") {
          setNegativePrompt(metadata.negativePrompt);
        }

        if (metadata.width != null) {
          setWidth(Number(metadata.width));
        }

        if (metadata.height != null) {
          setHeight(Number(metadata.height));
        }

        if (
          metadata.hunyuanParams &&
          typeof metadata.hunyuanParams === "object"
        ) {
          setHunyuanParams((prev) => ({
            ...prev,
            ...metadata.hunyuanParams,
          }));
        }

        if (
          metadata.qwenImageParams &&
          typeof metadata.qwenImageParams === "object"
        ) {
          setQwenImageParams((prev) => ({
            ...prev,
            ...metadata.qwenImageParams,
          }));
        }

        if (
          metadata.zImageParams &&
          typeof metadata.zImageParams === "object"
        ) {
          setZImageParams((prev) => ({
            ...prev,
            ...metadata.zImageParams,
          }));
        }

        if (typeof metadata.customParamsText === "string") {
          setCustomParamsText(metadata.customParamsText);
        }
      } else {
        setNegativePrompt("");
        setWidth(1024);
        setHeight(1024);
        setCustomParamsText("");
        setHunyuanParams({
          seed: "",
          size: "1024x1024",
          steps: 20,
        });
        setQwenImageParams({
          seed: "",
          width: 1024,
          height: 1024,
          trueCfgScale: 4,
          negativePrompt: "",
          numInferenceSteps: 30,
        });
        setZImageParams({
          seed: "",
          shift: 3,
          guidanceScale: 9,
          maxSequenceLength: 512,
          numInferenceSteps: 50,
        });

        if (
          resolvedModelKey === "chutes/hunyuan-image-3" ||
          resolvedModelKey === "chutes:chutes/hunyuan-image-3"
        ) {
          setHunyuanParams((prev) => ({
            ...prev,
            size: "1024x1024",
            steps: 20,
          }));
        }

        if (
          resolvedModelKey === "chutes/Qwen-Image-2512" ||
          resolvedModelKey === "chutes:chutes/Qwen-Image-2512"
        ) {
          setQwenImageParams((prev) => ({
            ...prev,
            width: 1024,
            height: 1024,
            trueCfgScale: 4,
            numInferenceSteps: 30,
            negativePrompt: "",
          }));
        }

        if (
          resolvedModelKey === "chutes/z-image-turbo" ||
          resolvedModelKey === "chutes:chutes/z-image-turbo"
        ) {
          setZImageParams((prev) => ({
            ...prev,
            guidanceScale: 9,
            numInferenceSteps: 50,
            shift: 3,
          }));
        }
      }
    },
    [getImage, availableModels],
  );

  useEffect(() => {
    window.addEventListener("imageHistorySelected", handleHistorySelected);
    return () => {
      window.removeEventListener("imageHistorySelected", handleHistorySelected);
    };
  }, [handleHistorySelected]);

  const handleDownload = () => {
    if (generatedImage?.url) {
      const link = document.createElement("a");
      link.href = generatedImage.url;
      link.download = `ai-image-${Date.now()}.png`;
      link.click();
    }
  };

  const handleImageToVideoPipeline = async () => {
    if (!generatedImage?.url || !prompt) return;
    // Navigate to video page with image data
    navigate("/video", {
      state: {
        imageSource: generatedImage.url,
        prompt: `${prompt} cinematic motion`,
      },
    });
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
      localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, model.modelKey);
    }
    if (resolvedProvider) {
      localStorage.setItem(IMAGE_SELECTED_PROVIDER_KEY, resolvedProvider);
    }

    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleLocalModelSelect = (model) => {
    setSelectedModel(model.id);
    setIsLocalModelSelected(true);
    setConfiguredProviderFilter("ollama");
    localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, model.id);
    localStorage.setItem(IMAGE_SELECTED_PROVIDER_KEY, "ollama");
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleCloseModelSelector = () => {
    setShowModelSelector(false);
    setModelSearch("");
  };

  const selectedModelInfo = availableModels.find(
    (m) => m.modelKey === selectedModel,
  );
  const selectedModelHints = selectedModelInfo
    ? modelParameterHints[selectedModelInfo.id]
    : null;

  // Unified params for ImagePresetPanel
  const imageParams = useMemo(() => {
    const modelId = selectedModelInfo?.id;
    if (modelId === "chutes/z-image-turbo") return zImageParams;
    if (modelId === "chutes/hunyuan-image-3") return hunyuanParams;
    if (modelId === "chutes/Qwen-Image-2512") return qwenImageParams;
    return { width, height, steps, guidanceScale, negativePrompt };
  }, [selectedModelInfo?.id, zImageParams, hunyuanParams, qwenImageParams, width, height, steps, guidanceScale, negativePrompt]);

  const handleImageParamsChange = useCallback((updater) => {
    const modelId = selectedModelInfo?.id;
    const newParams = typeof updater === "function" ? updater(imageParams) : updater;

    if (modelId === "chutes/z-image-turbo") {
      setZImageParams(newParams);
    } else if (modelId === "chutes/hunyuan-image-3") {
      setHunyuanParams(newParams);
    } else if (modelId === "chutes/Qwen-Image-2512") {
      setQwenImageParams(newParams);
    } else {
      if (newParams.width !== undefined) setWidth(newParams.width);
      if (newParams.height !== undefined) setHeight(newParams.height);
      if (newParams.steps !== undefined) setSteps(newParams.steps);
      if (newParams.guidanceScale !== undefined) setGuidanceScale(newParams.guidanceScale);
      if (newParams.negativePrompt !== undefined) setNegativePrompt(newParams.negativePrompt);
    }
  }, [selectedModelInfo?.id, imageParams]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Image className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Image Generation</h2>
            <p className="text-xs text-gray-400">
              {isLocalModelSelected ? `${selectedModel} (Local)` : selectedModelInfo?.name || "Select a model"}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowModelSelector(true)}
        >
          Change Model
        </Button>
      </div>

      {/* Model Selector Dropdown */}
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
                Select Image Model
              </h3>
              <button
                onClick={handleCloseModelSelector}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
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
                  className="w-full bg-gray-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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

            {/* Provider Filter */}
            <div className="mb-4 flex flex-wrap gap-2">
              {gatewayProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => {
                    setConfiguredProviderFilter(provider);
                    localStorage.setItem(IMAGE_SELECTED_PROVIDER_KEY, provider);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    configuredProviderFilter === provider
                      ? "bg-purple-600 text-white"
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
                        ? "bg-purple-600 text-white"
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
                        {model.free && (
                          <span className="text-xs px-2 py-0.5 bg-green-600 rounded">
                            Free
                          </span>
                        )}
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
                    onClick={() => {
                      setModelSearch("");
                    }}
                    className="mt-2 text-purple-400 hover:text-purple-300"
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
                  placeholder="Describe the image you want to generate..."
                  disabled={!isConfigured}
                  className="w-full bg-gray-800 text-white p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[120px]"
                />
              </div>

              {/* Image Preset Panel */}
              <ImagePresetPanel
                modelId={selectedModelInfo?.id || "default"}
                params={imageParams}
                onParamsChange={handleImageParamsChange}
              />

              {/* Debug & Custom JSON */}
              <div className="p-3 bg-gray-800 rounded-lg space-y-3">
                {selectedModelHints && selectedModelHints.length > 0 && (
                  <div className="text-xs text-gray-300 bg-gray-700/60 rounded p-2">
                    Suggested params: {selectedModelHints.join(", ")}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Custom JSON Parameters
                  </label>
                  <textarea
                    value={customParamsText}
                    onChange={(e) => setCustomParamsText(e.target.value)}
                    placeholder='{"seed": 42}'
                    className="w-full bg-gray-700 text-white p-2 rounded resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                    rows={3}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                    className="rounded"
                  />
                  Debug mode
                </label>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-900/50 text-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Debug Details */}
              {debugDetails && (
                <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                  <p className="text-sm text-purple-300 font-medium mb-2">Debug Details</p>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                    {JSON.stringify(debugDetails, null, 2)}
                  </pre>
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
                    Configure API keys in Admin panel to generate images.
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
                    onClick={() => cancelAllJobsByType("image")}
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
              disabled={!isConfigured || !prompt.trim()}
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="w-full bg-purple-600 hover:bg-purple-500"
            >
              Generate Image
              {hasActiveJobs && pendingCount >= maxConcurrentJobs - runningCount && (
                <span className="ml-2 text-xs opacity-75">(Queued)</span>
              )}
            </Button>
          </div>
        </div>

        {/* Right Panel - Output */}
        <div className="hidden lg:flex lg:w-[55%] flex-col">
          <MediaOutputPanel
            mediaType="image"
            generatedMedia={generatedImage}
            mediaHistory={imageHistory}
            getMediaIds={getImageIds}
            onDownload={handleDownload}
            onSendToVideo={handleImageToVideoPipeline}
            onPreview={(image) => {
              // Just preview the image without loading prompt
              setGeneratedImage({
                url: image.url,
                model: image.model,
              });
            }}
            onReloadPrompt={(image) => {
              // Load prompt and model for regeneration
              setPrompt(image.prompt || "");
              setGeneratedImage({
                url: image.url,
                revisedPrompt: image.revisedPrompt,
                model: image.model,
                prompt: image.prompt,
              });
              if (image.model) {
                const model = availableModels.find((m) => m.id === image.model);
                if (model) {
                  setSelectedModel(model.modelKey);
                  localStorage.setItem(IMAGE_SELECTED_MODEL_KEY, model.modelKey);
                }
              }
            }}
            onDeleteMedia={deleteImage}
            onClearHistory={clearAllImages}
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
    </div>
  );
}
