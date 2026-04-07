import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Square, Paperclip, Mic, Sparkles } from "lucide-react";
import { Button } from "../ui";

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  loading = false,
  placeholder = "Type a message...",
  disabled = false,
  showStopButton = false,
  onStop,
  className = "",
}) {
  const textareaRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [value]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) {
        onSubmit();
      }
    }
  };

  const handleSubmit = () => {
    if (!loading && value.trim()) {
      onSubmit();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <motion.div
        animate={{
          boxShadow: isFocused
            ? "0 0 0 2px rgba(59, 130, 246, 0.5)"
            : "0 0 0 0px rgba(59, 130, 246, 0)",
        }}
        className="relative flex items-end gap-2 p-2 bg-gray-800 border border-gray-700 rounded-xl transition-colors"
      >
        {/* Attachment button (placeholder) */}
        <button
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          title="Attach file (coming soon)"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={`
              w-full resize-none bg-transparent text-white placeholder-gray-500
              focus:outline-none py-2 px-1 text-sm leading-relaxed
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            style={{ maxHeight: "200px" }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {loading && showStopButton ? (
            <Button
              variant="danger"
              size="icon"
              onClick={onStop}
              title="Stop generating"
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="icon"
              onClick={handleSubmit}
              disabled={!value.trim() || loading || disabled}
              title="Send message (Enter)"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </motion.div>

      {/* Keyboard hint */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-xs text-gray-500">
          Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">Shift+Enter</kbd> for new line
        </span>
        {loading && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1 text-xs text-blue-400"
          >
            <Sparkles className="w-3 h-3 animate-pulse" />
            Generating...
          </motion.span>
        )}
      </div>
    </div>
  );
}
