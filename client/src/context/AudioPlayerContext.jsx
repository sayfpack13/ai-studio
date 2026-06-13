import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import { resolveAssetUrl } from "../services/api";

const AudioPlayerContext = createContext(null);

export function AudioPlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    try {
      return Number(localStorage.getItem("ai_studio_player_volume") || "0.8");
    } catch {
      return 0.8;
    }
  });
  const [isVisible, setIsVisible] = useState(false);
  const [pendingTrack, setPendingTrack] = useState(null);

  const playTrack = useCallback((track, newQueue = null) => {
    if (!track || !track.url) {
      console.error("Cannot play: invalid track or missing URL");
      return;
    }
    const resolvedUrl = resolveAssetUrl(track.url);
    // Validate URL - reject extremely long data URLs or malformed URLs
    if (!resolvedUrl || resolvedUrl.length > 10000) {
      console.error("Cannot play: invalid or malformed URL", resolvedUrl?.substring(0, 100));
      return;
    }
    const resolved = { ...track, resolvedUrl };
    setCurrentTrack(resolved);
    setIsVisible(true);
    setIsPlaying(true);
    if (newQueue) {
      const q = newQueue.map((t) => ({ ...t, resolvedUrl: resolveAssetUrl(t.url) }));
      const idx = q.findIndex((t) => t.id === track.id);
      setQueue(q);
      setQueueIndex(idx >= 0 ? idx : -1);
    } else {
      setQueue([]);
      setQueueIndex(-1);
    }
  }, []);

  const pause = useCallback(() => setIsPlaying(false), []);
  const resume = useCallback(() => setIsPlaying(true), []);
  const toggle = useCallback(() => setIsPlaying((p) => !p), []);
  const closePlayer = useCallback(() => {
    setIsVisible(false);
    setIsPlaying(false);
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    setProgress(0);
    setDuration(0);
    setPendingTrack(null);
  }, []);

  const requestPlayTrack = useCallback((track, newQueue = null) => {
    // Always use pendingTrack pattern - user must explicitly click to play
    // Check if same track by ID or URL (handles library vs history same audio)
    const isSameTrack = currentTrack && (
      currentTrack.id === track.id || 
      (currentTrack.url && currentTrack.url === track.url)
    );
    if (isSameTrack) {
      // Same track - clear pending track to show correct indicator
      setPendingTrack(null);
      return;
    }
    // Different track or no current track - set as pending
    setPendingTrack(track);
  }, [currentTrack]);

  const confirmReplace = useCallback(() => {
    if (pendingTrack) {
      playTrack(pendingTrack);
      setPendingTrack(null);
      // Force play immediately as a user gesture
      setTimeout(() => {
        const audio = audioRef.current;
        if (audio) {
          audio.play().catch((err) => {
            console.error("Audio play failed:", err);
            setIsPlaying(false);
          });
        }
      }, 0);
    }
  }, [pendingTrack, playTrack]);

  const next = useCallback(() => {
    if (!queue.length || queueIndex < 0) return;
    const nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) return;
    const track = queue[nextIdx];
    setCurrentTrack(track);
    setQueueIndex(nextIdx);
    setIsPlaying(true);
  }, [queue, queueIndex]);

  const prev = useCallback(() => {
    if (!queue.length || queueIndex < 0) return;
    const prevIdx = queueIndex - 1;
    if (prevIdx < 0) return;
    const track = queue[prevIdx];
    setCurrentTrack(track);
    setQueueIndex(prevIdx);
    setIsPlaying(true);
  }, [queue, queueIndex]);

  const seek = useCallback((time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration || time));
    }
  }, [duration]);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    try {
      localStorage.setItem("ai_studio_player_volume", String(clamped));
    } catch {}
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!currentTrack?.resolvedUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    // Double-check URL validity before setting
    if (currentTrack.resolvedUrl.length > 10000) {
      console.error("Audio URL too long, skipping load");
      setIsPlaying(false);
      return;
    }
    audio.src = currentTrack.resolvedUrl;
    audio.load();
    const onTime = () => setProgress(audio.currentTime);
    const onDur = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      if (queue.length && queueIndex >= 0 && queueIndex < queue.length - 1) {
        next();
      } else {
        setIsPlaying(false);
        setProgress(0);
      }
    };
    const onErr = () => {
      setIsPlaying(false);
      setTimeout(() => audio.load(), 800);
    };
    const onPlaying = () => {
      setIsPlaying(true);
    };
    const onWaiting = () => {
      // Audio is buffering, keep isPlaying true but could show loading state
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
    };
  }, [currentTrack, queue, queueIndex, next]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch((err) => {
        console.error("Audio play failed:", err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack]);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isVisible,
        progress,
        duration,
        volume,
        queue,
        queueIndex,
        hasNext: queueIndex >= 0 && queueIndex < queue.length - 1,
        hasPrev: queueIndex > 0,
        pendingTrack,
        playTrack,
        requestPlayTrack,
        confirmReplace,
        pause,
        resume,
        toggle,
        next,
        prev,
        seek,
        setVolume,
        closePlayer,
      }}
    >
      {children}
      <audio ref={audioRef} preload="auto" className="hidden" />
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error("useAudioPlayer must be inside AudioPlayerProvider");
  return ctx;
}
