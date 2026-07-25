import React from "react";
import { X, Plus, Music } from "lucide-react";
import type { CollabStem } from "../../types";

interface SampleLibraryModalProps {
  open: boolean;
  stems: CollabStem[];
  onClose: () => void;
  onSelectStem: (stem: CollabStem) => void;
}

export const SampleLibraryModal: React.FC<SampleLibraryModalProps> = ({
  open,
  stems,
  onClose,
  onSelectStem,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="card bg-base-100 border border-base-content/10 max-w-lg w-full rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg flex items-center gap-2">
            <Music size={18} className="text-primary" /> Add Sample to Track
          </h3>
          <button className="btn btn-ghost btn-circle btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="text-xs opacity-60">Select an uploaded project stem to add it as a clip on your timeline.</p>

        {stems.length === 0 ? (
          <div className="text-center py-10 opacity-40 border border-dashed border-base-content/10 rounded-2xl">
            <p className="text-xs font-semibold">No stems uploaded in this project yet.</p>
            <p className="text-[11px]">Upload a stem first using the Upload button.</p>
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {stems.map((stem) => (
              <div
                key={stem.id}
                className="card bg-base-200/50 hover:bg-base-200 border border-base-content/5 p-3 rounded-2xl flex flex-row items-center justify-between cursor-pointer transition-all hover:scale-[1.01]"
                onClick={() => {
                  onSelectStem(stem);
                  onClose();
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-xs truncate">{stem.name}</p>
                  <p className="text-[10px] opacity-50">By {stem.authorUsername || "Artist"}</p>
                </div>
                <button className="btn btn-xs btn-primary rounded-xl gap-1">
                  <Plus size={12} /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
