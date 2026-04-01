import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function HistorySidebar({ isOpen, onToggle }) {
  const location = useLocation();
  const {
    chatHistory,
    imageHistory,
    videoHistory,
    musicHistory,
    remixHistory,
    editorProjects,
    deleteChat,
    clearAllChats,
    deleteImage,
    clearAllImages,
    deleteVideo,
    clearAllVideos,
    deleteMusic,
    clearAllMusic,
    deleteRemix,
    clearAllRemixes,
    deleteEditorProject,
    getChatIds,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
    getEditorProjectIds,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState("");

  const LAST_CHAT_KEY = "blackbox_ai_last_chat_id";
  const LAST_IMAGE_KEY = "blackbox_ai_last_image_id";

  const pageType =
    location.pathname === "/image"
      ? "image"
      : location.pathname === "/video"
        ? "video"
        : location.pathname === "/music"
          ? "music"
          : location.pathname === "/remix"
            ? "remix"
            : location.pathname === "/editor" ||
                location.pathname === "/dashboard"
              ? "editor"
              : location.pathname === "/library"
                ? "library"
                : "chat";

  const pageLabels = {
    chat: "Chat History",
    image: "Image History",
    video: "Video History",
    music: "Music History",
    remix: "Remix History",
    editor: "Projects",
    library: "Library",
  };

  const history = useMemo(() => {
    switch (pageType) {
      case "chat":
        return chatHistory;
      case "image":
        return imageHistory;
      case "video":
        return videoHistory;
      case "music":
        return musicHistory;
      case "remix":
        return remixHistory;
      case "editor":
        return editorProjects;
      default:
        return {};
    }
  }, [
    pageType,
    chatHistory,
    imageHistory,
    videoHistory,
    musicHistory,
    remixHistory,
    editorProjects,
  ]);

  const historyIds = useMemo(() => {
    switch (pageType) {
      case "chat":
        return getChatIds();
      case "image":
        return getImageIds();
      case "video":
        return getVideoIds();
      case "music":
        return getMusicIds();
      case "remix":
        return getRemixIds();
      case "editor":
        return getEditorProjectIds();
      default:
        return [];
    }
  }, [
    pageType,
    getChatIds,
    getImageIds,
    getVideoIds,
    getMusicIds,
    getRemixIds,
    getEditorProjectIds,
  ]);

  const filteredIds = useMemo(() => {
    if (!searchQuery) return historyIds;

    const query = searchQuery.toLowerCase();
    return historyIds.filter((id) => {
      const item = history[id];
      if (!item) return false;

      if (pageType === "chat") {
        return item.messages?.[0]?.content?.toLowerCase().includes(query);
      }

      return (item.prompt || item.name || "").toLowerCase().includes(query);
    });
  }, [searchQuery, historyIds, history, pageType]);

  const getItemPreview = (item) => {
    if (pageType === "chat") {
      return item.messages?.[0]?.content?.slice(0, 50) || "New conversation";
    }
    return item.prompt?.slice(0, 50) || item.name?.slice(0, 50) || "No prompt";
  };

  const getItemDate = (item) => {
    const ts = item?.lastUpdated;
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString();
  };

  const getItemCount = (item) => {
    if (pageType === "chat") {
      return `${item.messages?.length || 0} msgs`;
    }
    return "1 item";
  };

  const handleItemClick = (id) => {
    switch (pageType) {
      case "chat":
        localStorage.setItem(LAST_CHAT_KEY, id);
        window.dispatchEvent(
          new CustomEvent("chatSelected", { detail: { chatId: id } }),
        );
        break;
      case "image":
        localStorage.setItem(LAST_IMAGE_KEY, id);
        window.dispatchEvent(
          new CustomEvent("imageHistorySelected", { detail: { imageId: id } }),
        );
        break;
      case "video":
        window.dispatchEvent(
          new CustomEvent("videoHistorySelected", { detail: { videoId: id } }),
        );
        break;
      case "music":
        window.dispatchEvent(
          new CustomEvent("musicHistorySelected", { detail: { musicId: id } }),
        );
        break;
      case "remix":
        window.dispatchEvent(
          new CustomEvent("remixHistorySelected", { detail: { remixId: id } }),
        );
        break;
      default:
        break;
    }

    if (typeof onToggle === "function" && window.innerWidth < 1024) {
      onToggle();
    }
  };

  const handleDelete = (id, event) => {
    event.stopPropagation();

    switch (pageType) {
      case "chat":
        deleteChat(id);
        break;
      case "image":
        deleteImage(id);
        break;
      case "video":
        deleteVideo(id);
        break;
      case "music":
        deleteMusic(id);
        break;
      case "remix":
        deleteRemix(id);
        break;
      case "editor":
        deleteEditorProject(id);
        break;
      default:
        break;
    }
  };

  const handleClearAll = () => {
    switch (pageType) {
      case "chat":
        clearAllChats();
        break;
      case "image":
        clearAllImages();
        break;
      case "video":
        clearAllVideos();
        break;
      case "music":
        clearAllMusic();
        break;
      case "remix":
        clearAllRemixes();
        break;
      default:
        break;
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={`${
          isOpen ? "w-80" : "w-0"
        } flex-shrink-0 bg-gray-900 border-l border-gray-800 transition-all duration-300 ease-in-out overflow-hidden flex flex-col fixed right-0 lg:relative h-full z-50`}
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold tracking-wide text-gray-200 uppercase">
            {pageLabels[pageType]}
          </h3>
          <div className="flex items-center gap-1">
            {historyIds.length > 0 && pageType !== "library" && (
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 hover:bg-gray-800 rounded"
                title="Clear all"
              >
                Clear
              </button>
            )}
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded lg:hidden"
              title="Close history"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {historyIds.length > 0 && pageType !== "library" && (
          <div className="p-2 border-b border-gray-800">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search history..."
                className="w-full bg-gray-800 text-white pl-9 pr-8 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  title="Clear search"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {pageType === "library" ? (
            <div className="p-4 text-gray-400 text-sm">
              Library items are managed in the Library page.
            </div>
          ) : filteredIds.length === 0 ? (
            <div className="p-4 text-gray-400 text-center text-sm">
              <svg
                className="w-10 h-10 mx-auto mb-2 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7h18M3 12h18M3 17h18"
                />
              </svg>
              <p>
                {searchQuery
                  ? "No results found"
                  : `No ${pageType} history yet`}
              </p>
              {!searchQuery && (
                <p className="text-xs mt-1">
                  Your generated content will appear here
                </p>
              )}
            </div>
          ) : (
            filteredIds.map((id) => {
              const item = history[id];
              if (!item) return null;

              return (
                <div
                  key={id}
                  onClick={() => handleItemClick(id)}
                  className="group p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors hover:bg-gray-800 border border-transparent hover:border-gray-700"
                >
                  <div className="flex items-start gap-2">
                    {pageType !== "chat" && item.result?.url && (
                      <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                        {pageType === "image" ? (
                          <img
                            src={item.result.url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
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
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate text-gray-200">
                        {getItemPreview(item)}
                        {getItemPreview(item).length >= 50 ? "..." : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {getItemCount(item)}
                        </span>
                        <span className="text-xs text-gray-600">•</span>
                        <span className="text-xs text-gray-500">
                          {getItemDate(item)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(event) => handleDelete(id, event)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition-all"
                      title="Delete"
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
