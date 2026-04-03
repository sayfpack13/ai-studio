import { useState } from "react";

export default function LocalOllamaPanel({
  localUrl,
  setLocalUrl,
  localModels,
  localLoading,
  localError,
  fetchModels,
  onSelectModel,
  selectedModelId,
}) {
  const [urlInput, setUrlInput] = useState(localUrl);

  const handleFetch = () => {
    const url = urlInput.trim();
    if (url) {
      setLocalUrl(url);
      fetchModels(url);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFetch();
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    const gb = bytes / 1e9;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / 1e6;
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="mb-4">
      {/* URL Input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="http://localhost:11434"
          className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={handleFetch}
          disabled={localLoading || !urlInput.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          {localLoading ? (
            <span className="flex items-center gap-1">
              <svg
                className="animate-spin w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Fetching...
            </span>
          ) : (
            "Fetch Models"
          )}
        </button>
      </div>

      {/* Error */}
      {localError && (
        <div className="mb-3 px-3 py-2 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
          {localError}
        </div>
      )}

      {/* Local Models List */}
      {localModels.length > 0 && (
        <>
          <p className="text-sm text-gray-400 mb-2">
            {localModels.length} local model
            {localModels.length !== 1 ? "s" : ""} found
          </p>
          <div className="grid gap-2 max-h-[40vh] overflow-y-auto">
            {localModels.map((model) => (
              <button
                key={model.id}
                onClick={() => onSelectModel(model)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  selectedModelId === model.id
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{model.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 bg-emerald-700 rounded">
                      Local
                    </span>
                    {model.size && (
                      <span className="text-xs px-2 py-0.5 bg-gray-600 rounded">
                        {formatSize(model.size)}
                      </span>
                    )}
                  </div>
                </div>
                {model.details?.family && (
                  <span className="text-xs text-gray-400 block mt-1">
                    {model.details.family}
                    {model.details.parameter_size
                      ? ` \u2022 ${model.details.parameter_size}`
                      : ""}
                    {model.details.quantization_level
                      ? ` \u2022 ${model.details.quantization_level}`
                      : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!localLoading && localModels.length === 0 && !localError && (
        <p className="text-sm text-gray-500 text-center py-4">
          Enter your local Ollama URL and click Fetch Models
        </p>
      )}
    </div>
  );
}
