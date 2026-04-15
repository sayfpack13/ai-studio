import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useJobs } from "../context/JobContext";
import { enqueuePipeline, getModels, resolveAssetUrl } from "../services/api";
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { Button } from "./ui";
import {
  LoadingSpinner,
  GenerationProgress,
  ImagePresetPanel,
  MediaOutputPanel,
  CollapsiblePanel,
  getModelConfig,
} from "./shared";
import {
  Image,
  Sparkles,
  Download,
  RefreshCw,
  Film,
  Settings,
  X,
  Search,
} from "lucide-react";

// Generate unique image ID
const generateImageId = () =>
  `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// LocalStorage keys for image page model persistence
const IMAGE_SELECTED_MODEL_KEY = "blackbox_ai_image_selected_model";
const IMAGE_SELECTED_PROVIDER_KEY = "blackbox_ai_image_selected_provider";
const IMAGE_HF_MODE_KEY = "blackbox_ai_image_hf_mode";
const IMAGE_HF_SPACE_TARGET_KEY = "blackbox_ai_image_hf_space_target";
const IMAGE_HF_CUSTOM_SPACE_KEY = "blackbox_ai_image_hf_custom_space";
const PUBLIC_TONGYI_SPACE_ID = "mrfakename/Z-Image-Turbo";
const PUBLIC_FLUX_SPACE_ID = "black-forest-labs/FLUX.1-dev";

const toHuggingFaceSpacePageUrl = (spaceValue) => {
  const raw = String(spaceValue || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://huggingface.co/spaces/${raw}`;
};

const parseSizeToDimensions = (rawSize, fallbackWidth = 1024, fallbackHeight = 1024) => {
  const match = String(rawSize || "").match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) {
    return { width: fallbackWidth, height: fallbackHeight };
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  return {
    width: Number.isFinite(width) ? width : fallbackWidth,
    height: Number.isFinite(height) ? height : fallbackHeight,
  };
};

const reduceRatio = (w, h) => {
  const a = Math.max(1, Math.round(Number(w) || 1));
  const b = Math.max(1, Math.round(Number(h) || 1));
  const gcd = (x, y) => (y === 0 ? x : gcd(y, x % y));
  const d = gcd(a, b);
  return `${Math.round(a / d)}:${Math.round(b / d)}`;
};

const buildWxHSize = (width, height) =>
  `${Math.round(Number(width) || 1024)}x${Math.round(Number(height) || 1024)}`;

const buildTongyiResolution = (width, height) => {
  const w = Math.round(Number(width) || 1024);
  const h = Math.round(Number(height) || 1024);
  return `${w}x${h} ( ${reduceRatio(w, h)} )`;
};

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
  const {
    enqueueJob,
    getJobsByType,
    processQueue,
    updateJob,
    selectedJob,
    setSelectedJob,
    cancelAllJobsByType,
    cancelJob,
    removeJob,
    registerSaveFns,
    maxConcurrentJobs,
  } = useJobs();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(IMAGE_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const imageJobs = getJobsByType("image");
  const runningJobs = imageJobs.filter((job) => job.status === "running");
  const pendingJobs = imageJobs.filter((job) => job.status === "pending");
  const failedJobs = imageJobs.filter((job) => job.status === "failed");
  const runningCount = runningJobs.length;
  const pendingCount = pendingJobs.length;
  const hasActiveJobs = runningCount > 0 || pendingCount > 0;
  const [generatedImage, setGeneratedImage] = useState(null);
  const [localError, setLocalError] = useState("");
  const [selectedRunningJobId, setSelectedRunningJobId] = useState(null);

  // Only show error from localError (current generation) or when a job is explicitly selected
  // Don't automatically show errors from failed jobs in the list
  const error = localError;

  // Clear local error on component mount to prevent stale errors on page reload
  useEffect(() => {
    setLocalError("");
  }, []);

  // Auto-select the first running or pending image job after page reload to show progress
  useEffect(() => {
    // Only auto-select if no job is currently selected
    if (selectedRunningJobId) return;

    // Prioritize running jobs, then pending jobs
    const firstRunningJob = runningJobs[0];
    const firstPendingJob = pendingJobs[0];

    if (firstRunningJob) {
      setSelectedRunningJobId(firstRunningJob.id);
    } else if (firstPendingJob) {
      setSelectedRunningJobId(firstPendingJob.id);
    }
  }, [runningJobs, pendingJobs, selectedRunningJobId]);

  // Get the selected running job for progress display
  const selectedRunningJob = imageJobs.find(
    (job) => job.id === selectedRunningJobId,
  );
  const selectedJobProgress = selectedRunningJob?.progress || 0;

  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(4.0);
  const [seed, setSeed] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [customParamsText, setCustomParamsText] = useState("");
  const [debugDetails, setDebugDetails] = useState(null);
  const [hunyuanParams, setHunyuanParams] = useState({
    seed: "",
    size: "1024x1024",
    width: 1024,
    height: 1024,
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
  const [tongyiParams, setTongyiParams] = useState({
    size: "1024x1024 ( 1:1 )",
    width: 1024,
    height: 1024,
    seed: 42,
    randomSeed: true,
    steps: 8,
    shift: 3,
  });
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(IMAGE_SELECTED_PROVIDER_KEY) || "",
  );
  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const [hfMode, setHfMode] = useState(
    () => localStorage.getItem(IMAGE_HF_MODE_KEY) || "inference",
  );
  const [hfSpaceTarget, setHfSpaceTarget] = useState(
    () => localStorage.getItem(IMAGE_HF_SPACE_TARGET_KEY) || "public",
  );
  const [hfCustomSpace, setHfCustomSpace] = useState(
    () => localStorage.getItem(IMAGE_HF_CUSTOM_SPACE_KEY) || "",
  );
  const [spaceUrlCopied, setSpaceUrlCopied] = useState(false);
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

  useEffect(() => {
    localStorage.setItem(IMAGE_HF_MODE_KEY, hfMode);
  }, [hfMode]);

  useEffect(() => {
    localStorage.setItem(IMAGE_HF_SPACE_TARGET_KEY, hfSpaceTarget);
  }, [hfSpaceTarget]);

  useEffect(() => {
    localStorage.setItem(IMAGE_HF_CUSTOM_SPACE_KEY, hfCustomSpace);
  }, [hfCustomSpace]);

  // Load prompt data from selected job
  useEffect(() => {
    if (selectedJob && selectedJob.type === "image") {
      setPrompt(selectedJob.prompt || "");
      setDebugDetails(null);

      // Handle failed job - show error
      if (selectedJob.status === "failed") {
        setLocalError(selectedJob.error || "Generation failed");
        setSelectedRunningJobId(null);
      } else if (
        selectedJob.status === "running" ||
        selectedJob.status === "pending"
      ) {
        // Track running/pending job to show progress
        // Don't clear generatedImage - let user continue viewing previous/historical generations
        setSelectedRunningJobId(selectedJob.id);
        setLocalError("");

        const metadata = selectedJob.params?.metadata;
        const resolvedProvider = metadata?.provider || "";
        // Prioritize modelKey from metadata, then check job.model
        let resolvedModelKey = metadata?.modelKey || "";

        // If no modelKey, try to find modelKey from availableModels using model ID
        if (!resolvedModelKey && selectedJob.model) {
          const matchingModel = availableModels.find(
            (m) => m.id === selectedJob.model,
          );
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

          if (
            metadata.hunyuanParams &&
            typeof metadata.hunyuanParams === "object"
          ) {
            const sizeFromMeta =
              metadata.hunyuanParams.size ||
              buildWxHSize(metadata.hunyuanParams.width, metadata.hunyuanParams.height);
            const dims = parseSizeToDimensions(sizeFromMeta, 1024, 1024);
            setHunyuanParams((prev) => ({
              ...prev,
              ...metadata.hunyuanParams,
              size: sizeFromMeta,
              width: Number(metadata.hunyuanParams.width) || dims.width,
              height: Number(metadata.hunyuanParams.height) || dims.height,
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
            setZImageParams((prev) => ({ ...prev, ...metadata.zImageParams }));
          }

          if (typeof metadata.customParamsText === "string") {
            setCustomParamsText(metadata.customParamsText);
          }

          if (
            metadata.tongyiParams &&
            typeof metadata.tongyiParams === "object"
          ) {
            const sizeFromMeta =
              metadata.tongyiParams.size ||
              metadata.tongyiParams.resolution ||
              buildTongyiResolution(metadata.tongyiParams.width, metadata.tongyiParams.height);
            const dims = parseSizeToDimensions(sizeFromMeta, 1024, 1024);
            setTongyiParams((prev) => ({
              ...prev,
              ...metadata.tongyiParams,
              size: sizeFromMeta,
              width: Number(metadata.tongyiParams.width) || dims.width,
              height: Number(metadata.tongyiParams.height) || dims.height,
            }));
          }

          if (
            typeof metadata.hfMode === "string" &&
            ["inference", "space"].includes(metadata.hfMode)
          ) {
            setHfMode(metadata.hfMode);
          }

          if (
            typeof metadata.hfSpaceTarget === "string" &&
            ["public", "custom"].includes(metadata.hfSpaceTarget)
          ) {
            setHfSpaceTarget(metadata.hfSpaceTarget);
          }

          if (typeof metadata.hfCustomSpace === "string") {
            setHfCustomSpace(metadata.hfCustomSpace);
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
          const matchingModel = availableModels.find(
            (m) => m.id === selectedJob.model,
          );
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

          if (
            metadata.hunyuanParams &&
            typeof metadata.hunyuanParams === "object"
          ) {
            const sizeFromMeta =
              metadata.hunyuanParams.size ||
              buildWxHSize(metadata.hunyuanParams.width, metadata.hunyuanParams.height);
            const dims = parseSizeToDimensions(sizeFromMeta, 1024, 1024);
            setHunyuanParams((prev) => ({
              ...prev,
              ...metadata.hunyuanParams,
              size: sizeFromMeta,
              width: Number(metadata.hunyuanParams.width) || dims.width,
              height: Number(metadata.hunyuanParams.height) || dims.height,
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
            setZImageParams((prev) => ({ ...prev, ...metadata.zImageParams }));
          }

          if (typeof metadata.customParamsText === "string") {
            setCustomParamsText(metadata.customParamsText);
          }

          if (
            metadata.tongyiParams &&
            typeof metadata.tongyiParams === "object"
          ) {
            const sizeFromMeta =
              metadata.tongyiParams.size ||
              metadata.tongyiParams.resolution ||
              buildTongyiResolution(metadata.tongyiParams.width, metadata.tongyiParams.height);
            const dims = parseSizeToDimensions(sizeFromMeta, 1024, 1024);
            setTongyiParams((prev) => ({
              ...prev,
              ...metadata.tongyiParams,
              size: sizeFromMeta,
              width: Number(metadata.tongyiParams.width) || dims.width,
              height: Number(metadata.tongyiParams.height) || dims.height,
            }));
          }

          if (
            typeof metadata.hfMode === "string" &&
            ["inference", "space"].includes(metadata.hfMode)
          ) {
            setHfMode(metadata.hfMode);
          }

          if (
            typeof metadata.hfSpaceTarget === "string" &&
            ["public", "custom"].includes(metadata.hfSpaceTarget)
          ) {
            setHfSpaceTarget(metadata.hfSpaceTarget);
          }

          if (typeof metadata.hfCustomSpace === "string") {
            setHfCustomSpace(metadata.hfCustomSpace);
          }
        }

        // If job is completed, try to load result
        if (selectedJob.status === "completed") {
          // Use result directly from job (more reliable than history lookup)
          if (selectedJob.result?.url) {
            setGeneratedImage({
              url: selectedJob.result.url,
              revisedPrompt:
                selectedJob.result.revisedPrompt || selectedJob.params?.prompt,
            });
          } else if (selectedJob.params?.imageId) {
            // Fallback to history lookup
            const historyItem = getImage(selectedJob.params.imageId);
            if (historyItem) {
              setGeneratedImage(historyItem.result || null);
            }
          }
        }
        // Don't clear generatedImage if job has no result - preserve current display
      }

      // Clear selected job after loading
      setSelectedJob(null);
    }
  }, [selectedJob, setSelectedJob, getImage, availableModels]);

  // Auto-load result when selected running job completes
  useEffect(() => {
    if (selectedRunningJobId) {
      const job = imageJobs.find((j) => j.id === selectedRunningJobId);
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
    const isHuggingFaceSelection =
      !isLocalModelSelected && effectiveProvider === "huggingface";

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
        String(hunyuanParams.size || "").trim() ||
        buildWxHSize(hunyuanParams.width, hunyuanParams.height);

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
          size:
            String(hunyuanParams.size || "").trim() ||
            buildWxHSize(hunyuanParams.width, hunyuanParams.height),
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

    const modelIdToSend = isLocalModelSelected
      ? selectedModel
      : selectedModelInfo?.id;
    const localOpts = isLocalModelSelected
      ? { localOllamaUrl: ollamaLocal.localUrl }
      : {};

    // Prepare job parameters
    const imageId = generateImageId();
    const normalizedHfModelId = String(selectedModelInfo?.id || "").replace(
      /^huggingface\//i,
      "",
    );
    const jobParams = {
      prompt,
      model: modelIdToSend,
      imageId,
      options: {
        provider: effectiveProvider,
        modelKey: isLocalModelSelected
          ? undefined
          : selectedModelInfo?.modelKey,
        ...localOpts,
        negativePrompt:
          isHunyuanImage3 || isQwenImage2512 || isZImageTurbo
            ? undefined
            : negativePrompt,
        width: supportsWidthHeight ? width : undefined,
        height: supportsWidthHeight ? height : undefined,
        guidanceScale: isZImageTurbo
          ? Number(zImageParams.guidanceScale)
          : Number(guidanceScale),
        numInferenceSteps: isZImageTurbo
          ? Number(zImageParams.numInferenceSteps)
          : Number(steps),
        seed:
          seed === "" || seed == null
            ? undefined
            : Number(seed),
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
        hfModel: isHuggingFaceSelection ? normalizedHfModelId : undefined,
        resolution: isTongyiZImageTurbo
          ? buildTongyiResolution(tongyiParams.width, tongyiParams.height)
          : undefined,
        seed: isTongyiZImageTurbo ? Number(tongyiParams.seed) : undefined,
        steps: isTongyiZImageTurbo ? Number(tongyiParams.steps) : undefined,
        shift: isTongyiZImageTurbo ? Number(tongyiParams.shift) : undefined,
        random_seed: isTongyiZImageTurbo ? Boolean(tongyiParams.randomSeed) : undefined,
        tongyiParams: isTongyiZImageTurbo
          ? {
              size: buildTongyiResolution(tongyiParams.width, tongyiParams.height),
              width: Number(tongyiParams.width),
              height: Number(tongyiParams.height),
              seed: Number(tongyiParams.seed),
              steps: Number(tongyiParams.steps),
              shift: Number(tongyiParams.shift),
              random_seed: Boolean(tongyiParams.randomSeed),
            }
          : undefined,
        hfMode: isHuggingFaceSelection ? hfMode : undefined,
        hfSpaceTarget:
          isHFSpaceModel && isHuggingFaceSelection && hfMode === "space"
            ? hfSpaceTarget
            : undefined,
        hfCustomSpace:
          isHFSpaceModel &&
          isHuggingFaceSelection &&
          hfMode === "space" &&
          hfSpaceTarget === "custom"
            ? hfCustomSpace.trim()
            : undefined,
      },
      metadata: {
        modelKey: selectedModelInfo?.modelKey || selectedModel,
        provider: effectiveProvider,
        negativePrompt: negativePrompt || "",
        width,
        height,
        hunyuanParams:
          selectedModelInfo?.id === "chutes/hunyuan-image-3"
            ? {
                ...hunyuanParams,
                size:
                  String(hunyuanParams.size || "").trim() ||
                  buildWxHSize(hunyuanParams.width, hunyuanParams.height),
                width: Number(hunyuanParams.width),
                height: Number(hunyuanParams.height),
              }
            : undefined,
        qwenImageParams:
          selectedModelInfo?.id === "chutes/Qwen-Image-2512"
            ? { ...qwenImageParams }
            : undefined,
        zImageParams:
          selectedModelInfo?.id === "chutes/z-image-turbo"
            ? { ...zImageParams }
            : undefined,
        tongyiParams: isTongyiZImageTurbo
          ? {
              size: buildTongyiResolution(tongyiParams.width, tongyiParams.height),
              width: Number(tongyiParams.width),
              height: Number(tongyiParams.height),
              seed: Number(tongyiParams.seed),
              steps: Number(tongyiParams.steps),
              shift: Number(tongyiParams.shift),
              randomSeed: Boolean(tongyiParams.randomSeed),
            }
          : undefined,
        hfMode: isHuggingFaceSelection ? hfMode : undefined,
        hfSpaceTarget:
          isHFSpaceModel && isHuggingFaceSelection && hfMode === "space"
            ? hfSpaceTarget
            : undefined,
        hfCustomSpace:
          isHFSpaceModel &&
          isHuggingFaceSelection &&
          hfMode === "space" &&
          hfSpaceTarget === "custom"
            ? hfCustomSpace.trim()
            : undefined,
        customParamsText: customParamsText || "",
      },
    };

    // Enqueue the job with callback for UI updates (history saving is handled by registered saveImage)
    const jobId = enqueueJob("image", jobParams, (resultData) => {
      const imageData = {
        url: resultData.url,
        revisedPrompt: resultData.revisedPrompt || prompt,
      };
      setGeneratedImage(imageData);

      // Add to library
      addLibraryAsset({
        type: "image",
        source: "image",
        title: prompt.slice(0, 80) || "Generated image",
        url: imageData.url,
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

      // Clear selectedRunningJobId so loading state is correct
      setSelectedRunningJobId(null);
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
        const matchingModel = availableModels.find(
          (m) => m.id === rawModelKey || m.modelKey === rawModelKey,
        );
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
          const sizeFromMeta =
            metadata.hunyuanParams.size ||
            buildWxHSize(metadata.hunyuanParams.width, metadata.hunyuanParams.height);
          const dims = parseSizeToDimensions(sizeFromMeta, 1024, 1024);
          setHunyuanParams((prev) => ({
            ...prev,
            ...metadata.hunyuanParams,
            size: sizeFromMeta,
            width: Number(metadata.hunyuanParams.width) || dims.width,
            height: Number(metadata.hunyuanParams.height) || dims.height,
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

        if (
          metadata.tongyiParams &&
          typeof metadata.tongyiParams === "object"
        ) {
          const sizeFromMeta =
            metadata.tongyiParams.size ||
            metadata.tongyiParams.resolution ||
            buildTongyiResolution(metadata.tongyiParams.width, metadata.tongyiParams.height);
          const dims = parseSizeToDimensions(sizeFromMeta, 1024, 1024);
          setTongyiParams((prev) => ({
            ...prev,
            ...metadata.tongyiParams,
            size: sizeFromMeta,
            width: Number(metadata.tongyiParams.width) || dims.width,
            height: Number(metadata.tongyiParams.height) || dims.height,
          }));
        }

        if (
          typeof metadata.hfMode === "string" &&
          ["inference", "space"].includes(metadata.hfMode)
        ) {
          setHfMode(metadata.hfMode);
        }

        if (
          typeof metadata.hfSpaceTarget === "string" &&
          ["public", "custom"].includes(metadata.hfSpaceTarget)
        ) {
          setHfSpaceTarget(metadata.hfSpaceTarget);
        }

        if (typeof metadata.hfCustomSpace === "string") {
          setHfCustomSpace(metadata.hfCustomSpace);
        }
      } else {
        setNegativePrompt("");
        setWidth(1024);
        setHeight(1024);
        setCustomParamsText("");
        setHunyuanParams({
          seed: "",
          size: "1024x1024",
          width: 1024,
          height: 1024,
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
        setTongyiParams({
          size: "1024x1024 ( 1:1 )",
          width: 1024,
          height: 1024,
          seed: 42,
          randomSeed: true,
          steps: 8,
          shift: 3,
        });
        // Keep persisted HuggingFace mode/Space target preferences.

        if (
          resolvedModelKey === "chutes/hunyuan-image-3" ||
          resolvedModelKey === "chutes:chutes/hunyuan-image-3"
        ) {
          setHunyuanParams((prev) => ({
            ...prev,
            size: "1024x1024",
            width: 1024,
            height: 1024,
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
      link.href = resolveAssetUrl(generatedImage.url);
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
  const isTongyiZImageTurbo =
    selectedModelInfo?.id === "huggingface/Tongyi-MAI/Z-Image-Turbo";
  const isFluxModel =
    selectedModelInfo?.id === "huggingface/black-forest-labs/FLUX.1-dev";
  const isHFSpaceModel = isTongyiZImageTurbo || isFluxModel;
  const selectedProviderForModel =
    selectedModelInfo?.configuredProvider ||
    selectedModelInfo?.provider ||
    configuredProviderFilter ||
    "";
  const isHuggingFaceSelection =
    !isLocalModelSelected && selectedProviderForModel === "huggingface";
  const selectedModelHints = selectedModelInfo
    ? modelParameterHints[selectedModelInfo.id]
    : null;
  const activeTongyiSpaceValue =
    hfSpaceTarget === "custom" && hfCustomSpace.trim()
      ? hfCustomSpace.trim()
      : PUBLIC_TONGYI_SPACE_ID;
  const activeTongyiSpaceUrl = toHuggingFaceSpacePageUrl(activeTongyiSpaceValue);

  const activeFluxSpaceValue =
    hfSpaceTarget === "custom" && hfCustomSpace.trim()
      ? hfCustomSpace.trim()
      : PUBLIC_FLUX_SPACE_ID;
  const activeFluxSpaceUrl = toHuggingFaceSpacePageUrl(activeFluxSpaceValue);

  const activeSpaceLabel = isFluxModel
    ? `FLUX.1-dev`
    : `Tongyi Z-Image-Turbo`;
  const activeSpaceValue = isFluxModel
    ? activeFluxSpaceValue
    : activeTongyiSpaceValue;
  const activeSpaceUrl = isFluxModel
    ? activeFluxSpaceUrl
    : activeTongyiSpaceUrl;
  const activePublicSpaceId = isFluxModel
    ? PUBLIC_FLUX_SPACE_ID
    : PUBLIC_TONGYI_SPACE_ID;

  const handleCopySpaceUrl = useCallback(async () => {
    if (!activeSpaceUrl) return;
    try {
      await navigator.clipboard.writeText(activeSpaceUrl);
      setSpaceUrlCopied(true);
      setTimeout(() => setSpaceUrlCopied(false), 1200);
    } catch {
      setSpaceUrlCopied(false);
    }
  }, [activeSpaceUrl]);

  // Unified params for ImagePresetPanel
  const imageParams = useMemo(() => {
    const modelId = selectedModelInfo?.id;
    if (modelId === "chutes/z-image-turbo") return zImageParams;
    if (modelId === "chutes/hunyuan-image-3") return hunyuanParams;
    if (modelId === "chutes/Qwen-Image-2512") return qwenImageParams;
    if (modelId === "huggingface/Tongyi-MAI/Z-Image-Turbo") return tongyiParams;
    return { width, height, steps, guidanceScale, negativePrompt, seed };
  }, [
    selectedModelInfo?.id,
    zImageParams,
    hunyuanParams,
    qwenImageParams,
    tongyiParams,
    width,
    height,
    steps,
    guidanceScale,
    negativePrompt,
    seed,
  ]);

  const handleImageParamsChange = useCallback(
    (updater) => {
      const modelId = selectedModelInfo?.id;
      const newParams =
        typeof updater === "function" ? updater(imageParams) : updater;

      if (modelId === "chutes/z-image-turbo") {
        setZImageParams(newParams);
      } else if (modelId === "chutes/hunyuan-image-3") {
        setHunyuanParams({
          ...newParams,
          size:
            String(newParams.size || "").trim() ||
            buildWxHSize(newParams.width, newParams.height),
        });
      } else if (modelId === "chutes/Qwen-Image-2512") {
        setQwenImageParams(newParams);
      } else if (modelId === "huggingface/Tongyi-MAI/Z-Image-Turbo") {
        setTongyiParams({
          ...newParams,
          size: buildTongyiResolution(newParams.width, newParams.height),
        });
      } else {
        if (newParams.width !== undefined) setWidth(newParams.width);
        if (newParams.height !== undefined) setHeight(newParams.height);
        if (newParams.steps !== undefined) setSteps(newParams.steps);
        if (newParams.guidanceScale !== undefined)
          setGuidanceScale(newParams.guidanceScale);
        if (newParams.negativePrompt !== undefined)
          setNegativePrompt(newParams.negativePrompt);
        if (newParams.seed !== undefined) setSeed(newParams.seed);
      }
    },
    [selectedModelInfo?.id, imageParams],
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Image className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Image Generation
            </h2>
            <p className="text-xs text-gray-400">
              {isLocalModelSelected
                ? `${selectedModel} (Local)`
                : selectedModelInfo?.name || "Select a model"}
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
          className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModelSelector();
          }}
        >
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden mx-4 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
                  <Image className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Select Image Model
                  </h3>
                  <p className="text-xs text-gray-500">
                    Choose a model and provider to get started
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModelSelector}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-900/80 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models by name, provider, or ID..."
                  className="w-full bg-gray-900/70 text-white pl-10 pr-10 py-3 rounded-xl border border-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                />
                {modelSearch && (
                  <button
                    onClick={() => setModelSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
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
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                      cloudFilter === filter
                        ? filter === "cloud"
                          ? "bg-purple-600/20 text-purple-200 border-purple-500/40"
                          : filter === "local"
                            ? "bg-emerald-600/20 text-emerald-200 border-emerald-500/40"
                            : "bg-blue-600/20 text-blue-200 border-blue-500/40"
                        : "bg-gray-900/70 text-gray-300 border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    {filter === "all"
                      ? "All"
                      : filter === "cloud"
                        ? "☁ Cloud"
                        : "💻 Local"}
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
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                    configuredProviderFilter === provider
                      ? "bg-purple-600/20 text-purple-200 border-purple-500/40"
                      : "bg-gray-900/70 text-gray-300 border-gray-800 hover:border-gray-700"
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
                      className={`p-3 rounded-xl text-left border transition-all ${
                        selectedModel === model.modelKey
                          ? "bg-purple-600/15 border-purple-500/40 text-white"
                          : "bg-gray-900/70 border-gray-800 text-gray-200 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{model.name}</span>
                        <div className="flex items-center gap-2">
                          {model.isCloud ? (
                            <span className="text-[10px] px-2 py-0.5 bg-purple-600/30 text-purple-200 rounded">
                              Cloud
                            </span>
                          ) : configuredProviderFilter === "ollama" ? (
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-700/40 text-emerald-200 rounded">
                              Local
                            </span>
                          ) : null}
                          {model.free && (
                            <span className="text-[10px] px-2 py-0.5 bg-green-600/30 text-green-200 rounded">
                              Free
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 bg-gray-800/80 text-gray-300 rounded">
                            {model.configuredProvider || model.provider}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-cyan-700/40 text-cyan-200 rounded">
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
              {isHuggingFaceSelection && (
                <div className="p-3 bg-gray-800 rounded-lg space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    HuggingFace Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setHfMode("inference")}
                      className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                        hfMode === "inference"
                          ? "bg-purple-600/30 text-purple-100 border-purple-400/50"
                          : "bg-gray-700 text-gray-300 border-gray-600"
                      }`}
                    >
                      Inference API
                    </button>
                    <button
                      onClick={() => setHfMode("space")}
                      className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                        hfMode === "space"
                          ? "bg-purple-600/30 text-purple-100 border-purple-400/50"
                          : "bg-gray-700 text-gray-300 border-gray-600"
                      }`}
                    >
                      Space API
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Manual selection only. No automatic fallback.
                  </p>

                  {isHFSpaceModel && hfMode === "space" && (
                    <div className="pt-2 border-t border-gray-700 space-y-2">
                      <label className="block text-xs font-medium text-gray-300">
                        {activeSpaceLabel} Space Target
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setHfSpaceTarget("public")}
                          className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                            hfSpaceTarget === "public"
                              ? "bg-emerald-600/30 text-emerald-100 border-emerald-400/50"
                              : "bg-gray-700 text-gray-300 border-gray-600"
                          }`}
                        >
                          Public Space
                        </button>
                        <button
                          onClick={() => setHfSpaceTarget("custom")}
                          className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                            hfSpaceTarget === "custom"
                              ? "bg-emerald-600/30 text-emerald-100 border-emerald-400/50"
                              : "bg-gray-700 text-gray-300 border-gray-600"
                          }`}
                        >
                          My Space
                        </button>
                      </div>

                      {hfSpaceTarget === "custom" && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Space ID or URL
                          </label>
                          <input
                            type="text"
                            value={hfCustomSpace}
                            onChange={(e) => setHfCustomSpace(e.target.value)}
                            placeholder={`username/your-space or https://...hf.space`}
                            className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      )}

                      <div className="text-[11px] text-gray-300 bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 space-y-1">
                        <div>
                          {hfSpaceTarget === "custom"
                            ? `Using custom space: ${hfCustomSpace || "(not set)"}`
                            : `Using public space: ${activePublicSpaceId}`}
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={activeSpaceUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 truncate text-cyan-300 hover:text-cyan-200 underline"
                            title={activeSpaceUrl}
                          >
                            {activeSpaceUrl || "No Space URL set"}
                          </a>
                          <button
                            type="button"
                            onClick={handleCopySpaceUrl}
                            disabled={!activeSpaceUrl}
                            className="px-2 py-1 rounded border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {spaceUrlCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  disabled={!isConfigured}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              <ImagePresetPanel
                modelId={selectedModelInfo?.id || "default"}
                params={imageParams}
                onParamsChange={handleImageParamsChange}
              />

              {/* Debug & Custom JSON */}
              <CollapsiblePanel
                title="Debug & Custom JSON"
                defaultExpanded={false}
                icon={Settings}
              >
                {selectedModelHints && selectedModelHints.length > 0 && (
                  <div className="text-xs text-gray-300 bg-gray-700/60 rounded p-2">
                    Suggested params: {selectedModelHints.join(", ")}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Custom JSON Parameters
                  </label>
                  <textarea
                    value={customParamsText}
                    onChange={(e) => setCustomParamsText(e.target.value)}
                    placeholder='{"seed": 42}'
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-xs"
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
              </CollapsiblePanel>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-900/50 text-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Debug Details */}
              {debugDetails && (
                <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                  <p className="text-sm text-purple-300 font-medium mb-2">
                    Debug Details
                  </p>
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
                    <span className="text-sm font-medium">
                      API Not Configured
                    </span>
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
                    {runningCount > 0 && pendingCount > 0 && (
                      <span className="mx-1">,</span>
                    )}
                    {pendingCount > 0 && (
                      <span className="text-gray-500">
                        {pendingCount} queued
                      </span>
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
                    {runningJobs.slice(0, 3).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between text-xs text-gray-500"
                      >
                        <span className="truncate max-w-[180px]">
                          {job.prompt?.slice(0, 40) || "Generating..."}
                        </span>
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
                    Next:{" "}
                    {pendingJobs
                      .slice(0, 2)
                      .map((j) => j.prompt?.slice(0, 30) || "Queued")
                      .join(", ")}
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
              {hasActiveJobs &&
                pendingCount >= maxConcurrentJobs - runningCount && (
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
              // Clear selectedRunningJobId so loading state is correct
              setSelectedRunningJobId(null);
              setGeneratedImage({
                url: image.url,
                model: image.model,
              });
            }}
            onReloadPrompt={(image) => {
              // Clear selectedRunningJobId so loading state is correct
              setSelectedRunningJobId(null);
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
                  localStorage.setItem(
                    IMAGE_SELECTED_MODEL_KEY,
                    model.modelKey,
                  );
                }
              }
            }}
            onDeleteMedia={deleteImage}
            onClearHistory={clearAllImages}
            loading={hasActiveJobs || selectedRunningJobId !== null}
            error={error}
            progress={
              selectedRunningJobId !== null ? selectedJobProgress : null
            }
            onClearError={() => {
              setLocalError("");
            }}
          />
        </div>
      </div>
    </div>
  );
}
