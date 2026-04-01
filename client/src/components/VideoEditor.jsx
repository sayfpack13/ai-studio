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
  const videoTrack = tracks.find((item) => item.type === "video")?.id;
  const audioTrack = tracks.find((item) => item.type === "audio")?.id;

  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetDialogType, setAssetDialogType] = useState("video");

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
    e.target.value = '';
  };

  const handlePickAsset = (asset) => {
    const isAudio = asset.type === "audio";
    const trackId = isAudio ? audioTrack : videoTrack;
    
    addClip(trackId, {
      label: asset.title,
      start: playbackState.currentTime,
      duration: 5,
      assetRef: asset.id,
      sourceUrl: asset.url
    });
  };

  const openDialog = (type) => {
    setAssetDialogType(type);
    setAssetDialogOpen(true);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center justify-between text-white">
        Media Assets
        <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400">Inserts at {playbackState.currentTime.toFixed(1)}s</span>
      </h3>
      
      <div className="flex flex-col gap-2">
        <button 
          onClick={() => openDialog("video")} 
          className="flex items-center justify-between w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors text-white"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            Select from Library
          </span>
          <span className="text-xs text-gray-400">Video</span>
        </button>
        <button 
          onClick={() => openDialog("image")} 
          className="flex items-center justify-between w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors text-white"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            Select from Library
          </span>
          <span className="text-xs text-gray-400">Image</span>
        </button>
        <button 
          onClick={() => openDialog("audio")} 
          className="flex items-center justify-between w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors text-white"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            Select from Library
          </span>
          <span className="text-xs text-gray-400">Audio</span>
        </button>
      </div>

      <div className="pt-2 border-t border-gray-800">
        <label className="flex items-center justify-center w-full px-3 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-lg text-sm cursor-pointer transition-colors">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          Upload Local File
          <input type="file" accept="video/*,audio/*,image/*" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      <AssetPickerDialog
        open={assetDialogOpen}
        onClose={() => setAssetDialogOpen(false)}
        onSelect={handlePickAsset}
        type={assetDialogType}
        title={`Select ${assetDialogType} Asset`}
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
          <button onClick={saveProjectSnapshot} className="w-full px-3 py-2 rounded bg-blue-600 text-sm">
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
