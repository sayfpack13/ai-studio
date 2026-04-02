import { useNavigate } from "react-router-dom";

export default function EditorQuickAccessCard({ onOpenProjects }) {
  const navigate = useNavigate();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">Quick Access</h3>
        <p className="text-[11px] text-gray-500">
          Projects and Library shortcuts
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200"
          onClick={onOpenProjects}
        >
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
              d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7"
            />
          </svg>
          Projects
        </button>
        <button
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200"
          onClick={() => navigate("/library")}
        >
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
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          Library
        </button>
      </div>
    </div>
  );
}
