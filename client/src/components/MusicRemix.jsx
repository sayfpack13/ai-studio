import { useEffect, useMemo, useRef, useState } from "react";
import { enqueuePipeline, getMusicVoices, remixMusic, uploadMusicSource } from "../services/api";
import { useApp } from "../context/AppContext";

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

export default function MusicRemix() {
  const { saveRemix, defaultModel, addLibraryAsset } = useApp();
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [prompt, setPrompt] = useState("Create a cleaner cinematic remix");
  const [style, setStyle] = useState("cinematic");
  const [genre, setGenre] = useState("electronic");
  const [tempo, setTempo] = useState("same");
  const [weirdness, setWeirdness] = useState(30);
  const [influence, setInfluence] = useState(70);
  const [voice, setVoice] = useState("");
  const [voices, setVoices] = useState([]);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef(null);

  useEffect(() => {
    let active = true;
    getMusicVoices().then((response) => {
      if (active && response?.success) {
        setVoices(response.data || []);
        if ((response.data || [])[0]) {
          setVoice(response.data[0].id);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const canRemix = useMemo(() => file && !isLoading, [file, isLoading]);

  const onFileChange = (event) => {
    const next = event.target.files?.[0];
    if (!next) return;
    setFile(next);
    setAudioUrl(URL.createObjectURL(next));
    setResult(null);
    setError("");
  };

  const handleRemix = async () => {
    if (!file) return;
    setIsLoading(true);
    setError("");
    try {
      const audioBase64 = await fileToBase64(file);
      const uploaded = await uploadMusicSource({
        fileName: file.name,
        audioBase64,
        mimeType: file.type || "audio/mpeg",
      });
      const payload = {
        model: defaultModel,
        sourceAudioUrl: uploaded?.data?.url,
        prompt,
        style,
        genre,
        tempo,
        weirdness,
        influence,
        voice,
        preserveVocals: true,
        format: "mp3",
      };
      const response = await remixMusic(payload);
      if (!response?.success) {
        throw new Error(response?.error || "Remix failed");
      }
      const remixResult = response.data?.[0] || null;
      setResult(remixResult);
      if (remixResult) {
        const remixId = `remix_${Date.now()}`;
        saveRemix(remixId, prompt, remixResult, defaultModel, {
          style,
          genre,
          tempo,
          weirdness,
          influence,
        });
        await addLibraryAsset({
          type: "audio",
          source: "remix",
          title: prompt.slice(0, 80) || "Remix output",
          url: remixResult.url,
          metadata: { style, genre, tempo, weirdness, influence },
        });
      }
    } catch (err) {
      setError(err.message || "Remix failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemixToVideoPipeline = async () => {
    if (!result?.url) return;
    await enqueuePipeline("remix-to-video", {
      remixPayload: { prompt: `Use remix for video soundtrack: ${prompt}` },
      videoPayload: { prompt: "Generate visuals synced to remix soundtrack", duration: 10, fps: 24 },
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold text-white">Music Remix</h2>
        <p className="text-sm text-gray-400">
          Upload a track and generate a Suno-style remix.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <label className="block text-sm text-gray-300">Source Audio</label>
          <input
            type="file"
            accept="audio/*"
            onChange={onFileChange}
            className="w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white"
          />
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
          )}
          <div className="h-20 rounded-lg bg-gray-800 border border-gray-700 p-2 flex items-end gap-1">
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="bg-blue-500/70 w-1 rounded-sm"
                style={{ height: `${20 + ((i * 11) % 60)}%` }}
              />
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full min-h-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            placeholder="Describe the remix style"
          />
          <div className="grid grid-cols-2 gap-2">
            <input value={style} onChange={(e) => setStyle(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="Style" />
            <input value={genre} onChange={(e) => setGenre(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="Genre" />
            <input value={tempo} onChange={(e) => setTempo(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="Tempo" />
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Weirdness: {weirdness}</label>
            <input type="range" min="0" max="100" value={weirdness} onChange={(e) => setWeirdness(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Style Influence: {influence}</label>
            <input type="range" min="0" max="100" value={influence} onChange={(e) => setInfluence(Number(e.target.value))} className="w-full" />
          </div>
          <button
            onClick={handleRemix}
            disabled={!canRemix}
            className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {isLoading ? "Remixing..." : "Generate Remix"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {result?.url && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <h3 className="font-medium text-white">Remix Result</h3>
          <audio controls src={result.url} className="w-full" />
          <a href={result.url} download className="inline-flex px-3 py-2 rounded bg-blue-600 text-white text-sm">
            Download Remix
          </a>
          <button onClick={handleRemixToVideoPipeline} className="inline-flex ml-2 px-3 py-2 rounded bg-purple-600 text-white text-sm">
            Send To Remix{"->"}Video Pipeline
          </button>
        </div>
      )}
    </div>
  );
}
