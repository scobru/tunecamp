import React from "react";
import { Play, Pause, Square, Mic, ZoomIn, ZoomOut, Plus, Download, Sparkles } from "lucide-react";

interface TransportBarProps {
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number; // in seconds
  zoom: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddTrack: () => void;
  onExportWav: () => void;
  onToggleCanvas: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  isRecording,
  currentTime,
  zoom,
  onPlay,
  onPause,
  onStop,
  onToggleRecord,
  onZoomIn,
  onZoomOut,
  onAddTrack,
  onExportWav,
  onToggleCanvas,
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div className="card bg-base-200/90 border border-base-content/10 shadow-lg rounded-2xl p-3 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md sticky bottom-4 z-30">
      <div className="flex items-center gap-2">
        <button
          className="btn btn-circle btn-sm btn-ghost hover:bg-base-300"
          onClick={onStop}
          title="Stop"
        >
          <Square size={16} />
        </button>

        {isPlaying ? (
          <button
            className="btn btn-circle btn-primary btn-sm shadow-md"
            onClick={onPause}
            title="Pause"
          >
            <Pause size={16} />
          </button>
        ) : (
          <button
            className="btn btn-circle btn-primary btn-sm shadow-md"
            onClick={onPlay}
            title="Play"
          >
            <Play size={16} className="ml-0.5" />
          </button>
        )}

        <button
          className={`btn btn-circle btn-sm ${isRecording ? "btn-error animate-pulse" : "btn-ghost"}`}
          onClick={onToggleRecord}
          title={isRecording ? "Stop Recording" : "Record Mic Sample"}
        >
          <Mic size={16} />
        </button>

        <div className="bg-base-300 px-3 py-1.5 rounded-xl font-mono text-sm font-bold border border-base-content/10 text-primary min-w-[90px] text-center">
          {formatTime(currentTime)}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn btn-xs rounded-lg gap-1 border border-base-content/10" onClick={onAddTrack}>
          <Plus size={12} /> Add Track
        </button>
        <div className="flex items-center gap-1 bg-base-300 px-2 py-1 rounded-lg text-xs">
          <button onClick={onZoomOut} title="Zoom Out" className="hover:text-primary">
            <ZoomOut size={13} />
          </button>
          <span className="opacity-60 text-[10px] font-mono px-1">{zoom}px/s</span>
          <button onClick={onZoomIn} title="Zoom In" className="hover:text-primary">
            <ZoomIn size={13} />
          </button>
        </div>
        <button className="btn btn-xs btn-outline rounded-lg gap-1" onClick={onExportWav}>
          <Download size={12} /> Export WAV
        </button>
        <button className="btn btn-xs btn-accent rounded-lg gap-1" onClick={onToggleCanvas}>
          <Sparkles size={12} /> Canvas Mode
        </button>
      </div>
    </div>
  );
};
