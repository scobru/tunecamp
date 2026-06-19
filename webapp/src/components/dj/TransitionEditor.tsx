import { useEffect, useRef, useState } from 'react';
import { X, Save } from 'lucide-react';
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
  initialConfig: TransitionConfig;
  onSave: (fromIndex: number, config: TransitionConfig) => void;
  onClose: () => void;
}

// ─── Procedural waveform ──────────────────────────────────────────────────────

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

function drawWaveform(
  canvas: HTMLCanvasElement,
  outId: string | number,
  inId: string | number,
  overlapFrac: number,
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
  const outBars = makeWaveform(outId, count);
  const inBars = makeWaveform(inId, count);

  // overlap zone: last overlapFrac of outgoing, first overlapFrac of incoming
  const overlapX = (1 - overlapFrac) * W;

  // Dark background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  // Draw outgoing track (top half — bars grow upward from center)
  for (let i = 0; i < count; i++) {
    const x = i * (BAR_W + GAP);
    const pos = i / count;
    const barH = Math.max(2, outBars[i] * (midY - 4) * 0.9);
    const y = midY - barH;
    const inOverlap = pos >= 1 - overlapFrac;
    ctx.fillStyle = inOverlap ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
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
    const barH = Math.max(2, inBars[i] * (midY - 4) * 0.9);
    const y = midY;
    const inOverlap = pos < overlapFrac;
    ctx.fillStyle = inOverlap ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
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
  grad.addColorStop(0, 'rgba(99,202,183,0.04)');
  grad.addColorStop(0.5, 'rgba(99,202,183,0.12)');
  grad.addColorStop(1, 'rgba(99,202,183,0.04)');
  ctx.fillStyle = grad;
  ctx.fillRect(overlapX, 0, W - overlapX, H);

  // Left edge of overlap zone
  ctx.strokeStyle = 'rgba(99,202,183,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(overlapX, 0);
  ctx.lineTo(overlapX, H);
  ctx.stroke();

  // Green vertical "mix point" line (at end of outgoing track)
  ctx.strokeStyle = 'rgba(74,222,128,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W - 1, 0);
  ctx.lineTo(W - 1, H);
  ctx.stroke();

  // Center divider line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(W, midY);
  ctx.stroke();

  // Drag handle (black square at center of overlap zone)
  const handleX = overlapX + (W - overlapX) / 2;
  const hw = 18;
  const hh = 14;
  ctx.fillStyle = 'rgba(20,20,20,0.9)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(handleX - hw / 2, midY - hh / 2, hw, hh, 3);
  } else {
    ctx.rect(handleX - hw / 2, midY - hh / 2, hw, hh);
  }
  ctx.fill();
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
}: {
  track: DjTrack;
  bpm?: number;
  side: 'from' | 'to';
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
        <p className="text-xs opacity-50 truncate">{track.artistName || 'Unknown artist'}</p>
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
  initialConfig,
  onSave,
  onClose,
}: Props) {
  const [config, setConfig] = useState<TransitionConfig>(initialConfig);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Approximate overlap fraction: bars × barDuration / totalVisible
  const avgBpm = (fromBpm && fromBpm > 0 ? fromBpm : toBpm && toBpm > 0 ? toBpm : 120);
  const barSec = 60 / avgBpm * 4; // seconds per bar
  const visibleSec = 30; // we show ~30s of waveform context
  const overlapFrac = Math.min(0.7, (config.bars * barSec) / visibleSec);

  // Redraw whenever bars or tracks change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Small delay so the canvas has been laid out
    const raf = requestAnimationFrame(() => {
      drawWaveform(canvas, fromTrack.id, toTrack.id, overlapFrac);
    });
    return () => cancelAnimationFrame(raf);
  }, [fromTrack.id, toTrack.id, overlapFrac]);

  // Redraw on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      drawWaveform(canvas, fromTrack.id, toTrack.id, overlapFrac);
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [fromTrack.id, toTrack.id, overlapFrac]);

  const patch = (partial: Partial<TransitionConfig>) =>
    setConfig((c) => ({ ...c, ...partial }));

  const handleSave = () => {
    onSave(fromIndex, config);
    onClose();
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full sm:max-w-md bg-base-100 sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxHeight: '96vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 sticky top-0 bg-base-100 z-10">
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

        {/* Track A (outgoing) */}
        <TrackRow track={fromTrack} bpm={fromBpm} side="from" />

        {/* Dual waveform */}
        <div className="relative bg-black mx-0" style={{ height: 160 }}>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ display: 'block' }}
          />
        </div>

        {/* Track B (incoming) */}
        <TrackRow track={toTrack} bpm={toBpm} side="to" />

        {/* Bar count selector */}
        <div className="px-4 py-3 border-t border-base-content/10">
          <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider mb-2">
            Transition length
          </p>
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
        <div className="px-4 py-3 border-t border-base-content/10 grid grid-cols-3 gap-3">
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
        <div className="px-4 py-3 border-t border-base-content/10 pb-safe">
          <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider mb-2">
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
  );
}
