/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, useEffect, useRef } from "react";

const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const [project, setProject] = useState({
    name: "Untitled Project",
    duration: 30,
    fps: 30,
    resolution: "1920x1080",
  });
  const [tracks, setTracks] = useState([
    { id: "track_video_1", type: "video", clips: [], effects: [], keyframes: [] },
    { id: "track_audio_1", type: "audio", clips: [], effects: [], keyframes: [] },
  ]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [playbackState, setPlaybackState] = useState({ playing: false, currentTime: 0 });
  const [history, setHistory] = useState({ undoStack: [], redoStack: [] });
  const [templates, setTemplates] = useState([]);
  const [effectPresets, setEffectPresets] = useState([
    { id: "preset_cinematic", name: "Cinematic Boost", settings: { contrast: 1.2, glow: 0.2 } },
    { id: "preset_retro", name: "Retro Tape", settings: { grain: 0.5, desaturate: 0.2 } },
  ]);

  const lastTimeRef = useRef(Date.now());
  const requestRef = useRef(null);

  useEffect(() => {
    const playLoop = () => {
      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setPlaybackState((prev) => {
        let nextTime = prev.currentTime + dt;
        if (nextTime >= project.duration) {
          nextTime = 0; // Loop
        }
        return { ...prev, currentTime: nextTime };
      });

      requestRef.current = requestAnimationFrame(playLoop);
    };

    if (playbackState.playing) {
      lastTimeRef.current = Date.now();
      requestRef.current = requestAnimationFrame(playLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [playbackState.playing, project.duration]);

  const addTrack = (type) => {
    setTracks((prev) => [
      ...prev,
      { id: `track_${type}_${Date.now()}`, type, clips: [], effects: [], keyframes: [] },
    ]);
  };

  const addClip = (trackId, clip) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: [
                ...track.clips,
                {
                  id: `clip_${Date.now()}`,
                  scale: 1,
                  x: 0,
                  y: 0,
                  rotation: 0,
                  opacity: 1,
                  ...clip,
                },
              ],
            }
          : track,
      ),
    );
  };

  const updateClip = (clipId, updates) => {
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === clipId ? { ...clip, ...updates } : clip
        ),
      }))
    );
    setSelectedClip((prev) => (prev && prev.id === clipId ? { ...prev, ...updates } : prev));
  };

  const addEffect = (trackId, effect) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, effects: [...track.effects, effect] } : track,
      ),
    );
  };

  const addKeyframe = (trackId, keyframe) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? { ...track, keyframes: [...(track.keyframes || []), keyframe] }
          : track,
      ),
    );
  };

  const value = useMemo(
    () => ({
      project,
      setProject,
      tracks,
      setTracks,
      selectedClip,
      setSelectedClip,
      playbackState,
      setPlaybackState,
      history,
      setHistory,
      addTrack,
      addClip,
      updateClip,
      addEffect,
      addKeyframe,
      templates,
      setTemplates,
      effectPresets,
      setEffectPresets,
    }),
    [project, tracks, selectedClip, playbackState, history, templates, effectPresets],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within EditorProvider");
  }
  return context;
}
