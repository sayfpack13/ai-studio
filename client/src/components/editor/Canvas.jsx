import { useEditor } from "../../context/EditorContext";

export default function Canvas() {
  const { project, tracks, playbackState, selectedClip, setSelectedClip, updateClip } = useEditor();

  const activeClips = [];
  const currentTime = playbackState.currentTime;

  // Find all active clips at the current time
  tracks.forEach((track) => {
    track.clips.forEach((clip) => {
      const start = clip.start || 0;
      const duration = clip.duration || 5;
      if (currentTime >= start && currentTime <= start + duration) {
        activeClips.push({ ...clip, trackType: track.type });
      }
    });
  });

  const handleMouseDown = (e, clip) => {
    e.stopPropagation();
    if (selectedClip?.id !== clip.id) {
      setSelectedClip(clip);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const initialClipX = clip.x || 0;
    const initialClipY = clip.y || 0;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      updateClip(clip.id, { x: initialClipX + dx, y: initialClipY + dy });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleScaleMouseDown = (e, clip) => {
    e.stopPropagation();
    const startX = e.clientX;
    const initialScale = clip.scale ?? 1;

    const onMouseMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) * 0.01;
      updateClip(clip.id, { scale: parseFloat(Math.max(0.1, initialScale + dx).toFixed(2)) });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center select-none">
      <div 
        className="relative bg-black rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden w-full shadow-2xl"
        onClick={() => setSelectedClip(null)}
        style={{ 
          aspectRatio: project.resolution ? project.resolution.replace('x', '/') : '16/9',
        }}
      >
        {activeClips.length > 0 ? (
          activeClips.map((clip) => {
            const isSelected = selectedClip?.id === clip.id;
            const zIndex = isSelected ? 20 : (clip.trackType === "video" ? 10 : 1);
            
            const style = {
              position: "absolute",
              transform: `translate(${clip.x || 0}px, ${clip.y || 0}px) scale(${clip.scale ?? 1}) rotate(${clip.rotation || 0}deg)`,
              opacity: clip.opacity ?? 1,
              zIndex,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isSelected ? "move" : "pointer",
            };

            const mediaStyle = {
               maxHeight: "100%",
               maxWidth: "100%",
               objectFit: "contain",
               boxShadow: isSelected ? "0 0 0 4px #6366f1" : "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
               pointerEvents: "none" // Let wrapper handle drag
            };

            const content = () => {
              if (clip.trackType === "video" && clip.sourceUrl) {
                const url = clip.sourceUrl.toLowerCase();
                if (url.endsWith(".mp4") || url.endsWith(".webm") || url.includes("video")) {
                   return <video src={clip.sourceUrl} style={mediaStyle} autoPlay muted loop />;
                } else {
                   return <img src={clip.sourceUrl} style={mediaStyle} alt={clip.label} draggable="false" />;
                }
              } else if (clip.trackType === "audio") {
                return (
                  <div className={`border-2 p-6 rounded-2xl font-mono text-xl backdrop-blur-sm ${isSelected ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300' : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'}`}>
                     ♫ {clip.label || "Audio Track"}
                  </div>
                );
              }
              return (
                <div className="bg-indigo-500/50 border border-indigo-500 rounded-xl p-4 text-white font-mono shadow-xl backdrop-blur-md">
                  {clip.label || clip.id}
                </div>
              );
            };

            return (
              <div 
                key={clip.id} 
                style={style} 
                onMouseDown={(e) => handleMouseDown(e, clip)}
                className="group relative"
              >
                {content()}
                
                {/* Scale Handle */}
                {isSelected && (
                  <div
                    className="absolute z-30 w-6 h-6 bg-indigo-500 rounded-full border-2 border-white cursor-se-resize shadow-lg"
                    style={{
                      right: 'calc(50% - 100px)', // Arbitrary approx bounds for visual reference
                      bottom: 'calc(50% - 100px)',
                      transform: 'translate(50%, 50%)'
                    }}
                    onMouseDown={(e) => handleScaleMouseDown(e, clip)}
                  >
                     <div className="w-full h-full flex items-center justify-center opacity-50">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                     </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <span className="text-gray-600 font-mono text-sm tracking-wider">No clip active at {currentTime.toFixed(1)}s</span>
        )}
      </div>
      <p className="mt-4 text-xs text-gray-400 bg-gray-800 px-4 py-1.5 rounded-full font-mono border border-gray-700 shadow-inner">
        {project.resolution} @ {project.fps}fps
      </p>
    </div>
  );
}
