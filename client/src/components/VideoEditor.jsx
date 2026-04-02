import { useState, useEffect } from "react";
import { EditorProvider, useEditor } from "../context/EditorContext";
import { useApp } from "../context/AppContext";
import Canvas from "./editor/Canvas";
import ExportModal from "./editor/ExportModal";
import ProjectManagerDialog from "./editor/ProjectManagerDialog";
import Timeline from "./editor/Timeline";
import Toolbar from "./editor/Toolbar";
import EditorSidebarTabs from "./editor/EditorSidebarTabs";
import EditorProjectLibraryCard from "./editor/EditorProjectLibraryCard";

function VideoEditorContent() {
  const [exportOpen, setExportOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const { editorProjects } = useApp();
  const { loadProject, addClipToType, playbackState } = useEditor();

  useEffect(() => {
    const handleProjectSelected = (event) => {
      const projectId = event?.detail?.projectId;
      if (!projectId) return;
      const payload = editorProjects?.[projectId];
      if (!payload) return;

      loadProject(payload, {
        id: projectId,
        lastSavedAt: payload.lastUpdated || payload.savedAt || null,
      });
    };

    const pendingId = localStorage.getItem("editor_project_to_load");
    if (pendingId) {
      handleProjectSelected({ detail: { projectId: pendingId } });
      localStorage.removeItem("editor_project_to_load");
    }

    window.addEventListener("editorProjectSelected", handleProjectSelected);
    return () =>
      window.removeEventListener(
        "editorProjectSelected",
        handleProjectSelected,
      );
  }, [editorProjects, loadProject]);

  useEffect(() => {
    const handleAssetSelected = (event) => {
      const asset = event?.detail?.asset;
      if (!asset) return;

      const type = asset.type === "audio" ? "audio" : "video";
      addClipToType(type, {
        label: asset.title,
        start: playbackState.currentTime,
        duration: 5,
        assetRef: asset.id,
        sourceUrl: asset.url,
      });
    };

    window.addEventListener("editorAssetSelected", handleAssetSelected);
    return () =>
      window.removeEventListener("editorAssetSelected", handleAssetSelected);
  }, [addClipToType, playbackState.currentTime]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <Toolbar
        onExport={() => setExportOpen(true)}
        onProject={() => setProjectDialogOpen(true)}
      />
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <Canvas />
          <Timeline />
        </div>
        <div className="space-y-4">
          <EditorProjectLibraryCard
            onOpenProjectManager={() => setProjectDialogOpen(true)}
          />
          <EditorSidebarTabs />
        </div>
      </div>
      <ProjectManagerDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
      />
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
