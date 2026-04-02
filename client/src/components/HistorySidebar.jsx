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
    libraryAssets,
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
    removeLibraryAsset,
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
            : location.pathname === "/library"
              ? "library"
              : location.pathname === "/editor" ||
                  location.pathname === "/dashboard"
                ? "editor"
                : "chat";

  const pageLabels = {
    chat: "Chat History",
    image: "Image History",
    video: "Video History",
    music: "Music History",
    remix: "Remix History",
    editor: "Projects",
    library: "Library Assets",
  };

  const libraryMap = useMemo(() => {
    const map = {};
    (libraryAssets || []).forEach((asset) => {
      if (!asset?.id) return;
      map[asset.id] = asset;
    });
    return map;
  }, [libraryAssets]);

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
      case "library":
        return libraryMap;
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
    libraryMap,
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
      case "library":
        return (libraryAssets || []).map((asset) => asset.id);
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
    libraryAssets,
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

      if (pageType === "editor") {
        return (item.project?.name || item.name || "")
          .toLowerCase()
          .includes(query);
      }

      if (pageType === "library") {
        return (
          (item.title || "").toLowerCase().includes(query) ||
          (item.source || "").toLowerCase().includes(query)
        );
      }

      return (item.prompt || item.name || "").toLowerCase().includes(query);
    });
  }, [searchQuery, historyIds, history, pageType]);

  const getItemPreview = (item) => {
    if (pageType === "chat") {
      return item.messages?.[0]?.content?.slice(0, 50) || "New conversation";
    }
    if (pageType === "editor") {
      return item.project?.name || item.name || "Untitled Project";
    }
    if (pageType === "library") {
      return item.title || "Untitled Asset";
    }
    return item.prompt?.slice(0, 50) || item.name?.slice(0, 50) || "No prompt";
  };

  const getItemDate = (item) => {
    const ts =
      item?.lastUpdated || item?.updatedAt || item?.savedAt || item?.createdAt;
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString();
  };

  const getItemMeta = (item) => {
    if (pageType === "library") {
      return item.type ? item.type.toUpperCase() : "ASSET";
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
      case "editor":
        localStorage.setItem("editor_project_to_load", id);
        window.dispatchEvent(
          new CustomEvent("editorProjectSelected", {
            detail: { projectId: id },
          }),
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
      case "library":
        removeLibraryAsset?.(id);
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

  const allowClear =
    pageType === "chat" ||
    pageType === "image" ||
    pageType === "video" ||
    pageType === "music" ||
    pageType === "remix";

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
          isOpen ? "w-72" : "w-0"
        } flex-shrink-0 bg-gray-900 border-l border-gray-800 transition-all duration-300 ease-in-out overflow-hidden flex flex-col fixed right-0 lg:relative h-full z-50`}
      >
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-gray-300 uppercase">
            {pageLabels[pageType] || "History"}
          </h2>
          {allowClear && (
            <button
              onClick={handleClearAll}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
            >
              Clear
            </button>
          )}
        </div>

        <div className="p-3 border-b border-gray-800">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            placeholder="Search"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredIds.length === 0 ? (
            <div className="text-xs text-gray-500 p-3">
              No items found for this section.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredIds.map((id) => {
                const item = history[id];
                if (!item) return null;
                return (
                  <button
                    key={id}
                    onClick={() => handleItemClick(id)}
                    className="text-left bg-gray-800/40 hover:bg-gray-800/70 border border-gray-800 rounded-lg p-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-gray-200 truncate">
                          {getItemPreview(item)}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          {getItemDate(item)} • {getItemMeta(item)}
                        </div>
                      </div>
                      <span
                        onClick={(event) => handleDelete(id, event)}
                        className="text-xs px-2 py-1 rounded bg-rose-600/20 text-rose-200 hover:bg-rose-600/30"
                      >
                        Delete
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-2 border-t border-gray-800 lg:hidden">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
