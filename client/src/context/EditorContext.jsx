/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from "react";

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
          ? { ...track, clips: [...track.clips, { id: `clip_${Date.now()}`, ...clip }] }
          : track,
      ),
    );
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
