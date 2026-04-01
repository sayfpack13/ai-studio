import { useEditor } from "../../context/EditorContext";

function TrackRow({ track }) {
  return (
    <div className="border border-gray-800 rounded p-2 bg-gray-900">
      <div className="flex items-center justify-between text-xs text-gray-300">
        <span>{track.type.toUpperCase()} - {track.id}</span>
        <span>{track.clips.length} clips</span>
      </div>
      <div className="mt-2 h-10 bg-gray-800 rounded relative overflow-hidden">
        {(track.clips || []).map((clip, idx) => (
          <div
            key={clip.id || idx}
            className="absolute top-1 h-8 rounded bg-blue-500/70 px-2 text-xs flex items-center"
            style={{ left: `${(clip.start || idx * 4) * 10}px`, width: `${Math.max(40, (clip.duration || 3) * 18)}px` }}
          >
            {clip.label || `Clip ${idx + 1}`}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Timeline() {
  const { tracks, playbackState, setPlaybackState, project } = useEditor();
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-400">Time</label>
        <input
          type="range"
          min="0"
          max={project.duration}
          value={playbackState.currentTime}
          onChange={(e) =>
            setPlaybackState((prev) => ({ ...prev, currentTime: Number(e.target.value) }))
          }
          className="flex-1"
        />
        <span className="text-xs text-gray-400">{playbackState.currentTime.toFixed(1)}s</span>
      </div>
      {tracks.map((track) => (
        <TrackRow key={track.id} track={track} />
      ))}
    </div>
  );
}
