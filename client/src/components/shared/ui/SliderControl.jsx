export default function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  showValue = true,
  unit = "",
  className = "",
  formatValue,
}) {
  const displayValue = formatValue ? formatValue(value) : value;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-gray-400">{label}</label>
        {showValue && (
          <span className="text-xs font-mono text-gray-500">
            {displayValue}{unit}
          </span>
        )}
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange?.(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
}
