export default function TextInput({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  className = "",
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
      )}
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-white p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
  );
}
