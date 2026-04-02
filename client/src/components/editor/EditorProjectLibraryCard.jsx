import { useState } from "react";
import { useEditor } from "../../context/EditorContext";
import { useApp } from "../../context/AppContext";
import ProjectListCard from "./ProjectListCard";
import LibraryLinkPanel from "./LibraryLinkPanel";

export default function EditorProjectLibraryCard({ onOpenProjectManager }) {
  const {
    project,
    tracks,
    hasUnsavedChanges,
    markSaved,
    setProject,
    projectMeta,
  } = useEditor();
  const { saveEditorProject } = useApp();
  const [activeTab, setActiveTab] = useState("projects");
  const [saving, setSaving] = useState(false);

  const handleQuickSave = async () => {
    setSaving(true);
    const projectId = projectMeta.id || `project_${Date.now()}`;
    const payload = {
      type: "video-editor-project",
      version: 1,
      savedAt: Date.now(),
      project,
      tracks,
    };
    saveEditorProject(projectId, payload);
    markSaved(projectId);
    setTimeout(() => setSaving(false), 500);
  };

  const tabs = [
    {
      id: "projects",
      label: "Projects",
      render: () => <ProjectListCard onOpenManager={onOpenProjectManager} />,
    },
    {
      id: "library",
      label: "Library",
      render: () => <LibraryLinkPanel />,
    },
  ];

  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      {/* Current Project Status Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-950/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-500 truncate">
            {project.name || "Untitled Project"}
          </span>
          {hasUnsavedChanges && (
            <span
              className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
              title="Unsaved changes"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <button
              onClick={handleQuickSave}
              disabled={saving}
              className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-[10px] font-semibold text-white transition-colors"
              title="Quick Save"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}
          <button
            onClick={onOpenProjectManager}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300 transition-colors"
            title="Open Project Manager"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="flex items-center gap-1 border-b border-gray-800 bg-gray-950/60 p-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-200 border border-blue-600/40"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-3">{active.render()}</div>
    </div>
  );
}
