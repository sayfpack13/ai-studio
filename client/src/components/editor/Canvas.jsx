import { useCallback, useRef, useState, useEffect } from "react";
import { useEditor } from "../../context/EditorContext";
import { useApp } from "../../context/AppContext";

const HANDLE_SIZE = 12;
const ROTATION_OFFSET = 35;

export default function Canvas() {
  const {
    project,
    tracks,
    playbackState,
    selectedClip,
    setSelectedClip,
    updateClip,
  } = useEditor();
  const { libraryAssets } = useApp();

  const canvasRef = useRef(null);
  const [canvasRect, setCanvasRect] = useState(null);

  const currentTime = playbackState.currentTime;

  // Update canvas rect on mount and resize
  useEffect(() => {
    const updateRect = () => {
      if (canvasRef.current) {
        setCanvasRect(canvasRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, []);

  // Find active clips at current time
  const activeClips = [];
  tracks.forEach((track) => {
    track.clips.forEach((clip) => {
      const start = clip.start || 0;
      const duration = clip.duration || 5;
      if (currentTime >= start && currentTime <= start + duration) {
        activeClips.push({ ...clip, trackType: track.type });
      }
    });
  });

  // Get clip transform values
  const getClipTransform = (clip) => ({
    x: clip.x || 0,
    y: clip.y || 0,
    scale: clip.scale ?? 1,
    rotation: clip.rotation || 0,
    opacity: clip.opacity ?? 1,
  });

  // Parse resolution
  const parseResolution = (res) => {
    const parts = (res || "1920x1080").split("x");
    return {
      width: parseInt(parts[0], 10) || 1920,
      height: parseInt(parts[1], 10) || 1080,
    };
  };

  const { width: resWidth, height: resHeight } = parseResolution(
    project.resolution,
  );

  // Handle clip move
  const handleMoveStart = useCallback(
    (e, clip) => {
      e.stopPropagation();
      if (selectedClip?.id !== clip.id) {
        setSelectedClip(clip);
      }

      const startX = e.clientX;
      const startY = e.clientY;
      const transform = getClipTransform(clip);

      const handleMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        updateClip(clip.id, {
          x: Math.round(transform.x + dx),
          y: Math.round(transform.y + dy),
        });
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [selectedClip, setSelectedClip, updateClip],
  );

  // Handle scale from corners/edges
  const handleScaleStart = useCallback(
    (e, clip, handle) => {
      e.stopPropagation();
      e.preventDefault();

      if (selectedClip?.id !== clip.id) {
        setSelectedClip(clip);
      }

      const transform = getClipTransform(clip);
      const startX = e.clientX;
      const startY = e.clientY;
      const startScale = transform.scale;

      const handleMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let scaleDelta = 0;

        // Calculate scale delta based on handle and drag direction (lower = finer control)
        switch (handle) {
          case "nw":
          case "se":
            scaleDelta = (dx + dy) / 500;
            break;
          case "ne":
          case "sw":
            scaleDelta = (dx - dy) / 500;
            break;
          case "n":
            scaleDelta = -dy / 400;
            break;
          case "s":
            scaleDelta = dy / 400;
            break;
          case "e":
            scaleDelta = dx / 400;
            break;
          case "w":
            scaleDelta = -dx / 400;
            break;
        }

        const newScale = Math.max(0.1, Math.min(5, startScale + scaleDelta));
        updateClip(clip.id, { scale: Math.round(newScale * 100) / 100 });
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [selectedClip, setSelectedClip, updateClip],
  );

  // Handle rotation
  const handleRotateStart = useCallback(
    (e, clip) => {
      e.stopPropagation();
      e.preventDefault();

      if (selectedClip?.id !== clip.id) {
        setSelectedClip(clip);
      }

      if (!canvasRect) return;

      const transform = getClipTransform(clip);
      const canvasCenterX =
        canvasRect.left + canvasRect.width / 2 + transform.x;
      const canvasCenterY =
        canvasRect.top + canvasRect.height / 2 + transform.y;

      const startAngle = Math.atan2(
        e.clientY - canvasCenterY,
        e.clientX - canvasCenterX,
      );
      const startRotation = transform.rotation;

      const handleMove = (moveEvent) => {
        const currentAngle = Math.atan2(
          moveEvent.clientY - canvasCenterY,
          moveEvent.clientX - canvasCenterX,
        );
        let deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI;

        let newRotation = startRotation + deltaAngle;

        // Normalize to -180 to 180
        while (newRotation > 180) newRotation -= 360;
        while (newRotation < -180) newRotation += 360;

        // Snap to 15 degrees with shift
        if (moveEvent.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }

        updateClip(clip.id, { rotation: Math.round(newRotation) });
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [selectedClip, setSelectedClip, updateClip, canvasRect],
  );

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback(
    (e) => {
      if (
        e.target === e.currentTarget ||
        e.target.classList.contains("canvas-bg")
      ) {
        setSelectedClip(null);
      }
    },
    [setSelectedClip],
  );

  // Get cursor for handle
  const getHandleCursor = (handle) => {
    const cursors = {
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
    };
    return cursors[handle] || "pointer";
  };

  // Check if source is valid (not expired blob URL)
  const isValidSource = (url) => {
    if (!url) return false;
    // Blob URLs are temporary and expire when the session ends
    if (url.startsWith("blob:")) return false;
    // Check if it's a valid URL
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Render missing asset placeholder
  const renderMissingPlaceholder = (clip, isSelected, type) => {
    const isVideo = type === "video";
    const bgColor = isVideo ? "bg-red-500/20" : "bg-amber-500/20";
    const borderColor = isVideo ? "border-red-400/50" : "border-amber-400/50";
    const textColor = isVideo ? "text-red-300" : "text-amber-300";
    const icon = isVideo ? (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ) : (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
        />
      </svg>
    );

    return (
      <div
        className={`flex flex-col items-center justify-center p-4 rounded-xl ${bgColor} border-2 ${borderColor} ${textColor}`}
      >
        <div className="opacity-50 mb-2">{icon}</div>
        <div className="text-sm font-medium">Missing Asset</div>
        <div className="text-xs opacity-75 mt-1">{clip.label || "Unknown"}</div>
        {clip.assetRef && (
          <div className="text-[10px] opacity-50 mt-1">
            ID: {clip.assetRef.slice(-8)}
          </div>
        )}
      </div>
    );
  };

  // Resolve asset from library if needed
  const resolveAsset = useCallback(
    (clip) => {
      if (clip.sourceUrl && isValidSource(clip.sourceUrl)) {
        return clip.sourceUrl;
      }
      if (clip.assetRef && libraryAssets) {
        const asset = libraryAssets.find((a) => a.id === clip.assetRef);
        if (asset?.url) {
          return asset.url;
        }
      }
      return null;
    },
    [libraryAssets],
  );

  // Render media content for clip
  const renderClipContent = (clip, isSelected) => {
    const resolvedUrl = resolveAsset(clip);

    // Check for missing video/image assets
    if (clip.trackType === "video") {
      // If no valid source, show placeholder
      if (!resolvedUrl) {
        return renderMissingPlaceholder(clip, isSelected, "video");
      }

      const url = resolvedUrl.toLowerCase();
      const isVideo =
        url.endsWith(".mp4") || url.endsWith(".webm") || url.includes("video");

      if (isVideo) {
        return (
          <video
            src={resolvedUrl}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            loop
            onError={() => {
              console.warn("Failed to load video:", resolvedUrl);
            }}
          />
        );
      }
      return (
        <img
          src={resolvedUrl}
          className="max-w-full max-h-full object-contain"
          alt={clip.label}
          draggable={false}
          onError={() => {
            console.warn("Failed to load image:", resolvedUrl);
          }}
        />
      );
    }

    if (clip.trackType === "audio") {
      // Audio clips don't need a visible source, just show placeholder
      return (
        <div
          className={`px-4 py-3 rounded-xl border-2 backdrop-blur-sm ${
            isSelected
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
              : "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          <div className="flex items-center gap-2 font-mono text-sm">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
            <span>{clip.label || "Audio"}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 py-3 rounded-xl bg-blue-500/20 border border-blue-400/50 text-blue-300 font-mono text-sm">
        {clip.label || `Clip`}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center">
      {/* Canvas Preview */}
      <div
        ref={canvasRef}
        className="relative bg-black rounded-lg border border-gray-700 overflow-hidden w-full shadow-2xl cursor-crosshair"
        onClick={handleCanvasClick}
        style={{ aspectRatio: `${resWidth}/${resHeight}` }}
      >
        {/* Background grid */}
        <div className="canvas-bg absolute inset-0 pointer-events-none opacity-5">
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "10% 10%",
            }}
          />
        </div>

        {/* Center guides */}
        <div className="canvas-bg absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-500/20" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-500/20" />
        </div>

        {/* Active clips */}
        {activeClips.length > 0 ? (
          activeClips.map((clip) => {
            const isSelected = selectedClip?.id === clip.id;
            const transform = getClipTransform(clip);
            const zIndex = isSelected
              ? 20
              : clip.trackType === "video"
                ? 10
                : 5;

            return (
              <div
                key={clip.id}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  zIndex,
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
                  opacity: transform.opacity,
                }}
                onMouseDown={(e) => handleMoveStart(e, clip)}
              >
                {/* Clip content */}
                <div
                  className={`relative ${
                    isSelected
                      ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent"
                      : ""
                  }`}
                  style={{ cursor: isSelected ? "move" : "pointer" }}
                >
                  {renderClipContent(clip, isSelected)}

                  {/* Transform controls overlay */}
                  {isSelected && canvasRect && (
                    <div
                      className="absolute pointer-events-auto"
                      style={{ inset: -HANDLE_SIZE }}
                    >
                      {/* Bounding box */}
                      <div
                        className="absolute border-2 border-blue-400 pointer-events-none"
                        style={{ inset: HANDLE_SIZE / 2 }}
                      />

                      {/* Corner handles */}
                      {["nw", "ne", "sw", "se"].map((h) => (
                        <div
                          key={h}
                          className="absolute bg-white border-2 border-blue-500 rounded-sm shadow-lg hover:scale-125 hover:bg-blue-100 transition-transform"
                          style={{
                            width: HANDLE_SIZE,
                            height: HANDLE_SIZE,
                            cursor: getHandleCursor(h),
                            ...{
                              nw: { top: 0, left: 0 },
                              ne: { top: 0, right: 0 },
                              sw: { bottom: 0, left: 0 },
                              se: { bottom: 0, right: 0 },
                            }[h],
                          }}
                          onMouseDown={(e) => handleScaleStart(e, clip, h)}
                        />
                      ))}

                      {/* Edge handles */}
                      {["n", "s", "e", "w"].map((h) => (
                        <div
                          key={h}
                          className="absolute bg-white border-2 border-blue-500 rounded-sm shadow-lg hover:scale-110 hover:bg-blue-100 transition-transform"
                          style={{
                            width: h === "n" || h === "s" ? 24 : HANDLE_SIZE,
                            height: h === "e" || h === "w" ? 24 : HANDLE_SIZE,
                            cursor: getHandleCursor(h),
                            ...{
                              n: {
                                top: -HANDLE_SIZE / 2,
                                left: "50%",
                                transform: "translateX(-50%)",
                              },
                              s: {
                                bottom: -HANDLE_SIZE / 2,
                                left: "50%",
                                transform: "translateX(-50%)",
                              },
                              e: {
                                right: -HANDLE_SIZE / 2,
                                top: "50%",
                                transform: "translateY(-50%)",
                              },
                              w: {
                                left: -HANDLE_SIZE / 2,
                                top: "50%",
                                transform: "translateY(-50%)",
                              },
                            }[h],
                          }}
                          onMouseDown={(e) => handleScaleStart(e, clip, h)}
                        />
                      ))}

                      {/* Rotation handle */}
                      <div
                        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto"
                        style={{
                          top: -ROTATION_OFFSET - HANDLE_SIZE,
                          transform: "translateX(-50%)",
                        }}
                      >
                        <div className="w-px h-6 bg-blue-400" />
                        <div
                          className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center cursor-grab hover:bg-blue-400 hover:scale-110 transition-all"
                          onMouseDown={(e) => handleRotateStart(e, clip)}
                        >
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Info label */}
                      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-[10px] px-2 py-1 rounded font-mono whitespace-nowrap border border-gray-700 pointer-events-none">
                        {transform.scale.toFixed(2)}x • {transform.rotation}° •
                        ({transform.x}, {transform.y})
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          /* Empty state */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/50 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500 mb-1">
              No clip at {currentTime.toFixed(1)}s
            </p>
            <p className="text-xs text-gray-600">
              Add clips to timeline to preview
            </p>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400 flex-wrap justify-center">
        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
          <span className="font-mono">{project.resolution}</span>
        </div>
        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-mono">{project.fps} fps</span>
        </div>
        {selectedClip && (
          <div className="flex items-center gap-2 bg-blue-900/30 px-3 py-1.5 rounded-lg border border-blue-700/50 text-blue-300">
            <span className="font-mono">{selectedClip.label || "Clip"}</span>
          </div>
        )}
      </div>

      {/* Hints */}
      {selectedClip && (
        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-2 flex-wrap justify-center">
          <span>Drag clip to move</span>
          <span className="text-gray-600">•</span>
          <span>Handles to scale</span>
          <span className="text-gray-600">•</span>
          <span>Circle to rotate</span>
          <span className="text-gray-600">•</span>
          <span className="text-gray-400">Shift for snap</span>
        </div>
      )}
    </div>
  );
}
