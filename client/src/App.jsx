import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { JobProvider } from "./context/JobContext";
import { ToastProvider } from "./context/ToastContext";
import Sidebar from "./components/Sidebar";
import JobsPanel from "./components/JobsPanel";
import Chat from "./components/Chat";
import ImageGenerator from "./components/ImageGenerator";
import VideoGenerator from "./components/VideoGenerator";
import MusicGenerator from "./components/MusicGenerator";
import MusicRemix from "./components/MusicRemix";
import VideoEditor from "./components/VideoEditor";
import Dashboard from "./components/Dashboard";
import MediaLibrary from "./components/library/MediaLibrary";
import AdminPanel from "./components/AdminPanel";
import { ChutesPage } from "./components/Chutes";
import { getToken } from "./services/api";

function AppContent() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());
  const { sidebarOpen, toggleSidebar } = useApp();

  const handleAuthChange = (auth) => {
    setIsAuthenticated(auth);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Logo and Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              title="Toggle sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-lg font-bold">AI</span>
              </div>
              <h1 className="text-lg font-bold hidden sm:block">AI Studio</h1>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdmin(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isAuthenticated
                  ? "bg-green-700 hover:bg-green-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span className="hidden sm:inline">Admin</span>
              {isAuthenticated && (
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

        <main className="flex-1 p-4 overflow-hidden">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Chat />} />
            <Route path="/image" element={<ImageGenerator />} />
            <Route path="/video" element={<VideoGenerator />} />
            <Route path="/music" element={<MusicGenerator />} />
            <Route path="/remix" element={<MusicRemix />} />
            <Route path="/editor" element={<VideoEditor />} />
            <Route path="/library" element={<MediaLibrary />} />
            <Route path="/chutes" element={<ChutesPage />} />
          </Routes>
        </main>
      </div>

      {/* Admin Panel Modal */}
      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onAuthChange={handleAuthChange}
        />
      )}

      {/* Jobs Panel */}
      <JobsPanel />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <JobProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </ToastProvider>
      </JobProvider>
    </AppProvider>
  );
}

export default App;
