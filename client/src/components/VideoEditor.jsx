import { useState } from "react";
import { EditorProvider } from "../context/EditorContext";
import Canvas from "./editor/Canvas";
import EffectsPanel from "./editor/EffectsPanel";
import ExportModal from "./editor/ExportModal";
import PropertiesPanel from "./editor/PropertiesPanel";
import Timeline from "./editor/Timeline";
import Toolbar from "./editor/Toolbar";
import { useApp } from "../context/AppContext";
import AssetPickerDialog from "./library/AssetPickerDialog";
import TemplatesPanel from "./editor/TemplatesPanel";
import { useEditor } from "../context/EditorContext";

function LibraryLinkPanel() {
  const { addClip, tracks, playbackState } = useEditor();
  const { refreshLibraryAssets } = useApp();
  const videoTrack = tracks.find((item) => item.type === "video")?.id;
  const audioTrack = tracks.find((item) => item.type === "audio")?.id;

  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetDialogType, setAssetDialogType] = useState("all");

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const isAudio = file.type.startsWith("audio");
    const trackId = isAudio ? audioTrack : videoTrack;

    addClip(trackId, {
      label: file.name,
      start: playbackState.currentTime,
      duration: 5,
      sourceUrl: url,
    });

    // Reset input
    e.target.value = "";
  };

  const handlePickAsset = (asset) => {
    const isAudio = asset.type === "audio";
    const trackId = isAudio ? audioTrack : videoTrack;

    addClip(trackId, {
      label: asset.title,
      start: playbackState.currentTime,
      duration: 5,
      assetRef: asset.id,
      sourceUrl: asset.url,
    });
  };

  const openDialog = (type) => {
    refreshLibraryAssets?.();
    setAssetDialogType(type);
    setAssetDialogOpen(true);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center justify-between text-white">
        Media Assets
        <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400">
          Inserts at {playbackState.currentTime.toFixed(1)}s
        </span>
      </h3>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => openDialog("all")}
          className="flex items-center justify-between w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors text-white"
        >
          <span className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            Select from Library
          </span>
          <span className="text-xs text-gray-400">All Assets</span>
        </button>
      </div>

      <div className="pt-2 border-t border-gray-800">
        <label className="flex items-center justify-center w-full px-3 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-lg text-sm cursor-pointer transition-colors">
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 4v16m8-8H4"
            ></path>
          </svg>
          Upload Local File
          <input
            type="file"
            accept="video/*,audio/*,image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      <AssetPickerDialog
        open={assetDialogOpen}
        onClose={() => setAssetDialogOpen(false)}
        onSelect={handlePickAsset}
        type={assetDialogType}
        title={
          assetDialogType === "all"
            ? "Select Asset"
            : `Select ${assetDialogType} Asset`
        }
      />
    </div>
  );
}

function VideoEditorContent() {
  const [exportOpen, setExportOpen] = useState(false);
  const { saveEditorProject } = useApp();

  const saveProjectSnapshot = () => {
    saveEditorProject(`project_${Date.now()}`, {
      name: `Project ${new Date().toLocaleString()}`,
      type: "video-editor",
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <Toolbar onExport={() => setExportOpen(true)} />
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <Canvas />
          <Timeline />
        </div>
        <div className="space-y-4">
          <PropertiesPanel />
          <EffectsPanel />
          <LibraryLinkPanel />
          <TemplatesPanel />
          <button
            onClick={saveProjectSnapshot}
            className="w-full px-3 py-2 rounded bg-blue-600 text-sm"
          >
            Save Project Snapshot
          </button>
        </div>
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

export default function VideoEditor() {
  return (
    <EditorProvider>
      <VideoEditorContent />
    </EditorProvider>
  );
}
