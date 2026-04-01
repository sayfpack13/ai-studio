import { useMemo } from "react";
import { useApp } from "../../context/AppContext";

export default function AssetPicker({ type, onPick }) {
  const { libraryAssets } = useApp();
  const assets = useMemo(
    () => libraryAssets.filter((item) => (type ? item.type === type : true)),
    [libraryAssets, type],
  );

  return (
    <div className="space-y-2 max-h-56 overflow-y-auto">
      {assets.map((asset) => (
        <button
          key={asset.id}
          onClick={() => onPick(asset)}
          className="w-full text-left px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
        >
          {asset.title} <span className="text-gray-400">({asset.type})</span>
        </button>
      ))}
      {assets.length === 0 && <p className="text-xs text-gray-400">No matching assets.</p>}
    </div>
  );
}
