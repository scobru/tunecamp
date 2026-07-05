import { useRef, useEffect, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayerStore } from "../../stores/usePlayerStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useShallow } from "zustand/react/shallow";
import API from "../../services/api";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Mic2,
  ListMusic,
  Shuffle,
  Repeat,
  Music,
  Radio,
  Download,
  Maximize2,
  MoreVertical,
  User,
  Disc,
  AudioLines
} from "lucide-react";
import clsx from "clsx";
import * as ColorThiefReactModule from "color-thief-react";
import { LyricsPanel } from "./LyricsPanel";
import { QueuePanel } from "./QueuePanel";
import { PlayerCanvas } from "./PlayerCanvas";
import { useConfigStore } from "../../stores/useConfigStore";
import { formatDuration } from "../../utils/format";
import { notify } from "../../utils/notify";
import { useNowPlayingHeartbeat } from "../../hooks/useNowPlayingHeartbeat";
import { fixRelativeUrl } from '../../utils/url';

// Robust interop for color-thief-react which has inconsistent exports across versions/builds
const ColorThiefReact: any = ColorThiefReactModule;
const useColor = ColorThiefReact.useColor || ColorThiefReact.default?.useColor;

const PlayerBackground = ({ coverUrl }: { coverUrl: string }) => {
  const setDominantColor = usePlayerStore(state => state.setDominantColor);
  
  // `useColor` is a stable module-level binding (the color-thief interop is
  // resolved once at import), so the condition never changes between renders —
  // hook call order stays consistent. Safe despite the rules-of-hooks lint.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const colorResult = useColor ? useColor(coverUrl || "", "hex", {
    crossOrigin: "anonymous",
    quality: 10,
  }) : { data: null };

  const dominantColor = colorResult?.data;

  useEffect(() => {
    if (dominantColor) {
      setDominantColor(dominantColor);
    }
  }, [dominantColor, setDominantColor]);

  return (
    <div 
      className="absolute inset-0 transition-colors duration-1000 pointer-events-none"
      style={{ backgroundColor: dominantColor ? `${dominantColor}40` : "oklch(var(--b2) / 0.4)" }}
    />
  );
};

export const PlayerBar = () => {
  const { cacheBuster } = useConfigStore();
  useNowPlayingHeartbeat();
  const {
    currentTime,
    progress,
    duration,
  } = usePlayerStore(useShallow(state => ({
    progress: state.progress,
    currentTime: state.currentTime,
    duration: state.duration,
  })));

  const {
    currentTrack,
    isPlaying,
    volume,
    togglePlay,
    next,
    prev,
    setIsPlaying,
    setProgress,
    setVolume,
    crossfadeSec,
    setCrossfade,
    isShuffled,
    repeatMode,
    isRadioMode,
    toggleShuffle,
    toggleRepeat,
    toggleRadio,
    isLyricsOpen,
    isCanvasOpen,
    toggleLyrics,
    toggleQueue,
    toggleCanvas,
  } = usePlayerStore(useShallow(state => ({
    currentTrack: state.currentTrack,
    isPlaying: state.isPlaying,
    volume: state.volume,
    togglePlay: state.togglePlay,
    next: state.next,
    prev: state.prev,
    setIsPlaying: state.setIsPlaying,
    setProgress: state.setProgress,
    setVolume: state.setVolume,
    crossfadeSec: state.crossfadeSec,
    setCrossfade: state.setCrossfade,
    isShuffled: state.isShuffled,
    repeatMode: state.repeatMode,
    isRadioMode: state.isRadioMode,
    toggleShuffle: state.toggleShuffle,
    toggleRepeat: state.toggleRepeat,
    toggleRadio: state.toggleRadio,
    isLyricsOpen: state.isLyricsOpen,
    isCanvasOpen: state.isCanvasOpen,
    toggleLyrics: state.toggleLyrics,
    toggleQueue: state.toggleQueue,
    toggleCanvas: state.toggleCanvas,
  })));

  const audioRef = useRef<HTMLAudioElement>(null);
  // Disposable second deck: plays the tail of the OUTGOING track while the main
  // deck advances to the next one, so a crossfade can overlap them. Only used
  // when crossfade is enabled; otherwise it stays idle and playback is unchanged.
  const fadeDeckRef = useRef<HTMLAudioElement>(null);
  const crossfadingRef = useRef(false);
  
  // Track seek/scrub state
  const [isSeeking, setIsSeeking] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const localProgressRef = useRef(0);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  const updateDragPosition = useCallback((clientX: number) => {
    if (!progressContainerRef.current || !duration) return;
    const rect = progressContainerRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newProgress = percent * 100;
    setLocalProgress(newProgress);
    localProgressRef.current = newProgress;
  }, [duration]);

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressContainerRef.current || !duration) return;
    setIsSeeking(true);
    updateDragPosition(e.clientX);
  };

  const handleProgressTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!progressContainerRef.current || !duration || e.touches.length === 0) return;
    setIsSeeking(true);
    updateDragPosition(e.touches[0].clientX);
  };

  useEffect(() => {
    if (!isSeeking) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateDragPosition(e.clientX);
    };

    const handleMouseUp = () => {
      setIsSeeking(false);
      if (audioRef.current && Number.isFinite(duration) && duration > 0) {
        const targetTime = (localProgressRef.current / 100) * duration;
        audioRef.current.currentTime = targetTime;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateDragPosition(e.touches[0].clientX);
      }
    };

    const handleTouchEnd = () => {
      setIsSeeking(false);
      if (audioRef.current && Number.isFinite(duration) && duration > 0) {
        const targetTime = (localProgressRef.current / 100) * duration;
        audioRef.current.currentTime = targetTime;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isSeeking, duration, updateDragPosition]);

  // Track if the pause/play was triggered by our own code to avoid event loops
  const isInternalChange = useRef(false);
  const lastTrackId = useRef<string | number | null>(null);

  // ─── Unified Audio Source and Playback Effect ────────────────────────
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;

    // 1. Determine Source URL
    const isLosslessFormat =
      currentTrack.format &&
      ["wav", "lossless"].includes(currentTrack.format.toLowerCase());
    const isLosslessExt =
      currentTrack.filename &&
      currentTrack.filename.toLowerCase().endsWith(".wav");
    const forceMp3 =
      !currentTrack.streamUrl && (isLosslessFormat || isLosslessExt);

    let newSrc = API.getStreamUrl(currentTrack.streamUrl || currentTrack.id, forceMp3 ? 'mp3' : undefined);
    
    // Remote absolute URL - check if needs proxy
    // We check if it starts with http to avoid double-proxying local /api paths that contain '://' (like ext: IDs)
    if (newSrc.startsWith('http')) {
        try {
            const streamUrlObj = new URL(newSrc);
            const isLocalOrigin = streamUrlObj.origin === window.location.origin;
            if (!isLocalOrigin) {
                newSrc = `/api/proxy/stream?url=${encodeURIComponent(newSrc)}`;
            }
        } catch {
            // If it's a broken absolute URL, try proxying anyway or leave as is
            console.warn("[Player] Invalid absolute stream URL:", newSrc);
        }
    }

    // 2. Update Source if changed
    const srcChanged = audio.src !== newSrc && !audio.src.endsWith(newSrc) && audio.src !== newSrc + "/";
    if (srcChanged) {
      isInternalChange.current = true;
      audio.src = newSrc;
      // When source changes, browser automatically pauses.
      // We don't want the onPause event to toggle the store's isPlaying to false.
    }

    // 3. Sync Play/Pause State
    if (isPlaying && audio.paused) {
      isInternalChange.current = true;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== "AbortError") {
            console.error("[Player] Playback failed:", err);
            isInternalChange.current = true;
            setIsPlaying(false);
          }
        });
      }
    } else if (!isPlaying && !audio.paused) {
      isInternalChange.current = true;
      audio.pause();
    }

    isInternalChange.current = false;
  }, [currentTrack?.id, isPlaying, setIsPlaying]); // Sensitive to track changes and play/pause state

  // ─── Event Listeners and Metadata ──────────────────────────────────────
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;

    const handlePlay = () => {
      if (!isInternalChange.current) {
        setIsPlaying(true);
      }
    };

    const handlePause = () => {
      // Only update store if the pause wasn't triggered by our own code (like track switching)
      if (!isInternalChange.current) {
        setIsPlaying(false);
      }
    };

    const updateTime = () => {
      const d = audio.duration && Number.isFinite(audio.duration) ? audio.duration : (currentTrack.duration || 0);
      setProgress(audio.currentTime, d);
    };

    const handleEnded = () => next();
    
    const syncDuration = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setProgress(audio.currentTime, audio.duration);
      }
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("loadedmetadata", syncDuration);

    // Reset progress on track change
    if (lastTrackId.current !== currentTrack.id) {
        setProgress(0, currentTrack.duration || 0);
        lastTrackId.current = currentTrack.id;
    }

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("loadedmetadata", syncDuration);
    };
  }, [currentTrack?.id, setIsPlaying, setProgress, next]);

  // Sync volume
  useEffect(() => {
    // Don't fight the crossfade ramp, which drives volume directly.
    if (audioRef.current && !crossfadingRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ─── Crossfade between consecutive tracks ───────────────────────────────
  // Near the end of the current track, hand its tail to the disposable deck
  // (kept audible) and start loading the next track on the main deck.  The
  // fade ramp only begins once the incoming track fires 'canplay', ensuring
  // a true overlap instead of a gap.  With crossfadeSec === 0 the effect is
  // inert and playback proceeds normally.
  useEffect(() => {
    const audio = audioRef.current;
    const deckB = fadeDeckRef.current;
    if (!audio || !deckB || !crossfadeSec || crossfadeSec <= 0) return;

    const onTime = () => {
      if (crossfadingRef.current) return;
      const st = usePlayerStore.getState();
      if (!st.isPlaying || st.repeatMode === 'one') return;
      // Only crossfade into a real next track already in the queue.
      if (st.queueIndex < 0 || st.queueIndex >= st.queue.length - 1) return;
      const dur = audio.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const remaining = dur - audio.currentTime;
      if (remaining > crossfadeSec) return;

      const targetVol = st.volume;
      const fadeDur = Math.max(0.5, Math.min(crossfadeSec, dur / 2, remaining));
      crossfadingRef.current = true;

      // 1. Continue the outgoing track on the disposable deck.
      try {
        deckB.src = audio.src;
        deckB.currentTime = audio.currentTime;
        deckB.volume = audio.volume;
        void deckB.play().catch(() => {});
      } catch { /* ignore */ }

      // 2. Pre-build the incoming track URL and load it on the main deck.
      const nextIndex = st.queueIndex + 1;
      const nextTrack = st.queue[nextIndex];

      const isLosslessFormat = nextTrack.format && ['wav', 'lossless'].includes(nextTrack.format.toLowerCase());
      const isLosslessExt = nextTrack.filename && nextTrack.filename.toLowerCase().endsWith('.wav');
      const forceMp3 = !nextTrack.streamUrl && (isLosslessFormat || isLosslessExt);
      let nextSrc = API.getStreamUrl(nextTrack.streamUrl || nextTrack.id, forceMp3 ? 'mp3' : undefined);
      if (nextSrc.startsWith('http')) {
        try {
          const u = new URL(nextSrc);
          if (u.origin !== window.location.origin) {
            nextSrc = `/api/proxy/stream?url=${encodeURIComponent(nextSrc)}`;
          }
        } catch { /* ignore */ }
      }

      // Set source directly on the audio element — the React effect will see
      // the same src and skip re-assigning it.
      audio.volume = 0;
      audio.src = nextSrc;

      // Advance the store so the UI (title/cover) updates immediately.
      st.next();

      // 3. Wait for the incoming track to be ready, then ramp.
      const startRamp = () => {
        void audio.play().catch(() => {});
        const start = performance.now();
        const step = () => {
          if (!crossfadingRef.current) return;
          const t = Math.min(1, (performance.now() - start) / (fadeDur * 1000));
          try { deckB.volume = Math.max(0, targetVol * (1 - t)); } catch { /* ignore */ }
          if (audioRef.current) audioRef.current.volume = Math.min(targetVol, targetVol * t);
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            try { deckB.pause(); deckB.removeAttribute('src'); deckB.load(); } catch { /* ignore */ }
            if (audioRef.current) audioRef.current.volume = targetVol;
            crossfadingRef.current = false;
          }
        };
        requestAnimationFrame(step);
      };

      // If the browser already has enough data (e.g. cached), start immediately.
      if (audio.readyState >= 3) {
        startRamp();
      } else {
        audio.addEventListener('canplay', startRamp, { once: true });
        // Safety timeout: if the buffer takes too long, start anyway after 2s.
        setTimeout(() => {
          audio.removeEventListener('canplay', startRamp);
          if (crossfadingRef.current) startRamp();
        }, 2000);
      }
    };

    audio.addEventListener('timeupdate', onTime);
    return () => audio.removeEventListener('timeupdate', onTime);
  }, [crossfadeSec]);

  // Keep the disposable deck in step with pause: never leave a tail playing
  // after the user pauses the main deck.
  useEffect(() => {
    if (!isPlaying && fadeDeckRef.current) {
      try { fadeDeckRef.current.pause(); } catch { /* ignore */ }
    }
  }, [isPlaying]);

  // Handle manual seek from waveform/progress bar
  const handleSeek = useCallback(
    (percent: number) => {
      if (audioRef.current) {
        const d = Number.isFinite(duration) && duration > 0 ? duration : audioRef.current.duration;
        if (Number.isFinite(d) && d > 0) {
          audioRef.current.currentTime = percent * d;
        }
      }
    },
    [duration],
  );

  // Allow other components (e.g. the full-screen PlayerCanvas waveform) to request
  // a seek, since the <audio> element lives here. They dispatch a `player:seek`
  // CustomEvent with `{ percent: 0..1 }`.
  useEffect(() => {
    const onSeek = (e: Event) => {
      const detail = (e as CustomEvent<{ percent: number }>).detail;
      if (detail && typeof detail.percent === "number") {
        handleSeek(Math.min(1, Math.max(0, detail.percent)));
      }
    };
    window.addEventListener("player:seek", onSeek);
    return () => window.removeEventListener("player:seek", onSeek);
  }, [handleSeek]);

  let coverUrl = currentTrack ? (
    currentTrack.coverImage ||
    currentTrack.coverUrl ||
    (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId, cacheBuster) : "") ||
    (currentTrack.id ? API.getTrackCoverUrl(currentTrack.id, cacheBuster) : "") ||
    (currentTrack.artistId ? API.getArtistCoverUrl(currentTrack.artistId, cacheBuster) : "")
  ) : "";

  // Fix relative paths that might be missing the root / or /api
  coverUrl = fixRelativeUrl(coverUrl);

  if (!currentTrack)
    return (
      <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-base-content/5 flex items-center justify-center text-sm opacity-50 z-50">
        Select a track to play
      </div>
    );

  const isAdminOrOwner = (useAuthStore.getState().user?.isAdmin || 
    (currentTrack.owner_id && String(currentTrack.owner_id) === String(useAuthStore.getState().user?.id)) ||
    (currentTrack.artistId && String(currentTrack.artistId) === String(useAuthStore.getState().user?.artistId)));

  const handleStarArtist = async () => {
    if (!currentTrack?.artistId && !currentTrack?.artistName) return;
    try {
        const id = currentTrack.artistId ? String(currentTrack.artistId) : `ext:artist:${currentTrack.artistName}`;
        await API.starArtist(id, { name: currentTrack.artistName });
        notify.success("Artist added to favorites!");
    } catch (e) {
        console.error(e);
        notify.error(e, "Failed to favorite artist");
    }
  };

  const handleStarAlbum = async () => {
    if (!currentTrack?.albumId && !currentTrack?.album_title) return;
    try {
        const id = currentTrack.albumId ? String(currentTrack.albumId) : `ext:album:${currentTrack.album_title}`;
        await API.starAlbum(id, { title: currentTrack.album_title, artist: currentTrack.artistName });
        notify.success("Album added to favorites!");
    } catch (e) {
        console.error(e);
        notify.error(e, "Failed to favorite album");
    }
  };

  const handleAddToPlaylist = () => {
    if (!useAuthStore.getState().isAuthenticated) {
      document.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }
    document.dispatchEvent(
      new CustomEvent("open-playlist-modal", { detail: { trackId: currentTrack.id } }),
    );
  };

  // The album page is the closest "track detail" surface: link there and let it
  // scroll to / highlight this track via ?track=. Falls back to plain text when
  // the playing item has no album (e.g. some external/network tracks).
  const albumDetailTarget = currentTrack.albumId
    ? `/albums/${(currentTrack as any).albumSlug || (currentTrack as any).album_slug || currentTrack.albumId}?track=${currentTrack.id}`
    : null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 h-24 backdrop-blur-3xl bg-base-100/60 border-t border-base-content/5 shadow-level-3 px-4 lg:px-8 flex items-center justify-between gap-4 z-50">
        <PlayerBackground coverUrl={coverUrl} />
        
        <audio
          ref={audioRef}
          className="hidden"
          onError={(e) => {
            console.error("[Player] Audio Element Error:", e.currentTarget.error);
          }}
        />
        {/* Disposable deck for crossfades (outgoing-track tail). */}
        <audio ref={fadeDeckRef} className="hidden" />

        {/* Track Info */}
        <div className="flex items-center gap-4 w-1/2 lg:w-1/4 min-w-0">
          <div className="relative shrink-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="w-10 h-10 lg:w-16 lg:h-16 rounded-xl bg-base-300 shadow-level-2 object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="w-10 h-10 lg:w-16 lg:h-16 rounded-xl bg-base-300 shadow-level-2 flex items-center justify-center ring-1 ring-white/10">
                <Music className="opacity-20" size={20} />
              </div>
            )}
          </div>

          <div className="min-w-0">
            {albumDetailTarget ? (
              <Link
                to={albumDetailTarget}
                className="font-black text-title-small lg:text-title-medium truncate tracking-tight hover:text-primary hover:underline block"
              >
                {currentTrack.title}
              </Link>
            ) : (
              <h3 className="font-black text-title-small lg:text-title-medium truncate tracking-tight">{currentTrack.title}</h3>
            )}
            {currentTrack.artistId ? (
              <Link
                to={`/artists/${(currentTrack as any).artistSlug || (currentTrack as any).artist_slug || currentTrack.artistId}`}
                className="text-xs lg:text-label-small font-medium opacity-60 text-primary truncate tracking-normal hover:opacity-100 hover:underline block"
              >
                {currentTrack.artistName}
              </Link>
            ) : (
              <p className="text-xs lg:text-label-small font-medium opacity-60 text-primary truncate tracking-normal">{currentTrack.artistName}</p>
            )}
          </div>
        </div>

        {/* Controls & Waveform */}
        <div className="flex flex-col items-center flex-1 max-w-xl gap-1">
          <div className="flex items-center gap-3 lg:gap-6">
            <button
              aria-label="Toggle shuffle"
              className={clsx("hidden lg:flex btn btn-ghost btn-xs btn-circle transition-all tooltip tooltip-top", isShuffled ? "text-primary scale-110" : "opacity-40 hover:opacity-100")}
              onClick={toggleShuffle}
              data-tip="Shuffle"
            >
              <Shuffle size={14} aria-hidden="true" />
            </button>

            <button
              aria-label="Previous track"
              className="btn btn-ghost btn-sm btn-circle opacity-70 hover:opacity-100 tooltip tooltip-top"
              onClick={prev}
              data-tip="Previous Track"
            >
              <SkipBack className="w-[18px] h-[18px] lg:w-5 lg:h-5" fill="currentColor" aria-hidden="true" />
            </button>

            <button
              aria-label={isPlaying ? "Pause" : "Play"}
              className="btn btn-circle btn-primary btn-md lg:btn-lg shadow-level-2 shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 lg:w-7 lg:h-7" fill="currentColor" aria-hidden="true" />
              ) : (
                <Play className="w-5 h-5 lg:w-7 lg:h-7 ml-1" fill="currentColor" aria-hidden="true" />
              )}
            </button>

            <button
              aria-label="Next track"
              className="btn btn-ghost btn-sm btn-circle opacity-70 hover:opacity-100 tooltip tooltip-top"
              onClick={next}
              data-tip="Next Track"
            >
              <SkipForward className="w-[18px] h-[18px] lg:w-5 lg:h-5" fill="currentColor" aria-hidden="true" />
            </button>

            <button
              aria-label={`Repeat mode: ${repeatMode}`}
              className={clsx("hidden lg:flex btn btn-ghost btn-xs btn-circle relative transition-all tooltip tooltip-top", repeatMode !== "none" ? "text-primary scale-110" : "opacity-40 hover:opacity-100")}
              onClick={toggleRepeat}
              data-tip={`Repeat Mode: ${repeatMode}`}
            >
              <Repeat size={14} aria-hidden="true" />
              {repeatMode === "one" && (
                <span className="absolute -top-1 -right-1 text-[8px] font-black bg-primary text-primary-content rounded-full w-3 h-3 flex items-center justify-center">1</span>
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-4 text-[11px] lg:text-xs font-black tracking-normal opacity-40 h-6">
            <span className="w-8 lg:w-10 text-right tabular-nums">
              {formatDuration(isSeeking ? (localProgress / 100) * duration : currentTime)}
            </span>

            <div 
              ref={progressContainerRef}
              className="flex-1 relative h-6 cursor-pointer flex items-center group"
              onMouseDown={handleProgressMouseDown}
              onTouchStart={handleProgressTouchStart}
            >
               <div className="w-full h-1 lg:h-1.5 bg-base-content/5 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-primary/40 rounded-full"
                  style={{ width: `${isSeeking ? localProgress : progress}%` }}
                />
               </div>
               <input
                aria-label="Seek track"
                aria-valuenow={Math.round(isSeeking ? localProgress : progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                type="range"
                className="range range-xs range-primary absolute inset-x-0 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none z-10"
                min="0"
                max="100"
                step="0.1"
                value={isSeeking ? localProgress : (progress || 0)}
                onChange={(e) => handleSeek(parseFloat(e.target.value) / 100)}
              />
            </div>

            <span className="w-8 lg:w-10 tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Volume & Extras */}
        <div className="flex items-center gap-2 lg:gap-6 w-auto lg:w-1/4 justify-end">
          <div className="hidden lg:flex items-center gap-3">
            <Volume2
              size={16}
              className={clsx("opacity-40", volume === 0 && "text-error opacity-100")}
            />
            <input
              aria-label="Volume"
              aria-valuenow={Math.round(volume * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              type="range"
              className="range range-xs w-20 range-primary opacity-60 hover:opacity-100 transition-opacity"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>
          <div className="flex gap-1 h-10 items-center border-l border-base-content/5 pl-2 lg:pl-4 ml-1 lg:ml-2">
            <div className="dropdown dropdown-top dropdown-end">
              <div role="button" tabIndex={0} className="btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <MoreVertical size={18} />
              </div>
              <ul tabIndex={0} className="dropdown-content z-[60] menu p-2 shadow-level-1 bg-base-300 rounded-2xl w-56 border border-base-content/10 mb-4">
                <li className="lg:hidden"><a onClick={toggleShuffle}><Shuffle size={16} className={clsx(isShuffled && "text-primary")}/> Shuffle</a></li>
                <li className="lg:hidden"><a onClick={toggleRepeat}><Repeat size={16} className={clsx(repeatMode !== 'none' && "text-primary")}/> Repeat: {repeatMode}</a></li>
                
                <li><a onClick={toggleLyrics}><Mic2 size={16} className={clsx(isLyricsOpen && "text-primary")}/> Lyrics</a></li>
                <li><a onClick={toggleCanvas}><Maximize2 size={16} className={clsx(isCanvasOpen && "text-primary")}/> Visualizer</a></li>
                <li><a onClick={toggleRadio}><Radio size={16} className={clsx(isRadioMode && "text-primary")}/> Radio Mode</a></li>
                
                <div className="divider my-1 opacity-10"></div>
                <li className="menu-title flex-row items-center gap-2 px-2 py-1 text-[11px]">
                  <AudioLines size={14} className={clsx(crossfadeSec > 0 && "text-primary")} /> Crossfade
                </li>
                <li>
                  <div className="flex gap-1 px-1">
                    {[0, 4, 8, 12].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCrossfade(s)}
                        className={clsx(
                          "btn btn-xs flex-1",
                          crossfadeSec === s ? "btn-primary" : "btn-ghost"
                        )}
                      >
                        {s === 0 ? "Off" : `${s}s`}
                      </button>
                    ))}
                  </div>
                </li>
                <div className="divider my-1 opacity-10"></div>
                <li><a onClick={handleAddToPlaylist}><ListMusic size={16}/> Add to Playlist</a></li>
                <li><a onClick={handleStarArtist}><User size={16}/> Favorite Artist</a></li>
                <li><a onClick={handleStarAlbum}><Disc size={16}/> Favorite Album</a></li>
                {isAdminOrOwner && (
                  <>
                    <div className="divider my-1 opacity-10"></div>
                    <li><a href={API.getTrackDownloadUrl(currentTrack.id)} target="_blank"><Download size={16}/> Download</a></li>
                  </>
                )}
              </ul>
            </div>

            <button
              aria-label="Toggle queue"
              className={clsx("btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100 tooltip tooltip-top")}
              onClick={toggleQueue}
              data-tip="Play Queue"
            >
              <ListMusic size={18} />
            </button>
          </div>
        </div>
      </div>

      <LyricsPanel />
      <QueuePanel />
      <PlayerCanvas />
    </>
  );
};

