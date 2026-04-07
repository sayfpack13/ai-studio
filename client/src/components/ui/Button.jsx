import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

const variants = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20",
  secondary: "bg-gray-700 hover:bg-gray-600 text-white",
  ghost: "bg-transparent hover:bg-gray-800 text-gray-300 hover:text-white",
  danger: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20",
  success: "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
  icon: "p-2",
};

const Button = forwardRef(
  (
    {
      children,
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      className = "",
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center gap-2
          font-medium rounded-lg transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variants[variant]}
          ${sizes[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
