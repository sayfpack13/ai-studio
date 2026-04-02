import LibraryLinkPanel from "./LibraryLinkPanel";

export default function LibraryDialog({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          <div>
            <h3 className="text-sm font-semibold text-white">Media Library</h3>
            <p className="text-[11px] text-gray-400">
              Add assets to the timeline.
            </p>
          </div>
          <button
            className="px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-3">
          <LibraryLinkPanel />
        </div>
      </div>
    </div>
  );
}
