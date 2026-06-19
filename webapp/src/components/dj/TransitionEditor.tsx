import { useEffect, useRef, useState } from 'react';
import { X, Save, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  DjTrack,
  TransitionConfig,
  DjPreset,
  VolumeMode,
  EqMode,
  EffectsMode,
} from '../../lib/dj/DjEngine';

interface Props {
  fromTrack: DjTrack;
  toTrack: DjTrack;
  fromIndex: number;
  fromBpm?: number;
  toBpm?: number;
  fromBeatOffsetMs?: number;
  toBeatOffsetMs?: number;
  initialConfig: TransitionConfig;
  onSave: (fromIndex: number, config: TransitionConfig) => void;
  onClose: () => void;
}

// ─── Waveform helpers ─────────────────────────────────────────────────────────

function seededRng(seed: string | number) {
  let s =
    typeof seed === 'string'
      ? [...String(seed)].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)
      : Number(seed);
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function makeWaveform(id: string | number, count: number): number[] {
  const rng = seededRng(id);
  const raw = Array.from({ length: count }, () => 0.15 + rng() * 0.85);
  // Light smoothing pass
  return raw.map((v, i) => {
    const a = raw[i - 1] ?? v;
    const b = raw[i + 1] ?? v;
    return (a + v * 2 + b) / 4;
  });
}

function parseWaveform(data: any): number[] | null {
  if (!data) return null;
  try {
    if (typeof data === 'string') {
      if (data.includes('<svg') || data.startsWith('/') || data.startsWith('http')) {
        return null;
      }
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
    if (Array.isArray(data)) return data;
  } catch (e) {
    console.error('Failed to parse waveform data', e);
  }
  return null;
}

const PROCEDURAL_SAMPLES = 400;
function getOrCreateWaveform(track: DjTrack): number[] {
  const parsed = parseWaveform(track.waveform);
  if (parsed && parsed.length > 0) return parsed;
  return makeWaveform(track.id, PROCEDURAL_SAMPLES);
}

function getWaveformBar(waveform: number[], t: number, duration: number): number {
  if (t < 0 || t >= duration) return 0;
  const idx = Math.floor((t / duration) * waveform.length);
  return waveform[idx] ?? 0;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function snapToBeat(t: number, bpm: number, offsetMs: number): number {
  if (!bpm || bpm <= 0) return t;
  const beatSec = 60 / bpm;
  const offsetSec = offsetMs / 1000;
  const k = Math.round((t - offsetSec) / beatSec);
  return offsetSec + k * beatSec;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawWaveform(
  canvas: HTMLCanvasElement,
  fromTrack: DjTrack,
  toTrack: DjTrack,
  outPoint: number,
  inPoint: number,
  fadeWindow: number,
  visibleSec: number,
  fromBpm?: number,
  fromBeatOffsetMs?: number,
  toBpm?: number,
  toBeatOffsetMs?: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (W === 0 || H === 0) return;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const midY = H / 2;
  const BAR_W = 2;
  const GAP = 1;
  const count = Math.floor(W / (BAR_W + GAP));
  
  const outWaveform = getOrCreateWaveform(fromTrack);
  const inWaveform = getOrCreateWaveform(toTrack);

  const durationA = fromTrack.duration || 180;
  const durationB = toTrack.duration || 180;

  const overlapFrac = fadeWindow / visibleSec;
  const overlapX = (1 - overlapFrac) * W;

  // Dark background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  // Draw beat grid lines for outgoing track (top half)
  if (fromBpm && fromBpm > 0) {
    const beatSec = 60 / fromBpm;
    const offsetSec = (fromBeatOffsetMs ?? 0) / 1000;
    const t_start = outPoint - (1 - overlapFrac) * visibleSec;
    const t_end = outPoint + overlapFrac * visibleSec;
    
    const firstK = Math.ceil((t_start - offsetSec) / beatSec);
    const lastK = Math.floor((t_end - offsetSec) / beatSec);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let k = firstK; k <= lastK; k++) {
      const t_beat = offsetSec + k * beatSec;
      const pos = (t_beat - t_start) / visibleSec;
      const x = pos * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, midY);
      ctx.stroke();
    }
  }

  // Draw beat grid lines for incoming track (bottom half)
  if (toBpm && toBpm > 0) {
    const beatSec = 60 / toBpm;
    const offsetSec = (toBeatOffsetMs ?? 0) / 1000;
    const t_start = inPoint - (1 - overlapFrac) * visibleSec;
    const t_end = inPoint + overlapFrac * visibleSec;
    
    const firstK = Math.ceil((t_start - offsetSec) / beatSec);
    const lastK = Math.floor((t_end - offsetSec) / beatSec);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let k = firstK; k <= lastK; k++) {
      const t_beat = offsetSec + k * beatSec;
      const pos = (t_beat - t_start) / visibleSec;
      const x = pos * W;
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  // Draw outgoing track (top half — bars grow upward from center)
  for (let i = 0; i < count; i++) {
    const x = i * (BAR_W + GAP);
    const pos = i / count;
    const t_A = outPoint + (pos - (1 - overlapFrac)) * visibleSec;
    
    const peakA = getWaveformBar(outWaveform, t_A, durationA);
    const barH = Math.max(2, peakA * (midY - 4) * 0.9);
    const y = midY - barH;
    
    const inOverlap = pos >= 1 - overlapFrac;
    ctx.fillStyle = inOverlap ? 'rgba(99,202,183,0.95)' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, BAR_W, barH, 1);
    } else {
      ctx.rect(x, y, BAR_W, barH);
    }
    ctx.fill();
  }

  // Draw incoming track (bottom half — bars grow downward from center)
  for (let i = 0; i < count; i++) {
    const x = i * (BAR_W + GAP);
    const pos = i / count;
    const t_B = inPoint + (pos - (1 - overlapFrac)) * visibleSec;
    
    const peakB = getWaveformBar(inWaveform, t_B, durationB);
    const barH = Math.max(2, peakB * (midY - 4) * 0.9);
    const y = midY;
    
    const inOverlap = pos >= 1 - overlapFrac;
    ctx.fillStyle = inOverlap ? 'rgba(74,222,128,0.95)' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, BAR_W, barH, 1);
    } else {
      ctx.rect(x, y, BAR_W, barH);
    }
    ctx.fill();
  }

  // Overlap zone highlight
  const grad = ctx.createLinearGradient(overlapX, 0, W, 0);
  grad.addColorStop(0, 'rgba(99,202,183,0.03)');
  grad.addColorStop(0.5, 'rgba(99,202,183,0.08)');
  grad.addColorStop(1, 'rgba(99,202,183,0.03)');
  ctx.fillStyle = grad;
  ctx.fillRect(overlapX, 0, W - overlapX, H);

  // Left edge of overlap zone
  ctx.strokeStyle = 'rgba(99,202,183,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(overlapX, 0);
  ctx.lineTo(overlapX, H);
  ctx.stroke();

  // Green vertical "mix point" line (at end of transition)
  ctx.strokeStyle = 'rgba(74,222,128,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W - 1, 0);
  ctx.lineTo(W - 1, H);
  ctx.stroke();

  // Center divider line
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(W, midY);
  ctx.stroke();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const BARS_OPTIONS = [1, 2, 4, 8] as const;

const PRESETS: { id: DjPreset | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'fade', label: 'Fade' },
  { id: 'rise', label: 'Rise' },
  { id: 'cut', label: 'Blend' },
];

const VOLUME_OPTIONS: { id: VolumeMode; label: string }[] = [
  { id: 'smooth', label: 'Smooth cross...' },
  { id: 'overlap', label: 'Overlap' },
];

const EQ_OPTIONS: { id: EqMode; label: string }[] = [
  { id: 'center-bass', label: 'Center bass s...' },
  { id: 'none', label: 'None' },
];

const EFFECTS_OPTIONS: { id: EffectsMode; label: string }[] = [
  { id: 'lowpass', label: 'Low pass filte...' },
  { id: 'none', label: 'None' },
];

function TrackRow({
  track,
  bpm,
  side,
  timeLabel,
}: {
  track: DjTrack;
  bpm?: number;
  side: 'from' | 'to';
  timeLabel?: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${side === 'to' ? 'flex-row-reverse text-right' : ''}`}>
      {track.coverUrl ? (
        <img
          src={track.coverUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-cover ring-1 ring-white/10 shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-base-300 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{track.title}</p>
        <div className={`flex items-center gap-2 text-xs opacity-50 ${side === 'to' ? 'flex-row-reverse' : ''}`}>
          <span className="truncate">{track.artistName || 'Unknown artist'}</span>
          {timeLabel && (
            <span className={`badge badge-sm font-mono font-semibold text-[9px] uppercase tracking-wider ${
              side === 'from' ? 'badge-primary badge-outline text-primary/80' : 'badge-success badge-outline text-success/80'
            }`}>
              {timeLabel}
            </span>
          )}
        </div>
      </div>
      {typeof bpm === 'number' && bpm > 0 && (
        <span className="text-xs tabular-nums font-mono opacity-60 shrink-0">
          {bpm} bpm
        </span>
      )}
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider">{label}</p>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors truncate ${
              value === opt.id
                ? 'bg-primary text-primary-content font-semibold'
                : 'bg-base-content/5 hover:bg-base-content/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TransitionEditor({
  fromTrack,
  toTrack,
  fromIndex,
  fromBpm,
  toBpm,
  fromBeatOffsetMs,
  toBeatOffsetMs,
  initialConfig,
  onSave,
  onClose,
}: Props) {
  const [config, setConfig] = useState<TransitionConfig>(initialConfig);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Approximate overlap fraction: bars × barDuration / totalVisible
  const avgBpm = (fromBpm && fromBpm > 0 ? fromBpm : toBpm && toBpm > 0 ? toBpm : 120);
  const barSec = 60 / avgBpm * 4; // seconds per bar
  const fadeWindow = config.bars * barSec;
  
  const ZOOM_LEVELS = [5, 10, 15, 30, 60];
  const [visibleSec, setVisibleSec] = useState<number>(30); // we show 5s to 60s of context

  const handleZoomIn = () => {
    setVisibleSec((prev) => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      return idx > 0 ? ZOOM_LEVELS[idx - 1] : prev;
    });
  };

  const handleZoomOut = () => {
    setVisibleSec((prev) => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      return idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : prev;
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (e.deltaY < 0) {
      handleZoomIn();
    } else if (e.deltaY > 0) {
      handleZoomOut();
    }
  };

  const durationA = fromTrack.duration || 180;
  const durationB = toTrack.duration || 180;

  const defaultOutPoint = durationA - fadeWindow;
  const defaultInPoint = (toBeatOffsetMs !== undefined) ? (toBeatOffsetMs / 1000) : 0;

  const [outPoint, setOutPoint] = useState<number>(() => {
    return initialConfig.outPoint !== undefined ? initialConfig.outPoint : defaultOutPoint;
  });
  const [inPoint, setInPoint] = useState<number>(() => {
    return initialConfig.inPoint !== undefined ? initialConfig.inPoint : defaultInPoint;
  });

  const [hasManuallyDraggedOut, setHasManuallyDraggedOut] = useState(initialConfig.outPoint !== undefined);
  const [hasManuallyDraggedIn, setHasManuallyDraggedIn] = useState(initialConfig.inPoint !== undefined);

  // Update outPoint when bars/fadeWindow changes, but only if the user hasn't manually dragged it.
  useEffect(() => {
    if (!hasManuallyDraggedOut) {
      setOutPoint(durationA - fadeWindow);
    }
  }, [fadeWindow, durationA, hasManuallyDraggedOut]);

  // Drag-and-drop state
  const [dragState, setDragState] = useState<{
    active: 'from' | 'to' | null;
    startX: number;
    initialVal: number;
  }>({ active: null, startX: 0, initialVal: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const isTopHalf = y < rect.height / 2;

    setDragState({
      active: isTopHalf ? 'from' : 'to',
      startX: e.clientX,
      initialVal: isTopHalf ? outPoint : inPoint,
    });
    
    if (isTopHalf) {
      setHasManuallyDraggedOut(true);
    } else {
      setHasManuallyDraggedIn(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const y = touch.clientY - rect.top;
    const isTopHalf = y < rect.height / 2;

    setDragState({
      active: isTopHalf ? 'from' : 'to',
      startX: touch.clientX,
      initialVal: isTopHalf ? outPoint : inPoint,
    });
    
    if (isTopHalf) {
      setHasManuallyDraggedOut(true);
    } else {
      setHasManuallyDraggedIn(true);
    }
  };

  // Global mousemove/mouseup and touchmove/touchend listeners
  useEffect(() => {
    if (!dragState.active) return;

    const handleMove = (clientX: number, shiftKey: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const W = canvas.offsetWidth;
      const deltaX = clientX - dragState.startX;
      const deltaSec = (deltaX / W) * visibleSec;
      
      const shouldSnap = !shiftKey; // Hold Shift key to bypass snapping
      
      if (dragState.active === 'from') {
        let newVal = dragState.initialVal - deltaSec;
        newVal = Math.max(0, Math.min(newVal, durationA - fadeWindow));
        
        if (shouldSnap && fromBpm && fromBpm > 0) {
          newVal = snapToBeat(newVal, fromBpm, fromBeatOffsetMs || 0);
        }
        
        setOutPoint(newVal);
      } else {
        let newVal = dragState.initialVal - deltaSec;
        newVal = Math.max(0, Math.min(newVal, durationB - fadeWindow));
        
        if (shouldSnap && toBpm && toBpm > 0) {
          newVal = snapToBeat(newVal, toBpm, toBeatOffsetMs || 0);
        }
        
        setInPoint(newVal);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.shiftKey);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        handleMove(touch.clientX, false); // No shift-key on touch
      }
    };

    const handleEnd = () => {
      setDragState({ active: null, startX: 0, initialVal: 0 });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragState, visibleSec, durationA, durationB, fadeWindow, fromBpm, fromBeatOffsetMs, toBpm, toBeatOffsetMs]);

  // Prevent default scroll on wheel over canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventDefaultWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    canvas.addEventListener('wheel', preventDefaultWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', preventDefaultWheel);
    };
  }, []);

  // Redraw canvas whenever points or properties change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(() => {
      drawWaveform(
        canvas,
        fromTrack,
        toTrack,
        outPoint,
        inPoint,
        fadeWindow,
        visibleSec,
        fromBpm,
        fromBeatOffsetMs,
        toBpm,
        toBeatOffsetMs,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [fromTrack, toTrack, outPoint, inPoint, fadeWindow, visibleSec, fromBpm, fromBeatOffsetMs, toBpm, toBeatOffsetMs]);

  // Redraw on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      drawWaveform(
        canvas,
        fromTrack,
        toTrack,
        outPoint,
        inPoint,
        fadeWindow,
        visibleSec,
        fromBpm,
        fromBeatOffsetMs,
        toBpm,
        toBeatOffsetMs,
      );
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [fromTrack, toTrack, outPoint, inPoint, fadeWindow, visibleSec, fromBpm, fromBeatOffsetMs, toBpm, toBeatOffsetMs]);

  const patch = (partial: Partial<TransitionConfig>) =>
    setConfig((c) => ({ ...c, ...partial }));

  const handleSave = () => {
    onSave(fromIndex, {
      ...config,
      outPoint,
      inPoint,
    });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-stretch justify-center sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-h-[96vh] sm:max-w-6xl bg-base-100 sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-base-content/10 bg-base-100 z-10">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm gap-1"
          >
            <X size={14} />
            Cancel
          </button>
          <div className="text-center">
            <span className="text-sm font-bold">Edit transition</span>
            <span className="badge badge-xs badge-primary badge-outline ml-1.5">beta</span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary btn-sm gap-1"
          >
            <Save size={14} />
            Save
          </button>
        </div>

        {/* Waveform workspace — grows to fill all available height */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Track A (outgoing) */}
          <TrackRow
            track={fromTrack}
            bpm={fromBpm}
            side="from"
            timeLabel={`Mix-out: ${formatTime(outPoint)}`}
          />

          {/* Dual waveform — fills remaining vertical space */}
          <div className="relative group bg-black flex-1 min-h-[220px]">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onWheel={handleWheel}
              className="absolute inset-0 w-full h-full cursor-ew-resize"
              style={{ display: 'block' }}
            />
            <div className="absolute top-2 left-3 text-[10px] text-white/40 pointer-events-none uppercase tracking-wider font-bold">
              Outgoing Track
            </div>
            <div className="absolute bottom-2 left-3 text-[10px] text-white/40 pointer-events-none uppercase tracking-wider font-bold">
              Incoming Track
            </div>
            <div className="absolute top-2 right-3 text-[9px] text-white/30 pointer-events-none font-mono">
              {fromBpm ? `${fromBpm} BPM` : 'No grid'}
            </div>
            <div className="absolute bottom-2 right-3 text-[9px] text-white/30 pointer-events-none font-mono">
              {toBpm ? `${toBpm} BPM` : 'No grid'}
            </div>
            {/* Zoom controls — always visible so they're discoverable */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10">
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={visibleSec === 5}
                className="btn btn-circle btn-sm bg-black/60 hover:bg-black/80 text-white border-white/10 disabled:opacity-30 disabled:pointer-events-none"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={visibleSec === 60}
                className="btn btn-circle btn-sm bg-black/60 hover:bg-black/80 text-white border-white/10 disabled:opacity-30 disabled:pointer-events-none"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
            </div>
            {/* Zoom scale label indicator */}
            <div className="absolute right-14 top-1/2 -translate-y-1/2 pointer-events-none bg-black/70 text-white/80 px-2 py-0.5 rounded text-[9px] font-mono border border-white/5">
              {visibleSec}s view
            </div>
            {/* Instructions hint */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="text-[10px] text-white/50 bg-black/60 px-2.5 py-1 rounded-lg border border-white/5 text-center whitespace-nowrap">
                Drag to align beats · Scroll / ± to Zoom · Hold Shift to bypass snapping
              </span>
            </div>
          </div>

          {/* Track B (incoming) */}
          <TrackRow
            track={toTrack}
            bpm={toBpm}
            side="to"
            timeLabel={`Mix-in: ${formatTime(inPoint)}`}
          />
        </div>

        {/* Controls — horizontal toolbar so they don't steal height from the waveform */}
        <div className="shrink-0 border-t border-base-content/10 bg-base-100 px-4 py-3 flex flex-col lg:flex-row lg:items-start gap-4 overflow-y-auto">
          {/* Transition length */}
          <div className="lg:flex-1 lg:min-w-[220px] space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider">
                Transition length
              </p>
              {(hasManuallyDraggedOut || hasManuallyDraggedIn) && (
                <button
                  type="button"
                  onClick={() => {
                    setOutPoint(defaultOutPoint);
                    setInPoint(defaultInPoint);
                    setHasManuallyDraggedOut(false);
                    setHasManuallyDraggedIn(false);
                  }}
                  className="text-[10px] text-primary hover:underline font-bold"
                >
                  Reset alignment
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {BARS_OPTIONS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => patch({ bars: b })}
                  className={`flex-1 py-1.5 rounded-xl text-sm font-semibold transition-colors border ${
                    config.bars === b
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-base-content/10 hover:border-base-content/30'
                  }`}
                >
                  {b} {b === 1 ? 'bar' : 'bars'}
                </button>
              ))}
            </div>
          </div>

          {/* Volume / EQ / Effects */}
          <div className="grid grid-cols-3 gap-3 lg:flex-[2]">
            <OptionGroup
              label="Volume"
              options={VOLUME_OPTIONS}
              value={config.volume}
              onChange={(v) => patch({ volume: v })}
            />
            <OptionGroup
              label="EQ"
              options={EQ_OPTIONS}
              value={config.eq}
              onChange={(v) => patch({ eq: v })}
            />
            <OptionGroup
              label="Effects"
              options={EFFECTS_OPTIONS}
              value={config.effects}
              onChange={(v) => patch({ effects: v })}
            />
          </div>

          {/* Preset type */}
          <div className="lg:flex-1 lg:min-w-[220px] space-y-2 pb-safe">
            <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider">
              Type
            </p>
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => patch({ preset: p.id })}
                  className={`flex-1 py-1.5 rounded-xl text-sm font-semibold transition-colors border ${
                    config.preset === p.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-base-content/10 hover:border-base-content/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
