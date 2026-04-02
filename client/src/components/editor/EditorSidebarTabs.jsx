import { useState } from "react";
import PropertiesPanel from "./PropertiesPanel";
import EffectsPanel from "./EffectsPanel";
import TemplatesPanel from "./TemplatesPanel";

const buildTabs = () => [
  {
    id: "properties",
    label: "Properties",
    icon: (
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
          d="M4 6h16M4 12h16M4 18h7"
        />
      </svg>
    ),
    render: () => <PropertiesPanel />,
  },
  {
    id: "effects",
    label: "Effects",
    icon: (
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
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    render: () => <EffectsPanel />,
  },

  {
    id: "templates",
    label: "Templates",
    icon: (
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
          d="M3 7h8v10H3zM13 7h8v4h-8zM13 13h8v4h-8z"
        />
      </svg>
    ),
    render: () => <TemplatesPanel />,
  },
];

export default function EditorSidebarTabs() {
  const [activeTab, setActiveTab] = useState("properties");
  const tabs = buildTabs();
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col min-h-[480px]">
      <div className="flex items-center gap-1 border-b border-gray-800 bg-gray-950/60 p-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                isActive
                  ? "bg-blue-600/20 text-blue-200 border border-blue-600/40"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
              }`}
            >
              <span className={isActive ? "text-blue-300" : "text-gray-500"}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-3 flex-1 overflow-y-auto">{active.render()}</div>
    </div>
  );
}
