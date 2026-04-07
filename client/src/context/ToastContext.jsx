import { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

const ToastContext = createContext(null);

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: "bg-green-600/10 border-green-600/50 text-green-400",
  error: "bg-red-600/10 border-red-600/50 text-red-400",
  info: "bg-blue-600/10 border-blue-600/50 text-blue-400",
  warning: "bg-yellow-600/10 border-yellow-600/50 text-yellow-400",
};

function Toast({ id, type = "info", title, message, onClose }) {
  const Icon = icons[type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      className={`
        flex items-start gap-3 p-4 rounded-lg border
        min-w-[300px] max-w-[400px]
        ${colors[type]}
      `}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium text-white">{title}</p>}
        {message && <p className="text-sm opacity-90 mt-0.5">{message}</p>}
      </div>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);

    // Auto dismiss after duration
    const duration = toast.duration || 5000;
    setTimeout(() => {
      removeToast(id);
    }, duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback(
    (title, message) => addToast({ type: "success", title, message }),
    [addToast]
  );

  const error = useCallback(
    (title, message) => addToast({ type: "error", title, message, duration: 7000 }),
    [addToast]
  );

  const info = useCallback(
    (title, message) => addToast({ type: "info", title, message }),
    [addToast]
  );

  const warning = useCallback(
    (title, message) => addToast({ type: "warning", title, message }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info, warning }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <Toast key={toast.id} {...toast} onClose={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
