export default function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = "",
  className = "",
  hint,
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
      )}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange?.(parseInt(e.target.value) || min || 0)}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-white p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {(hint || (min !== undefined && max !== undefined)) && (
        <span className="text-xs text-gray-600 mt-0.5 block">
          {hint || `${min} - ${max}`}
        </span>
      )}
    </div>
  );
}
