import { useState } from "react";
import { useEditor } from "../../context/EditorContext";

const EFFECTS = [
  { id: "camera-shake", name: "Camera Shake" },
  { id: "kaleidoscope", name: "Kaleidoscope" },
  { id: "blur", name: "Blur" },
  { id: "color-grade", name: "Color Grade" },
];

export default function EffectsPanel() {
  const { tracks, addEffect, addKeyframe } = useEditor();
  const [strength, setStrength] = useState(50);
  const targetTrack = tracks[0]?.id;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Effects</h3>
      <label className="text-xs text-gray-400">Audio Reactive Strength: {strength}</label>
      <input
        type="range"
        min="0"
        max="100"
        value={strength}
        onChange={(e) => setStrength(Number(e.target.value))}
        className="w-full"
      />
      <div className="grid grid-cols-2 gap-2">
        {EFFECTS.map((effect) => (
          <button
            key={effect.id}
            className="px-2 py-2 text-xs rounded bg-gray-800 hover:bg-gray-700"
            onClick={() =>
              addEffect(targetTrack, {
                ...effect,
                strength,
                audioReactive: true,
                createdAt: Date.now(),
              })
            }
          >
            {effect.name}
          </button>
        ))}
      </div>
      <button
        className="w-full px-3 py-2 rounded bg-purple-600 text-sm"
        onClick={() =>
          addKeyframe(targetTrack, {
            id: `kf_${Date.now()}`,
            time: Date.now() % 30,
            property: "effectStrength",
            value: strength,
          })
        }
      >
        Add Keyframe
      </button>
    </div>
  );
}
