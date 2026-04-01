import { useEditor } from "../../context/EditorContext";

export default function PropertiesPanel() {
  const { project, setProject, selectedClip, updateClip } = useEditor();

  if (!selectedClip) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Project Properties</h3>
        <input
          value={project.name}
          onChange={(e) => setProject((prev) => ({ ...prev, name: e.target.value }))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
          placeholder="Project name"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={project.fps}
            onChange={(e) => setProject((prev) => ({ ...prev, fps: Number(e.target.value) || 30 }))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            placeholder="FPS"
          />
          <input
            value={project.resolution}
            onChange={(e) => setProject((prev) => ({ ...prev, resolution: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
            placeholder="Resolution"
          />
        </div>
        <p className="text-xs text-gray-500 mt-4 text-center p-4 bg-gray-800/50 rounded-lg border border-gray-800 border-dashed">
          Select a clip in the timeline to edit its properties.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">Clip Properties</h3>
        <div className="px-3 py-1.5 bg-gray-800 rounded-lg border border-indigo-500/30 text-xs text-indigo-200 mb-3 truncate flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          {selectedClip.label || selectedClip.id}
        </div>
      </div>

      <div className="space-y-4">
        {/* Transform Group */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Transform</div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">X Position</label>
              <input
                type="number"
                value={selectedClip.x || 0}
                onChange={(e) => updateClip(selectedClip.id, { x: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Y Position</label>
              <input
                type="number"
                value={selectedClip.y || 0}
                onChange={(e) => updateClip(selectedClip.id, { y: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Scale</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={selectedClip.scale ?? 1}
                onChange={(e) => updateClip(selectedClip.id, { scale: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Rotation (deg)</label>
              <input
                type="number"
                value={selectedClip.rotation || 0}
                onChange={(e) => updateClip(selectedClip.id, { rotation: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Visuals Group */}
        <div className="space-y-2 pt-3 border-t border-gray-800">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Visuals</div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-gray-500">Opacity</label>
              <span className="text-[10px] text-gray-400">{Math.round((selectedClip.opacity ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={selectedClip.opacity ?? 1}
              onChange={(e) => updateClip(selectedClip.id, { opacity: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>
        
        {/* Timing Group */}
        <div className="space-y-2 pt-3 border-t border-gray-800">
           <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Timing</div>
           <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Start (s)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={selectedClip.start || 0}
                onChange={(e) => updateClip(selectedClip.id, { start: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Duration (s)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={selectedClip.duration || 5}
                onChange={(e) => updateClip(selectedClip.id, { duration: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
