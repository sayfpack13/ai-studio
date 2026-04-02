import { useEffect, useMemo, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import { useApp } from "../../context/AppContext";

export default function ProjectManagerDialog({ open, onClose }) {
  const {
    project,
    tracks,
    loadProject,
    setProject,
    hasUnsavedChanges,
    newProject,
    markSaved,
    projectMeta,
  } = useEditor();
  const {
    editorProjects,
    getEditorProjectIds,
    saveEditorProject,
    deleteEditorProject,
  } = useApp();
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingLoadId, setPendingLoadId] = useState(null);
  const [projectName, setProjectName] = useState(project.name || "Untitled");
  const [importError, setImportError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (open) {
      setProjectName(project.name || "Untitled");
      setImportError("");
      setSaveMessage("");
    }
  }, [open, project.name]);

  const projectIds = useMemo(
    () => getEditorProjectIds?.() || [],
    [getEditorProjectIds, editorProjects],
  );

  if (!open) return null;

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return "—";
    }
  };

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
    const projectId = projectMeta.id || `project_${Date.now()}`;
    saveEditorProject(projectId, payload);
    markSaved(projectId);
    setSaveMessage("Project saved successfully!");
    setTimeout(() => setSaveMessage(""), 2000);
  };

  const saveAndProceed = () => {
    handleSave();
    setShowUnsavedWarning(false);

    if (pendingLoadId === "new") {
      newProject();
      setProjectName("Untitled Project");
      setSaveMessage("New project created.");
      setTimeout(() => setSaveMessage(""), 2000);
    } else if (pendingLoadId) {
      const payload = editorProjects?.[pendingLoadId];
      if (payload) {
        loadProject(payload, {
          id: pendingLoadId,
          lastSavedAt: payload.lastUpdated || payload.savedAt || null,
        });
        setSaveMessage("Project loaded.");
        setTimeout(() => setSaveMessage(""), 1500);
        onClose?.();
      }
    }
    setPendingLoadId(null);
  };

  const handleNewProject = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
      setPendingLoadId("new");
      return;
    }
    newProject();
    setProjectName("Untitled Project");
    setSaveMessage("New project created.");
    setTimeout(() => setSaveMessage(""), 2000);
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

  const handleLoad = (projectId) => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
      setPendingLoadId(projectId);
      return;
    }
    const payload = editorProjects?.[projectId];
    if (!payload) return;
    loadProject(payload, {
      id: projectId,
      lastSavedAt: payload.lastUpdated || payload.savedAt || null,
    });
    setSaveMessage("Project loaded.");
    setTimeout(() => setSaveMessage(""), 1500);
    onClose?.();
  };

  const confirmLoad = () => {
    setShowUnsavedWarning(false);
    if (pendingLoadId === "new") {
      newProject();
      setProjectName("Untitled Project");
      setSaveMessage("New project created.");
      setTimeout(() => setSaveMessage(""), 2000);
    } else if (pendingLoadId) {
      const payload = editorProjects?.[pendingLoadId];
      if (payload) {
        loadProject(payload, {
          id: pendingLoadId,
          lastSavedAt: payload.lastUpdated || payload.savedAt || null,
        });
        setSaveMessage("Project loaded.");
        setTimeout(() => setSaveMessage(""), 1500);
        onClose?.();
      }
    }
    setPendingLoadId(null);
  };

  const cancelLoad = () => {
    setShowUnsavedWarning(false);
    setPendingLoadId(null);
  };

  const handleDuplicate = (projectId) => {
    const payload = editorProjects?.[projectId];
    if (!payload) return;

    const baseName = payload.project?.name || "Untitled Project";
    const copyPayload = {
      ...payload,
      savedAt: Date.now(),
      project: {
        ...payload.project,
        name: `${baseName} (Copy)`,
      },
    };

    const newId = `project_${Date.now()}`;
    saveEditorProject(newId, copyPayload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white">
              Project Dashboard
            </h3>
            {hasUnsavedChanges && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                Unsaved Changes
              </span>
            )}
          </div>
          <button
            className="px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Current Project
                </h4>
                <p className="text-[11px] text-gray-500">
                  Update the name, then save or export.
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500">Project Name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                  placeholder="Untitled Project"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                <div>Tracks: {tracks.length}</div>
                <div>Duration: {project.duration}s</div>
                <div>Resolution: {project.resolution}</div>
                <div>FPS: {project.fps}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-sm font-semibold"
                  onClick={handleNewProject}
                >
                  New Project
                </button>
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

          <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-white">
                Recent Projects
              </h4>
              <p className="text-[11px] text-gray-500">
                Load, duplicate, or delete a saved project.
              </p>
            </div>

            {projectIds.length === 0 ? (
              <div className="text-xs text-gray-500 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
                No saved projects yet. Use Save Project to create one.
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {projectIds.map((projectId) => {
                  const payload = editorProjects?.[projectId];
                  const title = payload?.project?.name || "Untitled Project";
                  const updated = payload?.lastUpdated || payload?.savedAt;

                  return (
                    <div
                      key={projectId}
                      className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-gray-200 truncate">
                          {title}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Updated {formatDate(updated)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="px-2 py-1 rounded bg-blue-600/20 text-blue-200 text-xs hover:bg-blue-600/30"
                          onClick={() => handleLoad(projectId)}
                        >
                          Load
                        </button>
                        <button
                          className="px-2 py-1 rounded bg-gray-800 text-gray-200 text-xs hover:bg-gray-700"
                          onClick={() => handleDuplicate(projectId)}
                        >
                          Duplicate
                        </button>
                        <button
                          className="px-2 py-1 rounded bg-rose-600/20 text-rose-200 text-xs hover:bg-rose-600/30"
                          onClick={() => deleteEditorProject(projectId)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {showUnsavedWarning && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-900 border border-amber-500/50 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Unsaved Changes
                  </h4>
                  <p className="text-xs text-gray-400">
                    Your current project has unsaved changes that will be lost.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="px-3 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
                  onClick={cancelLoad}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
                  onClick={saveAndProceed}
                >
                  Save & Continue
                </button>
                <button
                  className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold"
                  onClick={confirmLoad}
                >
                  Discard & Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
