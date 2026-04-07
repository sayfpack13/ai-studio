import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Copy, Check } from "lucide-react";
import { motion } from "framer-motion";

const languageMap = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
};

export default function CodeBlock({ children, className = "" }) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (e.g., "language-javascript")
  const match = /language-(\w+)/.exec(className);
  const language = match
    ? languageMap[match[1]] || match[1]
    : "javascript";

  const code = children?.trim() || "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
        <span className="text-xs font-mono text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <Highlight theme={themes.vsDark} code={code} language={language}>
        {({ className: hlClassName, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${hlClassName} overflow-x-auto p-4 text-sm`}
            style={{ ...style, background: "#111827" }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                <span className="table-cell text-gray-600 select-none pr-4 text-right w-8">
                  {i + 1}
                </span>
                <span className="table-cell">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
