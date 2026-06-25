import { useCallback, useEffect, useRef, useState } from "react";
import { Mp3Encoder } from "lamejs";
import {
  enqueuePipeline, transcribeAudio, enhanceAudio, resolveAssetUrl,
  uploadLibraryFile, verifyInternalToken,
} from "../services/api";
import AssetPickerDialog from "./library/AssetPickerDialog";
import { useApp } from "../context/AppContext";
import { useJobs } from "../context/JobContext";
import { useAudioPlayer } from "../context/AudioPlayerContext";
import { MediaOutputPanel } from "./shared";
import {
  Mic, Sparkles, Wand2, Music2,
  ChevronDown, ChevronUp, Loader2,
  UploadCloud, Clock, AlertCircle,
  SlidersHorizontal, Cpu, Brain,
  Library,
} from "lucide-react";

const GENRE_TAGS = [
  "lo-fi", "hip hop", "jazz", "electronic", "cinematic", "pop", "rock",
  "ambient", "classical", "r&b", "drum & bass", "synthwave", "acoustic",
];

const MIN_DURATION = 15;
const MAX_DURATION = 240;

const SONICMASTER_SPACE = "amaai-lab/SonicMaster";
const WHISPER_SPACE = "openai/whisper";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const payload = result.includes(",") ? result.split(",")[1] : result;
      resolve(payload);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAudioDuration(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onloadedmetadata = () => resolve(Math.round(audio.duration));
    audio.onerror = () => resolve(null);
  });
}

function formatDuration(secs) {
  if (!secs || secs <= 0) return "?";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ValidationErrors({ errors }) {
  if (!errors.length) return null;
  return (
    <div className="bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 space-y-1">
      {errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{e}</span>
        </div>
      ))}
    </div>
  );
}

export default function MusicRemix() {
  const {
    remixHistory,
    saveRemix,
    deleteRemix,
    clearAllRemixes,
    getRemixIds,
    refreshLibraryAssets,
  } = useApp();
  const { enqueueJob, selectedJob, setSelectedJob, getJobsByType, registerSaveFns } = useJobs();

  const [selectedRunningJobId, setSelectedRunningJobId] = useState(null);
  const remixJobs = getJobsByType("remix");
  const runningRemixJobs = remixJobs.filter((job) => job.status === "running");
  const pendingRemixJobs = remixJobs.filter((job) => job.status === "pending");
  const selectedRunningJob = remixJobs.find((job) => job.id === selectedRunningJobId);
  const selectedJobProgress = selectedRunningJob?.progress ?? 0;
  const hasActiveRemixJobs = runningRemixJobs.length > 0 || pendingRemixJobs.length > 0;

  const [file, setFile] = useState(null);
  const [sourceAudioName, setSourceAudioName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioBase64, setAudioBase64] = useState("");
  const [sourceDuration, setSourceDuration] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState("reduce reverb, clarify vocals, improve balance");
  const [enhancedUrl, setEnhancedUrl] = useState(null);

  // mode: "simple" | "genre" | "instrumental"
  const [inputMode, setInputMode] = useState("simple");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [lyrics, setLyrics] = useState("");
  const [duration, setDuration] = useState("");
  const [refAudioStrength, setRefAudioStrength] = useState(0.2);
  const [seed, setSeed] = useState(-1);
  const [inferStep, setInferStep] = useState(8);
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [model, setModel] = useState("acestep-v15-xl-turbo");
  const [thinking, setThinking] = useState(false);
  const [bpm, setBpm] = useState("");
  const [keyScale, setKeyScale] = useState("");
  const [timeSignature, setTimeSignature] = useState("");
  const [coverStrength, setCoverStrength] = useState(0.8);
  const [negativeStyles, setNegativeStyles] = useState("");
  const [refAudioFile, setRefAudioFile] = useState(null);
  const [refAudioBase64, setRefAudioBase64] = useState(null);
  const [refAudioMime, setRefAudioMime] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useInternalApi, setUseInternalApi] = useState(() => localStorage.getItem("acestudio_use_internal_api") === "true");
  const [internalBearerToken, setInternalBearerToken] = useState(() => localStorage.getItem("acestudio_internal_bearer") || "");
  const [internalAiToken, setInternalAiToken] = useState(() => localStorage.getItem("acestudio_internal_ai_token") || "");
  const [internalRouter, setInternalRouter] = useState(() => localStorage.getItem("acestudio_internal_router") || "");
  const [tokenVerifyStatus, setTokenVerifyStatus] = useState("idle"); // idle | loading | success | error
  const [tokenVerifyMessage, setTokenVerifyMessage] = useState("");

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const [validationErrors, setValidationErrors] = useState([]);
  const [generatedRemix, setGeneratedRemix] = useState(null);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const { requestPlayTrack } = useAudioPlayer();

  const fileInputRef = useRef(null);
  const saveRemixRef = useRef(saveRemix);
  const instrumental = inputMode === "instrumental";

  useEffect(() => {
    saveRemixRef.current = saveRemix;
  }, [saveRemix]);

  useEffect(() => {
    registerSaveFns("remix", (remixHistoryId, prompt, result, model, metadata) => {
      saveRemixRef.current?.(remixHistoryId, prompt, result, model, metadata);
    });
  }, [registerSaveFns, saveRemix]);

  useEffect(() => {
    if (generatedRemix?.url) {
      requestPlayTrack({ ...generatedRemix, type: "remix" });
    }
  }, [generatedRemix?.url, requestPlayTrack]);

  useEffect(() => {
    localStorage.setItem("acestudio_use_internal_api", String(useInternalApi));
  }, [useInternalApi]);

  useEffect(() => {
    localStorage.setItem("acestudio_internal_bearer", internalBearerToken);
  }, [internalBearerToken]);

  useEffect(() => {
    localStorage.setItem("acestudio_internal_ai_token", internalAiToken);
  }, [internalAiToken]);

  useEffect(() => {
    localStorage.setItem("acestudio_internal_router", internalRouter);
  }, [internalRouter]);

  const applyRemixFormFromMetadata = useCallback((metadata, fallbackPrompt = "") => {
    if (!metadata || typeof metadata !== "object") {
      if (fallbackPrompt) setDescription(fallbackPrompt);
      return;
    }

    if (metadata.inputMode) setInputMode(metadata.inputMode);

    if (metadata.tags) {
      const tagList = metadata.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      setTags(metadata.tags);
      setSelectedTags(tagList);
    }

    if (metadata.description) {
      setDescription(metadata.description);
    } else if (metadata.inputMode === "simple" && fallbackPrompt) {
      setDescription(fallbackPrompt);
    } else if (!metadata.tags && fallbackPrompt) {
      setDescription(fallbackPrompt);
    }

    if (metadata.model) setModel(metadata.model);
    if (metadata.refAudioStrength != null) {
      setRefAudioStrength(Number(metadata.refAudioStrength));
    }
    if (metadata.coverStrength != null) {
      setCoverStrength(Number(metadata.coverStrength));
    }
    if (metadata.useInternalApi != null) setUseInternalApi(Boolean(metadata.useInternalApi));
    if (metadata.internalBearerToken != null) setInternalBearerToken(String(metadata.internalBearerToken));
    if (metadata.internalAiToken != null) setInternalAiToken(String(metadata.internalAiToken));
    if (metadata.internalRouter != null) setInternalRouter(String(metadata.internalRouter));
  }, []);

  // Re-attach UI to in-flight remix jobs when returning to this page
  useEffect(() => {
    if (selectedRunningJobId || isPreparing) return;
    const active = remixJobs.find(
      (job) => job.status === "running" || job.status === "pending",
    );
    if (!active) return;
    setSelectedRunningJobId(active.id);
    if (active.progress != null) setGenProgress(active.progress);
    if (active.message) setGenMessage(active.message);
    if (active.params?.remixMetadata) {
      applyRemixFormFromMetadata(active.params.remixMetadata, active.prompt);
    }
  }, [remixJobs, selectedRunningJobId, isPreparing, applyRemixFormFromMetadata]);

  useEffect(() => {
    if (!selectedJob || selectedJob.type !== "remix") return;

    const jobPrompt = selectedJob.prompt || selectedJob.params?.prompt || "";
    const remixHistoryId = selectedJob.params?.remixHistoryId;
    const historyItem = remixHistoryId ? remixHistory[remixHistoryId] : null;
    const metadata = historyItem?.metadata || selectedJob.params?.remixMetadata || null;

    applyRemixFormFromMetadata(metadata, jobPrompt);
    setError("");

    if (selectedJob.status === "failed") {
      setError(selectedJob.error || "Generation failed");
      setSelectedRunningJobId(null);
    } else if (
      selectedJob.status === "running" ||
      selectedJob.status === "pending"
    ) {
      setSelectedRunningJobId(selectedJob.id);
      if (selectedJob.progress != null) setGenProgress(selectedJob.progress);
      if (selectedJob.message) setGenMessage(selectedJob.message);
    } else if (selectedJob.status === "completed") {
      setSelectedRunningJobId(null);
      const historyResult = historyItem?.result;
      const resultUrl = historyResult?.url || selectedJob.resultUrl;
      if (resultUrl) {
        setGeneratedRemix({
          id: remixHistoryId,
          url: resultUrl,
          urls: selectedJob.resultUrls || historyResult?.urls,
          prompt: historyItem?.prompt || jobPrompt,
          model: historyItem?.model || selectedJob.model,
          title: historyResult?.title,
          tags: historyResult?.tags,
          lyrics: historyResult?.lyrics,
          thumbnail: historyResult?.thumbnail,
          duration: historyResult?.duration,
          seed: historyResult?.seed,
          coverStrength: historyResult?.coverStrength,
          refAudioStrength: historyResult?.refAudioStrength,
          bpm: historyResult?.bpm,
          keyScale: historyResult?.keyScale,
          timeSignature: historyResult?.timeSignature,
          negativeStyles: historyResult?.negativeStyles,
          thinking: historyResult?.thinking,
          inferStep: historyResult?.inferStep,
          guidanceScale: historyResult?.guidanceScale,
          source: historyItem?.source || "remix",
          createdAt: historyItem?.createdAt || Date.now(),
          updatedAt: historyItem?.updatedAt || Date.now(),
        });
      }
    }

    setSelectedJob(null);
  }, [selectedJob, setSelectedJob, applyRemixFormFromMetadata, remixHistory]);

  useEffect(() => {
    if (!selectedRunningJobId) return;

    const job = remixJobs.find((j) => j.id === selectedRunningJobId);
    console.log("[MusicRemix] selectedRunningJob effect:", selectedRunningJobId, "job:", job?.status);
    if (!job) {
      setSelectedRunningJobId(null);
      return;
    }

    if (job.status === "completed") {
      const remixId = job.params?.remixHistoryId;
      const historyItem = remixId ? remixHistory[remixId] : null;
      const url = job.resultUrl || historyItem?.result?.url || job.result?.url;
      if (url) {
        setGeneratedRemix({
          id: remixId,
          prompt: historyItem?.prompt || job.prompt,
          model: historyItem?.model || job.model,
          url,
          urls: job.resultUrls || historyItem?.result?.urls,
          title: historyItem?.result?.title || job.result?.title,
          tags: historyItem?.result?.tags || job.result?.tags,
          lyrics: historyItem?.result?.lyrics || job.result?.lyrics,
          thumbnail: historyItem?.result?.thumbnail || job.result?.thumbnail,
          duration: historyItem?.result?.duration || job.result?.duration,
          seed: historyItem?.result?.seed ?? job.result?.seed ?? null,
          coverStrength: historyItem?.result?.coverStrength ?? job.result?.coverStrength ?? null,
          refAudioStrength: historyItem?.result?.refAudioStrength ?? job.result?.refAudioStrength ?? null,
          bpm: historyItem?.result?.bpm ?? job.result?.bpm ?? null,
          keyScale: historyItem?.result?.keyScale || job.result?.keyScale || null,
          timeSignature: historyItem?.result?.timeSignature ?? job.result?.timeSignature ?? null,
          negativeStyles: historyItem?.result?.negativeStyles || job.result?.negativeStyles || null,
          thinking: historyItem?.result?.thinking ?? job.result?.thinking ?? null,
          inferStep: historyItem?.result?.inferStep ?? job.result?.inferStep ?? null,
          guidanceScale: historyItem?.result?.guidanceScale ?? job.result?.guidanceScale ?? null,
          source: "remix",
          createdAt: historyItem?.createdAt || Date.now(),
          updatedAt: historyItem?.updatedAt || Date.now(),
        });
      }
      setSelectedRunningJobId(null);
    } else if (job.status === "failed" || job.status === "cancelled") {
      if (job.status === "failed") {
        setError(job.error || "Generation failed");
      }
      setSelectedRunningJobId(null);
    } else if (!isPreparing && !isTranscribing && !isEnhancing) {
      if (job.progress != null) setGenProgress(job.progress);
      if (job.message) setGenMessage(job.message);
    }
  }, [selectedRunningJobId, remixJobs, isPreparing, isTranscribing, isEnhancing, remixHistory]);

  const handleFetchToken = async () => {
    setTokenVerifyStatus("loading");
    setTokenVerifyMessage("Fetching ai_token from AceMusic via server…");
    try {
      const data = await verifyInternalToken(internalBearerToken.trim());
      setInternalAiToken(data.token || "");
      setInternalRouter(data.router || "");
      // Auto-fill the Bearer token input with the token used (from .env or user input)
      if (data.bearerToken) {
        setInternalBearerToken(data.bearerToken);
      }
      setTokenVerifyStatus("success");
      setTokenVerifyMessage(`ai_token OK — expires ${data.expire || "soon"}`);
    } catch (err) {
      setTokenVerifyStatus("error");
      setTokenVerifyMessage(err.message || "Token fetch failed — check your Bearer token");
    }
  };

  const onFileSelected = useCallback(async (f) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFile(f);
    setSourceAudioName(f.name);
    setAudioUrl(url);
    setGeneratedRemix(null);
    setError("");
    setEnhancedUrl(null);
    setValidationErrors([]);

    const [b64, detectedDuration] = await Promise.all([
      fileToBase64(f),
      readAudioDuration(url),
    ]);
    setAudioBase64(b64);

    if (detectedDuration && detectedDuration > 0) {
      setSourceDuration(detectedDuration);
      // Duration stays empty (auto) — API/LM will auto-fill based on prompt
    }

    // Persist to library so it can be reused later
    try {
      await uploadLibraryFile({
        fileName: f.name,
        fileBase64: b64,
        mimeType: f.type || "audio/mpeg",
        type: "audio",
        source: "remix-source",
        title: f.name,
      });
      refreshLibraryAssets?.({ type: "audio" });
    } catch (libErr) {
      console.warn("[MusicRemix] Failed to save source audio to library:", libErr);
    }
  }, [refreshLibraryAssets]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) onFileSelected(f);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("audio/")) onFileSelected(f);
  }, [onFileSelected]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const handleSelectFromLibrary = useCallback(async (asset) => {
    if (!asset?.url) return;
    setError("");
    setGeneratedRemix(null);
    setEnhancedUrl(null);
    setValidationErrors([]);

    try {
      const url = resolveAssetUrl(asset.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch audio (${response.status})`);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const b64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      const objectUrl = URL.createObjectURL(blob);
      setFile(null);
      setSourceAudioName(asset.name || asset.fileName || "");
      setAudioUrl(objectUrl);
      setAudioBase64(b64);

      const detectedDuration = await readAudioDuration(objectUrl);
      if (detectedDuration && detectedDuration > 0) {
        setSourceDuration(detectedDuration);
      }
    } catch (err) {
      setError(err.message || "Failed to load selected audio");
    }
  }, []);

  const toggleTag = (tag) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      setTags(next.join(", "));
      return next;
    });
  };

  const validate = () => {
    const errors = [];
    if (!audioBase64) errors.push("Upload a source audio file first.");
    if (inputMode === "simple" && !description.trim()) errors.push("Enter a style description.");
    if ((inputMode === "genre" || inputMode === "instrumental") && !tags.trim()) errors.push("Add at least one genre / mood tag.");
    return errors;
  };

  const handleDetectLyrics = async () => {
    if (!audioBase64) return;
    setIsTranscribing(true);
    setError("");
    try {
      const res = await transcribeAudio({
        spaceUrl: WHISPER_SPACE,
        audioBase64,
        audioMime: file?.type || "audio/mpeg",
        task: "transcribe",
      });
      if (res?.success && res.data?.text) {
        setLyrics(res.data.text);
        if (inputMode === "auto") setInputMode("manual");
      } else {
        setError(res?.error || "Transcription returned no text");
      }
    } catch (err) {
      setError(err.message || "Transcription failed");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateClick = async () => {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setError("");
    setIsPreparing(true);

    const workingAudioBase64 = audioBase64;
    const workingAudioMime = file?.type || "audio/mpeg";

    const baseTags = inputMode === "simple" ? (description.trim() || tags.trim()) : tags.trim();
    const effectiveTags = instrumental ? `${baseTags}, instrumental`.replace(/^,\s*/, "instrumental") : baseTags;
    const effectiveDesc = instrumental && inputMode === "simple" ? `${description.trim()}, instrumental, no vocals`.trim() : description.trim();
    const jobPrompt = effectiveDesc || effectiveTags || "Music remix";
    const modelLabel = model === "acestep-v15-turbo" ? "Turbo" : "XL Turbo";
    const remixId = `remix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const remixMetadata = {
      inputMode,
      description: effectiveDesc,
      tags: effectiveTags,
      model,
      refAudioStrength,
      coverStrength: Number(coverStrength),
      instrumental,
      duration: duration ? Math.round(Number(duration)) : null,
      seed: Number(seed),
      inferStep: Number(inferStep),
      guidanceScale: Number(guidanceScale),
      bpm: bpm ? Number(bpm) : null,
      keyScale: keyScale.trim() || null,
      timeSignature: timeSignature ? Number(timeSignature) : null,
      negativeStyles: negativeStyles.trim() || null,
      thinking,
      useInternalApi,
      internalBearerToken: internalBearerToken || null,
      internalAiToken: internalAiToken || null,
      internalRouter: internalRouter || null,
    };

    let workingLyrics = lyrics;

    try {
      if (enhanceEnabled && audioBase64) {
        setIsEnhancing(true);
        try {
          const enhRes = await enhanceAudio({
            spaceUrl: SONICMASTER_SPACE,
            audioBase64,
            audioMime: workingAudioMime,
            prompt: enhancePrompt || "Enhance the input audio",
          });
          if (enhRes?.success && enhRes.data?.url) {
            setEnhancedUrl(enhRes.data.url);
          }
        } catch (enhErr) {
          console.warn("Enhancement failed (continuing):", enhErr.message);
        } finally {
          setIsEnhancing(false);
        }
      }

      if (!instrumental && inputMode === "genre" && !workingLyrics.trim() && audioBase64) {
        setIsTranscribing(true);
        try {
          const txRes = await transcribeAudio({
            spaceUrl: WHISPER_SPACE,
            audioBase64: workingAudioBase64,
            audioMime: workingAudioMime,
            task: "transcribe",
          });
          if (txRes?.success && txRes.data?.text) {
            workingLyrics = txRes.data.text;
            setLyrics(txRes.data.text);
          }
        } catch {
          // not critical
        } finally {
          setIsTranscribing(false);
        }
      }

      const remixPayload = {
        remixHistoryId: remixId,
        mode: "generate",
        description: effectiveDesc,
        tags: effectiveTags,
        lyrics: instrumental ? "" : workingLyrics.trim(),
        duration: duration ? Math.round(Number(duration)) : null,
        seed: Number(seed),
        inferStep: Number(inferStep),
        guidanceScale: Number(guidanceScale),
        model,
        thinking,
        bpm: bpm ? Number(bpm) : null,
        keyScale: keyScale.trim() || null,
        timeSignature: timeSignature ? Number(timeSignature) : null,
        negativeStyles: negativeStyles.trim() || null,
        audioBase64: workingAudioBase64 || undefined,
        audioMime: workingAudioMime || undefined,
        refAudioStrength: Number(refAudioStrength),
        refAudioBase64: refAudioBase64 || undefined,
        refAudioMime: refAudioMime || undefined,
        useInternalApi,
        internalBearerToken: internalBearerToken || undefined,
        internalAiToken: internalAiToken || undefined,
        internalRouter: internalRouter || undefined,
      };
      remixPayload.coverStrength = Number(coverStrength);

      const jobId = enqueueJob(
        "remix",
        {
          prompt: jobPrompt,
          model: modelLabel,
          remixHistoryId: remixId,
          remixMetadata,
          streamPayload: remixPayload,
        },
        (result) => {
          setGeneratedRemix({
            id: remixId,
            prompt: jobPrompt,
            model: modelLabel,
            url: result.url,
            urls: result.urls,
            title: result.title,
            tags: result.tags,
            lyrics: result.lyrics,
            thumbnail: result.thumbnail,
            duration: remixMetadata.duration,
            seed: remixMetadata.seed,
            coverStrength: remixMetadata.coverStrength,
            refAudioStrength: remixMetadata.refAudioStrength,
            bpm: remixMetadata.bpm,
            keyScale: remixMetadata.keyScale,
            timeSignature: remixMetadata.timeSignature,
            negativeStyles: remixMetadata.negativeStyles,
            thinking: remixMetadata.thinking,
            inferStep: remixMetadata.inferStep,
            guidanceScale: remixMetadata.guidanceScale,
            source: "remix",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        },
      );

      setSelectedRunningJobId(jobId);
      setGenProgress(0);
      setGenMessage("");
    } catch (err) {
      setError(err.message || "Failed to start remix");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSendToVideo = async () => {
    if (!generatedRemix?.url) return;
    await enqueuePipeline("remix-to-video", {
      remixPayload: { prompt: `Use remix for video soundtrack: ${description || tags}` },
      videoPayload: { prompt: "Generate visuals synced to remix soundtrack", duration: 10, fps: 24 },
    });
  };

  const [downloadFormat, setDownloadFormat] = useState("wav");
  const [isConverting, setIsConverting] = useState(false);

  const handleDownload = async () => {
    if (!generatedRemix?.url) return;

    const baseName = (sourceAudioName || file?.name || "remix").replace(/\.[^.]+$/, "");
    const remixNum = Object.keys(remixHistory).length + 1;
    const downloadName = `${baseName} (remix ${remixNum})`;

    if (downloadFormat === "mp3") {
      setIsConverting(true);
      try {
        const audioUrl = resolveAssetUrl(generatedRemix.url);
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Convert to MP3 using lamejs
        const mp3encoder = new Mp3Encoder(audioBuffer.numberOfChannels, audioBuffer.sampleRate, 128);
        const mp3Data = [];
        
        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
        
        const sampleBlockSize = 1152;
        for (let i = 0; i < leftChannel.length; i += sampleBlockSize) {
          const leftChunk = leftChannel.subarray(i, i + sampleBlockSize);
          const rightChunk = rightChannel.subarray(i, i + sampleBlockSize);
          const leftInt16 = new Int16Array(leftChunk.map(x => x < 0 ? x * 32768 : x * 32767));
          const rightInt16 = new Int16Array(rightChunk.map(x => x < 0 ? x * 32768 : x * 32767));
          const mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
        }
        
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
        
        const blob = new Blob(mp3Data, { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${downloadName}.mp3`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("MP3 conversion failed:", err);
        // Fallback to WAV download via fetch
        try {
          const audioUrl = resolveAssetUrl(generatedRemix.url);
          const response = await fetch(audioUrl);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = `${downloadName}.wav`;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
        } catch {
          window.open(resolveAssetUrl(generatedRemix.url), "_blank");
        }
      } finally {
        setIsConverting(false);
      }
    } else {
      // WAV download - fetch as blob to handle cross-origin
      try {
        const audioUrl = resolveAssetUrl(generatedRemix.url);
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${downloadName}.wav`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch {
        window.open(resolveAssetUrl(generatedRemix.url), "_blank");
      }
    }
  };

  const applyRemixHistoryItem = useCallback((remixId, remixItem) => {
    if (!remixItem) return;
    const result = remixItem.result || {};
    setGeneratedRemix({
      id: remixId,
      url: result.url,
      urls: result.urls,
      prompt: remixItem.prompt,
      model: remixItem.model,
      title: result.title,
      tags: result.tags,
      lyrics: result.lyrics,
      thumbnail: result.thumbnail,
      duration: result.duration,
      seed: result.seed,
      coverStrength: result.coverStrength,
      refAudioStrength: result.refAudioStrength,
      bpm: result.bpm,
      keyScale: result.keyScale,
      timeSignature: result.timeSignature,
      negativeStyles: result.negativeStyles,
      thinking: result.thinking,
      inferStep: result.inferStep,
      guidanceScale: result.guidanceScale,
      source: remixItem.source || "remix",
      createdAt: remixItem.createdAt || Date.now(),
      updatedAt: remixItem.updatedAt || Date.now(),
    });
    setError("");

    const metadata =
      remixItem.metadata && typeof remixItem.metadata === "object"
        ? remixItem.metadata
        : null;

    applyRemixFormFromMetadata(metadata, remixItem.prompt);
  }, [applyRemixFormFromMetadata]);

  const handleReloadPrompt = useCallback(
    (item) => {
      const remixItem = remixHistory[item.id] || {
        prompt: item.prompt,
        model: item.model,
        result: {
          url: item.url,
          urls: item.urls,
          title: item.title,
          tags: item.tags,
          lyrics: item.lyrics,
          thumbnail: item.thumbnail,
          duration: item.duration,
          seed: item.seed,
          coverStrength: item.coverStrength,
          refAudioStrength: item.refAudioStrength,
          bpm: item.bpm,
          keyScale: item.keyScale,
          timeSignature: item.timeSignature,
          negativeStyles: item.negativeStyles,
          thinking: item.thinking,
          inferStep: item.inferStep,
          guidanceScale: item.guidanceScale,
        },
        metadata: item.metadata,
      };
      applyRemixHistoryItem(item.id, remixItem);
    },
    [applyRemixHistoryItem, remixHistory],
  );

  const handleRemixHistorySelected = useCallback(
    (event) => {
      const { remixId } = event.detail || {};
      if (!remixId) return;

      const remixItem = remixHistory[remixId];
      if (!remixItem) return;

      applyRemixHistoryItem(remixId, remixItem);
    },
    [applyRemixHistoryItem, remixHistory],
  );

  useEffect(() => {
    window.addEventListener("remixHistorySelected", handleRemixHistorySelected);
    return () => {
      window.removeEventListener(
        "remixHistorySelected",
        handleRemixHistorySelected,
      );
    };
  }, [handleRemixHistorySelected]);

  const isWorking = isPreparing || isTranscribing || isEnhancing;
  const selectedJobIsActive =
    selectedRunningJob &&
    (selectedRunningJob.status === "running" ||
      selectedRunningJob.status === "pending");
  const outputLoading =
    isWorking || (selectedRunningJobId !== null && selectedJobIsActive);
  const outputProgress = outputLoading
    ? isWorking
      ? genProgress
      : selectedJobProgress
    : null;
  const outputLoadingMessage = isWorking
    ? genMessage || selectedRunningJob?.message || undefined
    : selectedJobIsActive
      ? selectedRunningJob?.message || undefined
      : undefined;
  const outputError =
    error ||
    (selectedRunningJob?.status === "failed" ? selectedRunningJob.error : null);

  const renderOutputPanel = (className = "") => (
    <MediaOutputPanel
      mediaType="remix"
      generatedMedia={generatedRemix}
      mediaHistory={remixHistory}
      getMediaIds={getRemixIds}
      onDownload={handleDownload}
      onSendToVideo={handleSendToVideo}
      onReloadPrompt={(item) => {
        setSelectedRunningJobId(null);
        handleReloadPrompt(item);
      }}
      onPreview={(item) => {
        setSelectedRunningJobId(null);
        setGeneratedRemix({
          id: item.id,
          url: item.url,
          urls: item.urls,
          prompt: item.prompt,
          model: item.model,
          title: item.title,
          tags: item.tags,
          lyrics: item.lyrics,
          thumbnail: item.thumbnail,
          duration: item.duration,
          seed: item.seed,
          coverStrength: item.coverStrength,
          refAudioStrength: item.refAudioStrength,
          bpm: item.bpm,
          keyScale: item.keyScale,
          timeSignature: item.timeSignature,
          negativeStyles: item.negativeStyles,
          thinking: item.thinking,
          inferStep: item.inferStep,
          guidanceScale: item.guidanceScale,
          source: item.source || "remix",
          createdAt: item.createdAt || Date.now(),
          updatedAt: item.updatedAt || Date.now(),
        });
      }}
      onDeleteMedia={(remixId) => {
        deleteRemix(remixId);
        if (generatedRemix?.id === remixId) {
          setGeneratedRemix(null);
        }
      }}
      onClearHistory={clearAllRemixes}
      loading={outputLoading}
      error={outputError}
      progress={outputProgress}
      loadingMessage={outputLoadingMessage}
      downloadFormat={downloadFormat}
      setDownloadFormat={setDownloadFormat}
      isConverting={isConverting}
      onClearError={() => {
        setError("");
        if (selectedRunningJobId && selectedRunningJob?.status === "failed") {
          setSelectedRunningJobId(null);
        }
      }}
      className={className}
    />
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Music Remixer</h2>
            <p className="text-sm text-gray-400">Upload a track → set style & strength → AI remixes your audio with ACE-Step</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-full lg:w-[60%] overflow-y-auto p-4 space-y-4 border-r border-gray-800">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* ── Panel A: Source ── */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Source Audio</h3>
                {file && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    {sourceDuration && (
                      <span className="flex items-center gap-1 text-blue-400 font-medium whitespace-nowrap">
                        <Clock className="w-3 h-3" />
                        {formatDuration(sourceDuration)} ({sourceDuration}s)
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors p-6 flex flex-col items-center gap-2 ${isDragging ? "border-purple-500 bg-purple-500/10" : "border-gray-700 hover:border-gray-600 bg-gray-800/50"}`}
              >
                <UploadCloud className={`w-8 h-8 ${isDragging ? "text-purple-400" : "text-gray-500"}`} />
                <span className="text-sm text-gray-400">Drop audio file or click to browse</span>
                <span className="text-xs text-gray-600">MP3, WAV, OGG, M4A supported</span>
                <input ref={fileInputRef} type="file" accept="audio/*" onChange={onFileChange} className="hidden" />
              </div>

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-300 text-sm transition-colors"
              >
                <Library className="w-4 h-4" />
                Select from Library
              </button>

              {audioUrl && (
                <div className="space-y-2">
                  <audio src={audioUrl} controls className="w-full rounded-lg" />
                  <div className="h-10 rounded-lg bg-gray-800 flex items-end gap-px px-2 overflow-hidden">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div key={i} className="bg-purple-500/60 flex-1 rounded-t-sm" style={{ height: `${25 + ((i * 17 + i * i) % 75)}%` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SonicMaster enhance toggle */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Pre-Enhance with SonicMaster</span>
                </div>
                <button
                  onClick={() => { setEnhanceEnabled((v) => !v); }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${enhanceEnabled ? "bg-amber-500" : "bg-gray-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enhanceEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              {enhanceEnabled && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Clean up your track before remixing (de-reverb, EQ, mastering)</p>
                  <input
                    value={enhancePrompt}
                    onChange={(e) => { setEnhancePrompt(e.target.value); }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                    placeholder="e.g. reduce reverb, clarify vocals"
                  />
                  {enhancedUrl && (
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-400">Enhanced version ready</p>
                      <audio src={enhancedUrl} controls className="w-full rounded-lg" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detect Lyrics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-white">Auto-Detect Lyrics</span>
                </div>
                <button
                  onClick={handleDetectLyrics}
                  disabled={!audioBase64 || isTranscribing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                  {isTranscribing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                  {isTranscribing ? "Detecting..." : "Detect via Whisper"}
                </button>
              </div>
              <p className="text-xs text-gray-500">Uses OpenAI Whisper to transcribe vocals from the uploaded track</p>
            </div>
          </div>

          {/* ── Panel B: Style ── */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">Style & Generation</h3>
              </div>

              {/* ── 3-mode selector cards ── */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "simple",       icon: "✨", title: "Simple",       sub: "Describe in words" },
                  { id: "genre",        icon: "🎛️", title: "Genre + Lyrics", sub: "Pick tags & lyrics" },
                  { id: "instrumental", icon: "🎸", title: "Instrumental",  sub: "No vocals" },
                ].map(({ id, icon, title, sub }) => (
                  <button
                    key={id}
                    onClick={() => { setInputMode(id); }}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-center transition-all ${
                      inputMode === id
                        ? "border-purple-500 bg-purple-600/20 text-white"
                        : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">{icon}</span>
                    <span className="text-xs font-semibold leading-none">{title}</span>
                    <span className="text-xs text-gray-500 leading-none">{sub}</span>
                  </button>
                ))}
              </div>

              {/* ── Simple mode ── */}
              {inputMode === "simple" && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Describe the remix you want</label>
                  <textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); }}
                    rows={4}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
                    placeholder="e.g. A chill lo-fi hip hop remix with rain sounds and mellow piano, relaxing evening vibes"
                  />
                  <p className="text-xs text-gray-600">ACE-Step AI will auto-write genre tags and lyrics from your description</p>
                </div>
              )}

              {/* ── Genre + Lyrics mode ── */}
              {inputMode === "genre" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">Genre / Mood Tags <span className="text-red-500">*</span></label>
                    <input
                      value={tags}
                      onChange={(e) => { setTags(e.target.value); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                      placeholder="e.g. lo-fi, hip hop, rainy, mellow guitar"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {GENRE_TAGS.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-0.5 rounded-full text-xs transition-colors ${selectedTags.includes(tag) ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400">Lyrics <span className="text-gray-600">(optional — use [verse]/[chorus])</span></label>
                    <textarea
                      value={lyrics}
                      onChange={(e) => { setLyrics(e.target.value); }}
                      rows={5}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none font-mono"
                      placeholder={"[verse]\nYour verse lyrics here...\n\n[chorus]\nYour chorus here..."}
                    />
                  </div>
                </div>
              )}

              {/* ── Instrumental mode ── */}
              {inputMode === "instrumental" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">Genre / Mood Tags <span className="text-red-500">*</span></label>
                    <input
                      value={tags}
                      onChange={(e) => { setTags(e.target.value); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                      placeholder="e.g. synthwave, french electronic, dark beats"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {GENRE_TAGS.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-0.5 rounded-full text-xs transition-colors ${selectedTags.includes(tag) ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-indigo-950/40 border border-indigo-800/50 rounded-lg px-3 py-2">
                    <span className="text-lg mt-0.5">🎸</span>
                    <p className="text-xs text-indigo-300">No vocals or lyrics — ACE-Step will generate a pure instrumental track from your genre tags.</p>
                  </div>
                </div>
              )}

              {/* Duration — editable with Auto/Clear */}
              <div className="space-y-2 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Duration
                  </span>
                  <div className="flex items-center gap-2">
                    {duration ? (
                      <span className="text-xs text-blue-400 font-mono">{duration}s</span>
                    ) : (
                      <span className="text-xs text-gray-600">Auto · LM decides</span>
                    )}
                    <button
                      onClick={() => { setDuration(""); }}
                      className="text-xs text-gray-500 hover:text-white px-1"
                    >Auto</button>
                    <button
                      onClick={() => { setDuration(""); }}
                      className="text-xs text-gray-500 hover:text-white px-1"
                    >Clear</button>
                  </div>
                </div>
                <input
                  type="range"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  step="5"
                  value={duration || MIN_DURATION}
                  onChange={(e) => { setDuration(Number(e.target.value)); }}
                  className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{MIN_DURATION}s</span>
                  <span>{MAX_DURATION}s</span>
                </div>
              </div>

              {/* Cover Strength */}
              <div className="flex items-center gap-4 py-2 border-t border-gray-800">
                <span className="text-xs text-gray-400 font-medium shrink-0">Cover Strength</span>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={coverStrength}
                  onChange={(e) => { setCoverStrength(Number(e.target.value)); }}
                  className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                />
                <span className="text-xs text-purple-400 font-mono tabular-nums shrink-0 w-10 text-right">{Math.round(coverStrength * 100)}%</span>
              </div>

              {/* Remix Strength */}
              <div className="flex items-center gap-4 py-2 border-t border-gray-800">
                <span className="text-xs text-gray-400 font-medium shrink-0">Remix Strength</span>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={refAudioStrength}
                  onChange={(e) => { setRefAudioStrength(Number(e.target.value)); }}
                  className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                />
                <span className="text-xs text-purple-400 font-mono tabular-nums shrink-0 w-10 text-right">{Math.round(refAudioStrength * 100)}%</span>
              </div>

              {/* Model & Quality */}
              <div className="space-y-3 py-2 border-t border-gray-800">
                <div className="space-y-1.5">
                  <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    Model
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "acestep-v15-xl-turbo", title: "XL Turbo", sub: "Best quality" },
                      { id: "acestep-v15-turbo", title: "Turbo", sub: "Faster / lighter" },
                    ].map(({ id, title, sub }) => (
                      <button
                        key={id}
                        onClick={() => { setModel(id); }}
                        className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-all ${
                          model === id
                            ? "border-purple-500 bg-purple-600/20 text-white"
                            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white"
                        }`}
                      >
                        <span className="text-xs font-semibold leading-none">{title}</span>
                        <span className="text-xs text-gray-500 leading-none">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {!audioBase64 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-emerald-400" />
                    <div className="leading-tight">
                      <span className="text-xs font-medium text-white">Thinking mode</span>
                      <p className="text-xs text-gray-500">Higher quality, but much slower — disable for speed / to avoid GPU timeouts</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setThinking((v) => !v); }}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${thinking ? "bg-emerald-500" : "bg-gray-700"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${thinking ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                )}
              </div>

              {/* Advanced toggle */}
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Advanced settings
              </button>

              {showAdvanced && (
                <div className="space-y-4 border border-gray-800 rounded-lg p-4 bg-gray-800/50">
                  {/* ── Row: Tempo ── */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 shrink-0">Tempo</span>
                    <input
                      type="number" min="30" max="200"
                      value={bpm}
                      placeholder="Auto"
                      onChange={(e) => { setBpm(e.target.value); }}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    />
                    <button onClick={() => { setBpm(""); }} className="text-xs text-gray-500 hover:text-white px-2">Clear</button>
                  </div>

                  {/* ── Row: Time Signature ── */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 shrink-0">Time Signature</span>
                    <select
                      value={timeSignature}
                      onChange={(e) => { setTimeSignature(e.target.value); }}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">Auto</option>
                      <option value="2">2/4</option>
                      <option value="3">3/4</option>
                      <option value="4">4/4</option>
                      <option value="6">6/8</option>
                    </select>
                    <button onClick={() => { setTimeSignature(""); }} className="text-xs text-gray-500 hover:text-white px-2">Clear</button>
                  </div>

                  {/* ── Row: Key ── */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 shrink-0">Key</span>
                    <select
                      value={keyScale}
                      onChange={(e) => { setKeyScale(e.target.value); }}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">Auto</option>
                      <option value="C major">C major</option>
                      <option value="C minor">C minor</option>
                      <option value="C♯ major">C♯ major</option>
                      <option value="C♯ minor">C♯ minor</option>
                      <option value="D♭ major">D♭ major</option>
                      <option value="D♭ minor">D♭ minor</option>
                      <option value="D major">D major</option>
                      <option value="D minor">D minor</option>
                      <option value="D♯ major">D♯ major</option>
                      <option value="D♯ minor">D♯ minor</option>
                      <option value="E♭ major">E♭ major</option>
                      <option value="E♭ minor">E♭ minor</option>
                      <option value="E major">E major</option>
                      <option value="E minor">E minor</option>
                      <option value="E♯ major">E♯ major</option>
                      <option value="E♯ minor">E♯ minor</option>
                      <option value="F major">F major</option>
                      <option value="F minor">F minor</option>
                      <option value="F♯ major">F♯ major</option>
                      <option value="F♯ minor">F♯ minor</option>
                      <option value="G♭ major">G♭ major</option>
                      <option value="G♭ minor">G♭ minor</option>
                      <option value="G major">G major</option>
                      <option value="G minor">G minor</option>
                      <option value="G♯ major">G♯ major</option>
                      <option value="G♯ minor">G♯ minor</option>
                      <option value="A♭ major">A♭ major</option>
                      <option value="A♭ minor">A♭ minor</option>
                      <option value="A major">A major</option>
                      <option value="A minor">A minor</option>
                      <option value="A♯ major">A♯ major</option>
                      <option value="A♯ minor">A♯ minor</option>
                      <option value="B♭ major">B♭ major</option>
                      <option value="B♭ minor">B♭ minor</option>
                      <option value="B major">B major</option>
                      <option value="B minor">B minor</option>
                      <option value="B♯ major">B♯ major</option>
                      <option value="B♯ minor">B♯ minor</option>
                    </select>
                    <button onClick={() => { setKeyScale(""); }} className="text-xs text-gray-500 hover:text-white px-2">Clear</button>
                  </div>

                  {/* ── Row: Negative Styles ── */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-400">Negative Styles</span>
                    <input
                      type="text"
                      value={negativeStyles}
                      placeholder="e.g. no vocals, no drums..."
                      onChange={(e) => { setNegativeStyles(e.target.value); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  {/* ── Generation Params (collapsible sub-section) ── */}
                  <div className="pt-3 border-t border-gray-700 space-y-3">
                    <span className="text-xs text-gray-500 font-medium">Generation Parameters</span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Seed <span className="text-gray-700">(-1 = random)</span></label>
                        <input
                          type="number"
                          value={seed}
                          onChange={(e) => { setSeed(Number(e.target.value)); }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Infer Steps</label>
                        <input
                          type="number" min="1" max="50"
                          value={inferStep}
                          onChange={(e) => { setInferStep(Number(e.target.value)); }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Guidance</label>
                        <input
                          type="number" min="1" max="20" step="0.5"
                          value={guidanceScale}
                          onChange={(e) => { setGuidanceScale(Number(e.target.value)); }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Reference Audio upload ── */}
                  <div className="pt-3 border-t border-gray-700 space-y-2">
                    <span className="text-xs text-gray-400 font-medium">Upload Reference Audio <span className="text-gray-600">(style transfer)</span></span>
                    {refAudioFile ? (
                      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                        <Music2 className="w-3 h-3 text-purple-400" />
                        <span className="text-xs text-white truncate flex-1">{refAudioFile.name}</span>
                        <button
                          onClick={() => { setRefAudioFile(null); setRefAudioBase64(null); setRefAudioMime(null); }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >Remove</button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 border border-dashed border-gray-600 rounded-lg px-3 py-2 cursor-pointer hover:border-gray-500 transition-colors">
                        <Music2 className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-400">Upload reference audio</span>
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setRefAudioFile(f);
                            setRefAudioMime(f.type || "audio/mpeg");
                            const b64 = await fileToBase64(f);
                            setRefAudioBase64(b64);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Validation errors ── */}
        {validationErrors.length > 0 && !isWorking && (
          <ValidationErrors errors={validationErrors} />
        )}

        {/* ── Internal API Toggle ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">AceMusic Internal Playground</span>
            </div>
            <button
              onClick={() => { setUseInternalApi((v) => !v); }}
              className={`relative w-10 h-5 rounded-full transition-colors ${useInternalApi ? "bg-cyan-500" : "bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useInternalApi ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <p className="text-xs text-gray-500">Route generation through the AceMusic internal playground API instead of the public cloud endpoint</p>
          {useInternalApi && (
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Bearer Token (optional — server uses .env if empty)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={internalBearerToken}
                  onChange={(e) => { setInternalBearerToken(e.target.value); setTokenVerifyStatus("idle"); }}
                  placeholder="Leave empty to use server .env, or paste your own…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                />
                <button
                  onClick={handleFetchToken}
                  disabled={tokenVerifyStatus === "loading"}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {tokenVerifyStatus === "loading" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  Fetch Token
                </button>
              </div>
              {tokenVerifyStatus === "success" && (
                <p className="text-[11px] text-green-400">{tokenVerifyMessage}</p>
              )}
              {tokenVerifyStatus === "error" && (
                <p className="text-[11px] text-red-400">{tokenVerifyMessage}</p>
              )}
              <p className="text-[11px] text-gray-600">The server fetches the ai_token JWT from AceMusic (uses .env if input is empty)</p>
            </div>
          )}
        </div>

        {/* ── Generate ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <button
            onClick={handleGenerateClick}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
          >
            <Sparkles className="w-5 h-5" />
            Generate Remix
          </button>
        </div>

        <div className="lg:hidden">
          {renderOutputPanel()}
        </div>
        </div>

        <div className="hidden lg:flex lg:w-[40%] flex-col p-4 min-h-0">
          {renderOutputPanel("h-full")}
        </div>
      </div>

      <AssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectFromLibrary}
        type="audio"
        title="Select Source Audio"
      />
    </div>
  );
}
