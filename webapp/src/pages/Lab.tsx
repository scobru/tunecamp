import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Disc3, Play, Pause, SkipForward, SkipBack, Square, Music, Volume2, Shuffle, ListMusic, Activity } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import API from '../services/api';
import { usePlayerStore } from '../stores/usePlayerStore';
import { DjEngine, type DjEngineState, type DjTrack, type DjPreset } from '../lib/dj/DjEngine';
import type { Playlist, Track } from '../types';
import { formatDuration } from '../utils/format';
import { detectBeatInfoFromUrl } from '../utils/bpm';
import { notify } from '../utils/notify';

/**
 * Build a Web-Audio-decodable stream URL for a track, mirroring the lossless→mp3
 * and remote-proxy handling in PlayerBar.
 */
function buildStreamSrc(track: Track): string {
  const isLosslessFormat =
    track.format && ['wav', 'lossless'].includes(track.format.toLowerCase());
  const isLosslessExt = track.filename && track.filename.toLowerCase().endsWith('.wav');
  const forceMp3 = !track.streamUrl && (isLosslessFormat || isLosslessExt);

  let src = API.getStreamUrl(track.streamUrl || track.id, forceMp3 ? 'mp3' : undefined);

  if (src.startsWith('http')) {
    try {
      const obj = new URL(src);
      if (obj.origin !== window.location.origin) {
        src = `/api/proxy/stream?url=${encodeURIComponent(src)}`;
      }
    } catch {
      /* leave as-is */
    }
  }
  return src;
}

function toDjTrack(track: Track): DjTrack {
  return {
    id: track.id,
    title: track.title,
    artistName: track.artistName || track.artist_name,
    src: buildStreamSrc(track),
    coverUrl:
      track.coverImage ||
      track.coverUrl ||
      (track.albumId ? API.getAlbumCoverUrl(track.albumId) : '') ||
      (track.id ? API.getTrackCoverUrl(track.id) : ''),
    duration: track.duration,
  };
}

const DEFAULT_STATE: DjEngineState = {
  isPlaying: false,
  currentIndex: -1,
  currentTrack: null,
  nextTrack: null,
  position: 0,
  duration: 0,
  isCrossfading: false,
  ended: false,
  preset: 'fade',
  volume: 1,
  beatSync: true,
};

const PRESETS: { id: DjPreset; label: string; description: string }[] = [
  {
    id: 'fade',
    label: 'Fade',
    description: 'Equal-power crossfade with bass-swap — outgoing lows fade out as incoming lows rise in.',
  },
  {
    id: 'rise',
    label: 'Rise',
    description: 'Incoming track sweeps up from high frequencies down — materialises from the top of the spectrum.',
  },
  {
    id: 'cut',
    label: 'Cut',
    description: 'Hard cut on the beat with minimal overlap (~0.3 s). Best for tracks at similar energy.',
  },
];

/** Small BPM badge: shows the detected tempo, a spinner while detecting, or a
 *  click-to-analyse button when the BPM is still unknown. */
const BpmChip = ({
  value,
  onAnalyze,
}: {
  value: number | 'loading' | undefined;
  onAnalyze?: () => void;
}) => {
  if (value === 'loading') {
    return <span className="loading loading-spinner loading-xs opacity-50 shrink-0" />;
  }
  if (typeof value === 'number' && value > 0) {
    return (
      <span className="badge badge-ghost badge-sm gap-1 tabular-nums shrink-0">
        <Activity size={10} /> {value}
      </span>
    );
  }
  if (value === 0) {
    return <span className="text-[10px] opacity-30 w-6 text-center shrink-0">—</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAnalyze?.();
      }}
      className="btn btn-ghost btn-xs px-1.5 opacity-50 hover:opacity-100 shrink-0"
      title="Detect BPM"
      aria-label="Detect BPM"
    >
      <Activity size={13} />
    </button>
  );
};

const DjMixExperiment = () => {
  const engineRef = useRef<DjEngine | null>(null);
  const [state, setState] = useState<DjEngineState>(DEFAULT_STATE);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [crossfade, setCrossfade] = useState(8);
  const [loading, setLoading] = useState(false);
  const [trackCount, setTrackCount] = useState(0);
  const [djTracks, setDjTracks] = useState<DjTrack[]>([]);
  // Client-side BPM per track id: number = detected, 0 = unknown/failed, 'loading' = in flight.
  const [bpms, setBpms] = useState<Record<string, number | 'loading'>>({});
  const bpmRef = useRef<Record<string, number | 'loading'>>({});

  // Lazily create the engine and subscribe to its state.
  useEffect(() => {
    const engine = new DjEngine();
    engineRef.current = engine;
    const unsub = engine.subscribe(setState);
    return () => {
      unsub();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Keep the engine's crossfade length in sync with the slider.
  useEffect(() => {
    engineRef.current?.setCrossfade(crossfade);
  }, [crossfade]);

  // Lazily detect BPM for a track, fully client-side (Web Audio). Cached by id.
  const analyzeBpm = useCallback(async (track: DjTrack | null) => {
    if (!track) return;
    const key = String(track.id);
    if (bpmRef.current[key] !== undefined) return; // already known or in flight
    bpmRef.current[key] = 'loading';
    setBpms({ ...bpmRef.current });
    const info = await detectBeatInfoFromUrl(track.src);
    bpmRef.current[key] = info?.bpm ?? 0;
    setBpms({ ...bpmRef.current });
    // Feed tempo + beat phase to the engine so it can beat-align transitions.
    if (info?.bpm) {
      engineRef.current?.setBeatInfo(track.id, info.bpm, info.beatOffsetMs);
    }
  }, []);

  // Auto-analyse the current and upcoming track — the pair that matters for the
  // next transition. Other tracks are analysed on demand from the queue.
  useEffect(() => {
    void analyzeBpm(state.currentTrack);
    void analyzeBpm(state.nextTrack);
  }, [state.currentTrack?.id, state.nextTrack?.id, analyzeBpm]);

  useEffect(() => {
    API.getPlaylists()
      .then((pls) => setPlaylists(pls || []))
      .catch((e) => console.error('[LAB] failed to load playlists', e));
  }, []);

  const loadAndStart = async () => {
    const engine = engineRef.current;
    if (!engine || !selectedId) return;
    setLoading(true);
    try {
      const playlist = await API.getPlaylist(selectedId);
      const tracks = (playlist.tracks || []).filter((t) => t && (t.id || t.streamUrl));
      if (!tracks.length) {
        notify.error('This playlist has no playable tracks.');
        return;
      }
      // DJ mode owns the audio output — stop the main player to avoid double audio.
      usePlayerStore.getState().setIsPlaying(false);

      const mapped = tracks.map(toDjTrack);
      bpmRef.current = {};
      setBpms({});
      setTrackCount(mapped.length);
      setDjTracks(mapped);
      engine.setCrossfade(crossfade);
      engine.load(mapped, 0);
      await engine.play();
    } catch (e) {
      console.error('[LAB] failed to start DJ mix', e);
      notify.error(e, 'Failed to start the DJ mix');
    } finally {
      setLoading(false);
    }
  };

  const hasMix = state.currentIndex >= 0 && trackCount > 0;
  const progressPct =
    state.duration > 0 ? Math.min(100, (state.position / state.duration) * 100) : 0;

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => String(p.id) === selectedId),
    [playlists, selectedId],
  );

  const currentPreset = PRESETS.find((p) => p.id === state.preset) ?? PRESETS[0];

  // Shuffle only the upcoming tracks — the current track keeps playing.
  const shuffleUpcoming = () => {
    const engine = engineRef.current;
    if (!engine || state.currentIndex < 0) return;
    const head = djTracks.slice(0, state.currentIndex + 1);
    const tail = djTracks.slice(state.currentIndex + 1);
    for (let i = tail.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tail[i], tail[j]] = [tail[j], tail[i]];
    }
    const reordered = [...head, ...tail];
    setDjTracks(reordered);
    engine.setTracks(reordered, state.currentIndex);
  };

  return (
    <div className="card bg-base-200 border border-base-content/5">
      <div className="card-body p-6 lg:p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Disc3
              size={24}
              className={state.isPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}
            />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
              DJ Mix
              <span className="badge badge-sm badge-primary badge-outline font-bold">beta</span>
            </h3>
            <p className="text-sm opacity-60 mt-1">
              Turn a playlist into a continuous, gapless DJ set with crossfades
              between tracks.{' '}
              <span className="opacity-80">Local-library playlists work best.</span>
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="form-control">
            <span className="label-text text-xs font-bold opacity-60 mb-1">Source playlist</span>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={state.isPlaying}
            >
              <option value="">Choose a playlist…</option>
              {playlists.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} ({p.trackCount} tracks)
                </option>
              ))}
            </select>
          </label>

          <label className="form-control">
            <span className="label-text text-xs font-bold opacity-60 mb-1">
              Crossfade: {state.preset === 'cut' ? '0.3s (auto)' : `${crossfade}s`}
            </span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={crossfade}
              onChange={(e) => setCrossfade(parseInt(e.target.value, 10))}
              className="range range-primary range-sm mt-2"
              disabled={state.preset === 'cut'}
            />
          </label>
        </div>

        {/* Preset selector */}
        <div className="space-y-2">
          <span className="label-text text-xs font-bold opacity-60">Transition preset</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const active = state.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => engineRef.current?.setPreset(p.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-base-content/10 bg-base-300/30 hover:border-base-content/30'
                  }`}
                >
                  <span className={`text-sm font-bold block ${active ? 'text-primary' : ''}`}>
                    {p.label}
                  </span>
                  <span className="text-[11px] opacity-60 mt-0.5 block leading-tight">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Beat sync */}
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="label-text text-xs font-bold opacity-60 flex items-center gap-1.5">
            <Activity size={12} />
            Beat sync
            <span className="font-normal opacity-70">
              — snap transitions to detected BPM &amp; beat grid
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm shrink-0"
            checked={state.beatSync}
            onChange={(e) => engineRef.current?.setBeatSync(e.target.checked)}
          />
        </label>

        {/* Volume */}
        <label className="form-control">
          <span className="label-text text-xs font-bold opacity-60 mb-1 flex items-center gap-1">
            <Volume2 size={12} />
            Volume: {Math.round(state.volume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.volume}
            onChange={(e) => engineRef.current?.setVolume(parseFloat(e.target.value))}
            className="range range-primary range-xs"
          />
        </label>

        {/* Now playing */}
        {hasMix && state.currentTrack && (
          <div className="rounded-2xl bg-base-300/50 border border-base-content/5 p-4 space-y-3">
            <div className="flex items-center gap-3">
              {state.currentTrack.coverUrl ? (
                <img
                  src={state.currentTrack.coverUrl}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-base-300 flex items-center justify-center">
                  <Music className="opacity-20" size={20} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold truncate">{state.currentTrack.title}</p>
                  <BpmChip
                    value={bpms[String(state.currentTrack.id)]}
                    onAnalyze={() => void analyzeBpm(state.currentTrack)}
                  />
                  {state.isCrossfading && (
                    <span className="badge badge-xs badge-primary animate-pulse">
                      {currentPreset.label}…
                    </span>
                  )}
                </div>
                <p className="text-sm opacity-60 truncate">
                  {state.currentTrack.artistName || 'Unknown artist'}
                </p>
              </div>
              <span className="text-xs opacity-50 tabular-nums shrink-0">
                {state.currentIndex + 1} / {trackCount}
              </span>
            </div>

            <div className="relative w-full h-4 flex items-center cursor-pointer">
              <div className="w-full h-1.5 bg-base-content/10 rounded-full overflow-hidden pointer-events-none">
                <div
                  className="h-full bg-primary/60 rounded-full transition-[width] duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progressPct}
                onChange={(e) => engineRef.current?.seek(parseFloat(e.target.value) / 100)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                aria-label="Seek"
              />
            </div>
            <div className="flex justify-between text-[11px] opacity-50 tabular-nums">
              <span>{formatDuration(state.position)}</span>
              <span>{formatDuration(state.duration)}</span>
            </div>

            {state.nextTrack && (
              <p className="text-xs opacity-50 truncate">
                <span className="font-bold">Up next:</span> {state.nextTrack.title}
                {state.nextTrack.artistName ? ` — ${state.nextTrack.artistName}` : ''}
              </p>
            )}
            {state.ended && (
              <p className="text-xs text-primary font-bold">Mix finished 🎉</p>
            )}
          </div>
        )}

        {/* Transport */}
        <div className="flex items-center gap-3">
          {!hasMix ? (
            <button
              className="btn btn-primary"
              onClick={loadAndStart}
              disabled={!selectedId || loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
              Start DJ Mix
            </button>
          ) : (
            <>
              <button
                className="btn btn-ghost btn-circle"
                onClick={() => engineRef.current?.skipPrev()}
                aria-label="Previous track"
              >
                <SkipBack size={18} fill="currentColor" />
              </button>
              <button
                className="btn btn-primary btn-circle"
                onClick={() => engineRef.current?.toggle()}
                aria-label={state.isPlaying ? 'Pause' : 'Play'}
              >
                {state.isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </button>
              <button
                className="btn btn-ghost btn-circle"
                onClick={() => engineRef.current?.skipNext()}
                aria-label="Skip to next"
                disabled={!state.nextTrack}
              >
                <SkipForward size={18} fill="currentColor" />
              </button>
              <button
                className="btn btn-outline btn-sm gap-1"
                onClick={() => engineRef.current?.mixNow()}
                aria-label="Mix into next track now"
                disabled={!state.nextTrack || state.isCrossfading}
              >
                <Disc3 size={14} /> Mix now
              </button>
              <button
                className="btn btn-ghost btn-circle text-error"
                onClick={() => {
                  engineRef.current?.stop();
                  setTrackCount(0);
                  setDjTracks([]);
                }}
                aria-label="Stop"
              >
                <Square size={18} fill="currentColor" />
              </button>
              {selectedPlaylist && (
                <span className="text-xs opacity-50 ml-auto truncate">
                  {selectedPlaylist.name}
                </span>
              )}
            </>
          )}
        </div>

        {/* Mix queue */}
        {hasMix && djTracks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-text text-xs font-bold opacity-60 flex items-center gap-1">
                <ListMusic size={12} /> Queue ({djTracks.length})
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1"
                onClick={shuffleUpcoming}
                disabled={state.currentIndex >= djTracks.length - 1}
                title="Shuffle upcoming tracks"
              >
                <Shuffle size={12} /> Shuffle next
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-base-content/5 divide-y divide-base-content/5">
              {djTracks.map((t, i) => {
                const isCurrent = i === state.currentIndex;
                const isPast = i < state.currentIndex;
                return (
                  <div
                    key={`${t.id}-${i}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => engineRef.current?.jumpTo(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        engineRef.current?.jumpTo(i);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-primary/10'
                        : 'hover:bg-base-content/5'
                    } ${isPast ? 'opacity-40' : ''}`}
                  >
                    <span className="text-[11px] tabular-nums w-6 shrink-0 opacity-50 text-right">
                      {isCurrent ? (
                        <Disc3
                          size={13}
                          className={`text-primary ${state.isPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}`}
                        />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${isCurrent ? 'font-bold text-primary' : ''}`}>
                        {t.title}
                      </p>
                      <p className="text-[11px] opacity-50 truncate">
                        {t.artistName || 'Unknown artist'}
                      </p>
                    </div>
                    <BpmChip value={bpms[String(t.id)]} onAnalyze={() => void analyzeBpm(t)} />
                    {typeof t.duration === 'number' && t.duration > 0 && (
                      <span className="text-[11px] opacity-40 tabular-nums shrink-0 w-10 text-right">
                        {formatDuration(t.duration)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Lab = () => {
  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <PageHeader
        title="LAB"
        subtitle="Experimental features — rough edges expected, may change or disappear"
        icon={FlaskConical}
        iconColor="text-primary"
      />

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="alert bg-base-200 border border-base-content/5 text-sm">
          <FlaskConical size={18} className="text-primary shrink-0" />
          <span className="opacity-70">
            These are early experiments. They run entirely in your browser and don't
            affect normal playback. See the{' '}
            <a
              href="https://github.com/scobru/tunecamp/blob/main/docs/auto-mix-dj.md"
              target="_blank"
              rel="noreferrer"
              className="link link-primary"
            >
              design doc
            </a>{' '}
            for what's planned next.
          </span>
        </div>

        <DjMixExperiment />
      </div>
    </div>
  );
};

export default Lab;
