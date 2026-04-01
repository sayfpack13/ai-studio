import { useEditor } from "../../context/EditorContext";

export default function PropertiesPanel() {
  const { project, setProject, selectedClip } = useEditor();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Properties</h3>
      <input
        value={project.name}
        onChange={(e) => setProject((prev) => ({ ...prev, name: e.target.value }))}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        placeholder="Project name"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={project.fps}
          onChange={(e) => setProject((prev) => ({ ...prev, fps: Number(e.target.value) || 30 }))}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          placeholder="FPS"
        />
        <input
          value={project.resolution}
          onChange={(e) => setProject((prev) => ({ ...prev, resolution: e.target.value }))}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          placeholder="Resolution"
        />
      </div>
      <p className="text-xs text-gray-500">
        Selected clip: {selectedClip ? selectedClip.label || selectedClip.id : "None"}
      </p>
    </div>
  );
}
