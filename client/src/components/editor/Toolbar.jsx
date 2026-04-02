import { useEditor } from "../../context/EditorContext";

export default function Toolbar({ onExport, onProject }) {
  const {
    addTrack,
    playbackState,
    selectedClip,
    splitClip,
    removeClip,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useEditor();

  const clipStart = selectedClip?.start || 0;
  const clipEnd = clipStart + (selectedClip?.duration || 0);
  const canSplit =
    !!selectedClip &&
    playbackState.currentTime > clipStart + 0.05 &&
    playbackState.currentTime < clipEnd - 0.05;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 bg-gray-950/60 border border-gray-800 rounded-lg p-1">
        <button
          className="px-2 py-1 rounded text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 14l-4-4 4-4M5 10h9a4 4 0 110 8h-1"
            />
          </svg>
        </button>
        <button
          className="px-2 py-1 rounded text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          onClick={redo}
          disabled={!canRedo}
          title="Redo"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 14l4-4-4-4M19 10H9a4 4 0 000 8h1"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-1 bg-gray-950/60 border border-gray-800 rounded-lg p-1">
        <button
          className="px-3 py-1.5 rounded text-gray-200 hover:bg-gray-700 text-xs"
          onClick={() => addTrack("video")}
          title="Add video track"
        >
          + Video Track
        </button>
        <button
          className="px-3 py-1.5 rounded text-gray-200 hover:bg-gray-700 text-xs"
          onClick={() => addTrack("audio")}
          title="Add audio track"
        >
          + Audio Track
        </button>
      </div>

      <div className="flex items-center gap-1 bg-gray-950/60 border border-gray-800 rounded-lg p-1">
        <button
          className="px-3 py-1.5 rounded text-gray-200 hover:bg-gray-700 text-xs disabled:opacity-50"
          onClick={() =>
            selectedClip &&
            splitClip(selectedClip.id, playbackState.currentTime)
          }
          disabled={!canSplit}
          title={
            canSplit
              ? "Split clip at playhead"
              : "Select a clip and position playhead inside it"
          }
        >
          Split
        </button>
        <button
          className="px-3 py-1.5 rounded text-rose-200 hover:bg-rose-700/40 text-xs disabled:opacity-50"
          onClick={() => selectedClip && removeClip(selectedClip.id)}
          disabled={!selectedClip}
          title="Delete selected clip"
        >
          Delete
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-200"
          onClick={onProject}
        >
          Project
        </button>
        <button
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
          onClick={onExport}
        >
          Export
        </button>
      </div>
    </div>
  );
}
