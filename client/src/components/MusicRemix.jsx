import { useCallback, useRef, useState } from "react";
import { enqueuePipeline, transcribeAudio, enhanceAudio, generateRemix, streamGenerateRemix } from "../services/api";
import { useApp } from "../context/AppContext";
import {
  Mic, Sparkles, Wand2, Music2, Download, Film,
  ChevronDown, ChevronUp, Loader2, CheckCircle2,
  UploadCloud, Clock, AlertCircle, Eye, ArrowRight,
  SlidersHorizontal,
} from "lucide-react";

const GENRE_TAGS = [
  "lo-fi", "hip hop", "jazz", "electronic", "cinematic", "pop", "rock",
  "ambient", "classical", "r&b", "drum & bass", "synthwave", "acoustic",
];

const ACESTEP_SPACE = "ACE-Step/ACE-Step";

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

function StageIndicator({ stages, current }) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {stages.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={stage} className="flex items-center gap-1">
            {i > 0 && <div className="w-4 h-px bg-gray-700" />}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${done ? "bg-emerald-900/60 text-emerald-400" : active ? "bg-blue-900/60 text-blue-400" : "bg-gray-800 text-gray-500"}`}>
              {done ? <CheckCircle2 className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
              {stage}
            </div>
          </div>
        );
      })}
    </div>
  );
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
  const { addLibraryAsset } = useApp();

  const [file, setFile] = useState(null);
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
  const [duration, setDuration] = useState(60);
  const [refAudioStrength, setRefAudioStrength] = useState(0.5);
  const [seed, setSeed] = useState(-1);
  const [inferStep, setInferStep] = useState(60);
  const [guidanceScale, setGuidanceScale] = useState(15.0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageIndex, setStageIndex] = useState(-1);
  const [stages] = useState(["Enhance", "Transcribe", "Generate"]);

  const [showReview, setShowReview] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [result, setResult] = useState(null);
  const [liveAudioUrl, setLiveAudioUrl] = useState(null);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);
  const sseAbortRef = useRef(null);
  const instrumental = inputMode === "instrumental";

  const onFileSelected = useCallback(async (f) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFile(f);
    setAudioUrl(url);
    setResult(null);
    setError("");
    setEnhancedUrl(null);
    setShowReview(false);
    setValidationErrors([]);

    const [b64, detectedDuration] = await Promise.all([
      fileToBase64(f),
      readAudioDuration(url),
    ]);
    setAudioBase64(b64);

    if (detectedDuration && detectedDuration > 0) {
      setSourceDuration(detectedDuration);
      setDuration(Math.max(MIN_DURATION, Math.min(MAX_DURATION, detectedDuration)));
    }
  }, []);

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

  const toggleTag = (tag) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      setTags(next.join(", "));
      setShowReview(false);
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

  const handleGenerateClick = () => {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) {
      setShowReview(false);
      return;
    }
    setShowReview(true);
  };

  const handleConfirmGenerate = async () => {
    setShowReview(false);
    setIsGenerating(true);
    setError("");
    setResult(null);
    setLiveAudioUrl(null);
    setGenProgress(0);
    setGenMessage("");
    setStageIndex(0);

    const workingAudioBase64 = audioBase64;
    const workingAudioMime = file?.type || "audio/mpeg";

    try {
      if (enhanceEnabled && audioBase64) {
        setStageIndex(0);
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

      setStageIndex(1);

      if (!instrumental && inputMode === "genre" && !lyrics.trim() && audioBase64) {
        setIsTranscribing(true);
        try {
          const txRes = await transcribeAudio({
            spaceUrl: WHISPER_SPACE,
            audioBase64: workingAudioBase64,
            audioMime: workingAudioMime,
            task: "transcribe",
          });
          if (txRes?.success && txRes.data?.text) {
            setLyrics(txRes.data.text);
          }
        } catch {
          // not critical
        } finally {
          setIsTranscribing(false);
        }
      }

      setStageIndex(2);
      setGenMessage("Submitting to ACE-Step…");

      const effectiveMode = "generate";
      const baseTags = inputMode === "simple" ? (description.trim() || tags.trim()) : tags.trim();
      const effectiveTags = instrumental ? `${baseTags}, instrumental`.replace(/^,\s*/, "instrumental") : baseTags;
      const effectiveDesc = instrumental && inputMode === "simple" ? `${description.trim()}, instrumental, no vocals`.trim() : description.trim();

      await new Promise((resolve, reject) => {
        const abort = streamGenerateRemix(
          {
            spaceUrl: ACESTEP_SPACE,
            mode: effectiveMode,
            description: effectiveDesc,
            tags: effectiveTags,
            lyrics: instrumental ? "" : lyrics.trim(),
            duration: Math.round(Number(duration)),
            seed: Number(seed),
            inferStep: Number(inferStep),
            guidanceScale: Number(guidanceScale),
            audioBase64: workingAudioBase64 || undefined,
            audioMime: workingAudioMime || undefined,
            refAudioStrength: Number(refAudioStrength),
          },
          {
            onProgress: (value, message) => {
              setGenProgress(value);
              setGenMessage(message || `Generating… ${value}%`);
            },
            onResult: (data) => {
              // Audio is ready — unblock UI and play immediately
              const playUrl = data.audio || data.url;
              if (playUrl) setLiveAudioUrl(playUrl);
              setResult(data);
              resolve(); // don't wait for save
            },
            onSaved: (savedUrl) => {
              // Silently upgrade to persisted library URL
              setResult((prev) => ({ ...(prev || {}), url: savedUrl }));
              setLiveAudioUrl(savedUrl);
            },
            onError: (msg) => reject(new Error(msg)),
          }
        );
        sseAbortRef.current = abort;
      });

    } catch (err) {
      setError(err.message || "Generation failed");
    } finally {
      sseAbortRef.current = null;
      setIsGenerating(false);
      setStageIndex(-1);
      setGenMessage("");
    }
  };

  const handleSendToVideo = async () => {
    if (!result?.url) return;
    await enqueuePipeline("remix-to-video", {
      remixPayload: { prompt: `Use remix for video soundtrack: ${description || tags}` },
      videoPayload: { prompt: "Generate visuals synced to remix soundtrack", duration: 10, fps: 24 },
    });
  };

  const isWorking = isGenerating || isTranscribing || isEnhancing;
  const safeDuration = Math.round(Number(duration)) || 60;
  const displayDuration = sourceDuration ? `${formatDuration(sourceDuration)} (${sourceDuration}s) — auto matched` : "Upload a song to set duration";

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      <div className="max-w-5xl mx-auto p-4 space-y-4">

        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Music Remixer</h2>
              <p className="text-sm text-gray-400">Upload a track → set style & strength → review → AI remixes your audio with ACE-Step</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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
                  onClick={() => { setEnhanceEnabled((v) => !v); setShowReview(false); }}
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
                    onChange={(e) => { setEnhancePrompt(e.target.value); setShowReview(false); }}
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
                    onClick={() => { setInputMode(id); setShowReview(false); }}
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
                    onChange={(e) => { setDescription(e.target.value); setShowReview(false); }}
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
                      onChange={(e) => { setTags(e.target.value); setShowReview(false); }}
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
                      onChange={(e) => { setLyrics(e.target.value); setShowReview(false); }}
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
                      onChange={(e) => { setTags(e.target.value); setShowReview(false); }}
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

              {/* Duration — auto from source */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Output Duration
                </span>
                <span className={`text-xs font-medium ${sourceDuration ? "text-blue-400" : "text-gray-600"}`}>
                  {displayDuration}
                </span>
              </div>

              {/* Remix Strength slider */}
              {audioBase64 && (
                <div className="space-y-2 py-2 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                      <SlidersHorizontal className="w-3 h-3" />
                      Remix Strength
                    </span>
                    <span className="text-xs text-purple-400 font-mono tabular-nums">{Math.round(refAudioStrength * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={refAudioStrength}
                    onChange={(e) => { setRefAudioStrength(Number(e.target.value)); setShowReview(false); }}
                    className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>More Creative</span>
                    <span>More Original</span>
                  </div>
                  <p className="text-xs text-gray-500">Controls how closely the remix matches your uploaded audio. Higher = closer to source.</p>
                </div>
              )}

              {/* Advanced toggle */}
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Advanced settings
              </button>

              {showAdvanced && (
                <div className="space-y-3 border border-gray-800 rounded-lg p-3 bg-gray-800/50">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Seed <span className="text-gray-600">(-1 = random)</span></label>
                      <input
                        type="number"
                        value={seed}
                        onChange={(e) => { setSeed(Number(e.target.value)); setShowReview(false); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Infer Steps</label>
                      <input
                        type="number" min="1" max="50"
                        value={inferStep}
                        onChange={(e) => { setInferStep(Number(e.target.value)); setShowReview(false); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Guidance</label>
                      <input
                        type="number" min="1" max="20" step="0.5"
                        value={guidanceScale}
                        onChange={(e) => { setGuidanceScale(Number(e.target.value)); setShowReview(false); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white mt-1"
                      />
                    </div>
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

        {/* ── Pre-generation review panel ── */}
        {showReview && !isWorking && (
          <div className="bg-gray-900 border border-purple-700/60 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-white">Review Before Generating</h3>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="text-gray-500">Source file</div>
              <div className="text-white font-medium truncate">
                {file ? `${file.name}${sourceDuration ? ` · ${formatDuration(sourceDuration)} (${sourceDuration}s)` : ""}` : "—"}
              </div>

              <div className="text-gray-500">Mode</div>
              <div className="text-white">{inputMode === "simple" ? "Simple (Describe)" : inputMode === "genre" ? "Genre + Lyrics" : "Instrumental"}</div>

              <div className="text-gray-500">Output duration</div>
              <div className="text-blue-400 font-medium">{sourceDuration ? `${formatDuration(sourceDuration)} (${sourceDuration}s)` : `${safeDuration}s`} · auto matched</div>

              <div className="text-gray-500">Pre-enhance</div>
              <div className={enhanceEnabled ? "text-amber-400" : "text-gray-500"}>{enhanceEnabled ? `On — "${enhancePrompt}"` : "Off"}</div>

              {inputMode === "simple" && description && (
                <>
                  <div className="text-gray-500">Description</div>
                  <div className="text-purple-300 italic">"{description.slice(0, 80)}{description.length > 80 ? "…" : ""}"</div>
                </>
              )}
              {(inputMode === "genre" || inputMode === "instrumental") && tags && (
                <>
                  <div className="text-gray-500">Tags</div>
                  <div className="text-purple-300">{tags}</div>
                </>
              )}
              {audioBase64 && (
                <>
                  <div className="text-gray-500">Remix Strength</div>
                  <div className="text-purple-400 font-medium">{Math.round(refAudioStrength * 100)}% — {refAudioStrength >= 0.7 ? "closely matches source" : refAudioStrength >= 0.4 ? "balanced remix" : "more creative"}</div>
                </>
              )}
              <div className="text-gray-500">Vocals</div>
              <div className={instrumental ? "text-indigo-400 font-medium" : "text-gray-400"}>
                {instrumental ? "Instrumental only (no lyrics)" : "Vocal / lyrics included"}
              </div>
              {seed !== -1 && (
                <>
                  <div className="text-gray-500">Seed</div>
                  <div className="text-white">{seed}</div>
                </>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowReview(false)}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 text-sm font-medium transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleConfirmGenerate}
                className="flex-1 py-2 rounded-xl font-semibold text-white flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all"
              >
                <ArrowRight className="w-4 h-4" />
                Confirm &amp; Generate
              </button>
            </div>
          </div>
        )}

        {/* ── Generate Button + Live Progress ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          {isWorking && (
            <StageIndicator stages={stages} current={stageIndex} />
          )}

          {/* Live generation progress — shown while ACE-Step is running */}
          {isGenerating && stageIndex === 2 && (
            <div className="space-y-3">
              {/* Animated waveform bars */}
              <div className="h-12 rounded-lg bg-gray-800/80 flex items-end justify-center gap-px px-3 overflow-hidden">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-purple-600 to-pink-400"
                    style={{
                      height: `${25 + ((i * 13 + i * i * 3) % 60)}%`,
                      transformOrigin: "bottom",
                      animation: `waveBar ${0.5 + (i % 6) * 0.12}s ease-in-out infinite`,
                      animationDelay: `${(i * 0.05) % 0.9}s`,
                    }}
                  />
                ))}
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{genMessage || "Generating…"}</span>
                  <span className="text-purple-400 font-medium tabular-nums">{genProgress}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full transition-all duration-500"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
              </div>

              {/* Live audio preview — appears as soon as audio data arrives */}
              {liveAudioUrl && (
                <div className="space-y-1">
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Remix ready — auto-playing preview
                  </p>
                  <audio
                    key={liveAudioUrl}
                    src={liveAudioUrl}
                    controls
                    autoPlay
                    className="w-full rounded-lg"
                  />
                </div>
              )}
            </div>
          )}

          {!showReview && (
            <button
              onClick={handleGenerateClick}
              disabled={isWorking}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWorking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {stageIndex === 0 ? "Enhancing audio…" : stageIndex === 1 ? "Detecting lyrics…" : genMessage || "Generating remix…"}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Remix
                </>
              )}
            </button>
          )}
          {error && (
            <div className="bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* ── Panel C: Result ── */}
        {(result?.url || liveAudioUrl) && !isGenerating && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">
                {result?.title || "Remix Result"}
              </h3>
            </div>

            {result?.thumbnail && (
              <img src={result.thumbnail} alt="Thumbnail" className="w-24 h-24 rounded-xl object-cover border border-gray-700" />
            )}

            <audio controls src={result?.url || liveAudioUrl} className="w-full rounded-lg" />

            {(result?.tags || result?.lyrics) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result?.tags && (
                  <div className="bg-gray-800 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium">Generated Tags</p>
                    <p className="text-sm text-purple-300">{result.tags}</p>
                  </div>
                )}
                {result?.lyrics && (
                  <div className="bg-gray-800 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-xs text-gray-500 font-medium">Generated Lyrics</p>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">{result.lyrics}</pre>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <a
                href={result?.url || liveAudioUrl}
                download="remix.wav"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
              <button
                onClick={handleSendToVideo}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
              >
                <Film className="w-4 h-4" />
                Send to Video Pipeline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
