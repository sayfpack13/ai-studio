import { useState } from "react";
import { EditorProvider } from "../context/EditorContext";
import Canvas from "./editor/Canvas";
import EffectsPanel from "./editor/EffectsPanel";
import ExportModal from "./editor/ExportModal";
import PropertiesPanel from "./editor/PropertiesPanel";
import Timeline from "./editor/Timeline";
import Toolbar from "./editor/Toolbar";
import { useApp } from "../context/AppContext";
import AssetPicker from "./library/AssetPicker";
import TemplatesPanel from "./editor/TemplatesPanel";
import { useEditor } from "../context/EditorContext";

function LibraryLinkPanel() {
  const { addClip, tracks } = useEditor();
  const videoTrack = tracks.find((item) => item.type === "video")?.id;
  const audioTrack = tracks.find((item) => item.type === "audio")?.id;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold">Import From Library</h3>
      <p className="text-xs text-gray-400">Pick assets and add directly into timeline tracks.</p>
      <AssetPicker
        type="video"
        onPick={(asset) =>
          addClip(videoTrack, { label: asset.title, start: 0, duration: 5, assetRef: asset.id, sourceUrl: asset.url })
        }
      />
      <AssetPicker
        type="audio"
        onPick={(asset) =>
          addClip(audioTrack, { label: asset.title, start: 0, duration: 5, assetRef: asset.id, sourceUrl: asset.url })
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
