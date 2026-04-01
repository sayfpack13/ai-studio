import { useEffect } from "react";
import { createEditorTemplate, getEditorTemplates } from "../../services/api";
import { useEditor } from "../../context/EditorContext";

export default function TemplatesPanel() {
  const { templates, setTemplates, tracks, project } = useEditor();

  useEffect(() => {
    getEditorTemplates().then((response) => {
      setTemplates(response?.templates || []);
    });
  }, [setTemplates]);

  const saveCurrentAsTemplate = async () => {
    const response = await createEditorTemplate({
      name: `${project.name} Template`,
      scene: { tracks },
    });
    if (response?.template) {
      setTemplates((prev) => [response.template, ...prev]);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Templates</h3>
        <button onClick={saveCurrentAsTemplate} className="px-2 py-1 text-xs rounded bg-blue-600">
          Save Current
        </button>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {templates.map((template) => (
          <div key={template.id} className="text-xs bg-gray-800 rounded px-2 py-1">
            {template.name}
          </div>
        ))}
        {templates.length === 0 && <p className="text-xs text-gray-500">No templates yet.</p>}
      </div>
    </div>
  );
}
