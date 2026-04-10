/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  checkApiStatus,
  listLibraryAssets,
  createLibraryAsset,
  updateLibraryAsset,
  deleteLibraryAsset,
  searchLibraryAssets,
  uploadLibraryFile,
} from "../services/api";

const AppContext = createContext();

// LocalStorage keys
const STREAM_ENABLED_KEY = "blackbox_ai_stream_enabled";
const SIDEBAR_OPEN_KEY = "blackbox_ai_sidebar_open";
const CHAT_HISTORY_KEY = "blackbox_ai_chat_history";
const IMAGE_HISTORY_KEY = "blackbox_ai_image_history";
const VIDEO_HISTORY_KEY = "blackbox_ai_video_history";
const MUSIC_HISTORY_KEY = "blackbox_ai_music_history";
const REMIX_HISTORY_KEY = "blackbox_ai_remix_history";
const EDITOR_PROJECTS_KEY = "blackbox_ai_editor_projects";
const LIBRARY_FILTERS_KEY = "blackbox_ai_library_filters";

// Maximum items to keep in history
const MAX_HISTORY_ITEMS = 50;

// Trim history to max items
const trimHistory = (history, maxItems = MAX_HISTORY_ITEMS) => {
  const entries = Object.entries(history);
  if (entries.length <= maxItems) return history;

  // Sort by lastUpdated and keep only the most recent
  const sorted = entries.sort(
    (a, b) => (b[1]?.lastUpdated || 0) - (a[1]?.lastUpdated || 0),
  );
  const trimmed = Object.fromEntries(sorted.slice(0, maxItems));
  return trimmed;
};

// Filter out invalid video URLs (videolan.org, data URLs, missing/not found)
const isInvalidMediaUrl = (url) => {
  if (!url) return true;
  const normalized = String(url).trim();
  if (!normalized) return true;
  const lower = normalized.toLowerCase();
  if (
    lower === "not found" ||
    lower === "missing" ||
    lower === "undefined" ||
    lower === "null"
  ) {
    return true;
  }
  if (normalized.includes("videolan.org")) return true;
  if (normalized.startsWith("data:")) return true;
  return false;
};

const getVideoUrl = (video) => {
  if (!video) return "";
  return (
    video?.result?.url || video?.result?.data?.[0]?.url || video?.url || ""
  );
};

const filterInvalidVideos = (history) => {
  const filtered = {};
  for (const [id, video] of Object.entries(history)) {
    const url = getVideoUrl(video);
    if (!isInvalidMediaUrl(url)) {
      filtered[id] = video;
    }
  }
  return filtered;
};

const getImageUrl = (image) => {
  if (!image) return "";
  return image?.result?.url || image?.url || "";
};

const mergeImageHistoryFromLibrary = (history, assets = []) => {
  if (!Array.isArray(assets) || assets.length === 0) return history;

  const next = { ...(history || {}) };
  const existingUrls = new Set(
    Object.values(history || {})
      .map((item) => getImageUrl(item))
      .filter((url) => !isInvalidMediaUrl(url)),
  );

  for (const asset of assets) {
    if (!asset || asset.type !== "image") continue;
    if (asset.source && asset.source !== "image") continue;

    const url = asset.url;
    if (isInvalidMediaUrl(url) || existingUrls.has(url)) continue;

    const lastUpdatedMs =
      Date.parse(asset.updatedAt || asset.createdAt || "") || Date.now();

    next[asset.id] = {
      prompt: asset.metadata?.prompt || asset.title || "Generated image",
      result: { url },
      model: asset.metadata?.model,
      metadata: asset.metadata || {},
      lastUpdated: lastUpdatedMs,
    };

    existingUrls.add(url);
  }

  return trimHistory(next);
};

// Helper to load from localStorage with size check
const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    const parsed = JSON.parse(stored);
    // If it's a history object, trim it on load
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      return trimHistory(parsed);
    }
    return parsed;
  } catch {
    return defaultValue;
  }
};

// Helper to save to localStorage with error handling
const saveToStorage = (key, value) => {
  try {
    const serialized = JSON.stringify(value);
    // Check if this would exceed quota (rough check: 5MB limit per origin)
    if (serialized.length > 4 * 1024 * 1024) {
      console.warn(`Data for ${key} is too large, clearing old data`);
      // If it's a history object, trim it
      if (typeof value === "object" && !Array.isArray(value)) {
        const trimmed = trimHistory(value, MAX_HISTORY_ITEMS / 2);
        localStorage.setItem(key, JSON.stringify(trimmed));
        return;
      }
    }
    localStorage.setItem(key, serialized);
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      console.warn(`localStorage quota exceeded for ${key}, clearing...`);
      try {
        // Clear the key and try again with trimmed data
        localStorage.removeItem(key);
        if (typeof value === "object" && !Array.isArray(value)) {
          const trimmed = trimHistory(value, MAX_HISTORY_ITEMS / 2);
          localStorage.setItem(key, JSON.stringify(trimmed));
        }
      } catch {
        // If still failing, just clear the key
        localStorage.removeItem(key);
      }
    }
  }
};

export function AppProvider({ children }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [defaultModel, setDefaultModel] = useState("");
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streamEnabled, setStreamEnabled] = useState(() =>
    loadFromStorage(STREAM_ENABLED_KEY, false),
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    loadFromStorage(SIDEBAR_OPEN_KEY, true),
  );
  const [chatHistory, setChatHistory] = useState(() =>
    loadFromStorage(CHAT_HISTORY_KEY, {}),
  );
  const [imageHistory, setImageHistory] = useState(() =>
    loadFromStorage(IMAGE_HISTORY_KEY, {}),
  );
  const [videoHistory, setVideoHistory] = useState(() =>
    filterInvalidVideos(loadFromStorage(VIDEO_HISTORY_KEY, {})),
  );
  const [musicHistory, setMusicHistory] = useState(() =>
    loadFromStorage(MUSIC_HISTORY_KEY, {}),
  );
  const [remixHistory, setRemixHistory] = useState(() =>
    loadFromStorage(REMIX_HISTORY_KEY, {}),
  );
  const [editorProjects, setEditorProjects] = useState(() =>
    loadFromStorage(EDITOR_PROJECTS_KEY, {}),
  );
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [libraryFilters, setLibraryFilters] = useState(() =>
    loadFromStorage(LIBRARY_FILTERS_KEY, { query: "", type: "" }),
  );

  useEffect(() => {
    checkStatus();
  }, []);

  // Persist stream toggle
  useEffect(() => {
    saveToStorage(STREAM_ENABLED_KEY, streamEnabled);
  }, [streamEnabled]);

  // Persist sidebar state
  useEffect(() => {
    saveToStorage(SIDEBAR_OPEN_KEY, sidebarOpen);
  }, [sidebarOpen]);

  // Persist chat history (trimmed)
  useEffect(() => {
    saveToStorage(CHAT_HISTORY_KEY, trimHistory(chatHistory));
  }, [chatHistory]);

  // Persist image history (trimmed)
  useEffect(() => {
    saveToStorage(IMAGE_HISTORY_KEY, trimHistory(imageHistory));
  }, [imageHistory]);

  // Persist video history (trimmed + filtered)
  useEffect(() => {
    saveToStorage(
      VIDEO_HISTORY_KEY,
      trimHistory(filterInvalidVideos(videoHistory)),
    );
  }, [videoHistory]);

  // Persist music history (trimmed)
  useEffect(() => {
    saveToStorage(MUSIC_HISTORY_KEY, trimHistory(musicHistory));
  }, [musicHistory]);

  useEffect(() => {
    saveToStorage(REMIX_HISTORY_KEY, trimHistory(remixHistory));
  }, [remixHistory]);

  useEffect(() => {
    saveToStorage(EDITOR_PROJECTS_KEY, trimHistory(editorProjects));
  }, [editorProjects]);

  useEffect(() => {
    saveToStorage(LIBRARY_FILTERS_KEY, libraryFilters);
  }, [libraryFilters]);

  const checkStatus = async () => {
    try {
      const status = await checkApiStatus();
      setIsConfigured(status.configured);
      setDefaultModel(status.defaultModel || "blackboxai/z-ai/glm-5");
      setProviders(status.providers || []);
    } catch (error) {
      console.error("Status check failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshLibraryAssets = useCallback(async (filters = {}) => {
    const response = await listLibraryAssets(filters);
    const assets = response?.items || response?.assets || [];
    setLibraryAssets(assets);
    setImageHistory((prev) => mergeImageHistoryFromLibrary(prev, assets));
    return assets;
  }, []);

  const addLibraryAsset = useCallback(async (asset) => {
    const response = await createLibraryAsset(asset);
    if (response?.asset) {
      setLibraryAssets((prev) => [response.asset, ...prev]);
      setImageHistory((prev) =>
        mergeImageHistoryFromLibrary(prev, [response.asset]),
      );
    }
    return response;
  }, []);

  const patchLibraryAsset = useCallback(async (assetId, patch) => {
    const response = await updateLibraryAsset(assetId, patch);
    if (response?.asset) {
      setLibraryAssets((prev) =>
        prev.map((item) => (item.id === assetId ? response.asset : item)),
      );
    }
    return response;
  }, []);

  const removeLibraryAsset = useCallback(async (assetId) => {
    const response = await deleteLibraryAsset(assetId);
    if (response?.success) {
      setLibraryAssets((prev) => prev.filter((item) => item.id !== assetId));
    }
    return response;
  }, []);

  const runLibrarySearch = useCallback(async (queryPayload) => {
    const response = await searchLibraryAssets(queryPayload);
    const assets = response?.items || response?.assets || [];
    setLibraryAssets(assets);
    return assets;
  }, []);

  const uploadLibraryAssetFile = useCallback(
    async ({
      fileName,
      fileBase64,
      mimeType,
      title,
      source = "upload",
      tags = [],
      folderId = null,
      metadata = {},
      type,
    }) => {
      const response = await uploadLibraryFile({
        fileName,
        fileBase64,
        mimeType,
        title,
        source,
        tags,
        folderId,
        metadata,
        type,
      });

      if (response?.asset) {
        setLibraryAssets((prev) => [response.asset, ...prev]);
      }

      return response;
    },
    [],
  );

  // Toggle stream setting
  const toggleStream = useCallback(() => {
    setStreamEnabled((prev) => !prev);
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // ==================== CHAT HISTORY ====================

  const saveChatMessages = useCallback((chatId, messages) => {
    setChatHistory((prev) => {
      const updated = {
        ...prev,
        [chatId]: {
          messages,
          lastUpdated: Date.now(),
        },
      };
      return trimHistory(updated);
    });
  }, []);

  const getChatMessages = useCallback(
    (chatId) => {
      return chatHistory[chatId]?.messages || [];
    },
    [chatHistory],
  );

  const deleteChat = useCallback((chatId) => {
    setChatHistory((prev) => {
      const newHistory = { ...prev };
      delete newHistory[chatId];
      return newHistory;
    });
  }, []);

  const clearAllChats = useCallback(() => {
    setChatHistory({});
  }, []);

  const getChatIds = useCallback(() => {
    return Object.keys(chatHistory).sort(
      (a, b) =>
        (chatHistory[b]?.lastUpdated || 0) - (chatHistory[a]?.lastUpdated || 0),
    );
  }, [chatHistory]);

  // ==================== IMAGE HISTORY ====================

  const saveImage = useCallback(
    (imageId, prompt, result, model, metadata = null) => {
      setImageHistory((prev) => {
        const updated = {
          ...prev,
          [imageId]: {
            prompt,
            result,
            model,
            ...(metadata && typeof metadata === "object" ? { metadata } : {}),
            lastUpdated: Date.now(),
          },
        };
        return trimHistory(updated);
      });
    },
    [],
  );

  const getImage = useCallback(
    (imageId) => {
      return imageHistory[imageId];
    },
    [imageHistory],
  );

  const deleteImage = useCallback((imageId) => {
    setImageHistory((prev) => {
      const newHistory = { ...prev };
      delete newHistory[imageId];
      return newHistory;
    });
  }, []);

  const clearAllImages = useCallback(() => {
    setImageHistory({});
  }, []);

  const getImageIds = useCallback(() => {
    return Object.keys(imageHistory).sort(
      (a, b) =>
        (imageHistory[b]?.lastUpdated || 0) -
        (imageHistory[a]?.lastUpdated || 0),
    );
  }, [imageHistory]);

  // ==================== VIDEO HISTORY ====================

  const saveVideo = useCallback((videoId, prompt, result, model, metadata) => {
    setVideoHistory((prev) => {
      const nextItem = {
        prompt,
        result,
        model,
        metadata,
        lastUpdated: Date.now(),
      };

      const url = getVideoUrl(nextItem);
      if (isInvalidMediaUrl(url)) {
        return filterInvalidVideos(prev);
      }

      const updated = {
        ...prev,
        [videoId]: nextItem,
      };
      return trimHistory(filterInvalidVideos(updated));
    });
  }, []);

  const getVideo = useCallback(
    (videoId) => {
      return videoHistory[videoId];
    },
    [videoHistory],
  );

  const deleteVideo = useCallback((videoId) => {
    setVideoHistory((prev) => {
      const newHistory = { ...prev };
      delete newHistory[videoId];
      return newHistory;
    });
  }, []);

  const clearAllVideos = useCallback(() => {
    setVideoHistory({});
  }, []);

  const getVideoIds = useCallback(() => {
    return Object.keys(videoHistory)
      .filter((id) => !isInvalidMediaUrl(getVideoUrl(videoHistory[id])))
      .sort(
        (a, b) =>
          (videoHistory[b]?.lastUpdated || 0) -
          (videoHistory[a]?.lastUpdated || 0),
      );
  }, [videoHistory]);

  // ==================== MUSIC HISTORY ====================

  const saveMusic = useCallback((musicId, prompt, result, model) => {
    setMusicHistory((prev) => {
      const updated = {
        ...prev,
        [musicId]: {
          prompt,
          result,
          model,
          lastUpdated: Date.now(),
        },
      };
      return trimHistory(updated);
    });
  }, []);

  const getMusic = useCallback(
    (musicId) => {
      return musicHistory[musicId];
    },
    [musicHistory],
  );

  const deleteMusic = useCallback((musicId) => {
    setMusicHistory((prev) => {
      const newHistory = { ...prev };
      delete newHistory[musicId];
      return newHistory;
    });
  }, []);

  const clearAllMusic = useCallback(() => {
    setMusicHistory({});
  }, []);

  const getMusicIds = useCallback(() => {
    return Object.keys(musicHistory).sort(
      (a, b) =>
        (musicHistory[b]?.lastUpdated || 0) -
        (musicHistory[a]?.lastUpdated || 0),
    );
  }, [musicHistory]);

  const saveRemix = useCallback(
    (remixId, prompt, result, model, metadata = {}) => {
      setRemixHistory((prev) => {
        const updated = {
          ...prev,
          [remixId]: {
            prompt,
            result,
            model,
            metadata,
            lastUpdated: Date.now(),
          },
        };
        return trimHistory(updated);
      });
    },
    [],
  );

  const deleteRemix = useCallback((remixId) => {
    setRemixHistory((prev) => {
      const next = { ...prev };
      delete next[remixId];
      return next;
    });
  }, []);

  const clearAllRemixes = useCallback(() => {
    setRemixHistory({});
  }, []);

  const getRemixIds = useCallback(() => {
    return Object.keys(remixHistory).sort(
      (a, b) =>
        (remixHistory[b]?.lastUpdated || 0) -
        (remixHistory[a]?.lastUpdated || 0),
    );
  }, [remixHistory]);

  const saveEditorProject = useCallback((projectId, project) => {
    setEditorProjects((prev) => {
      const updated = {
        ...prev,
        [projectId]: {
          ...project,
          lastUpdated: Date.now(),
        },
      };
      return trimHistory(updated);
    });
  }, []);

  const deleteEditorProject = useCallback((projectId) => {
    setEditorProjects((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  }, []);

  const getEditorProjectIds = useCallback(() => {
    return Object.keys(editorProjects).sort(
      (a, b) =>
        (editorProjects[b]?.lastUpdated || 0) -
        (editorProjects[a]?.lastUpdated || 0),
    );
  }, [editorProjects]);

  const value = {
    isConfigured,
    setIsConfigured,
    defaultModel,
    setDefaultModel,
    providers,
    loading,
    refreshStatus: checkStatus,
    streamEnabled,
    toggleStream,
    sidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    // Chat history
    chatHistory,
    saveChatMessages,
    getChatMessages,
    deleteChat,
    clearAllChats,
    getChatIds,
    // Image history
    imageHistory,
    saveImage,
    getImage,
    deleteImage,
    clearAllImages,
    getImageIds,
    // Video history
    videoHistory,
    saveVideo,
    getVideo,
    deleteVideo,
    clearAllVideos,
    getVideoIds,
    // Music history
    musicHistory,
    saveMusic,
    getMusic,
    deleteMusic,
    clearAllMusic,
    getMusicIds,
    // Remix history
    remixHistory,
    saveRemix,
    deleteRemix,
    clearAllRemixes,
    getRemixIds,
    // Editor projects
    editorProjects,
    saveEditorProject,
    deleteEditorProject,
    getEditorProjectIds,
    // Library
    libraryAssets,
    libraryFilters,
    setLibraryFilters,
    refreshLibraryAssets,
    addLibraryAsset,
    patchLibraryAsset,
    removeLibraryAsset,
    runLibrarySearch,
    uploadLibraryAssetFile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
