import { createContext, useContext, useState, useCallback, useEffect } from "react";

function getStorageKey(type) {
  return `ai_studio_favorites_${type}`;
}

function readFavorites(type) {
  try {
    const raw = localStorage.getItem(getStorageKey(type));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function writeFavorites(type, set) {
  try {
    localStorage.setItem(getStorageKey(type), JSON.stringify([...set]));
  } catch {
    // ignore storage errors
  }
}

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [favoriteMap, setFavoriteMap] = useState(() => ({
    image: readFavorites("image"),
    video: readFavorites("video"),
    audio: readFavorites("audio"),
    music: readFavorites("music"),
    remix: readFavorites("remix"),
  }));

  const isFavorite = useCallback(
    (type, id) => {
      if (!type || !id) return false;
      return favoriteMap[type]?.has(id) ?? false;
    },
    [favoriteMap]
  );

  const toggleFavorite = useCallback((type, id) => {
    if (!type || !id) return false;
    let nextValue = false;
    setFavoriteMap((prev) => {
      const next = { ...prev };
      const set = new Set(prev[type]);
      if (set.has(id)) {
        set.delete(id);
        nextValue = false;
      } else {
        set.add(id);
        nextValue = true;
      }
      next[type] = set;
      writeFavorites(type, set);
      return next;
    });
    return nextValue;
  }, []);

  const getFavorites = useCallback(
    (type) => {
      return new Set(favoriteMap[type] || []);
    },
    [favoriteMap]
  );

  return (
    <FavoritesContext.Provider value={{ isFavorite, toggleFavorite, getFavorites }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
}
