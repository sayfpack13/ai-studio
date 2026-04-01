import { useEditor } from "../../context/EditorContext";

export default function Canvas() {
  const { project, selectedClip } = useEditor();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="aspect-video w-full bg-black rounded-lg border border-gray-700 flex items-center justify-center text-gray-400">
        {selectedClip ? `Preview: ${selectedClip.label || selectedClip.id}` : "Canvas Preview"}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {project.resolution} @ {project.fps}fps
      </p>
    </div>
  );
}
