import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Cloud,
  HardDrive,
  Star,
  Clock,
  ChevronDown,
  X,
  Filter,
} from "lucide-react";
import { Button, Input } from "../ui";
import ModelCard from "./ModelCard";

const FAVORITES_KEY = "ai_studio_favorite_models";

export default function ModelSelector({
  models = [],
  selectedModel,
  onSelect,
  category = "chat",
  providers = [],
  selectedProvider,
  onProviderChange,
  placeholder = "Select a model",
  showProviderFilter = true,
  showCloudFilter = true,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  // Filter models
  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const matchesSearch =
        search === "" ||
        model.name?.toLowerCase().includes(search.toLowerCase()) ||
        model.id?.toLowerCase().includes(search.toLowerCase()) ||
        model.provider?.toLowerCase().includes(search.toLowerCase());

      const matchesCloud =
        cloudFilter === "all" ||
        (cloudFilter === "cloud" && model.isCloud) ||
        (cloudFilter === "local" && !model.isCloud);

      const matchesProvider =
        !selectedProvider ||
        model.provider === selectedProvider ||
        model.configuredProvider === selectedProvider;

      return matchesSearch && matchesCloud && matchesProvider;
    });
  }, [models, search, cloudFilter, selectedProvider]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups = {};
    filteredModels.forEach((model) => {
      const provider = model.provider || "Other";
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(model);
    });
    return groups;
  }, [filteredModels]);

  // Favorite models
  const favoriteModels = useMemo(() => {
    return models.filter((m) => favorites.includes(m.modelKey || m.id));
  }, [models, favorites]);

  // Recent models (from localStorage)
  const recentModels = useMemo(() => {
    try {
      const recent = JSON.parse(
        localStorage.getItem("ai_studio_recent_models") || "[]"
      );
      return models.filter((m) => recent.includes(m.modelKey || m.id)).slice(0, 3);
    } catch {
      return [];
    }
  }, [models]);

  const toggleFavorite = (modelKey) => {
    const newFavorites = favorites.includes(modelKey)
      ? favorites.filter((f) => f !== modelKey)
      : [...favorites, modelKey];
    setFavorites(newFavorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
  };

  const handleSelect = (model) => {
    onSelect?.(model);
    // Save to recent
    const modelKey = model.modelKey || model.id;
    const recent = JSON.parse(
      localStorage.getItem("ai_studio_recent_models") || "[]"
    );
    const newRecent = [modelKey, ...recent.filter((r) => r !== modelKey)].slice(
      0,
      5
    );
    localStorage.setItem("ai_studio_recent_models", JSON.stringify(newRecent));
    setIsOpen(false);
    setSearch("");
  };

  const selectedModelInfo = useMemo(() => {
    return models.find(
      (m) => m.modelKey === selectedModel || m.id === selectedModel
    );
  }, [models, selectedModel]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-2
          px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg
          hover:border-gray-600 transition-colors
          ${isOpen ? "ring-2 ring-blue-500 border-transparent" : ""}
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedModelInfo ? (
            <>
              <span className="font-medium truncate">
                {selectedModelInfo.name || selectedModelInfo.id}
              </span>
              {selectedModelInfo.isCloud ? (
                <Cloud className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              ) : (
                <HardDrive className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              )}
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            {/* Search */}
            <div className="p-3 border-b border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 mt-2">
                {showCloudFilter && (
                  <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
                    {["all", "cloud", "local"].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setCloudFilter(filter)}
                        className={`
                          px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                          ${cloudFilter === filter
                            ? "bg-gray-700 text-white"
                            : "text-gray-400 hover:text-gray-200"
                          }
                        `}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                )}

                {showProviderFilter && providers.length > 0 && (
                  <select
                    value={selectedProvider || ""}
                    onChange={(e) => onProviderChange?.(e.target.value || null)}
                    className="px-2.5 py-1 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Providers</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Model List */}
            <div className="max-h-80 overflow-y-auto p-2">
              {/* Favorites */}
              {favoriteModels.length > 0 && search === "" && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-400">
                    <Star className="w-3.5 h-3.5 text-yellow-500" />
                    Favorites
                  </div>
                  <div className="space-y-1">
                    {favoriteModels.map((model) => (
                      <ModelCard
                        key={model.modelKey || model.id}
                        model={{ ...model, isFavorite: true }}
                        isSelected={selectedModel === model.modelKey}
                        onClick={handleSelect}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent */}
              {recentModels.length > 0 && search === "" && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    Recent
                  </div>
                  <div className="space-y-1">
                    {recentModels.map((model) => (
                      <ModelCard
                        key={model.modelKey || model.id}
                        model={model}
                        isSelected={selectedModel === model.modelKey}
                        onClick={handleSelect}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Models by Provider */}
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <div key={provider} className="mb-3">
                  <div className="px-2 py-1.5 text-xs font-medium text-gray-400">
                    {provider}
                  </div>
                  <div className="space-y-1">
                    {providerModels.map((model) => (
                      <ModelCard
                        key={model.modelKey || model.id}
                        model={model}
                        isSelected={selectedModel === model.modelKey}
                        onClick={handleSelect}
                        compact
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Empty State */}
              {filteredModels.length === 0 && (
                <div className="py-8 text-center text-gray-500">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No models found</p>
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
