import { useState } from "react";
import { useEditor } from "../../context/EditorContext";

export default function ExportModal({ open, onClose }) {
  const { project } = useEditor();
  const [format, setFormat] = useState("mp4");
  const [resolution, setResolution] = useState(project.resolution);
  const [fps, setFps] = useState(project.fps);

  if (!open) return null;

  const downloadProject = () => {
    const payload = {
      type: "editor-export-manifest",
      project,
      export: { format, resolution, fps },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name || "project"}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-lg font-semibold">Export Video</h3>
        <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2">
          <option value="mp4">MP4</option>
          <option value="webm">WebM</option>
        </select>
        <input value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2" />
        <input value={fps} onChange={(e) => setFps(Number(e.target.value) || 30)} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2" />
        <p className="text-xs text-gray-400">Preset support includes 4K/60fps (`3840x2160`, `60`).</p>
        <div className="flex gap-2 justify-end">
          <button className="px-3 py-2 rounded bg-gray-700" onClick={onClose}>Cancel</button>
          <button className="px-3 py-2 rounded bg-emerald-600" onClick={downloadProject}>Export Manifest</button>
        </div>
      </div>
    </div>
  );
}
