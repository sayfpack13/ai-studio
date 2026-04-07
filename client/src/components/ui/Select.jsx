import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

const Select = forwardRef(
  (
    {
      label,
      error,
      options = [],
      placeholder = "Select an option",
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <div className={`w-full ${className}`}>
        {label && (
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              w-full bg-gray-800 border rounded-lg
              text-white appearance-none cursor-pointer
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? "border-red-500" : "border-gray-700 hover:border-gray-600"}
              pl-3 pr-10 py-2.5 text-sm
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
