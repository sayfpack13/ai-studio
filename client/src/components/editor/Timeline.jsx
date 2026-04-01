import { useEditor } from "../../context/EditorContext";

function TrackRow({ track, onSelectClip, selectedClipId, updateClip }) {
  const handleMouseDown = (e, clip, type) => {
    e.stopPropagation();
    onSelectClip(clip);
    
    const startX = e.clientX;
    const initialStart = clip.start || 0;
    const initialDuration = clip.duration || 5;

    const onMouseMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / 10; // 10px = 1s
      
      if (type === 'move') {
        const newStart = Math.max(0, initialStart + dx);
        updateClip(clip.id, { start: parseFloat(newStart.toFixed(2)) });
      } else if (type === 'right') {
        const newDuration = Math.max(0.5, initialDuration + dx);
        updateClip(clip.id, { duration: parseFloat(newDuration.toFixed(2)) });
      } else if (type === 'left') {
        const possibleNewStart = initialStart + dx;
        const newStart = Math.max(0, possibleNewStart);
        const actualDx = newStart - initialStart;
        const newDuration = Math.max(0.5, initialDuration - actualDx);
        
        // Ensure we don't shrink past 0.5s duration and jump around
        if (initialDuration - actualDx >= 0.5) {
           updateClip(clip.id, { 
             start: parseFloat(newStart.toFixed(2)), 
             duration: parseFloat(newDuration.toFixed(2)) 
           });
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="border border-gray-800 rounded p-2 bg-gray-900 relative">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
        <span className="font-semibold">{track.type.toUpperCase()}</span>
        <span>{track.clips.length} clips</span>
      </div>
      <div className="h-10 bg-gray-800 rounded relative overflow-hidden">
        {(track.clips || []).map((clip) => {
          const isSelected = selectedClipId === clip.id;
          return (
            <div
              key={clip.id}
              onMouseDown={(e) => handleMouseDown(e, clip, 'move')}
              className={`absolute top-1 h-8 rounded text-xs flex items-center cursor-ew-resize transition-colors whitespace-nowrap text-white select-none ${
                isSelected ? "ring-2 ring-white z-10" : ""
              } ${
                track.type === "video"
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
              style={{
                left: `${(clip.start || 0) * 10}px`,
                width: `${Math.max(40, (clip.duration || 5) * 10)}px`,
              }}
            >
              {/* Left Handle */}
              <div 
                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30"
                onMouseDown={(e) => handleMouseDown(e, clip, 'left')}
              />
              <div className="px-2 overflow-hidden truncate pointer-events-none">{clip.label || "Clip"}</div>
              {/* Right Handle */}
              <div 
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30"
                onMouseDown={(e) => handleMouseDown(e, clip, 'right')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Timeline() {
  const { tracks, playbackState, setPlaybackState, project, selectedClip, setSelectedClip, updateClip } = useEditor();

  const handleTimelineClick = (e) => {
    // Check if target is a clip
    if (e.target.closest('.cursor-ew-resize')) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(x / 10, project.duration));
    setPlaybackState((prev) => ({ ...prev, currentTime: time }));
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 relative overflow-hidden">
      <div className="flex items-center gap-3 relative z-20">
        <label className="text-xs text-gray-400 w-8">Time</label>
        <input
          type="range"
          min="0"
          max={project.duration}
          step="0.1"
          value={playbackState.currentTime}
          onChange={(e) =>
            setPlaybackState((prev) => ({ ...prev, currentTime: Number(e.target.value) }))
          }
          className="flex-1"
        />
        <span className="text-xs font-mono text-gray-300 w-12 text-right">
          {playbackState.currentTime.toFixed(1)}s
        </span>
      </div>

      <div 
        className="relative mt-2" 
        style={{ width: `${project.duration * 10}px`, minWidth: '100%' }}
        onMouseDown={handleTimelineClick}
      >
        <div className="space-y-2">
          {tracks.map((track) => (
            <TrackRow 
              key={track.id} 
              track={track} 
              onSelectClip={setSelectedClip} 
              selectedClipId={selectedClip?.id}
              updateClip={updateClip}
            />
          ))}
        </div>
        
        {/* Playhead Marker */}
        <div 
          className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none"
          style={{ 
            left: `${playbackState.currentTime * 10}px`,
            boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)'
          }}
        >
          <div className="w-3 h-3 bg-red-500 transform -translate-x-1/2 -translate-y-1 rotate-45" />
        </div>
      </div>
    </div>
  );
}
