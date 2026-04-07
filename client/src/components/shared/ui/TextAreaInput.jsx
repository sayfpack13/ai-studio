export default function TextAreaInput({
  label,
  value,
  onChange,
  placeholder = "",
  rows = 2,
  className = "",
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      )}
      <textarea
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-gray-700 text-white p-2 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
  );
}
