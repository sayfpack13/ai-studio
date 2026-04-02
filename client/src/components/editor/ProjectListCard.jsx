import { useState, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { useEditor } from "../../context/EditorContext";

export default function ProjectListCard({ onOpenManager }) {
  const {
    editorProjects,
    getEditorProjectIds,
    deleteEditorProject,
    saveEditorProject,
  } = useApp();
  const { loadProject, projectMeta } = useEditor();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const projectIds = getEditorProjectIds?.() || [];

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "—";
    }
  };

  const getProjectStats = (payload) => {
    const tracks = payload?.tracks || [];
    const videoTracks = tracks.filter((t) => t.type === "video").length;
    const audioTracks = tracks.filter((t) => t.type === "audio").length;
    const totalClips = tracks.reduce(
      (sum, t) => sum + (t.clips?.length || 0),
      0,
    );
    const duration = payload?.project?.duration || 0;
    return { videoTracks, audioTracks, totalClips, duration };
  };

  const handleLoad = useCallback(
    (projectId) => {
      const payload = editorProjects?.[projectId];
      if (!payload) return;
      loadProject(payload, {
        id: projectId,
        lastSavedAt: payload.lastUpdated || payload.savedAt || null,
      });
    },
    [editorProjects, loadProject],
  );

  const handleRename = useCallback(
    (projectId, newName) => {
      const payload = editorProjects?.[projectId];
      if (!payload) return;

      const timestamp = Date.now();
      const updatedPayload = {
        ...payload,
        project: {
          ...payload.project,
          name: newName.trim() || "Untitled Project",
        },
        lastUpdated: timestamp,
      };

      saveEditorProject(projectId, updatedPayload);
      setEditingId(null);
      setEditName("");
    },
    [editorProjects, saveEditorProject],
  );

  const handleDuplicate = useCallback(
    (projectId) => {
      const payload = editorProjects?.[projectId];
      if (!payload) return;

      const timestamp = Date.now();
      const baseName = payload.project?.name || "Untitled Project";
      const copyPayload = {
        ...payload,
        savedAt: timestamp,
        lastUpdated: timestamp,
        project: {
          ...payload.project,
          name: `${baseName} (Copy)`,
        },
      };

      const newId = `project_${timestamp}`;
      saveEditorProject(newId, copyPayload);
    },
    [editorProjects, saveEditorProject],
  );

  const handleDelete = useCallback(
    (projectId) => {
      deleteEditorProject(projectId);
      setConfirmDelete(null);
    },
    [deleteEditorProject],
  );

  const startEditing = useCallback((projectId, currentName) => {
    setEditingId(projectId);
    setEditName(currentName || "Untitled Project");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditName("");
  }, []);

  const handleExport = useCallback(
    (projectId) => {
      const payload = editorProjects?.[projectId];
      if (!payload) return;

      const name = payload.project?.name || "Untitled Project";
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "_")}.veproj.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [editorProjects],
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <h3 className="text-sm font-semibold text-white">Projects</h3>
            <span className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400">
              {projectIds.length}
            </span>
          </div>
          <button
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium flex items-center gap-1"
            onClick={onOpenManager}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="p-2 max-h-[400px] overflow-y-auto">
        {projectIds.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-xl bg-gray-800/50 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-400 mb-1">No saved projects</p>
            <p className="text-xs text-gray-500">
              Save your work to see it here
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {projectIds.map((projectId) => {
              const payload = editorProjects?.[projectId];
              const title = payload?.project?.name || "Untitled Project";
              const updated = payload?.lastUpdated || payload?.savedAt;
              const stats = getProjectStats(payload);
              const isEditing = editingId === projectId;
              const isActive = projectMeta?.id === projectId;
              const showDeleteConfirm = confirmDelete === projectId;

              return (
                <div
                  key={projectId}
                  className={`group relative rounded-lg border transition-all ${
                    isActive
                      ? "bg-blue-500/10 border-blue-500/50"
                      : "bg-gray-950/60 border-gray-800 hover:border-gray-700"
                  }`}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r" />
                  )}

                  <div className="p-3">
                    {/* Project name */}
                    <div className="flex items-center gap-2 mb-1.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleRename(projectId, editName);
                            if (e.key === "Escape") cancelEditing();
                          }}
                          autoFocus
                          className="flex-1 bg-gray-800 border border-blue-500 rounded px-2 py-1 text-sm text-white outline-none"
                        />
                      ) : (
                        <span className="flex-1 text-sm text-white font-medium truncate">
                          {title}
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleRename(projectId, editName)}
                              className="p-1.5 rounded bg-green-600/20 text-green-300 hover:bg-green-600/30"
                              title="Save"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="p-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                              title="Cancel"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditing(projectId, title)}
                              className="p-1.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                              title="Rename"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleExport(projectId)}
                              className="p-1.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                              title="Export"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDuplicate(projectId)}
                              className="p-1.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                              title="Duplicate"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => setConfirmDelete(projectId)}
                              className="p-1.5 rounded bg-gray-800 text-gray-400 hover:bg-red-600/30 hover:text-red-300"
                              title="Delete"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Project stats */}
                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                      <span>{formatDate(updated)}</span>
                      {stats.totalClips > 0 && (
                        <>
                          <span>•</span>
                          <span>{stats.totalClips} clips</span>
                        </>
                      )}
                      {stats.duration > 0 && (
                        <>
                          <span>•</span>
                          <span>{stats.duration}s</span>
                        </>
                      )}
                    </div>

                    {/* Load button */}
                    {!isEditing && !showDeleteConfirm && (
                      <button
                        onClick={() => handleLoad(projectId)}
                        className={`mt-2 w-full py-1.5 rounded text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-blue-600/30 text-blue-200 border border-blue-500/50"
                            : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                        }`}
                      >
                        {isActive ? "Currently Editing" : "Load Project"}
                      </button>
                    )}

                    {/* Delete confirmation */}
                    {showDeleteConfirm && (
                      <div className="mt-2 p-2 bg-red-500/20 rounded border border-red-500/50">
                        <p className="text-xs text-red-300 mb-2">
                          Delete this project?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDelete(projectId)}
                            className="flex-1 py-1 rounded bg-red-600 text-white text-xs font-medium"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="flex-1 py-1 rounded bg-gray-700 text-gray-300 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
