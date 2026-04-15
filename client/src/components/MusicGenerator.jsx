import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { Button } from "./ui";
import {
  LoadingSpinner,
  CollapsiblePanel,
  SliderControl,
  MediaOutputPanel,
} from "./shared";
import { Volume2, Sparkles, Settings, X, Film, Type, Upload, FolderOpen, ArrowDownToLine } from "lucide-react";

const AUDIO_SELECTED_MODEL_KEY = "blackbox_ai_audio_selected_model";
const AUDIO_SELECTED_PROVIDER_KEY = "blackbox_ai_audio_selected_provider";
const AUDIO_HF_SPACE_TARGET_KEY = "blackbox_ai_audio_hf_space_target";
const AUDIO_HF_CUSTOM_SPACE_KEY = "blackbox_ai_audio_hf_custom_space";

const DEFAULT_MMAUDIO_SPACE = "hkchengrex/MMAudio";

const generateAudioId = () =>
  `aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const toHuggingFaceSpacePageUrl = (spaceValue) => {
  const raw = String(spaceValue || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http")) return raw;
  return `https://huggingface.co/spaces/${raw}`;
};

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

export default function MusicGenerator() {
  const {
    isConfigured,
    providers,
    saveMusic,
    getMusic,
    musicHistory,
    getMusicIds,
    deleteMusic,
    clearAllMusic,
    addLibraryAsset,
    refreshLibraryAssets,
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

  // ── Audio state ──────────────────────────────────────────────────
  const [audioSubMode, setAudioSubMode] = useState("video_to_audio");
  const [audioPrompt, setAudioPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("music");
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoUrl, setVideoUrl] = useState(""); // library URL or uploaded URL
  const [videoSourceType, setVideoSourceType] = useState("upload"); // upload | library
  const [videoUploading, setVideoUploading] = useState(false);
  const [showVideoAssetPicker, setShowVideoAssetPicker] = useState(false);
  const [videoDuration, setVideoDuration] = useState(null); // auto-detected from video
  const [selectedVideoPrompt, setSelectedVideoPrompt] = useState(""); // prompt from library video
  const [audioSeed, setAudioSeed] = useState(-1);
  const [numSteps, setNumSteps] = useState(25);
  const [cfgStrength, setCfgStrength] = useState(4.5);
  const [audioDuration, setAudioDuration] = useState(8);
  const [durationAutoDetected, setDurationAutoDetected] = useState(false);
  const [audioSelectedModel, setAudioSelectedModel] = useState(
    () => localStorage.getItem(AUDIO_SELECTED_MODEL_KEY) || "",
  );
  const [audioSelectedProvider, setAudioSelectedProvider] = useState(
    () => localStorage.getItem(AUDIO_SELECTED_PROVIDER_KEY) || "",
  );
  const [audioAvailableModels, setAudioAvailableModels] = useState([]);
  const [generatedAudio, setGeneratedAudio] = useState(null);
  const [localError, setLocalError] = useState("");
  const videoInputRef = useRef(null);

  // ── Server job tracking ───────────────────────────────────────────
  const [serverJobs, setServerJobs] = useState([]);
  const audioJobs = getJobsByType("audio");
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
  const [selectedRunningJobId, setSelectedRunningJobId] = useState(null);
  const shouldPollServerJobs = hasActiveJobs || selectedRunningJobId !== null;

  const saveMusicRef = useRef(saveMusic);
  const addLibraryAssetRef = useRef(addLibraryAsset);
  const promptRef = useRef(audioPrompt);

  useEffect(() => { saveMusicRef.current = saveMusic; }, [saveMusic]);
  useEffect(() => { addLibraryAssetRef.current = addLibraryAsset; }, [addLibraryAsset]);
  useEffect(() => { promptRef.current = audioPrompt; }, [audioPrompt]);

  // Clear local error on mount
  useEffect(() => { setLocalError(""); }, []);

  // Load prompt data from selected job (when clicking a job in JobsPanel)
  useEffect(() => {
    if (selectedJob && (selectedJob.type === "audio" || selectedJob.type === "music")) {
      // Restore prompt
      const jobPrompt = selectedJob.prompt || selectedJob.payload?.prompt || "";
      if (jobPrompt) setAudioPrompt(jobPrompt);

      // Handle failed job - show error
      if (selectedJob.status === "failed") {
        setLocalError(selectedJob.error || "Generation failed");
        setSelectedRunningJobId(null);
      } else if (
        selectedJob.status === "running" ||
        selectedJob.status === "pending"
      ) {
        // Track running/pending job to show progress
        setSelectedRunningJobId(selectedJob.id);
        setLocalError("");

        const metadata = selectedJob.params?.metadata || selectedJob.metadata;
        const payload = selectedJob.payload || selectedJob.params || {};
        const resolvedProvider = metadata?.provider || payload.provider || "";

        // Prioritize modelKey from metadata
        let resolvedModelKey = metadata?.modelKey || "";

        // If no modelKey, try to find modelKey from availableModels using model ID
        if (!resolvedModelKey && (selectedJob.model || payload.model)) {
          const modelId = selectedJob.model || payload.model;
          const matchingModel = audioAvailableModels.find(
            (m) => m.id === modelId,
          );
          if (matchingModel) {
            resolvedModelKey = matchingModel.modelKey;
          } else {
            resolvedModelKey = modelId;
          }
        }

        // Set provider
        if (resolvedProvider) {
          setConfiguredProviderFilter(resolvedProvider);
          localStorage.setItem(AUDIO_SELECTED_PROVIDER_KEY, resolvedProvider);
        }

        // Set model
        if (resolvedModelKey) {
          setAudioSelectedModel(resolvedModelKey);
          localStorage.setItem(AUDIO_SELECTED_MODEL_KEY, resolvedModelKey);
        }

        // Load mode
        if (payload.mode) {
          setAudioSubMode(payload.mode);
        }

        // Load advanced settings from payload
        if (payload.negativePrompt != null) setNegativePrompt(payload.negativePrompt);
        if (payload.seed != null) setAudioSeed(Number(payload.seed));
        if (payload.numSteps != null) setNumSteps(Number(payload.numSteps));
        if (payload.cfgStrength != null) setCfgStrength(Number(payload.cfgStrength));
        if (payload.duration != null) setAudioDuration(Number(payload.duration));

        // Load HF space settings from payload
        if (payload.hfSpaceTarget) setHfSpaceTarget(payload.hfSpaceTarget);
        if (payload.hfCustomSpace != null) setHfCustomSpace(payload.hfCustomSpace);
      } else {
        // Completed, cancelled, or other status
        setLocalError("");
        setSelectedRunningJobId(null);

        const metadata = selectedJob.params?.metadata || selectedJob.metadata;
        const payload = selectedJob.payload || selectedJob.params || {};
        const resolvedProvider = metadata?.provider || payload.provider || "";

        // Prioritize modelKey from metadata
        let resolvedModelKey = metadata?.modelKey || "";

        // If no modelKey, try to find modelKey from availableModels using model ID
        if (!resolvedModelKey && (selectedJob.model || payload.model)) {
          const modelId = selectedJob.model || payload.model;
          const matchingModel = audioAvailableModels.find(
            (m) => m.id === modelId,
          );
          if (matchingModel) {
            resolvedModelKey = matchingModel.modelKey;
          } else {
            resolvedModelKey = modelId;
          }
        }

        // Set provider
        if (resolvedProvider) {
          setConfiguredProviderFilter(resolvedProvider);
          localStorage.setItem(AUDIO_SELECTED_PROVIDER_KEY, resolvedProvider);
        }

        // Set model
        if (resolvedModelKey) {
          setAudioSelectedModel(resolvedModelKey);
          localStorage.setItem(AUDIO_SELECTED_MODEL_KEY, resolvedModelKey);
        }

        // Load mode
        if (payload.mode) {
          setAudioSubMode(payload.mode);
        }

        // Load advanced settings from payload
        if (payload.negativePrompt != null) setNegativePrompt(payload.negativePrompt);
        if (payload.seed != null) setAudioSeed(Number(payload.seed));
        if (payload.numSteps != null) setNumSteps(Number(payload.numSteps));
        if (payload.cfgStrength != null) setCfgStrength(Number(payload.cfgStrength));
        if (payload.duration != null) setAudioDuration(Number(payload.duration));

        // Load HF space settings from payload
        if (payload.hfSpaceTarget) setHfSpaceTarget(payload.hfSpaceTarget);
        if (payload.hfCustomSpace != null) setHfCustomSpace(payload.hfCustomSpace);

        // If job is completed, try to load result
        if (selectedJob.status === "completed") {
          const completedAudioUrl =
            selectedJob.result?.data?.url ||
            selectedJob.result?.data?.[0]?.url ||
            selectedJob.result?.url;
          if (completedAudioUrl) {
            setGeneratedAudio({
              url: completedAudioUrl,
              mode: selectedJob.result?.data?.mode || payload.mode,
              prompt: jobPrompt,
            });
          } else if (metadata?.audioId) {
            // Fallback to history lookup
            const historyItem = getMusic(metadata.audioId);
            if (historyItem) {
              setGeneratedAudio(historyItem.result || null);
            }
          }
        }
      }

      // Clear selected job after loading
      setSelectedJob(null);
    }
  }, [selectedJob, setSelectedJob, getMusic, audioAvailableModels]);

  // Register save fns for music type
  useEffect(() => {
    registerSaveFns("music", {
      save: saveMusic,
      get: getMusic,
      history: musicHistory,
      getIds: getMusicIds,
      deleteItem: deleteMusic,
      clearAll: clearAllMusic,
    });
  }, [registerSaveFns, saveMusic, getMusic, musicHistory, getMusicIds, deleteMusic, clearAllMusic]);

  // Auto-select the first running or pending audio job after page reload
  useEffect(() => {
    if (selectedRunningJobId) return;
    const firstRunningJob = runningJobs[0];
    const firstPendingJob = pendingJobs[0];
    if (firstRunningJob) {
      setSelectedRunningJobId(firstRunningJob.id);
    } else if (firstPendingJob) {
      setSelectedRunningJobId(firstPendingJob.id);
    }
  }, [runningJobs, pendingJobs, selectedRunningJobId]);

  // Sync server jobs and poll while audio jobs are active
  useEffect(() => {
    const syncServerJobs = async () => {
      try {
        const result = await getJobs({ type: "audio", limit: 100 });
        if (result.success && result.items) {
          const normalizedJobs = result.items.map((job) => ({
            ...job,
            status: mapServerStatus(job.status),
          }));
          setServerJobs((prev) => {
            const prevSignature = prev
              .map((job) => `${job.id}:${job.status}:${job.progress}:${job.updatedAt}`)
              .join("|");
            const nextSignature = normalizedJobs
              .map((job) => `${job.id}:${job.status}:${job.progress}:${job.updatedAt}`)
              .join("|");
            return prevSignature === nextSignature ? prev : normalizedJobs;
          });

          // Find the currently selected server job
          const selectedServerJob = result.items.find(
            (j) => j.id === selectedRunningJobId,
          );

          if (selectedRunningJobId && !selectedServerJob) {
            setSelectedRunningJobId(null);
            setLocalError("Generation interrupted: Job no longer exists on server.");
          } else if (selectedServerJob) {
            const selectedServerJobStatus = mapServerStatus(selectedServerJob.status);

            if (selectedServerJobStatus === "completed") {
              const audioUrl =
                selectedServerJob.result?.data?.url ||
                selectedServerJob.result?.data?.[0]?.url ||
                selectedServerJob.result?.url;
              if (audioUrl) {
                const audioData = {
                  url: audioUrl,
                  mode: selectedServerJob.result?.data?.mode || selectedServerJob.payload?.mode,
                  prompt: selectedServerJob.payload?.prompt || promptRef.current,
                };
                setGeneratedAudio(audioData);
                // Save to history
                const audioId =
                  selectedServerJob.metadata?.audioId || generateAudioId();
                saveMusicRef.current?.(
                  audioId,
                  selectedServerJob.payload?.prompt || promptRef.current,
                  audioData,
                  selectedServerJob.payload?.model ||
                    selectedServerJob.metadata?.model,
                );
                // Add to library
                addLibraryAssetRef.current?.({
                  type: selectedServerJob.result?.data?.mode === "video_to_audio" ? "video" : "audio",
                  source: "audio",
                  title:
                    (selectedServerJob.payload?.prompt || promptRef.current).slice(0, 80) ||
                    "Generated audio",
                  url: audioData.url,
                  metadata: selectedServerJob.metadata,
                });
              } else {
                setLocalError("Generation completed but no audio URL was returned.");
              }
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

    if (!shouldPollServerJobs) return;
    const pollInterval = setInterval(syncServerJobs, 3000);
    return () => clearInterval(pollInterval);
  }, [shouldPollServerJobs, selectedRunningJobId]);

  // Only show error from localError (current generation)
  const error = localError;

  // Get the selected running job for progress display
  const selectedRunningJob = serverJobs.find(
    (job) => job.id === selectedRunningJobId,
  );
  const selectedJobProgress = selectedRunningJob?.progress || 0;

  // ── HF Space target ──────────────────────────────────────────────
  const [hfSpaceTarget, setHfSpaceTarget] = useState(
    () => localStorage.getItem(AUDIO_HF_SPACE_TARGET_KEY) || "public",
  );
  const [hfCustomSpace, setHfCustomSpace] = useState(
    () => localStorage.getItem(AUDIO_HF_CUSTOM_SPACE_KEY) || "",
  );
  const [spaceUrlCopied, setSpaceUrlCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem(AUDIO_HF_SPACE_TARGET_KEY, hfSpaceTarget);
  }, [hfSpaceTarget]);

  useEffect(() => {
    localStorage.setItem(AUDIO_HF_CUSTOM_SPACE_KEY, hfCustomSpace);
  }, [hfCustomSpace]);

  // ── Model selector state ─────────────────────────────────────────
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(AUDIO_SELECTED_PROVIDER_KEY) || "",
  );
  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const searchInputRef = useRef(null);

  const isOllamaLocalActive =
    cloudFilter === "local" && configuredProviderFilter === "ollama";
  const ollamaLocal = useOllamaLocal(isOllamaLocalActive);

  // ── Derived: active space URL ─────────────────────────────────────
  const activeSpaceValue =
    hfSpaceTarget === "custom" && hfCustomSpace.trim()
      ? hfCustomSpace.trim()
      : DEFAULT_MMAUDIO_SPACE;
  const activeSpaceUrl = toHuggingFaceSpacePageUrl(activeSpaceValue);

  const handleCopySpaceUrl = useCallback(async () => {
    if (!activeSpaceUrl) return;
    try {
      await navigator.clipboard.writeText(activeSpaceUrl);
      setSpaceUrlCopied(true);
      setTimeout(() => setSpaceUrlCopied(false), 1200);
    } catch {}
  }, [activeSpaceUrl]);

  // ── Load audio models ─────────────────────────────────────────────
  useEffect(() => {
    const loadAudioModels = async () => {
      try {
        const result = await getModels({ category: "audio", provider: "all" });
        const models = result.models || [];
        setAudioAvailableModels(models);

        if (!audioSelectedModel && models.length > 0) {
          const first = models[0];
          const key = first.modelKey || first.id || "";
          setAudioSelectedModel(key);
          localStorage.setItem(AUDIO_SELECTED_MODEL_KEY, key);
          const prov = first.configuredProvider || first.provider || "";
          if (prov) {
            setAudioSelectedProvider(prov);
            localStorage.setItem(AUDIO_SELECTED_PROVIDER_KEY, prov);
          }
        }
      } catch (err) {
        console.error("Failed to load audio models:", err);
      }
    };
    loadAudioModels();
  }, [audioSelectedModel]);

  // ── Provider / model helpers ──────────────────────────────────────
  const gatewayProviders = useMemo(() => {
    return providers
      .filter((p) => p.configured)
      .map((p) => p.id);
  }, [providers]);

  const hasCloudModels = audioAvailableModels.some((m) => m.isCloud);
  const hasLocalModels = audioAvailableModels.some((m) => !m.isCloud);

  const filteredModels = useMemo(() => {
    let models = audioAvailableModels;

    if (cloudFilter === "cloud") models = models.filter((m) => m.isCloud);
    if (cloudFilter === "local") models = models.filter((m) => !m.isCloud);

    if (configuredProviderFilter) {
      models = models.filter(
        (m) =>
          m.configuredProvider === configuredProviderFilter ||
          m.provider === configuredProviderFilter,
      );
    }

    if (modelSearch.trim()) {
      const q = modelSearch.toLowerCase();
      models = models.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.id || "").toLowerCase().includes(q) ||
          (m.provider || "").toLowerCase().includes(q),
      );
    }

    return models;
  }, [audioAvailableModels, cloudFilter, configuredProviderFilter, modelSearch]);

  const selectedModelInfo = audioAvailableModels.find(
    (m) => (m.modelKey || m.id) === audioSelectedModel,
  );

  // ── Focus search on model selector open ───────────────────────────
  useEffect(() => {
    if (showModelSelector && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showModelSelector]);

  // ── Model selector handlers ──────────────────────────────────────
  const handleModelSelect = (model) => {
    const key = model.modelKey || model.id || "";
    setAudioSelectedModel(key);
    localStorage.setItem(AUDIO_SELECTED_MODEL_KEY, key);
    const prov = model.configuredProvider || model.provider || "";
    if (prov) {
      setAudioSelectedProvider(prov);
      localStorage.setItem(AUDIO_SELECTED_PROVIDER_KEY, prov);
    }
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleLocalModelSelect = (modelId) => {
    setAudioSelectedModel(modelId);
    localStorage.setItem(AUDIO_SELECTED_MODEL_KEY, modelId);
    setIsLocalModelSelected(true);
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleCloseModelSelector = () => {
    setShowModelSelector(false);
    setModelSearch("");
  };

  // ── Video handling ────────────────────────────────────────────────
  const detectVideoDuration = (videoSrc) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = videoSrc;
    video.onloadedmetadata = () => {
      const dur = Math.round(video.duration);
      if (dur && dur > 0) {
        setVideoDuration(dur);
        setAudioDuration(Math.min(dur, 15)); // cap at 15s (model max)
        setDurationAutoDetected(true);
      }
    };
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoUploading(true);
    setLocalError("");
    try {
      // Read as data URL for preview
      const previewReader = new FileReader();
      const previewPromise = new Promise((resolve) => {
        previewReader.onload = () => resolve(previewReader.result);
        previewReader.readAsDataURL(file);
      });
      const previewDataUrl = await previewPromise;
      setVideoPreview(previewDataUrl);
      setVideoFile(file);

      // Auto-detect duration from the preview
      detectVideoDuration(previewDataUrl);

      // Upload to library
      const uploadResult = await uploadLibraryFile({
        fileName: file.name,
        fileBase64: previewDataUrl,
        mimeType: file.type,
        type: "video",
        title: file.name,
        source: "audio-video-upload",
      });

      if (uploadResult?.asset?.url) {
        setVideoUrl(uploadResult.asset.url);
        setVideoSourceType("upload");
        refreshLibraryAssets?.({ type: "video" });
      } else {
        throw new Error("Failed to upload video to library");
      }
    } catch (err) {
      setLocalError(err.message || "Failed to process video file");
    } finally {
      setVideoUploading(false);
    }
  };

  const handleVideoAssetSelect = (asset) => {
    if (asset?.url) {
      const resolvedUrl = resolveAssetUrl(asset.url);
      setVideoUrl(asset.url);
      setVideoPreview(resolvedUrl);
      setVideoFile(null);
      setVideoSourceType("library");
      // Auto-detect duration from the library video
      detectVideoDuration(resolvedUrl);
      // Store the video's original prompt for optional reuse
      const videoPrompt = asset.metadata?.prompt || asset.title || "";
      setSelectedVideoPrompt(videoPrompt);
    }
    setShowVideoAssetPicker(false);
  };

  const clearVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
    setVideoUrl("");
    setVideoDuration(null);
    setDurationAutoDetected(false);
    setSelectedVideoPrompt("");
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  // ── Generate audio (server job queue) ──────────────────────────────
  const handleAudioGenerate = async () => {
    if (hasActiveJobs && runningCount >= maxConcurrentJobs) return;
    if (audioSubMode === "video_to_audio" && !videoUrl) {
      setLocalError("Please upload or select a video for Video → Audio mode");
      return;
    }
    if (audioSubMode === "text_to_audio" && !audioPrompt.trim()) {
      setLocalError("Please enter a prompt for Text → Audio mode");
      return;
    }

    setLocalError("");
    setSelectedRunningJobId(null);

    const selectedInfo = audioAvailableModels.find(
      (m) => (m.modelKey || m.id) === audioSelectedModel,
    );
    const effectiveProvider = isLocalModelSelected
      ? "ollama"
      : configuredProviderFilter || selectedInfo?.provider || "huggingface";

    const modelIdToSend = isLocalModelSelected
      ? audioSelectedModel
      : selectedInfo?.id;
    const audioId = generateAudioId();

    try {
      const payload = {
        mode: audioSubMode,
        prompt: audioPrompt,
        negativePrompt,
        seed: audioSeed,
        numSteps,
        cfgStrength,
        duration: audioDuration,
        provider: effectiveProvider,
        model: modelIdToSend || undefined,
        modelKey: audioSelectedModel || undefined,
        hfSpaceTarget,
        hfCustomSpace: hfSpaceTarget === "custom" ? hfCustomSpace.trim() : "",
      };

      if (audioSubMode === "video_to_audio" && videoUrl) {
        payload.videoUrl = videoUrl;
      }

      const serverResult = await enqueueServerJob({
        type: "audio",
        payload,
        metadata: {
          audioId,
          modelKey: selectedInfo?.modelKey || audioSelectedModel,
          provider: effectiveProvider,
          mode: audioSubMode,
        },
      });

      if (serverResult.success && serverResult.job) {
        // Optimistically add job to local state so it appears instantly
        setServerJobs((prev) => {
          const exists = prev.some((j) => j.id === serverResult.job.id);
          if (exists) return prev;
          return [...prev, { ...serverResult.job, status: mapServerStatus(serverResult.job.status) }];
        });
        setSelectedRunningJobId(serverResult.job.id);
      } else {
        throw new Error(serverResult.error || "Failed to enqueue job");
      }
    } catch (err) {
      setLocalError(err.message || "Failed to start generation");
    }
  };

  // ── Download ──────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!generatedAudio?.url) return;
    const resolvedUrl = resolveAssetUrl(generatedAudio.url);
    const link = document.createElement("a");
    link.href = resolvedUrl;
    const isVideoAudio = generatedAudio.mode === "video_to_audio";
    link.download = isVideoAudio ? `audio_video_${Date.now()}.mp4` : `audio_${Date.now()}.wav`;
    link.click();
  };

  // ── History sidebar integration ───────────────────────────────────
  const handleMusicHistorySelected = useCallback(
    (e) => {
      const { musicId } = e.detail || {};
      if (!musicId) return;

      const musicItem = getMusic(musicId);
      if (!musicItem) return;

      setGeneratedAudio(
        musicItem.result
          ? { ...musicItem.result, prompt: musicItem.prompt }
          : null,
      );
      setAudioPrompt(musicItem.prompt || "");
      setLocalError("");
      setSelectedRunningJobId(null); // Clear running job to prevent showing loading state

      const metadata =
        musicItem?.metadata && typeof musicItem.metadata === "object"
          ? musicItem.metadata
          : null;
      const legacyModel = musicItem?.model || "";
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
        const matchingModel = audioAvailableModels.find(
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
        localStorage.setItem(AUDIO_SELECTED_PROVIDER_KEY, resolvedProvider);
      }

      if (resolvedModelKey) {
        setAudioSelectedModel(resolvedModelKey);
        localStorage.setItem(AUDIO_SELECTED_MODEL_KEY, resolvedModelKey);
      }

      // Restore mode if available
      if (musicItem.result?.mode) {
        setAudioSubMode(musicItem.result.mode);
      }
    },
    [getMusic, audioAvailableModels],
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

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Audio Generation
            </h2>
            <p className="text-xs text-gray-400">
              {selectedModelInfo?.name || "MMAudio"}
            </p>
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

      {/* Model Selector Overlay */}
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
                  <Volume2 className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Select Audio Model
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
                    localStorage.setItem(AUDIO_SELECTED_PROVIDER_KEY, provider);
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
                selectedModelId={isLocalModelSelected ? audioSelectedModel : ""}
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
                  filteredModels.map((model) => {
                    const key = model.modelKey || model.id || "";
                    return (
                      <button
                        key={key}
                        onClick={() => handleModelSelect(model)}
                        className={`p-3 rounded-xl text-left border transition-all ${
                          audioSelectedModel === key
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
                    );
                  })
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
              {/* HuggingFace Space URL Display */}
              <div className="bg-cyan-950/20 border border-cyan-800/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                  <span className="text-sm font-medium text-cyan-200">
                    HuggingFace Public Space Connected
                  </span>
                </div>

                {/* Space Target toggle */}
                <div className="mb-2 space-y-2">
                  <label className="block text-xs font-medium text-gray-300">
                    MMAudio Space Target
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
                        placeholder="username/your-mmaudio-space or https://...hf.space"
                        className="w-full bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-gray-300 bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 space-y-1">
                  <div className="text-gray-400">
                    {hfSpaceTarget === "custom"
                      ? `Using custom space: ${hfCustomSpace || "(not set)"}`
                      : `Using public space: ${DEFAULT_MMAUDIO_SPACE}`}
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

              {/* Audio Sub-Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAudioSubMode("video_to_audio")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    audioSubMode === "video_to_audio"
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  }`}
                >
                  <Film className="w-4 h-4" />
                  Video → Audio
                </button>
                <button
                  onClick={() => setAudioSubMode("text_to_audio")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    audioSubMode === "text_to_audio"
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  }`}
                >
                  <Type className="w-4 h-4" />
                  Text → Audio
                </button>
              </div>

              {/* Video Upload (video_to_audio mode) */}
              {audioSubMode === "video_to_audio" && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Source Video
                  </label>

                  {/* Upload / Library toggle */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVideoSourceType("upload")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                        videoSourceType === "upload"
                          ? "bg-purple-600 text-white"
                          : "bg-gray-700 text-gray-200"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                    </button>
                    <button
                      onClick={() => setVideoSourceType("library")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                        videoSourceType === "library"
                          ? "bg-purple-600 text-white"
                          : "bg-gray-700 text-gray-200"
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      From Library
                    </button>
                  </div>

                  {/* Upload source */}
                  {videoSourceType === "upload" && (
                    <div className="space-y-2">
                      {videoPreview ? (
                        <div className="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-700">
                          <video
                            src={videoPreview}
                            className="w-full max-h-48 object-contain"
                            muted
                            controls
                          />
                          <button
                            onClick={clearVideo}
                            className="absolute top-2 right-2 p-1.5 bg-gray-900/80 hover:bg-red-600 rounded-full transition-colors"
                            title="Remove video"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-gray-800/50 transition-all">
                          <Upload className="w-8 h-8 text-gray-500 mb-2" />
                          <span className="text-sm text-gray-400">
                            Click to upload a video file
                          </span>
                          <span className="text-xs text-gray-500 mt-1">
                            MP4, WebM, MOV supported
                          </span>
                          <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            onChange={handleVideoUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                      {videoUploading && (
                        <div className="flex items-center gap-2 text-xs text-purple-400">
                          <LoadingSpinner size="sm" />
                          Uploading video...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Library source */}
                  {videoSourceType === "library" && (
                    <div className="space-y-2">
                      {videoPreview ? (
                        <div className="relative rounded-lg overflow-hidden bg-gray-900 border border-gray-700">
                          <video
                            src={videoPreview}
                            className="w-full max-h-48 object-contain"
                            muted
                            controls
                          />
                          <button
                            onClick={clearVideo}
                            className="absolute top-2 right-2 p-1.5 bg-gray-900/80 hover:bg-red-600 rounded-full transition-colors"
                            title="Remove video"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowVideoAssetPicker(true)}
                          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-gray-800/50 transition-all"
                        >
                          <Film className="w-8 h-8 text-gray-500 mb-2" />
                          <span className="text-sm text-gray-400">
                            Select a video from library
                          </span>
                          <span className="text-xs text-gray-500 mt-1">
                            Browse your uploaded and generated videos
                          </span>
                        </button>
                      )}
                      {selectedVideoPrompt && (
                        <button
                          onClick={() => setAudioPrompt(selectedVideoPrompt)}
                          className="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 hover:border-purple-500/50 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                          title={`Load video prompt: "${selectedVideoPrompt.slice(0, 80)}${selectedVideoPrompt.length > 80 ? "..." : ""}"`}
                        >
                          <ArrowDownToLine className="w-4 h-4" />
                          Use Video Prompt as Audio Prompt
                        </button>
                      )}
                    </div>
                  )}

                  {/* Auto-detected duration indicator */}
                  {durationAutoDetected && videoDuration && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 rounded px-2 py-1.5">
                      <Film className="w-3.5 h-3.5" />
                      <span>
                        Video duration: {videoDuration}s — audio duration auto-set to {audioDuration}s
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Audio Prompt */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  {audioSubMode === "video_to_audio"
                    ? "Audio Description (optional)"
                    : "Audio Prompt"}
                </label>
                <textarea
                  value={audioPrompt}
                  onChange={(e) => setAudioPrompt(e.target.value)}
                  placeholder={
                    audioSubMode === "video_to_audio"
                      ? "Describe the audio you want (e.g., 'rain falling on leaves, distant thunder')"
                      : "Describe the audio to generate (e.g., 'ocean waves crashing on shore, seagulls')"
                  }
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Negative Prompt */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Negative Prompt
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="music"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Advanced Settings */}
              <CollapsiblePanel
                title="Advanced Settings"
                defaultExpanded={false}
                icon={Settings}
              >
                <div className="space-y-4 pt-2">
                  <SliderControl
                    label="Inference Steps"
                    value={numSteps}
                    onChange={setNumSteps}
                    min={10}
                    max={50}
                    step={1}
                  />
                  <SliderControl
                    label="CFG Strength"
                    value={cfgStrength}
                    onChange={setCfgStrength}
                    min={1}
                    max={10}
                    step={0.5}
                  />
                  <SliderControl
                    label={
                      durationAutoDetected
                        ? `Duration (auto: ${videoDuration}s)`
                        : "Duration (seconds)"
                    }
                    value={audioDuration}
                    onChange={setAudioDuration}
                    min={2}
                    max={15}
                    step={1}
                  />
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-300">
                      Seed (-1 = random)
                    </label>
                    <input
                      type="number"
                      value={audioSeed}
                      onChange={(e) => setAudioSeed(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </CollapsiblePanel>

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
                    Configure API keys in Admin panel to generate audio.
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
                    onClick={() => cancelAllJobsByType("audio")}
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
                          {job.payload?.prompt?.slice(0, 40) || "Generating..."}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: `${job.progress || 0}%` }}
                            />
                          </div>
                          <span>{Math.round(job.progress || 0)}%</span>
                          <button
                            onClick={() => cancelJob(job.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleAudioGenerate}
              disabled={
                !isConfigured ||
                (audioSubMode === "text_to_audio" && !audioPrompt.trim()) ||
                (audioSubMode === "video_to_audio" && !videoUrl) ||
                (hasActiveJobs && runningCount >= maxConcurrentJobs)
              }
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="w-full bg-purple-600 hover:bg-purple-500"
            >
              Generate Audio
              {hasActiveJobs &&
                pendingCount >= maxConcurrentJobs - runningCount && (
                  <span className="ml-2 text-xs opacity-75">(Queued)</span>
                )}
            </Button>

            {/* Mobile Output — visible only below lg */}
            <div className="lg:hidden mt-4">
              <MediaOutputPanel
                mediaType="music"
                generatedMedia={generatedAudio}
                mediaHistory={musicHistory}
                getMediaIds={getMusicIds}
                onDownload={handleDownload}
                onPreview={(audio) => {
                  setSelectedRunningJobId(null);
                  setGeneratedAudio({
                    url: audio.url,
                    mode: audio.mode,
                    prompt: audio.prompt,
                  });
                }}
                onReloadPrompt={(audio) => {
                  setSelectedRunningJobId(null);
                  setAudioPrompt(audio.prompt || "");
                  setGeneratedAudio({
                    url: audio.url,
                    mode: audio.mode,
                    prompt: audio.prompt,
                  });
                }}
                onDeleteMedia={(audioId) => {
                  deleteMusic(audioId);
                  if (generatedAudio?.id === audioId) {
                    setGeneratedAudio(null);
                  }
                }}
                onClearHistory={clearAllMusic}
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
            mediaType="music"
            generatedMedia={generatedAudio}
            mediaHistory={musicHistory}
            getMediaIds={getMusicIds}
            onDownload={handleDownload}
            onPreview={(audio) => {
              setSelectedRunningJobId(null);
              setGeneratedAudio({
                url: audio.url,
                mode: audio.mode,
                prompt: audio.prompt,
              });
            }}
            onReloadPrompt={(audio) => {
              setSelectedRunningJobId(null);
              setAudioPrompt(audio.prompt || "");
              setGeneratedAudio({
                url: audio.url,
                mode: audio.mode,
                prompt: audio.prompt,
              });
            }}
            onDeleteMedia={(audioId) => {
              deleteMusic(audioId);
              if (generatedAudio?.id === audioId) {
                setGeneratedAudio(null);
              }
            }}
            onClearHistory={clearAllMusic}
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

      {/* Video Asset Picker Dialog */}
      <AssetPickerDialog
        open={showVideoAssetPicker}
        onClose={() => setShowVideoAssetPicker(false)}
        onSelect={handleVideoAssetSelect}
        type="video"
        title="Select Video for Audio Generation"
      />
    </div>
  );
}
