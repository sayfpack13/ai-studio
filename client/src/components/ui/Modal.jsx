import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "./Button";

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[90vw]",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
}) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={`
              w-full ${sizes[size]}
              bg-gray-900 border border-gray-800 rounded-xl
              shadow-2xl shadow-black/50
              max-h-[85vh] flex flex-col
            `}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-800">
              <div>
                {title && (
                  <h2 className="text-lg font-semibold text-white">{title}</h2>
                )}
                {description && (
                  <p className="mt-1 text-sm text-gray-400">{description}</p>
                )}
              </div>
              {showCloseButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
