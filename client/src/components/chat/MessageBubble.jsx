import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  RotateCcw,
  Trash2,
  User,
  Bot,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import CodeBlock from "./CodeBlock";

const MessageBubble = memo(function MessageBubble({
  message,
  onRegenerate,
  onDelete,
  isStreaming = false,
  timestamp,
  tokenCount,
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isError = message.isError;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom components for markdown
  const components = {
    code({ node, inline, className, children, ...props }) {
      if (inline) {
        return (
          <code
            className="px-1.5 py-0.5 bg-gray-700/50 text-blue-300 rounded text-sm font-mono"
            {...props}
          >
            {children}
          </code>
        );
      }
      return <CodeBlock className={className}>{children}</CodeBlock>;
    },
    p({ children }) {
      return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
    },
    ul({ children }) {
      return <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>;
    },
    li({ children }) {
      return <li className="text-gray-200">{children}</li>;
    },
    h1({ children }) {
      return <h1 className="text-xl font-bold mb-3 text-white">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-lg font-bold mb-2 text-white">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-base font-bold mb-2 text-white">{children}</h3>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-4 border-gray-600 pl-4 my-3 text-gray-400 italic">
          {children}
        </blockquote>
      );
    },
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto my-3">
          <table className="min-w-full border border-gray-700 rounded-lg overflow-hidden">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-gray-800">{children}</thead>;
    },
    tbody({ children }) {
      return <tbody className="divide-y divide-gray-700">{children}</tbody>;
    },
    tr({ children }) {
      return <tr>{children}</tr>;
    },
    th({ children }) {
      return <th className="px-4 py-2 text-left text-gray-300 font-medium">{children}</th>;
    },
    td({ children }) {
      return <td className="px-4 py-2 text-gray-200">{children}</td>;
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`
          flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
          ${isUser ? "bg-blue-600" : isError ? "bg-red-600" : "bg-gray-700"}
        `}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`
            inline-block rounded-2xl px-4 py-2.5 text-sm
            ${isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : isError
              ? "bg-red-900/30 border border-red-800 text-red-200 rounded-tl-sm"
              : "bg-gray-800 text-gray-100 rounded-tl-sm"
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
              )}
            </div>
          )}
        </div>

        {/* Meta & Actions */}
        <div
          className={`
            flex items-center gap-2 mt-1.5 text-xs text-gray-500
            ${isUser ? "justify-end" : ""}
          `}
        >
          {timestamp && (
            <span>
              {new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {tokenCount && <span>{tokenCount} tokens</span>}

          {/* Actions */}
          {!isStreaming && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="Copy"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              {!isUser && onRegenerate && (
                <button
                  onClick={() => onRegenerate(message)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Regenerate"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(message)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors text-red-400"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

export default MessageBubble;
