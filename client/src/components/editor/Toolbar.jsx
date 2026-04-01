import { useEditor } from "../../context/EditorContext";

export default function Toolbar({ onExport }) {
  const { addTrack, setPlaybackState, playbackState } = useEditor();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap gap-2">
      <button className="px-3 py-2 rounded bg-gray-700" onClick={() => addTrack("video")}>Add Video Track</button>
      <button className="px-3 py-2 rounded bg-gray-700" onClick={() => addTrack("audio")}>Add Audio Track</button>
      <button
        className="px-3 py-2 rounded bg-blue-600"
        onClick={() =>
          setPlaybackState((prev) => ({ ...prev, playing: !prev.playing }))
        }
      >
        {playbackState.playing ? "Pause" : "Play"}
      </button>
      <button className="px-3 py-2 rounded bg-emerald-600 ml-auto" onClick={onExport}>
        Export
      </button>
    </div>
  );
}
