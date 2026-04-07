import { Cloud, HardDrive, Star, Clock, Zap, Brain, Image, Video, Music } from "lucide-react";
import { motion } from "framer-motion";

const categoryIcons = {
  chat: Brain,
  image: Image,
  video: Video,
  audio: Music,
};

const providerColors = {
  ollama: "bg-green-600/20 text-green-400 border-green-600/30",
  openai: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  anthropic: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  blackbox: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  chutes: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  nanogpt: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30",
  stability: "bg-pink-600/20 text-pink-400 border-pink-600/30",
  replicate: "bg-indigo-600/20 text-indigo-400 border-indigo-600/30",
};

export default function ModelCard({
  model,
  isSelected,
  onClick,
  showProvider = true,
  compact = false,
}) {
  const CategoryIcon = categoryIcons[model.category] || Brain;
  const providerColor = providerColors[model.provider?.toLowerCase()] || "bg-gray-600/20 text-gray-400 border-gray-600/30";

  return (
    <motion.button
      onClick={() => onClick?.(model)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`
        w-full text-left p-3 rounded-lg border transition-all
        ${isSelected
          ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500"
          : "bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800"
        }
        ${compact ? "p-2" : "p-3"}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${compact ? "text-sm" : "text-base"}`}>
              {model.name || model.id}
            </span>
            {model.isFavorite && (
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {model.isCloud ? (
              <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                <Cloud className="w-3 h-3" />
                Cloud
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <HardDrive className="w-3 h-3" />
                Local
              </span>
            )}

            {showProvider && model.provider && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${providerColor}`}>
                {model.provider}
              </span>
            )}

            {model.contextLength && !compact && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                {(model.contextLength / 1000).toFixed(0)}k ctx
              </span>
            )}
          </div>

          {!compact && model.description && (
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
              {model.description}
            </p>
          )}
        </div>

        <CategoryIcon className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
      </div>

      {model.capabilities && !compact && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {model.capabilities.slice(0, 3).map((cap) => (
            <span
              key={cap}
              className="text-xs px-1.5 py-0.5 bg-gray-700/50 text-gray-400 rounded"
            >
              {cap}
            </span>
          ))}
          {model.capabilities.length > 3 && (
            <span className="text-xs text-gray-500">
              +{model.capabilities.length - 3}
            </span>
          )}
        </div>
      )}
    </motion.button>
  );
}
