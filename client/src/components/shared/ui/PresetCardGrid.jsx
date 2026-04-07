import PresetCard from "./PresetCard";

export default function PresetCardGrid({
  presets,
  selectedId,
  onSelect,
  columns = 4,
  className = "",
}) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };

  return (
    <div className={`grid ${gridCols[columns] || "grid-cols-4"} gap-2 ${className}`}>
      {presets.map((preset) => (
        <PresetCard
          key={preset.id}
          icon={preset.icon}
          label={preset.label}
          description={preset.description}
          isSelected={selectedId === preset.id}
          onClick={() => onSelect?.(preset)}
          color={preset.color}
          bgColor={preset.bgColor}
          borderColor={preset.borderColor}
        >
          {preset.children}
        </PresetCard>
      ))}
    </div>
  );
}
