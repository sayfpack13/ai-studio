import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useJobs } from "../context/JobContext";
import {
  getModels,
  uploadLibraryFile,
  enqueueJob as enqueueServerJob,
  getJobs,
  resolveAssetUrl,
} from "../services/api";
import AssetPickerDialog from "./library/AssetPickerDialog";
import StitchDialog from "./StitchDialog";
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { Button } from "./ui";
import {
  LoadingSpinner,
  VideoPresetPanel,
  MediaOutputPanel,
  CollapsiblePanel,
  SliderControl,
} from "./shared";
import {
  Film,
  Sparkles,
  Download,
  Music,
  Settings,
  X,
  Upload,
  FolderOpen,
  Scissors,
} from "lucide-react";

// Generate unique video ID
const generateVideoId = () =>
  `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const VIDEO_SELECTED_MODEL_KEY = "blackbox_ai_video_selected_model";
const VIDEO_SELECTED_PROVIDER_KEY = "blackbox_ai_video_selected_provider";

const WAN_I2V_MODEL_ID = "chutes/Wan-AI/Wan2.2-I2V-14B-Fast";
const WAN_DEFAULT_NEGATIVE_PROMPT = "";
const PUBLIC_WAN_I2V_A14B_SPACE_ID = "r3gm/wan2-2-fp8da-aoti-preview";

const VIDEO_HF_SPACE_TARGET_KEY = "blackbox_ai_video_hf_space_target";
const VIDEO_HF_CUSTOM_SPACE_KEY = "blackbox_ai_video_hf_custom_space";

const toHuggingFaceSpacePageUrl = (spaceValue) => {
  const raw = String(spaceValue || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://huggingface.co/spaces/${raw}`;
};

// Duration presets (frames at 16fps baseline)
const WAN_DURATION_PRESETS = [
  { id: "quick", label: "~2s", frames: 33, desc: "Quick clip" },
  { id: "short", label: "~3s", frames: 49, desc: "Short clip" },
  { id: "medium", label: "~5s", frames: 81, desc: "Standard" },
  { id: "long", label: "~7s", frames: 113, desc: "Long clip" },
  { id: "extended", label: "~9s", frames: 140, desc: "Maximum" },
];

// Quality presets (resolution + fast mode)
const WAN_QUALITY_PRESETS = [
  {
    id: "draft",
    label: "Draft",
    resolution: "480p",
    fast: true,
    desc: "480p / Fastest",
  },
  {
    id: "standard",
    label: "Standard",
    resolution: "720p",
    fast: true,
    desc: "720p / Fast",
  },
  {
    id: "quality",
    label: "Quality",
    resolution: "720p",
    fast: false,
    desc: "720p / Best",
  },
];

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

function extractLastFrame(videoUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;

    let settled = false;
    const fail = (msg) => {
      if (!settled) {
        settled = true;
        reject(new Error(msg));
      }
    };

    video.onerror = () => fail("Failed to load video for frame extraction");

    video.onloadedmetadata = () => {
      if (!video.duration || !isFinite(video.duration)) {
        return fail("Video has no valid duration");
      }
      const seekTarget = Math.max(0, video.duration - 0.05);
      video.currentTime = seekTarget;
    };

    video.onseeked = () => {
      if (settled) return;
      settled = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        resolve({ dataUrl, width: canvas.width, height: canvas.height });
      } catch (err) {
        reject(new Error("Failed to capture frame: " + err.message));
      }
    };

    video.src = videoUrl;
    video.load();

    setTimeout(() => fail("Frame extraction timed out"), 30000);
  });
}

// Map raw server job statuses to client-side statuses
const mapServerStatus = (status) => {
  const statusMap = {
    queued: "pending",
    processing: "running",
    completed: "completed",
    failed: "failed",
    canceled: "cancelled",
  };
  return statusMap[status] || status;
};

export default function VideoGenerator() {
  const location = useLocation();
  const {
    isConfigured,
    saveVideo,
    providers,
    getVideo,
    addLibraryAsset,
    refreshLibraryAssets,
    videoHistory,
    getVideoIds,
    deleteVideo,
    clearAllVideos,
  } = useApp();

  const {
    getJobsByType,
    selectedJob,
    setSelectedJob,
    cancelAllJobsByType,
    cancelJob,
    maxConcurrentJobs,
    registerSaveFns,
  } = useJobs();

  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(VIDEO_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [serverJobs, setServerJobs] = useState([]);
  const videoJobs = getJobsByType("video");
  const runningJobs = useMemo(
    () => serverJobs.filter((job) => job.status === "running"),
    [serverJobs],
  );
  const pendingJobs = useMemo(
    () => serverJobs.filter((job) => job.status === "pending"),
    [serverJobs],
  );
  const runningCount = runningJobs.length;
  const pendingCount = pendingJobs.length;
  const hasActiveJobs = runningCount > 0 || pendingCount > 0;
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [localError, setLocalError] = useState("");
  const [selectedRunningJobId, setSelectedRunningJobId] = useState(null);
  const shouldPollServerJobs = hasActiveJobs || selectedRunningJobId !== null;
  const saveVideoRef = useRef(saveVideo);
  const addLibraryAssetRef = useRef(addLibraryAsset);
  const promptRef = useRef(prompt);

  useEffect(() => {
    saveVideoRef.current = saveVideo;
  }, [saveVideo]);

  useEffect(() => {
    addLibraryAssetRef.current = addLibraryAsset;
  }, [addLibraryAsset]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  // Clear local error on component mount to prevent stale errors on page reload
  useEffect(() => {
    setLocalError("");
  }, []);

  // Auto-select the first running or pending video job after page reload to show progress
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

  // Sync server jobs and only poll while video jobs are active
  useEffect(() => {
    // Initial sync on mount
    const syncServerJobs = async () => {
      try {
        const result = await getJobs({ type: "video", limit: 100 });
        if (result.success && result.items) {
          const normalizedJobs = result.items.map((job) => ({
            ...job,
            status: mapServerStatus(job.status),
          }));
          setServerJobs((prev) => {
            const prevSignature = prev
              .map(
                (job) =>
                  `${job.id}:${job.status}:${job.progress}:${job.updatedAt}`,
              )
              .join("|");
            const nextSignature = normalizedJobs
              .map(
                (job) =>
                  `${job.id}:${job.status}:${job.progress}:${job.updatedAt}`,
              )
              .join("|");
            return prevSignature === nextSignature ? prev : normalizedJobs;
          });

          // Find the currently selected server job
          const selectedServerJob = result.items.find(
            (j) => j.id === selectedRunningJobId,
          );

          if (selectedRunningJobId && !selectedServerJob) {
            // Job is gone from server (maybe server was restarted/cleared)
            setSelectedRunningJobId(null);
            setLocalError(
              "Generation interrupted: Job no longer exists on server.",
            );
          } else if (selectedServerJob) {
            const selectedServerJobStatus = mapServerStatus(
              selectedServerJob.status,
            );

            // Handle completion
            if (selectedServerJobStatus === "completed") {
              const videoUrl =
                selectedServerJob.result?.data?.[0]?.url ||
                selectedServerJob.result?.url;
              if (videoUrl) {
                const videoData = {
                  url: videoUrl,
                  thumbnail:
                    selectedServerJob.result?.data?.[0]?.thumbnail || null,
                  id: selectedServerJob.result?.id,
                  prompt:
                    selectedServerJob.payload?.prompt || promptRef.current,
                };
                setGeneratedVideo(videoData);
                // Save to history
                const videoId =
                  selectedServerJob.metadata?.videoId || generateVideoId();
                saveVideoRef.current?.(
                  videoId,
                  selectedServerJob.payload?.prompt || promptRef.current,
                  videoData,
                  selectedServerJob.payload?.model ||
                    selectedServerJob.metadata?.model,
                  selectedServerJob.metadata,
                );
                // Add to library
                addLibraryAssetRef.current?.({
                  type: "video",
                  source: "video",
                  title:
                    (
                      selectedServerJob.payload?.prompt || promptRef.current
                    ).slice(0, 80) || "Generated video",
                  url: videoData.url,
                  metadata: selectedServerJob.metadata,
                });
              } else {
                setLocalError(
                  "Generation completed but no video URL was returned.",
                );
              }
              // Always clear selected job on terminal completion state
              setSelectedRunningJobId(null);
            } else if (
              selectedServerJobStatus === "failed" ||
              selectedServerJobStatus === "cancelled"
            ) {
              setLocalError(
                selectedServerJob.error?.message ||
                  selectedServerJob.error ||
                  (selectedServerJobStatus === "cancelled"
                    ? "Generation cancelled"
                    : "Generation failed"),
              );
              setSelectedRunningJobId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to sync server jobs:", err);
      }
    };

    syncServerJobs();

    // Keep polling only when there is an active/selected video job
    if (!shouldPollServerJobs) return;

    const pollInterval = setInterval(syncServerJobs, 10000);

    return () => clearInterval(pollInterval);
  }, [shouldPollServerJobs, selectedRunningJobId]);

  // Only show error from localError (current generation) or when a job is explicitly selected
  // Don't automatically show errors from failed jobs in the list
  const error = localError;

  // Get the selected running job for progress display
  const selectedRunningJob = serverJobs.find(
    (job) => job.id === selectedRunningJobId,
  );
  const selectedJobProgress = selectedRunningJob?.progress || 0;

  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(24);

  // serverJobs state is declared at the top of the component (before first usage)

  // Wan I2V controls
  const [wanImageData, setWanImageData] = useState("");
  const [wanImageSourceType, setWanImageSourceType] = useState("none"); // none | upload | library | video
  const [wanFrames, setWanFrames] = useState(81);
  const [wanFps, setWanFps] = useState(16);
  const [wanFast, setWanFast] = useState(true);
  const [wanSeed, setWanSeed] = useState("");
  const [wanResolution, setWanResolution] = useState("480p");
  const [wanGuidanceScale, setWanGuidanceScale] = useState(1);
  const [wanGuidanceScale2, setWanGuidanceScale2] = useState(1);
  const [wanSteps, setWanSteps] = useState(6);
  const [wanDurationSeconds, setWanDurationSeconds] = useState(3.5);
  const [wanQuality, setWanQuality] = useState(6);
  const [wanScheduler, setWanScheduler] = useState("UniPCMultistep");
  const [wanFlowShift, setWanFlowShift] = useState(3);
  const [wanFrameMultiplier, setWanFrameMultiplier] = useState(16);
  const [wanNegativePrompt, setWanNegativePrompt] = useState(
    WAN_DEFAULT_NEGATIVE_PROMPT,
  );
  const [wanLibraryImageId, setWanLibraryImageId] = useState("");
  const [wanUploadingImage, setWanUploadingImage] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showVideoAssetPicker, setShowVideoAssetPicker] = useState(false);

  const [wanExtractingFrame, setWanExtractingFrame] = useState(false);
  const [wanSourceVideoTitle, setWanSourceVideoTitle] = useState("");
  const [showStitchDialog, setShowStitchDialog] = useState(false);

  // HF Space target for Wan I2V A14B
  const [hfSpaceTarget, setHfSpaceTarget] = useState(
    () => localStorage.getItem(VIDEO_HF_SPACE_TARGET_KEY) || "public",
  );
  const [hfCustomSpace, setHfCustomSpace] = useState(
    () => localStorage.getItem(VIDEO_HF_CUSTOM_SPACE_KEY) || "",
  );
  const [spaceUrlCopied, setSpaceUrlCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIDEO_HF_SPACE_TARGET_KEY, hfSpaceTarget);
  }, [hfSpaceTarget]);

  useEffect(() => {
    localStorage.setItem(VIDEO_HF_CUSTOM_SPACE_KEY, hfCustomSpace);
  }, [hfCustomSpace]);

  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(VIDEO_SELECTED_PROVIDER_KEY) || "",
  );

  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const searchInputRef = useRef(null);

  const isOllamaLocalActive =
    cloudFilter === "local" && configuredProviderFilter === "ollama";
  const ollamaLocal = useOllamaLocal(isOllamaLocalActive);

  const selectedModelInfo = useMemo(
    () => availableModels.find((m) => m.modelKey === selectedModel),
    [availableModels, selectedModel],
  );

  const isWanI2VSelected = 
    selectedModelInfo?.id === WAN_I2V_MODEL_ID || 
    (selectedModelInfo?.id && selectedModelInfo.id.toLowerCase().includes("i2v"));

  const isWanI2VA14B = selectedModelInfo?.id === "huggingface/Wan2.2-I2V-A14B";

  // For Space URL: strip the "huggingface/" prefix from model IDs like
  // "huggingface/r3gm/wan2-2-fp8da-aoti-preview" → "r3gm/wan2-2-fp8da-aoti-preview"
  const hfModelSpaceId = useMemo(() => {
    const raw = selectedModelInfo?.id || "";
    if (raw.startsWith("huggingface/")) return raw.slice("huggingface/".length);
    return raw;
  }, [selectedModelInfo?.id]);

  const isHuggingFaceSpace = selectedModelInfo?.provider === "huggingface" && hfModelSpaceId.includes("/");

  const activeWanA14BSpaceValue =
    hfSpaceTarget === "custom" && hfCustomSpace.trim()
      ? hfCustomSpace.trim()
      : PUBLIC_WAN_I2V_A14B_SPACE_ID;
  const activeWanA14BSpaceUrl = toHuggingFaceSpacePageUrl(activeWanA14BSpaceValue);

  const activeSpaceUrl = isWanI2VA14B
    ? activeWanA14BSpaceUrl
    : isHuggingFaceSpace
      ? `https://huggingface.co/spaces/${hfModelSpaceId}`
      : null;

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

  // Load models on mount
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

  // Register save function so jobs can save results after page reload
  useEffect(() => {
    registerSaveFns("video", saveVideo);
  }, [registerSaveFns, saveVideo]);

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
        setSelectedRunningJobId(null);
      } else if (
        selectedJob.status === "running" ||
        selectedJob.status === "pending"
      ) {
        // Track running/pending job to show progress
        // Don't clear generatedVideo - let user continue viewing previous/historical generations
        setSelectedRunningJobId(selectedJob.id);
        setLocalError("");

        const metadata = selectedJob.params?.metadata;
        const options = selectedJob.params?.options || {};
        const resolvedProvider = metadata?.provider || options.provider || "";

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
          if (options.wan.frames != null)
            setWanFrames(Number(options.wan.frames));
          if (options.wan.fps != null) setWanFps(Number(options.wan.fps));
          if (options.wan.fast != null) setWanFast(Boolean(options.wan.fast));
          if (options.wan.seed != null) setWanSeed(String(options.wan.seed));
          if (options.wan.resolution) setWanResolution(options.wan.resolution);
          if (options.wan.guidance_scale != null)
            setWanGuidanceScale(Number(options.wan.guidance_scale));
          if (options.wan.guidance_scale_2 != null)
            setWanGuidanceScale2(Number(options.wan.guidance_scale_2));
          if (options.wan.negative_prompt)
            setWanNegativePrompt(options.wan.negative_prompt);
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
          if (options.wan.frames != null)
            setWanFrames(Number(options.wan.frames));
          if (options.wan.fps != null) setWanFps(Number(options.wan.fps));
          if (options.wan.fast != null) setWanFast(Boolean(options.wan.fast));
          if (options.wan.seed != null) setWanSeed(String(options.wan.seed));
          if (options.wan.resolution) setWanResolution(options.wan.resolution);
          if (options.wan.guidance_scale != null)
            setWanGuidanceScale(Number(options.wan.guidance_scale));
          if (options.wan.guidance_scale_2 != null)
            setWanGuidanceScale2(Number(options.wan.guidance_scale_2));
          if (options.wan.negative_prompt)
            setWanNegativePrompt(options.wan.negative_prompt);
        }

        // If job is completed, try to load result
        if (selectedJob.status === "completed") {
          const completedVideoUrl =
            selectedJob.result?.data?.[0]?.url || selectedJob.result?.url;
          if (completedVideoUrl) {
            setGeneratedVideo({
              url: completedVideoUrl,
              thumbnail:
                selectedJob.result?.data?.[0]?.thumbnail ||
                selectedJob.result?.thumbnail ||
                null,
              id: selectedJob.result?.id || selectedJob.params?.videoId,
              prompt: selectedJob.payload?.prompt || selectedJob.params?.prompt,
            });
          } else if (selectedJob.params?.videoId) {
            // Fallback to history lookup
            const historyItem = getVideo(selectedJob.params.videoId);
            if (historyItem) {
              setGeneratedVideo(
                { ...historyItem.result, prompt: historyItem.prompt } || null,
              );
            }
          }
        }
        // Don't clear generatedVideo if job has no result - preserve current display
      }

      // Clear selected job after loading
      setSelectedJob(null);
    }
  }, [selectedJob, setSelectedJob, getVideo, availableModels]);

  // Auto-load result when selected running job completes (via JobContext polling)
  useEffect(() => {
    if (!selectedRunningJobId) return;

    const job = videoJobs.find((j) => j.id === selectedRunningJobId);
    if (!job) {
      // Job not in JobContext yet (hasn't been polled) — let VideoGenerator
      // polling handle it instead of clearing the tracking prematurely.
      return;
    }

    if (job.status === "completed") {
      const videoUrl = job.result?.data?.[0]?.url || job.result?.url;
      if (videoUrl) {
        const jobPrompt = job.prompt || job.params?.prompt || promptRef.current;
        const videoData = {
          url: videoUrl,
          thumbnail:
            job.result?.data?.[0]?.thumbnail || job.result?.thumbnail || null,
          id: job.result?.id || job.params?.videoId,
          prompt: jobPrompt,
        };
        setGeneratedVideo(videoData);

        // Save to history (use refs to avoid stale closures)
        const videoId =
          job.params?.videoId || job.result?.id || generateVideoId();
        saveVideoRef.current?.(
          videoId,
          jobPrompt,
          videoData,
          job.model || job.params?.model,
          job.params?.metadata || null,
        );
      } else if (job.params?.videoId) {
        const historyItem = getVideo(job.params.videoId);
        if (historyItem) {
          setGeneratedVideo(
            { ...historyItem.result, prompt: historyItem.prompt } || null,
          );
        }
      }
      setSelectedRunningJobId(null);
    } else if (job.status === "failed" || job.status === "cancelled") {
      if (job.status === "failed") {
        setLocalError(job.error || "Generation failed");
      }
      setSelectedRunningJobId(null);
    }
  }, [selectedRunningJobId, videoJobs, getVideo]);

  useEffect(() => {
    if (!isWanI2VSelected) return;

    setDuration(5);
    setFps(24);
  }, [isWanI2VSelected]);

  // Handle navigation state from ImageGenerator "Send to Video"
  const processedNavigationStateRef = useRef(false);
  useEffect(() => {
    const state = location.state;
    if (state?.imageSource && !processedNavigationStateRef.current) {
      processedNavigationStateRef.current = true;
      const imageSource = state.imageSource;

      // Set the prompt if provided
      if (state.prompt) {
        setPrompt(state.prompt);
      }

      // Select Wan I2V model
      setSelectedModel(WAN_I2V_MODEL_ID);
      localStorage.setItem(VIDEO_SELECTED_MODEL_KEY, WAN_I2V_MODEL_ID);

      // Set provider to chutes
      setConfiguredProviderFilter("chutes");
      localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, "chutes");

      // Check if imageSource is a data URL that needs to be uploaded
      if (imageSource.startsWith("data:")) {
        // Upload to library
        const uploadImage = async () => {
          try {
            const uploadResult = await uploadLibraryFile({
              fileName: `image-to-video-${Date.now()}.png`,
              fileBase64: imageSource,
              mimeType: "image/png",
              type: "image",
              title: "Image to Video",
              source: "wan-i2v-pipeline",
            });

            if (uploadResult?.asset?.url) {
              setWanImageData(uploadResult.asset.url);
              setWanLibraryImageId(uploadResult.asset.id);
              setWanImageSourceType("upload");
              refreshLibraryAssets?.({ type: "image" });
            }
          } catch (err) {
            console.error("Failed to upload image to library:", err);
            // Fallback to using the data URL directly
            setWanImageData(imageSource);
            setWanImageSourceType("upload");
            setWanLibraryImageId("");
          }
        };
        uploadImage();
      } else {
        // It's already a URL (library URL or external URL), use it directly
        setWanImageData(imageSource);
        setWanImageSourceType("library");
        setWanLibraryImageId("");
      }

      // Clear the navigation state to prevent re-processing
      window.history.replaceState({}, document.title);
    }
  }, [location.state, refreshLibraryAssets]);

  const handleAssetPickerSelect = (asset) => {
    if (asset?.url) {
      setWanImageData(asset.url);
      setWanLibraryImageId(asset.id);
      setWanImageSourceType("library");
    }
  };

  const handleVideoAssetSelect = async (asset) => {
    if (!asset?.url) return;
    setWanExtractingFrame(true);
    setLocalError("");
    setWanSourceVideoTitle(asset.title || "Video");
    try {
      const { dataUrl } = await extractLastFrame(asset.url);

      const uploadResult = await uploadLibraryFile({
        fileName: `last-frame-${Date.now()}.png`,
        fileBase64: dataUrl,
        mimeType: "image/png",
        type: "image",
        title: `Last frame of "${(asset.title || "Video").slice(0, 80)}"`,
        source: "wan-i2v-video-frame",
      });

      if (uploadResult?.asset?.url) {
        setWanImageData(uploadResult.asset.url);
        setWanLibraryImageId(uploadResult.asset.id);
        setWanImageSourceType("video");
        refreshLibraryAssets?.({ type: "image" });
      } else {
        throw new Error("Failed to upload extracted frame");
      }
    } catch (err) {
      setLocalError(err.message || "Failed to extract last frame from video");
      setWanSourceVideoTitle("");
    } finally {
      setWanExtractingFrame(false);
    }
  };

  const handleWanImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setWanUploadingImage(true);
    setLocalError("");
    try {
      const dataUrl = await fileToDataUrl(file);

      // Upload to library
      const uploadResult = await uploadLibraryFile({
        fileName: file.name,
        fileBase64: dataUrl,
        mimeType: file.type,
        type: "image",
        title: file.name,
        source: "wan-i2v-upload",
      });

      if (uploadResult?.asset?.url) {
        setWanImageData(uploadResult.asset.url);
        setWanLibraryImageId(uploadResult.asset.id);
        setWanImageSourceType("upload");

        // Refresh library assets to show the newly uploaded image
        refreshLibraryAssets?.({ type: "image" });
      } else {
        throw new Error("Failed to upload image to library");
      }
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
      return "Please upload an image, select from library, or pick a video to continue.";
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

    // Don't clear generatedVideo - let user continue viewing previous/historical generations
    // Clear selected running job to avoid showing stale errors
    setSelectedRunningJobId(null);

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

    const modelIdToSend = isLocalModelSelected
      ? selectedModel
      : selectedInfo?.id;
    const videoId = generateVideoId();

    // Enqueue job on server-side job queue for backend processing
    try {
      const serverResult = await enqueueServerJob({
        type: "video",
        payload: {
          prompt,
          model: modelIdToSend,
          provider: effectiveProvider,
          ...(isWanI2VSelected
            ? {
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
              }
            : {
                duration,
                fps,
              }),
          ...(isWanI2VA14B && effectiveProvider === "huggingface"
            ? {
                hfSpaceTarget,
                hfCustomSpace: hfSpaceTarget === "custom" ? hfCustomSpace.trim() : "",
                wanSteps,
                wanDurationSeconds,
                wanQuality,
                wanScheduler,
                wanFlowShift,
                wanFrameMultiplier,
              }
            : {}),
        },
        metadata: {
          videoId,
          modelKey: selectedInfo?.modelKey || selectedModel,
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
            : {
                duration,
                fps,
              }),
        },
      });

      if (serverResult.success && serverResult.job) {
        // Don't create client-side job - just track the server job ID directly
        // The polling will sync the server job status
        setSelectedRunningJobId(serverResult.job.id);
      } else {
        throw new Error(serverResult.error || "Failed to enqueue job");
      }
    } catch (err) {
      setLocalError(err.message || "Failed to start generation");
      return;
    }
  };

  const handleDownload = () => {
    if (!generatedVideo?.url) return;
    const resolvedUrl = resolveAssetUrl(generatedVideo.url);
    const link = document.createElement("a");
    link.href = resolvedUrl;
    link.download = `ai-video-${Date.now()}.mp4`;
    link.click();
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

      setGeneratedVideo(
        videoItem.result
          ? { ...videoItem.result, prompt: videoItem.prompt }
          : null,
      );
      setPrompt(videoItem.prompt || "");
      setLocalError("");
      setSelectedRunningJobId(null); // Clear running job to prevent showing loading state

      const metadata =
        videoItem?.metadata && typeof videoItem.metadata === "object"
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
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Video Generation
            </h2>
            <p className="text-xs text-gray-400">
              {isLocalModelSelected
                ? `${selectedModel} (Local)`
                : selectedModelInfo?.name || "Select a model"}
            </p>
            {isWanI2VSelected && (
              <p className="text-xs text-purple-400 mt-0.5">
                Wan 2.2 I2V mode: image-to-video
              </p>
            )}
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowModelSelector(true)}
          className="bg-purple-600 hover:bg-purple-500"
        >
          Change Model
        </Button>
      </div>

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
                  <Film className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Select Video Model
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

            <div className="mb-4">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
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

            <div className="mb-4 flex flex-wrap gap-2">
              {gatewayProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => {
                    setConfiguredProviderFilter(provider);
                    localStorage.setItem(VIDEO_SELECTED_PROVIDER_KEY, provider);
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
              {/* Space URL Display (if applicable) */}
              {(isWanI2VA14B || isHuggingFaceSpace) && activeSpaceUrl && (
                <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                    <span className="text-sm font-medium text-cyan-200">
                      HuggingFace Public/Private Space Connected
                    </span>
                  </div>

                  {/* Wan I2V A14B Space Target toggle */}
                  {isWanI2VA14B && (
                    <div className="mb-2 space-y-2">
                      <label className="block text-xs font-medium text-gray-300">
                        Wan 2.2 I2V Space Target
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
                            placeholder="username/your-wan-space or https://...hf.space"
                            className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-gray-300 bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 space-y-1">
                    <div className="text-gray-400">
                      {isWanI2VA14B
                        ? hfSpaceTarget === "custom"
                          ? `Using custom space: ${hfCustomSpace || "(not set)"}`
                          : `Using public space: ${PUBLIC_WAN_I2V_A14B_SPACE_ID}`
                        : `Using space: ${hfModelSpaceId}`}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={activeSpaceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 truncate text-cyan-300 hover:text-cyan-200 underline"
                        title={activeSpaceUrl}
                      >
                        {activeSpaceUrl}
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

              {/* Prompt */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
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
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Wan I2V Controls or Video Preset Panel */}
              {isWanI2VSelected ? (
                <div className="space-y-4 p-3 bg-gray-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Wan 2.2 I2V Settings
                  </h3>

                  {/* Image Source */}
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-300">
                      Image Source
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setWanImageSourceType("upload");
                          setWanLibraryImageId("");
                          setWanSourceVideoTitle("");
                        }}
                        className={`px-3 py-1.5 rounded text-sm ${
                          wanImageSourceType === "upload"
                            ? "bg-purple-600 text-white"
                            : "bg-gray-700 text-gray-200"
                        }`}
                      >
                        Upload
                      </button>
                      <button
                        onClick={() => {
                          setWanImageSourceType("library");
                          setWanSourceVideoTitle("");
                        }}
                        className={`px-3 py-1.5 rounded text-sm ${
                          wanImageSourceType === "library"
                            ? "bg-purple-600 text-white"
                            : "bg-gray-700 text-gray-200"
                        }`}
                      >
                        From Library
                      </button>
                      <button
                        onClick={() => {
                          setWanImageSourceType("video");
                          setWanLibraryImageId("");
                        }}
                        className={`px-3 py-1.5 rounded text-sm ${
                          wanImageSourceType === "video"
                            ? "bg-purple-600 text-white"
                            : "bg-gray-700 text-gray-200"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <Film className="w-3.5 h-3.5" />
                          From Video
                        </span>
                      </button>
                    </div>

                    {wanImageSourceType === "upload" && (
                      <div className="space-y-2">
                        {wanImageData ? (
                          <div className="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-700">
                            <img
                              src={wanImageData}
                              alt="Wan input preview"
                              className="w-full h-32 object-cover"
                            />
                            {wanImageSourceType === "video" && (
                              <div className="absolute top-1.5 left-1.5 bg-black/70 text-[10px] text-purple-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Film className="w-3 h-3" />
                                Last frame
                              </div>
                            )}
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-gray-800/50 transition-all">
                            <Upload className="w-8 h-8 text-gray-500 mb-2" />
                            <span className="text-sm text-gray-400">
                              Click to upload an image file
                            </span>
                            <span className="text-xs text-gray-500 mt-1">
                              PNG, JPG, WebP supported
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleWanImageUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                        {wanUploadingImage && (
                          <div className="flex items-center gap-2 text-xs text-purple-400">
                            <LoadingSpinner size="sm" />
                            Processing image...
                          </div>
                        )}
                      </div>
                    )}

                    {wanImageSourceType === "library" && (
                      <div className="space-y-2">
                        {wanImageData ? (
                          <div className="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-700">
                            <img
                              src={wanImageData}
                              alt="Selected library image"
                              className="w-full h-32 object-cover"
                            />
                            <button
                              onClick={() => {
                                setWanImageData("");
                                setWanLibraryImageId("");
                              }}
                              className="absolute top-1.5 right-1.5 p-1.5 bg-gray-900/80 hover:bg-red-600 rounded-full transition-colors"
                              title="Remove image"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowAssetPicker(true)}
                            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-gray-800/50 transition-all"
                          >
                            <FolderOpen className="w-8 h-8 text-gray-500 mb-2" />
                            <span className="text-sm text-gray-400">
                              Select an image from library
                            </span>
                            <span className="text-xs text-gray-500 mt-1">
                              Browse your uploaded and generated images
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {wanImageSourceType === "video" && (
                      <div className="space-y-2">
                        {wanSourceVideoTitle && !wanExtractingFrame ? (
                          <div className="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-700 p-3">
                            <div className="flex items-center gap-2 text-sm text-purple-300">
                              <Film className="w-4 h-4" />
                              <span className="truncate">{wanSourceVideoTitle}</span>
                            </div>
                            <button
                              onClick={() => {
                                setWanSourceVideoTitle("");
                                setWanImageData("");
                              }}
                              className="absolute top-1.5 right-1.5 p-1.5 bg-gray-900/80 hover:bg-red-600 rounded-full transition-colors"
                              title="Remove source video"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : !wanSourceVideoTitle && !wanExtractingFrame ? (
                          <button
                            type="button"
                            onClick={() => setShowVideoAssetPicker(true)}
                            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-gray-800/50 transition-all"
                          >
                            <Film className="w-8 h-8 text-gray-500 mb-2" />
                            <span className="text-sm text-gray-400">
                              Select a source video
                            </span>
                            <span className="text-xs text-gray-500 mt-1">
                              Uses last frame as image input
                            </span>
                          </button>
                        ) : null}
                        <button
                          onClick={() => setShowVideoAssetPicker(true)}
                          disabled={wanExtractingFrame}
                          className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <Film className="w-4 h-4" />
                          {wanSourceVideoTitle
                            ? "Change Source Video"
                            : "Select Video from Library"}
                        </button>
                        {wanExtractingFrame && (
                          <div className="flex items-center gap-2 text-xs text-purple-400">
                            <LoadingSpinner size="sm" />
                            Extracting last frame...
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Duration Presets */}
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <label className="text-sm text-gray-300">Duration</label>
                      <span className="text-xs text-gray-500">
                        {(wanFrames / wanFps).toFixed(1)}s
                        {!WAN_DURATION_PRESETS.some(
                          (p) => p.frames === wanFrames,
                        ) && (
                          <span className="ml-1 text-purple-400">Custom</span>
                        )}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {WAN_DURATION_PRESETS.map((preset) => {
                        const isActive = preset.frames === wanFrames;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => setWanFrames(preset.frames)}
                            className={`py-2 px-1 rounded-lg text-center transition-all ${
                              isActive
                                ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                            }`}
                          >
                            <div className="text-sm font-medium">
                              {preset.label}
                            </div>
                            <div
                              className={`text-[10px] ${isActive ? "text-purple-200" : "text-gray-500"}`}
                            >
                              {preset.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quality Presets */}
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <label className="text-sm text-gray-300">Quality</label>
                      <span className="text-xs text-gray-500">
                        {wanResolution}
                        {wanFast ? " / Fast" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {WAN_QUALITY_PRESETS.map((preset) => {
                        const isActive =
                          preset.resolution === wanResolution &&
                          preset.fast === wanFast;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => {
                              setWanResolution(preset.resolution);
                              setWanFast(preset.fast);
                            }}
                            className={`py-2.5 px-2 rounded-lg text-center transition-all ${
                              isActive
                                ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                            }`}
                          >
                            <div className="text-sm font-medium">
                              {preset.label}
                            </div>
                            <div
                              className={`text-[10px] ${isActive ? "text-purple-200" : "text-gray-500"}`}
                            >
                              {preset.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Advanced Settings */}
                  <CollapsiblePanel
                    title="Advanced Settings"
                    defaultExpanded={false}
                    icon={Settings}
                  >
                    <div className="space-y-4">
                      {/* Frames */}
                      <SliderControl
                        label="Frames"
                        value={wanFrames}
                        onChange={setWanFrames}
                        min={21}
                        max={140}
                        step={1}
                        formatValue={(v) => `${v} (${(v / wanFps).toFixed(1)}s)`}
                      />

                      {/* FPS */}
                      <SliderControl
                        label="FPS"
                        value={wanFps}
                        onChange={setWanFps}
                        min={16}
                        max={24}
                        step={1}
                      />

                      {/* Resolution */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                          Resolution
                        </label>
                        <div className="flex gap-1.5">
                          {["480p", "720p"].map((res) => (
                            <button
                              key={res}
                              onClick={() => setWanResolution(res)}
                              className={`flex-1 py-1.5 rounded text-sm transition-colors ${
                                wanResolution === res
                                  ? "bg-purple-600 text-white"
                                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                              }`}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Fast Mode */}
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-300">
                          Fast Mode
                        </label>
                        <button
                          onClick={() => setWanFast((v) => !v)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            wanFast ? "bg-purple-600" : "bg-gray-600"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              wanFast ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Guidance Scale */}
                      <SliderControl
                        label="Guidance Scale"
                        value={wanGuidanceScale}
                        onChange={setWanGuidanceScale}
                        min={0}
                        max={10}
                        step={0.5}
                      />

                      {/* Guidance Scale 2 */}
                      <SliderControl
                        label="Guidance Scale 2"
                        value={wanGuidanceScale2}
                        onChange={setWanGuidanceScale2}
                        min={0}
                        max={10}
                        step={0.5}
                      />

                      {/* Inference Steps (shown for HF A14B model) */}
                      {isWanI2VA14B && (
                        <SliderControl
                          label="Inference Steps"
                          value={wanSteps}
                          onChange={setWanSteps}
                          min={4}
                          max={30}
                          step={1}
                        />
                      )}

                      {/* A14B Space Parameters */}
                      {isWanI2VA14B && (
                        <>
                          {/* Video Quality */}
                          <SliderControl
                            label="Video Quality"
                            value={wanQuality}
                            onChange={setWanQuality}
                            min={1}
                            max={10}
                            step={1}
                          />

                          {/* Duration (seconds) */}
                          <SliderControl
                            label="Duration (seconds)"
                            value={wanDurationSeconds}
                            onChange={setWanDurationSeconds}
                            min={1}
                            max={10}
                            step={0.5}
                            formatValue={(v) => `${v}s`}
                          />

                          {/* Flow Shift */}
                          <SliderControl
                            label="Flow Shift"
                            value={wanFlowShift}
                            onChange={setWanFlowShift}
                            min={1}
                            max={10}
                            step={0.5}
                          />

                          {/* Frame Multiplier (Video Fluidity) */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">
                              Video Fluidity (FPS)
                            </label>
                            <div className="flex gap-1.5">
                              {[
                                { value: 16, label: "16 fps" },
                                { value: 32, label: "32 fps" },
                                { value: 64, label: "64 fps" },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setWanFrameMultiplier(opt.value)}
                                  className={`flex-1 py-1.5 rounded text-sm transition-colors ${
                                    wanFrameMultiplier === opt.value
                                      ? "bg-purple-600 text-white"
                                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Scheduler */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">
                              Scheduler
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                              {[
                                { value: "UniPCMultistep", label: "UniPC" },
                                { value: "FlowMatchEulerDiscrete", label: "FlowMatch" },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setWanScheduler(opt.value)}
                                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                                    wanScheduler === opt.value
                                      ? "bg-purple-600 text-white"
                                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Seed */}
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-300">
                          Seed (-1 = random)
                        </label>
                        <input
                          type="text"
                          value={wanSeed}
                          onChange={(e) => setWanSeed(e.target.value)}
                          placeholder="Random"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      {/* Negative Prompt */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Negative Prompt
                        </label>
                        <input
                          type="text"
                          value={wanNegativePrompt}
                          onChange={(e) => setWanNegativePrompt(e.target.value)}
                          placeholder="Leave empty for default quality filter"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </CollapsiblePanel>
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
                    <span className="text-sm font-medium">
                      API Not Configured
                    </span>
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
                    onClick={() => cancelAllJobsByType("video")}
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
              disabled={
                !isConfigured ||
                !prompt.trim() ||
                (isWanI2VSelected && !wanImageData)
              }
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="w-full bg-purple-600 hover:bg-purple-500"
            >
              Generate Video
              {hasActiveJobs &&
                pendingCount >= maxConcurrentJobs - runningCount && (
                  <span className="ml-2 text-xs opacity-75">(Queued)</span>
                )}
            </Button>

            <Button
              variant="ghost"
              onClick={() => setShowStitchDialog(true)}
              leftIcon={<Scissors className="w-4 h-4" />}
              className="w-full text-gray-300 hover:text-white"
            >
              Stitch Clips
            </Button>

            {/* Mobile Output — visible only below lg */}
            <div className="lg:hidden mt-4">
              <MediaOutputPanel
                mediaType="video"
                generatedMedia={generatedVideo}
                mediaHistory={videoHistory}
                getMediaIds={getVideoIds}
                onDownload={handleDownload}
                onPreview={(video) => {
                  setSelectedRunningJobId(null);
                  setGeneratedVideo({
                    url: video.url,
                    model: video.model,
                    prompt: video.prompt,
                  });
                }}
                onReloadPrompt={(video) => {
                  setSelectedRunningJobId(null);
                  setPrompt(video.prompt || "");
                  setGeneratedVideo({
                    url: video.url,
                    model: video.model,
                    prompt: video.prompt,
                  });
                }}
                onDeleteMedia={(videoId) => {
                  deleteVideo(videoId);
                  if (generatedVideo?.id === videoId) {
                    setGeneratedVideo(null);
                  }
                }}
                onClearHistory={clearAllVideos}
                loading={hasActiveJobs}
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

        {/* Right Panel - Output */}
        <div className="hidden lg:flex lg:w-[55%] flex-col">
          <MediaOutputPanel
            mediaType="video"
            generatedMedia={generatedVideo}
            mediaHistory={videoHistory}
            getMediaIds={getVideoIds}
            onDownload={handleDownload}
            onPreview={(video) => {
              setSelectedRunningJobId(null);
              setGeneratedVideo({
                url: video.url,
                model: video.model,
                prompt: video.prompt,
              });
            }}
            onReloadPrompt={(video) => {
              setSelectedRunningJobId(null);
              setPrompt(video.prompt || "");
              setGeneratedVideo({
                url: video.url,
                model: video.model,
                prompt: video.prompt,
              });
            }}
            onDeleteMedia={(videoId) => {
              deleteVideo(videoId);
              if (generatedVideo?.id === videoId) {
                setGeneratedVideo(null);
              }
            }}
            onClearHistory={clearAllVideos}
            loading={hasActiveJobs}
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

      {/* Asset Picker Dialog - Images */}
      <AssetPickerDialog
        open={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={handleAssetPickerSelect}
        type="image"
        title="Select Image for Wan I2V"
      />

      {/* Asset Picker Dialog - Videos (for last frame extraction) */}
      <AssetPickerDialog
        open={showVideoAssetPicker}
        onClose={() => setShowVideoAssetPicker(false)}
        onSelect={handleVideoAssetSelect}
        type="video"
        title="Select Video to Continue (last frame)"
      />

      {/* Stitch Dialog */}
      <StitchDialog
        open={showStitchDialog}
        onClose={() => setShowStitchDialog(false)}
        onStitchComplete={(data) => {
          setGeneratedVideo({
            url: data.url,
            thumbnail: data.thumbnail,
            prompt: `Stitched video (${data.clipCount} clips)`,
          });
        }}
      />
    </div>
  );
}
