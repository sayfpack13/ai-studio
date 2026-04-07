import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { sendChatMessage, getModels } from "../services/api";
import useOllamaLocal from "../hooks/useOllamaLocal";
import LocalOllamaPanel from "./LocalOllamaPanel";
import { MessageBubble, ChatInput, TypingIndicator } from "./chat/index";
import { ModelSelector } from "./shared";
import { Button } from "./ui";
import { Plus, Settings, Sparkles, Zap } from "lucide-react";

// Generate unique chat ID
const generateChatId = () =>
  `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// LocalStorage keys for chat page persistence
const LAST_CHAT_KEY = "blackbox_ai_last_chat_id";
const CHAT_SELECTED_MODEL_KEY = "blackbox_ai_chat_selected_model";
const CHAT_SELECTED_PROVIDER_KEY = "blackbox_ai_chat_selected_provider";

export default function Chat() {
  const {
    isConfigured,
    defaultModel,
    providers,
    streamEnabled,
    toggleStream,
    saveChatMessages,
    getChatMessages,
    getChatIds,
  } = useApp();

  const [currentChatId, setCurrentChatId] = useState(() => {
    // Try to load last active chat from localStorage
    const lastChatId = localStorage.getItem(LAST_CHAT_KEY);
    if (lastChatId) {
      return lastChatId;
    }
    // Otherwise get most recent chat or create new
    return generateChatId();
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(CHAT_SELECTED_MODEL_KEY) || "",
  );
  const [availableModels, setAvailableModels] = useState([]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [cloudFilter, setCloudFilter] = useState("all");
  const [configuredProviderFilter, setConfiguredProviderFilter] = useState(
    () => localStorage.getItem(CHAT_SELECTED_PROVIDER_KEY) || "",
  );
  const [streamingContent, setStreamingContent] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [isLocalModelSelected, setIsLocalModelSelected] = useState(false);
  const messagesEndRef = useRef(null);
  const searchInputRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const isOllamaLocalActive =
    cloudFilter === "local" && configuredProviderFilter === "ollama";
  const ollamaLocal = useOllamaLocal(isOllamaLocalActive);

  // On initial mount, load the last chat or most recent one
  useEffect(() => {
    if (initialized) return;

    const chatIds = getChatIds();
    const savedMessages = getChatMessages(currentChatId);

    // If current chat has messages, use it
    if (savedMessages.length > 0) {
      setMessages(savedMessages);
      setInitialized(true);
      return;
    }

    // If there are existing chats but current one is empty, load the most recent
    if (chatIds.length > 0 && !getChatMessages(currentChatId).length) {
      const mostRecentId = chatIds[0];
      setCurrentChatId(mostRecentId);
      localStorage.setItem(LAST_CHAT_KEY, mostRecentId);
    }

    setInitialized(true);
  }, [initialized, currentChatId, getChatIds, getChatMessages]);

  // Listen for chat selection from sidebar
  useEffect(() => {
    const handleChatSelected = (e) => {
      const { chatId } = e.detail;
      if (chatId && chatId !== currentChatId) {
        setCurrentChatId(chatId);
      }
    };

    window.addEventListener("chatSelected", handleChatSelected);
    return () => window.removeEventListener("chatSelected", handleChatSelected);
  }, [currentChatId]);

  // Load messages when switching chats
  useEffect(() => {
    const savedMessages = getChatMessages(currentChatId);
    if (savedMessages.length > 0) {
      setMessages(savedMessages);
    } else {
      setMessages([]);
    }
    setStreamingContent("");
    // Save as last active chat
    localStorage.setItem(LAST_CHAT_KEY, currentChatId);
  }, [currentChatId, getChatMessages]);

  // Load models on mount
  useEffect(() => {
    if (providers.length === 0) return;

    const loadChatModels = async () => {
      try {
        const result = await getModels({ category: "chat", provider: "all" });
        const nextModels = result.models || [];

        const configuredGateways = providers
          .filter((provider) => provider.configured)
          .map((provider) => provider.id);

        const persistedProvider = localStorage.getItem(
          CHAT_SELECTED_PROVIDER_KEY,
        );
        const persistedModelKey = localStorage.getItem(CHAT_SELECTED_MODEL_KEY);

        const isProviderMatch = (model, providerId) => 
          model.provider === providerId || model.configuredProvider === providerId;

        const persistedProviderValid =
          persistedProvider &&
          configuredGateways.includes(persistedProvider) &&
          nextModels.some((model) => isProviderMatch(model, persistedProvider));

        const firstGateway =
          (persistedProviderValid
            ? persistedProvider
            : configuredGateways.find((gatewayId) =>
                nextModels.some((model) => isProviderMatch(model, gatewayId)),
              )) ||
          nextModels[0]?.configuredProvider || nextModels[0]?.provider ||
          "";

        setConfiguredProviderFilter(firstGateway);

        const persistedModelForGateway =
          persistedModelKey &&
          nextModels.some(
            (model) =>
              isProviderMatch(model, firstGateway) &&
              model.modelKey === persistedModelKey,
          )
            ? persistedModelKey
            : "";

        const firstGatewayModel = nextModels.find(
          (model) => isProviderMatch(model, firstGateway),
        );
        setSelectedModel(
          persistedModelForGateway || firstGatewayModel?.modelKey || "",
        );
      } catch (error) {
        console.error("Failed to load chat models:", error);
      }
    };

    loadChatModels();
  }, [defaultModel, providers]);

  useEffect(() => {
    if (!configuredProviderFilter) {
      setAvailableModels([]);
      return;
    }

    const loadGatewayModels = async () => {
      try {
        const result = await getModels({
          category: "chat",
          provider: configuredProviderFilter,
        });
        setAvailableModels(result.models || []);
      } catch (error) {
        console.error("Failed to load gateway chat models:", error);
      }
    };

    loadGatewayModels();
  }, [configuredProviderFilter]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Focus input when AI response completes
  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading]);

  // Focus search input when modal opens
  useEffect(() => {
    if (showModelSelector && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showModelSelector]);

  // Gateway providers from AppContext (these are the configured gateways)
  const gatewayProviders = useMemo(() => {
    return providers
      .filter((provider) => provider.configured)
      .map((p) => p.id)
      .sort();
  }, [providers]);

  const providerModels = useMemo(() => availableModels, [availableModels]);

  // Filter models based on search, selected gateway, and cloud/local filter
  const filteredModels = useMemo(() => {
    return providerModels.filter((model) => {
      const matchesSearch =
        modelSearch === "" ||
        model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.provider.toLowerCase().includes(modelSearch.toLowerCase()) ||
        (model.modelProvider || "")
          .toLowerCase()
          .includes(modelSearch.toLowerCase()) ||
        model.id.toLowerCase().includes(modelSearch.toLowerCase());

      const matchesCloud =
        cloudFilter === "all" ||
        (cloudFilter === "cloud" && model.isCloud) ||
        (cloudFilter === "local" && !model.isCloud);

      return matchesSearch && matchesCloud;
    });
  }, [providerModels, modelSearch, cloudFilter]);

  const hasCloudModels = useMemo(
    () => providerModels.some((m) => m.isCloud),
    [providerModels],
  );
  const hasLocalModels = useMemo(
    () => providerModels.some((m) => !m.isCloud),
    [providerModels],
  );

  useEffect(() => {
    if (!configuredProviderFilter || !providerModels.length) {
      return;
    }

    if (!providerModels.some((model) => model.modelKey === selectedModel)) {
      setSelectedModel(providerModels[0].modelKey);
    }
  }, [configuredProviderFilter, providerModels, selectedModel]);

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem(CHAT_SELECTED_MODEL_KEY, selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (configuredProviderFilter) {
      localStorage.setItem(
        CHAT_SELECTED_PROVIDER_KEY,
        configuredProviderFilter,
      );
    }
  }, [configuredProviderFilter]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreamingContent("");

    const selectedModelInfo = availableModels.find(
      (m) => m.modelKey === selectedModel,
    );
    const effectiveProvider =
      configuredProviderFilter || selectedModelInfo?.provider;

    // For local Ollama models, selectedModelInfo won't exist in availableModels
    const modelIdToSend = isLocalModelSelected
      ? selectedModel
      : selectedModelInfo?.id;
    const effectiveProviderForSend = isLocalModelSelected
      ? "ollama"
      : effectiveProvider;

    if ((!selectedModelInfo && !isLocalModelSelected) || !effectiveProviderForSend) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: Please select a gateway and model before sending.",
          isError: true,
        },
      ]);
      setLoading(false);
      return;
    }

    // Extra options for local Ollama
    const localOpts = isLocalModelSelected
      ? { localOllamaUrl: ollamaLocal.localUrl }
      : {};

    try {
      if (streamEnabled) {
        // Streaming mode
        let fullContent = "";
        const controller = new AbortController();
        abortControllerRef.current = controller;
        await sendChatMessage(newMessages, modelIdToSend, {
          temperature: 0.7,
          maxTokens: 2048,
          provider: effectiveProviderForSend,
          modelKey: isLocalModelSelected ? undefined : selectedModelInfo?.modelKey,
          stream: true,
          signal: controller.signal,
          ...localOpts,
          onChunk: (chunk) => {
            fullContent += chunk;
            setStreamingContent(fullContent);
          },
        });

        const assistantMessage = {
          role: "assistant",
          content: fullContent,
        };
        const finalMessages = [...newMessages, assistantMessage];
        setMessages(finalMessages);
        saveChatMessages(currentChatId, finalMessages);
        setStreamingContent("");
      } else {
        // Non-streaming mode
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const response = await sendChatMessage(
          newMessages,
          modelIdToSend,
          {
            temperature: 0.7,
            maxTokens: 2048,
            provider: effectiveProviderForSend,
            modelKey: isLocalModelSelected ? undefined : selectedModelInfo?.modelKey,
            signal: controller.signal,
            ...localOpts,
          },
        );

        if (response.choices && response.choices[0]) {
          const assistantMessage = {
            role: "assistant",
            content: response.choices[0].message.content,
          };
          const finalMessages = [...newMessages, assistantMessage];
          setMessages(finalMessages);
          saveChatMessages(currentChatId, finalMessages);
        } else if (response.error) {
          const errorMessage = {
            role: "assistant",
            content: `Error: ${response.error}`,
            isError: true,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Generation stopped.",
            isError: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${error.message}`,
            isError: true,
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Start a new chat
  const handleNewChat = useCallback(() => {
    const newChatId = generateChatId();
    setCurrentChatId(newChatId);
    setMessages([]);
    setStreamingContent("");
    localStorage.setItem(LAST_CHAT_KEY, newChatId);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelSelect = (model) => {
    setSelectedModel(model.modelKey);
    setIsLocalModelSelected(false);

    const nextProvider =
      model.provider ||
      model.configuredProvider ||
      configuredProviderFilter ||
      "";
    setConfiguredProviderFilter(nextProvider);

    if (model.modelKey) {
      localStorage.setItem(CHAT_SELECTED_MODEL_KEY, model.modelKey);
    }
    if (nextProvider) {
      localStorage.setItem(CHAT_SELECTED_PROVIDER_KEY, nextProvider);
    }

    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleLocalModelSelect = (model) => {
    setSelectedModel(model.id);
    setIsLocalModelSelected(true);
    setConfiguredProviderFilter("ollama");
    localStorage.setItem(CHAT_SELECTED_MODEL_KEY, model.id);
    localStorage.setItem(CHAT_SELECTED_PROVIDER_KEY, "ollama");
    setShowModelSelector(false);
    setModelSearch("");
  };

  const handleCloseModelSelector = () => {
    setShowModelSelector(false);
    setModelSearch("");
  };

  const selectedModelInfo = availableModels.find(
    (m) => m.modelKey === selectedModel,
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">AI Chat</h2>
            <p className="text-xs text-gray-400">
              {isLocalModelSelected ? `${selectedModel} (Local)` : selectedModelInfo?.name || "Select a model"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Stream Toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700">
            <Zap className={`w-4 h-4 ${streamEnabled ? "text-yellow-400" : "text-gray-500"}`} />
            <span className="text-sm text-gray-400">Stream</span>
            <button
              onClick={toggleStream}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                streamEnabled ? "bg-blue-600" : "bg-gray-600"
              }`}
              title={streamEnabled ? "Streaming enabled" : "Streaming disabled"}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  streamEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <Button
            variant="success"
            size="sm"
            onClick={handleNewChat}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowModelSelector(!showModelSelector)}
          >
            Change Model
          </Button>
        </div>
      </div>

      {/* Model Selector Dropdown */}
      {showModelSelector && (
        <div
          className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModelSelector();
          }}
        >
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden mx-4 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Select Model</h3>
              <button
                onClick={handleCloseModelSelector}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models by name, provider, or ID..."
                  className="w-full bg-gray-700 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {modelSearch && (
                  <button
                    onClick={() => setModelSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Cloud/Local Filter */}
            {hasCloudModels && hasLocalModels && (
              <div className="mb-3 flex gap-2">
                {["all", "cloud", "local"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setCloudFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      cloudFilter === filter
                        ? filter === "cloud"
                          ? "bg-purple-600 text-white"
                          : filter === "local"
                            ? "bg-emerald-600 text-white"
                            : "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {filter === "all" ? "All" : filter === "cloud" ? "☁ Cloud" : "💻 Local"}
                  </button>
                ))}
              </div>
            )}

            {/* Provider Filter */}
            <div className="mb-4 flex flex-wrap gap-2">
              {gatewayProviders.slice(0, 8).map((provider) => (
                <button
                  key={provider}
                  onClick={() => {
                    setConfiguredProviderFilter(provider);
                    localStorage.setItem(CHAT_SELECTED_PROVIDER_KEY, provider);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    configuredProviderFilter === provider
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {providers.find((p) => p.id === provider)?.name || provider}
                </button>
              ))}
              {gatewayProviders.length > 8 && (
                <select
                  value={configuredProviderFilter}
                  onChange={(e) => {
                    const nextProvider = e.target.value;
                    setConfiguredProviderFilter(nextProvider);
                    if (nextProvider) {
                      localStorage.setItem(
                        CHAT_SELECTED_PROVIDER_KEY,
                        nextProvider,
                      );
                    }
                  }}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-700 text-gray-300 border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">More gateways...</option>
                  {gatewayProviders.slice(8).map((provider) => (
                    <option key={provider} value={provider}>
                      {providers.find((p) => p.id === provider)?.name ||
                        provider}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Local Ollama Panel */}
            {isOllamaLocalActive && (
              <LocalOllamaPanel
                localUrl={ollamaLocal.localUrl}
                setLocalUrl={ollamaLocal.setLocalUrl}
                localModels={ollamaLocal.localModels}
                localLoading={ollamaLocal.localLoading}
                localError={ollamaLocal.localError}
                fetchModels={ollamaLocal.fetchModels}
                onSelectModel={handleLocalModelSelect}
                selectedModelId={isLocalModelSelected ? selectedModel : ""}
              />
            )}

            {/* Results count — hide when showing local panel */}
            {!isOllamaLocalActive && (
              <p className="text-sm text-gray-400 mb-3">
                {filteredModels.length} model
                {filteredModels.length !== 1 ? "s" : ""} found
              </p>
            )}

            {/* Model List — hide when showing local panel */}
            {!isOllamaLocalActive && (
            <div className="flex-1 overflow-y-auto grid gap-2 min-h-0">
              {filteredModels.length > 0 ? (
                filteredModels.map((model) => (
                  <button
                    key={model.uniqueKey || model.id}
                    onClick={() => handleModelSelect(model)}
                    className={`p-3 rounded-lg text-left transition-colors ${
                      selectedModel === model.modelKey
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{model.name}</span>
                      <div className="flex items-center gap-2">
                        {model.isCloud ? (
                          <span className="text-xs px-2 py-0.5 bg-purple-600 rounded">
                            Cloud
                          </span>
                        ) : configuredProviderFilter === "ollama" ? (
                          <span className="text-xs px-2 py-0.5 bg-emerald-700 rounded">
                            Local
                          </span>
                        ) : null}
                        {model.free && (
                          <span className="text-xs px-2 py-0.5 bg-green-600 rounded">
                            Free
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 bg-gray-600 rounded">
                          {model.configuredProvider || model.provider}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-cyan-700 rounded">
                          {model.modelProvider || "unknown"}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 truncate block mt-1">
                      {model.id}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>No models found matching "{modelSearch}"</p>
                  <button
                    onClick={() => {
                      setModelSearch("");
                    }}
                    className="mt-2 text-blue-400 hover:text-blue-300"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!isConfigured && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-yellow-600/20 flex items-center justify-center mb-4">
              <Settings className="w-8 h-8 text-yellow-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">API Not Configured</h3>
            <p className="text-gray-400 text-center max-w-sm">
              Please configure your API keys in the Admin panel to start chatting with AI models.
            </p>
          </div>
        )}

        {messages.length === 0 && isConfigured && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Start a Conversation</h3>
            <p className="text-gray-400 text-center max-w-sm mb-4">
              Type your message below and press Enter to send. Use markdown for formatting.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-400">
                **bold**
              </span>
              <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-400">
                `code`
              </span>
              <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-400">
                ```code block```
              </span>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className="group">
            <MessageBubble
              message={message}
              isStreaming={false}
            />
          </div>
        ))}

        {/* Streaming content */}
        {streamEnabled && loading && streamingContent && (
          <MessageBubble
            message={{ role: "assistant", content: streamingContent }}
            isStreaming={true}
          />
        )}

        {/* Typing indicator */}
        {loading && !streamingContent && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700 flex-shrink-0">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          loading={loading}
          disabled={!isConfigured}
          showStopButton={true}
          onStop={handleStop}
          placeholder="Type your message..."
        />
      </div>
    </div>
  );
}
