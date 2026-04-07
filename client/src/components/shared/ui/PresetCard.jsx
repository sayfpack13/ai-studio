export default function PresetCard({
  icon: Icon,
  label,
  description,
  isSelected,
  onClick,
  color = "text-gray-400",
  bgColor = "bg-purple-600/20",
  borderColor = "ring-purple-500",
  className = "",
  children,
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
        isSelected
          ? `${bgColor} ring-2 ${borderColor}`
          : "bg-gray-700/30 hover:bg-gray-700/50"
      } ${className}`}
    >
      {Icon && <Icon className={`w-4 h-4 mb-1 ${isSelected ? "text-white" : color}`} />}
      <span className={`text-xs font-medium ${isSelected ? "text-white" : "text-gray-300"}`}>
        {label}
      </span>
      {description && (
        <span className="text-xs text-gray-500 mt-0.5">{description}</span>
      )}
      {children}
    </button>
  );
}
