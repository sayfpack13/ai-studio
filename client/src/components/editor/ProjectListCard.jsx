import { useApp } from "../../context/AppContext";
import { useEditor } from "../../context/EditorContext";

export default function ProjectListCard({ onOpenManager }) {
  const {
    editorProjects,
    getEditorProjectIds,
    deleteEditorProject,
    saveEditorProject,
  } = useApp();
  const { loadProject } = useEditor();

  const projectIds = getEditorProjectIds?.() || [];

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return "—";
    }
  };

  const handleLoad = (projectId) => {
    const payload = editorProjects?.[projectId];
    if (!payload) return;
    loadProject(payload, {
      id: projectId,
      lastSavedAt: payload.lastUpdated || payload.savedAt || null,
    });
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Projects</h3>
          <p className="text-[11px] text-gray-500">
            Load or manage saved editor projects
          </p>
        </div>
        <button
          className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-200"
          onClick={onOpenManager}
        >
          Manager
        </button>
      </div>

      {projectIds.length === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-950/60 border border-gray-800 rounded-lg p-3">
          No saved projects yet. Use the Project Manager to save your first
          project.
        </div>
      ) : (
        <div className="space-y-2">
          {projectIds.map((projectId) => {
            const payload = editorProjects?.[projectId];
            const title = payload?.project?.name || "Untitled Project";
            const updated = payload?.lastUpdated || payload?.savedAt;

            return (
              <div
                key={projectId}
                className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-gray-200 truncate">{title}</div>
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
  );
}
