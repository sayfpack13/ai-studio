/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

const EditorContext = createContext(null);

const MAX_HISTORY = 50;

const DEFAULT_PROJECT = {
  name: "Untitled Project",
  duration: 30,
  fps: 30,
  resolution: "1920x1080",
};

const DEFAULT_TRACKS = [
  {
    id: "track_video_1",
    type: "video",
    clips: [],
    effects: [],
    keyframes: [],
  },
  {
    id: "track_audio_1",
    type: "audio",
    clips: [],
    effects: [],
    keyframes: [],
  },
];

const cloneState = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const buildSnapshot = (project, tracks) => ({
  type: "video-editor-project",
  version: 1,
  savedAt: Date.now(),
  project,
  tracks,
});

export function EditorProvider({ children }) {
  const [project, setProjectState] = useState(() => ({ ...DEFAULT_PROJECT }));
  const [tracks, setTracksState] = useState(() => cloneState(DEFAULT_TRACKS));
  const [selectedClip, setSelectedClip] = useState(null);
  const [projectMeta, setProjectMeta] = useState({
    id: null,
    lastSavedAt: null,
    lastSavedSnapshot: null,
  });
  const [playbackState, setPlaybackState] = useState({
    playing: false,
    currentTime: 0,
  });
  const [history, setHistory] = useState({ undoStack: [], redoStack: [] });
  const [templates, setTemplates] = useState([]);
  const [effectPresets, setEffectPresets] = useState([
    {
      id: "preset_cinematic",
      name: "Cinematic Boost",
      settings: { contrast: 1.2, glow: 0.2 },
    },
    {
      id: "preset_retro",
      name: "Retro Tape",
      settings: { grain: 0.5, desaturate: 0.2 },
    },
  ]);

  const lastTimeRef = useRef(0);
  const requestRef = useRef(null);
  const isRestoringRef = useRef(false);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!projectMeta.lastSavedSnapshot) return true;
    const current = buildSnapshot(project, tracks);
    return (
      JSON.stringify(current) !== JSON.stringify(projectMeta.lastSavedSnapshot)
    );
  }, [project, tracks, projectMeta.lastSavedSnapshot]);

  const pushHistory = useCallback(() => {
    if (isRestoringRef.current) return;
    setHistory((prev) => ({
      undoStack: [
        cloneState({ project, tracks, selectedClip }),
        ...prev.undoStack,
      ].slice(0, MAX_HISTORY),
      redoStack: [],
    }));
  }, [project, tracks, selectedClip]);

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setProjectState(snapshot.project);
    setTracksState(snapshot.tracks);
    setSelectedClip(snapshot.selectedClip);
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.undoStack.length === 0) return prev;
      const [snapshot, ...rest] = prev.undoStack;
      const current = cloneState({ project, tracks, selectedClip });
      isRestoringRef.current = true;
      applySnapshot(snapshot);
      isRestoringRef.current = false;
      return {
        undoStack: rest,
        redoStack: [current, ...prev.redoStack].slice(0, MAX_HISTORY),
      };
    });
  }, [applySnapshot, project, tracks, selectedClip]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.redoStack.length === 0) return prev;
      const [snapshot, ...rest] = prev.redoStack;
      const current = cloneState({ project, tracks, selectedClip });
      isRestoringRef.current = true;
      applySnapshot(snapshot);
      isRestoringRef.current = false;
      return {
        undoStack: [current, ...prev.undoStack].slice(0, MAX_HISTORY),
        redoStack: rest,
      };
    });
  }, [applySnapshot, project, tracks, selectedClip]);

  const setProject = useCallback(
    (updater) => {
      pushHistory();
      setProjectState((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      );
    },
    [pushHistory],
  );

  const setTracks = useCallback(
    (updater) => {
      pushHistory();
      setTracksState((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      );
    },
    [pushHistory],
  );

  // Playback loop
  useEffect(() => {
    const playLoop = () => {
      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setPlaybackState((prev) => {
        let nextTime = prev.currentTime + dt;
        if (nextTime >= project.duration) {
          nextTime = 0;
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (isCtrl && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Track operations
  const addTrack = useCallback(
    (type) => {
      pushHistory();
      setTracksState((prev) => [
        ...prev,
        {
          id: `track_${type}_${Date.now()}`,
          type,
          clips: [],
          effects: [],
          keyframes: [],
        },
      ]);
    },
    [pushHistory],
  );

  const updateTrack = useCallback(
    (trackId, updates) => {
      pushHistory();
      setTracksState((prev) =>
        prev.map((track) =>
          track.id === trackId ? { ...track, ...updates } : track,
        ),
      );
    },
    [pushHistory],
  );

  // Clip operations
  const addClip = useCallback(
    (trackId, clip) => {
      pushHistory();
      setTracksState((prev) =>
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
    },
    [pushHistory],
  );

  const addClipToType = useCallback(
    (type, clip) => {
      pushHistory();
      setTracksState((prev) => {
        const existing = prev.find((track) => track.type === type);
        if (existing) {
          return prev.map((track) =>
            track.id === existing.id
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
          );
        }

        const newTrack = {
          id: `track_${type}_${Date.now()}`,
          type,
          clips: [
            {
              id: `clip_${Date.now() + 1}`,
              scale: 1,
              x: 0,
              y: 0,
              rotation: 0,
              opacity: 1,
              ...clip,
            },
          ],
          effects: [],
          keyframes: [],
        };

        return [...prev, newTrack];
      });
    },
    [pushHistory],
  );

  const updateClip = useCallback(
    (clipId, updates, options = {}) => {
      if (!options.skipHistory) pushHistory();
      setTracksState((prev) =>
        prev.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, ...updates } : clip,
          ),
        })),
      );
      setSelectedClip((prev) =>
        prev && prev.id === clipId ? { ...prev, ...updates } : prev,
      );
    },
    [pushHistory],
  );

  const removeClip = useCallback(
    (clipId) => {
      pushHistory();
      setTracksState((prev) =>
        prev.map((track) => ({
          ...track,
          clips: track.clips.filter((clip) => clip.id !== clipId),
        })),
      );
      setSelectedClip((prev) => (prev && prev.id === clipId ? null : prev));
    },
    [pushHistory],
  );

  const rippleDeleteClip = useCallback(
    (clipId) => {
      pushHistory();
      setTracksState((prev) =>
        prev.map((track) => {
          const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
          if (clipIndex === -1) return track;

          const clip = track.clips[clipIndex];
          const clipStart = clip.start || 0;
          const clipDuration = clip.duration || 0;
          const clipEnd = clipStart + clipDuration;

          const nextClips = track.clips
            .filter((c) => c.id !== clipId)
            .map((c) => {
              const start = c.start || 0;
              if (start >= clipEnd) {
                return {
                  ...c,
                  start: parseFloat(
                    Math.max(0, start - clipDuration).toFixed(2),
                  ),
                };
              }
              return c;
            });

          return { ...track, clips: nextClips };
        }),
      );
      setSelectedClip((prev) => (prev && prev.id === clipId ? null : prev));
    },
    [pushHistory],
  );

  const splitClip = useCallback(
    (clipId, atTime) => {
      let nextSelected = null;
      pushHistory();
      const newClipId = `clip_${Date.now()}`;
      setTracksState((prev) =>
        prev.map((track) => {
          const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
          if (clipIndex === -1) return track;

          const clip = track.clips[clipIndex];
          const clipStart = clip.start || 0;
          const clipDuration = clip.duration || 0;
          const clipEnd = clipStart + clipDuration;

          if (atTime <= clipStart + 0.05 || atTime >= clipEnd - 0.05)
            return track;

          const leftDuration = Math.max(0.05, atTime - clipStart);
          const rightDuration = Math.max(0.05, clipEnd - atTime);

          const updatedClip = {
            ...clip,
            duration: parseFloat(leftDuration.toFixed(2)),
          };

          const newClip = {
            ...clip,
            id: newClipId,
            start: parseFloat(atTime.toFixed(2)),
            duration: parseFloat(rightDuration.toFixed(2)),
          };

          nextSelected = newClip;

          const nextClips = [...track.clips];
          nextClips.splice(clipIndex, 1, updatedClip, newClip);

          return { ...track, clips: nextClips };
        }),
      );
      setSelectedClip((prev) => {
        if (!prev || prev.id !== clipId) return prev;
        return nextSelected || prev;
      });
    },
    [pushHistory],
  );

  // Effect operations
  const addEffect = useCallback(
    (trackId, effect) => {
      pushHistory();
      setTracksState((prev) =>
        prev.map((track) =>
          track.id === trackId
            ? { ...track, effects: [...track.effects, effect] }
            : track,
        ),
      );
    },
    [pushHistory],
  );

  const addKeyframe = useCallback(
    (trackId, keyframe) => {
      pushHistory();
      setTracksState((prev) =>
        prev.map((track) =>
          track.id === trackId
            ? { ...track, keyframes: [...(track.keyframes || []), keyframe] }
            : track,
        ),
      );
    },
    [pushHistory],
  );

  // Project management
  const newProject = useCallback(() => {
    isRestoringRef.current = true;
    setProjectState({ ...DEFAULT_PROJECT });
    setTracksState(cloneState(DEFAULT_TRACKS));
    setSelectedClip(null);
    setPlaybackState({ playing: false, currentTime: 0 });
    setHistory({ undoStack: [], redoStack: [] });
    setProjectMeta({
      id: null,
      lastSavedAt: null,
      lastSavedSnapshot: null,
    });
    isRestoringRef.current = false;
  }, []);

  const markSaved = useCallback(
    (id) => {
      const snapshot = buildSnapshot(project, tracks);
      setProjectMeta({
        id: id || projectMeta.id,
        lastSavedAt: Date.now(),
        lastSavedSnapshot: snapshot,
      });
    },
    [project, tracks, projectMeta.id],
  );

  const loadProject = useCallback((snapshot, meta = {}) => {
    if (!snapshot?.project || !snapshot?.tracks) return;
    isRestoringRef.current = true;
    setProjectState(snapshot.project);
    setTracksState(snapshot.tracks);
    setSelectedClip(null);
    setPlaybackState({ playing: false, currentTime: 0 });
    setHistory({ undoStack: [], redoStack: [] });
    setProjectMeta({
      id: meta.id || snapshot.projectId || null,
      lastSavedAt: snapshot.savedAt || meta.lastSavedAt || null,
      lastSavedSnapshot: snapshot,
    });
    isRestoringRef.current = false;
  }, []);

  const canUndo = history.undoStack.length > 0;
  const canRedo = history.redoStack.length > 0;

  const value = useMemo(
    () => ({
      project,
      setProject,
      tracks,
      setTracks,
      selectedClip,
      setSelectedClip,
      projectMeta,
      setProjectMeta,
      hasUnsavedChanges,
      playbackState,
      setPlaybackState,
      history,
      setHistory,
      canUndo,
      canRedo,
      undo,
      redo,
      newProject,
      markSaved,
      loadProject,
      addTrack,
      updateTrack,
      addClip,
      addClipToType,
      updateClip,
      removeClip,
      rippleDeleteClip,
      splitClip,
      addEffect,
      addKeyframe,
      templates,
      setTemplates,
      effectPresets,
      setEffectPresets,
    }),
    [
      project,
      tracks,
      selectedClip,
      projectMeta,
      hasUnsavedChanges,
      playbackState,
      history,
      canUndo,
      canRedo,
      undo,
      redo,
      newProject,
      markSaved,
      loadProject,
      addTrack,
      updateTrack,
      addClip,
      addClipToType,
      updateClip,
      removeClip,
      rippleDeleteClip,
      splitClip,
      addEffect,
      addKeyframe,
      templates,
      effectPresets,
      setProject,
      setTracks,
    ],
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within EditorProvider");
  }
  return context;
}
