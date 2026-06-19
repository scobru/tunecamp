import { useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Disc3, Play, Pause, SkipForward, Square, Music, Volume2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import API from '../services/api';
import { usePlayerStore } from '../stores/usePlayerStore';
import { DjEngine, type DjEngineState, type DjTrack, type DjPreset } from '../lib/dj/DjEngine';
import type { Playlist, Track } from '../types';
import { formatDuration } from '../utils/format';
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

const DjMixExperiment = () => {
  const engineRef = useRef<DjEngine | null>(null);
  const [state, setState] = useState<DjEngineState>(DEFAULT_STATE);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [crossfade, setCrossfade] = useState(8);
  const [loading, setLoading] = useState(false);
  const [trackCount, setTrackCount] = useState(0);

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

      setTrackCount(tracks.length);
      engine.setCrossfade(crossfade);
      engine.load(tracks.map(toDjTrack), 0);
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
                className="btn btn-ghost btn-circle text-error"
                onClick={() => {
                  engineRef.current?.stop();
                  setTrackCount(0);
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
