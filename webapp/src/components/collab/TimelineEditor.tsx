import React, { useEffect, useRef } from "react";
import { Volume2, VolumeX, Lock, Trash2, Music } from "lucide-react";
import type { AudioEngine, TrackState, TrackClip } from "../../core/collab/AudioEngine";

interface TimelineEditorProps {
  audioEngine: AudioEngine;
  tracks: TrackState[];
  pixelsPerSecond: number;
  currentTime: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onSelectTrack: (trackId: string) => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateTracks: (newTracks: TrackState[]) => void;
  onSeek: (seconds: number) => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  audioEngine,
  tracks,
  pixelsPerSecond,
  currentTime,
  selectedTrackId,
  selectedClipId,
  onSelectTrack,
  onSelectClip,
  onUpdateTracks,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingClipRef = useRef<{ clipId: string; trackId: string; startX: number; originalStart: number } | null>(null);
  const resizingClipRef = useRef<{ clipId: string; trackId: string; startX: number; originalDuration: number } | null>(null);

  // Maximum timeline duration calculation (min 30 seconds)
  const maxDuration = Math.max(
    30,
    ...tracks.flatMap((t) => t.samples.map((s) => s.startTime + s.duration + 5))
  );

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const time = Math.max(0, clickX / pixelsPerSecond);
    onSeek(time);
  };

  const updateTrackProp = <K extends keyof TrackState>(trackId: string, key: K, value: TrackState[K]) => {
    const updated = tracks.map((t) => (t.id === trackId ? { ...t, [key]: value } : t));
    onUpdateTracks(updated);
  };

  const deleteTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    onUpdateTracks(tracks.filter((t) => t.id !== trackId));
  };

  const deleteClip = (trackId: string, clipId: string) => {
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      return { ...t, samples: t.samples.filter((s) => s.id !== clipId) };
    });
    onUpdateTracks(updated);
    if (selectedClipId === clipId) onSelectClip(null);
  };

  // Clip drag & resize handlers
  const handleMouseDownClip = (e: React.MouseEvent, clip: TrackClip, track: TrackState) => {
    e.stopPropagation();
    onSelectTrack(track.id);
    onSelectClip(clip.id);

    if (track.locked) return;

    draggingClipRef.current = {
      clipId: clip.id,
      trackId: track.id,
      startX: e.clientX,
      originalStart: clip.startTime,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingClipRef.current) return;
      const deltaX = moveEvent.clientX - draggingClipRef.current.startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newStart = Math.max(0, draggingClipRef.current.originalStart + deltaTime);

      const updated = tracks.map((t) => {
        if (t.id !== draggingClipRef.current!.trackId) return t;
        return {
          ...t,
          samples: t.samples.map((s) => (s.id === draggingClipRef.current!.clipId ? { ...s, startTime: newStart } : s)),
        };
      });
      onUpdateTracks(updated);
    };

    const handleMouseUp = () => {
      draggingClipRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseDownResize = (e: React.MouseEvent, clip: TrackClip, track: TrackState) => {
    e.stopPropagation();
    if (track.locked) return;

    resizingClipRef.current = {
      clipId: clip.id,
      trackId: track.id,
      startX: e.clientX,
      originalDuration: clip.duration,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingClipRef.current) return;
      const deltaX = moveEvent.clientX - resizingClipRef.current.startX;
      const deltaDuration = deltaX / pixelsPerSecond;
      const newDuration = Math.max(0.2, resizingClipRef.current.originalDuration + deltaDuration);

      const updated = tracks.map((t) => {
        if (t.id !== resizingClipRef.current!.trackId) return t;
        return {
          ...t,
          samples: t.samples.map((s) => (s.id === resizingClipRef.current!.clipId ? { ...s, duration: newDuration } : s)),
        };
      });
      onUpdateTracks(updated);
    };

    const handleMouseUp = () => {
      resizingClipRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="card bg-base-200/50 border border-base-content/10 rounded-3xl overflow-hidden shadow-inner flex flex-col min-h-[350px]">
      {/* Time Ruler */}
      <div className="flex border-b border-base-content/10 bg-base-300/60 select-none">
        <div className="w-56 p-2 text-[10px] font-bold opacity-50 uppercase border-r border-base-content/10 flex items-center justify-between">
          <span>Tracks ({tracks.length})</span>
        </div>
        <div
          className="flex-1 relative h-8 cursor-pointer overflow-hidden bg-base-300/30"
          onClick={handleRulerClick}
        >
          {Array.from({ length: Math.ceil(maxDuration) }).map((_, sec) => {
            if (sec % 2 !== 0 && pixelsPerSecond < 40) return null;
            return (
              <div
                key={sec}
                className="absolute top-0 bottom-0 border-l border-base-content/10 text-[9px] font-mono opacity-40 pl-1 pt-0.5"
                style={{ left: `${sec * pixelsPerSecond}px` }}
              >
                {sec}s
              </div>
            );
          })}
          {/* Playhead Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none shadow-[0_0_8px_rgba(74,222,128,0.8)]"
            style={{ left: `${currentTime * pixelsPerSecond}px` }}
          >
            <div className="w-2.5 h-2.5 bg-primary rounded-full -ml-[4px] -mt-[1px] shadow-sm" />
          </div>
        </div>
      </div>

      {/* Tracks Container */}
      <div className="flex-1 overflow-y-auto overflow-x-auto relative" ref={containerRef}>
        {/* Global Playhead Bar */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none shadow-[0_0_8px_rgba(74,222,128,0.8)]"
          style={{ left: `${224 + currentTime * pixelsPerSecond}px` }}
        />

        {tracks.map((track) => {
          const isSelected = track.id === selectedTrackId;
          return (
            <div
              key={track.id}
              className={`flex border-b border-base-content/5 transition-colors min-h-[88px] ${
                isSelected ? "bg-primary/5" : "hover:bg-base-100/40"
              }`}
              onClick={() => onSelectTrack(track.id)}
            >
              {/* Track Header Controls */}
              <div className="w-56 p-3 border-r border-base-content/10 bg-base-200/80 flex flex-col justify-between shrink-0 select-none space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <input
                    type="text"
                    className="font-bold text-xs bg-transparent border-none focus:outline-none focus:bg-base-100 px-1 rounded w-full truncate"
                    value={track.name}
                    onChange={(e) => updateTrackProp(track.id, "name", e.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      className={`btn btn-circle btn-ghost btn-xs ${track.locked ? "text-warning" : "opacity-40"}`}
                      onClick={() => updateTrackProp(track.id, "locked", !track.locked)}
                      title="Lock Track"
                    >
                      <Lock size={11} />
                    </button>
                    {tracks.length > 1 && (
                      <button
                        className="btn btn-circle btn-ghost btn-xs text-error opacity-40 hover:opacity-100"
                        onClick={() => deleteTrack(track.id)}
                        title="Delete Track"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      className={`btn btn-xs rounded-md text-[10px] px-2 font-bold ${
                        track.solo ? "btn-warning" : "btn-outline border-base-content/20"
                      }`}
                      onClick={() => updateTrackProp(track.id, "solo", !track.solo)}
                    >
                      S
                    </button>
                    <button
                      className={`btn btn-xs rounded-md text-[10px] px-2 font-bold ${
                        track.muted ? "btn-error" : "btn-outline border-base-content/20"
                      }`}
                      onClick={() => updateTrackProp(track.id, "muted", !track.muted)}
                    >
                      M
                    </button>
                  </div>

                  <div className="flex items-center gap-1 flex-1 max-w-[90px]">
                    {track.muted ? <VolumeX size={11} className="opacity-40" /> : <Volume2 size={11} className="opacity-40" />}
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="range range-xs range-primary"
                      value={track.volume}
                      onChange={(e) => updateTrackProp(track.id, "volume", parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Track Clip Lane */}
              <div
                className="flex-1 relative min-w-[600px] bg-base-100/20"
                style={{ width: `${maxDuration * pixelsPerSecond}px` }}
              >
                {track.samples.map((clip) => {
                  const clipLeft = clip.startTime * pixelsPerSecond;
                  const clipWidth = Math.max(16, clip.duration * pixelsPerSecond);
                  const isClipSelected = clip.id === selectedClipId;
                  const buffer = audioEngine.getBuffer(clip.sampleId);

                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-2 bottom-2 rounded-xl border p-2 flex flex-col justify-between select-none cursor-grab active:cursor-grabbing transition-shadow ${
                        isClipSelected
                          ? "bg-primary/20 border-primary ring-2 ring-primary/40 shadow-lg"
                          : "bg-base-300/80 border-base-content/10 hover:border-primary/40"
                      }`}
                      style={{ left: `${clipLeft}px`, width: `${clipWidth}px` }}
                      onMouseDown={(e) => handleMouseDownClip(e, clip, track)}
                    >
                      <div className="flex items-center justify-between gap-1 overflow-hidden">
                        <span className="font-bold text-[10px] truncate text-primary flex items-center gap-1">
                          <Music size={10} /> {clip.name}
                        </span>
                        {isClipSelected && (
                          <button
                            className="btn btn-circle btn-ghost btn-xs text-error hover:bg-error/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteClip(track.id, clip.id);
                            }}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>

                      {/* Waveform graphic canvas preview */}
                      <WaveformCanvas buffer={buffer} audioEngine={audioEngine} clipWidth={clipWidth} />

                      {/* Resize Right Handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/50 rounded-r-xl"
                        onMouseDown={(e) => handleMouseDownResize(e, clip, track)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Internal Waveform Renderer
const WaveformCanvas: React.FC<{ buffer?: AudioBuffer; audioEngine: AudioEngine; clipWidth: number }> = ({
  buffer,
  audioEngine,
  clipWidth,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const waveform = audioEngine.getWaveformData(buffer, Math.max(50, Math.floor(clipWidth)));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(74, 222, 128, 0.5)";

    const h = canvas.height;
    for (let i = 0; i < waveform.length; i++) {
      const val = waveform[i];
      const barH = Math.max(2, val * h * 1.8);
      const y = (h - barH) / 2;
      ctx.fillRect(i * (canvas.width / waveform.length), y, 1.5, barH);
    }
  }, [buffer, audioEngine, clipWidth]);

  if (!buffer) return <div className="text-[9px] opacity-40 italic">Audio loading...</div>;

  return <canvas ref={canvasRef} width={Math.max(50, Math.floor(clipWidth))} height={32} className="w-full h-8 pointer-events-none opacity-80" />;
};
