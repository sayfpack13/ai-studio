import { useState, useEffect, useCallback, useRef } from "react";
import { fetchOllamaLocalModels, getOllamaLocalUrl } from "../services/api";

const OLLAMA_LOCAL_URL_KEY = "blackbox_ai_ollama_local_url";
const DEFAULT_LOCAL_URL = "http://localhost:11434";

export default function useOllamaLocal(isActive) {
  const [localUrl, setLocalUrl] = useState(
    () => localStorage.getItem(OLLAMA_LOCAL_URL_KEY) || DEFAULT_LOCAL_URL,
  );
  const [localModels, setLocalModels] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const initializedRef = useRef(false);

  // Load saved URL from server on first activation
  useEffect(() => {
    if (!isActive || initializedRef.current) return;
    initializedRef.current = true;

    getOllamaLocalUrl()
      .then((data) => {
        if (data.url) {
          setLocalUrl(data.url);
          localStorage.setItem(OLLAMA_LOCAL_URL_KEY, data.url);
        }
      })
      .catch(() => {});
  }, [isActive]);

  // Auto-fetch models when filter becomes active
  useEffect(() => {
    if (isActive && localUrl && localModels.length === 0 && !localLoading) {
      fetchModels(localUrl);
    }
  }, [isActive]);

  const fetchModels = useCallback(
    async (url) => {
      const targetUrl = url || localUrl;
      if (!targetUrl) return;

      setLocalLoading(true);
      setLocalError("");

      try {
        const result = await fetchOllamaLocalModels(targetUrl);
        if (result.success) {
          setLocalModels(result.models || []);
          localStorage.setItem(OLLAMA_LOCAL_URL_KEY, targetUrl);
          setLocalUrl(targetUrl);
        } else {
          setLocalError(result.error || "Failed to fetch models");
          setLocalModels([]);
        }
      } catch (err) {
        setLocalError(err.message || "Connection failed");
        setLocalModels([]);
      } finally {
        setLocalLoading(false);
      }
    },
    [localUrl],
  );

  return {
    localUrl,
    setLocalUrl,
    localModels,
    localLoading,
    localError,
    fetchModels,
  };
}
