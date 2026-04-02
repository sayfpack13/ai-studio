import { useState } from "react";
import ProjectListCard from "./ProjectListCard";
import LibraryLinkPanel from "./LibraryLinkPanel";

export default function EditorProjectLibraryCard({ onOpenProjectManager }) {
  const [activeTab, setActiveTab] = useState("projects");

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