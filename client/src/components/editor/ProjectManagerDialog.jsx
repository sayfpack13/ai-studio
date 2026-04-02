import { useState } from "react";
import { useEditor } from "../../context/EditorContext";
import { useApp } from "../../context/AppContext";

export default function ProjectManagerDialog({ open, onClose }) {
  const { project, tracks, loadProject, setProject } = useEditor();
  const { saveEditorProject } = useApp();
  const [projectName, setProjectName] = useState(project.name || "Untitled");
  const [importError, setImportError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  if (!open) return null;

  const buildPayload = (nameOverride) => ({
    type: "video-editor-project",
    version: 1,
    savedAt: Date.now(),
    project: {
      ...project,
      name: nameOverride || project.name,
    },
    tracks,
  });

  const handleSave = () => {
    const name = projectName.trim() || project.name || "Untitled Project";
    setProject((prev) => ({ ...prev, name }));
    const payload = buildPayload(name);
    const projectId = `project_${Date.now()}`;
    saveEditorProject(projectId, payload);
    setSaveMessage("Project saved locally.");
    setTimeout(() => setSaveMessage(""), 1500);
  };

  const handleExport = () => {
    const name = projectName.trim() || project.name || "Untitled Project";
    const payload = buildPayload(name);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_")}.veproj.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event) => {
    setImportError("");
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const isValid =
        payload &&
        payload.project &&
        Array.isArray(payload.tracks) &&
        (payload.type === "video-editor-project" || payload.version);

      if (!isValid) {
        throw new Error(
          "Invalid file. Expected a video editor project export.",
        );
      }

      loadProject(payload);
      setProjectName(payload.project?.name || "Imported Project");
      onClose?.();
    } catch (error) {
      setImportError(error.message || "Failed to import project.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Project Manager
            </h3>
            <p className="text-xs text-gray-400">
              Save, import, or export full editor projects.
            </p>
          </div>
          <button
            className="px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 space-y-2">
          <label className="text-xs text-gray-500">Project Name</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            placeholder="Untitled Project"
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold"
              onClick={handleSave}
            >
              Save Project
            </button>
            <button
              className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
              onClick={handleExport}
            >
              Export Project File
            </button>
            <label className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm font-semibold cursor-pointer">
              Import Project File
              <input
                type="file"
                accept="application/json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
          {saveMessage && (
            <p className="text-xs text-emerald-400">{saveMessage}</p>
          )}
          {importError && (
            <p className="text-xs text-rose-400">{importError}</p>
          )}
        </div>

        <div className="text-xs text-gray-500">
          Import expects a `.veproj.json` file exported from this editor.
        </div>
      </div>
    </div>
  );
}
