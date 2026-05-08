import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../stores/usePlayerStore";
import { useAuthStore } from "../../stores/useAuthStore";
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
  Maximize2
} from "lucide-react";
import clsx from "clsx";
import * as ColorThiefReactModule from "color-thief-react";
import { LyricsPanel } from "./LyricsPanel";
import { QueuePanel } from "./QueuePanel";
import { PlayerCanvas } from "./PlayerCanvas";
import { formatDuration } from "../../utils/format";

// Robust interop for color-thief-react which has inconsistent exports across versions/builds
const ColorThiefReact: any = ColorThiefReactModule;
const useColor = ColorThiefReact.useColor || ColorThiefReact.default?.useColor;

const PlayerBackground = ({ coverUrl }: { coverUrl: string }) => {
  const setDominantColor = usePlayerStore(state => state.setDominantColor);
  
  // Conditionally call hook if available
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
    isShuffled,
    repeatMode,
    isRadioMode,
    toggleShuffle,
    toggleRepeat,
    toggleRadio,
    toggleLyrics,
    toggleQueue,
    toggleCanvas,
    progress,
    currentTime,
    duration,
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement>(null);
  
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
    if (newSrc.includes('://')) {
        try {
            const streamUrlObj = new URL(newSrc);
            const isLocalOrigin = streamUrlObj.origin === window.location.origin;
            if (!isLocalOrigin) {
                newSrc = `/api/proxy/stream?url=${encodeURIComponent(newSrc)}`;
            }
        } catch (e) {
            newSrc = `/api/proxy/stream?url=${encodeURIComponent(newSrc)}`;
        }
    }

    // 2. Update Source if changed
    const srcChanged = audio.src !== newSrc && !audio.src.endsWith(newSrc) && audio.src !== newSrc + "/";
    if (srcChanged) {
      console.log("Player: Changing source to", newSrc);
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
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

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

  let coverUrl = currentTrack ? (
    currentTrack.coverImage ||
    currentTrack.coverUrl ||
    (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId) : "") ||
    (currentTrack.id ? API.getTrackCoverUrl(currentTrack.id) : "") ||
    (currentTrack.artistId ? API.getArtistCoverUrl(currentTrack.artistId) : "")
  ) : "";

  // Fix relative paths that might be missing the root / or /api
  if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('/') && !coverUrl.startsWith('data:') && !coverUrl.startsWith('blob:')) {
    // If it looks like a local asset path, prepend /api/
    if (coverUrl.startsWith('assets/')) {
        coverUrl = `/api/${coverUrl}`;
    } else {
        coverUrl = `/${coverUrl}`;
    }
  }

  if (!currentTrack)
    return (
      <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-base-content/5 flex items-center justify-center text-sm opacity-50 z-50">
        Select a track to play
      </div>
    );

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 h-24 backdrop-blur-3xl bg-base-100/60 border-t border-base-content/5 px-4 lg:px-8 flex items-center justify-between gap-4 z-50">
        <PlayerBackground coverUrl={coverUrl} />
        
        <audio
          ref={audioRef}
          className="hidden"
          onError={(e) => {
            console.error("[Player] Audio Element Error:", e.currentTarget.error);
          }}
        />

        {/* Track Info */}
        <div className="flex items-center gap-4 w-1/4 min-w-0">
          <div className="relative shrink-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="w-12 h-12 lg:w-16 lg:h-16 rounded-xl bg-base-300 shadow-2xl object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-xl bg-base-300 shadow-2xl flex items-center justify-center ring-1 ring-white/10">
                <Music className="opacity-20" size={24} />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-black text-sm lg:text-base truncate tracking-tight">{currentTrack.title}</h3>
            <p className="text-xs lg:text-sm font-medium opacity-60 text-primary truncate uppercase tracking-widest">{currentTrack.artistName}</p>
          </div>
        </div>

        {/* Controls & Waveform */}
        <div className="flex flex-col items-center flex-1 max-w-xl gap-1">
          <div className="flex items-center gap-6">
            <button
              aria-label="Toggle shuffle"
              className={clsx("btn btn-ghost btn-xs btn-circle transition-all", isShuffled ? "text-primary scale-110" : "opacity-40 hover:opacity-100")}
              onClick={toggleShuffle}
            >
              <Shuffle size={14} />
            </button>

            <button
              aria-label="Toggle radio mode"
              className={clsx("btn btn-ghost btn-xs btn-circle transition-all", isRadioMode ? "text-primary scale-110" : "opacity-40 hover:opacity-100")}
              onClick={toggleRadio}
            >
              <Radio size={14} />
            </button>

            <button
              aria-label="Previous track"
              className="btn btn-ghost btn-sm btn-circle opacity-70 hover:opacity-100 hover:bg-base-300"
              onClick={prev}
            >
              <SkipBack size={20} fill="currentColor" />
            </button>

            <button
              aria-label={isPlaying ? "Pause" : "Play"}
              className="btn btn-circle btn-primary btn-lg shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause size={28} fill="currentColor" />
              ) : (
                <Play size={28} fill="currentColor" className="ml-1" />
              )}
            </button>

            <button
              aria-label="Next track"
              className="btn btn-ghost btn-sm btn-circle opacity-70 hover:opacity-100 hover:bg-base-300"
              onClick={next}
            >
              <SkipForward size={20} fill="currentColor" />
            </button>

            <button
              aria-label={`Repeat mode: ${repeatMode}`}
              className={clsx("btn btn-ghost btn-xs btn-circle relative transition-all", repeatMode !== "none" ? "text-primary scale-110" : "opacity-40 hover:opacity-100")}
              onClick={toggleRepeat}
            >
              <Repeat size={14} />
              {repeatMode === "one" && (
                <span className="absolute -top-1 -right-1 text-[8px] font-black bg-primary text-primary-content rounded-full w-3 h-3 flex items-center justify-center">1</span>
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-4 text-[10px] font-black tracking-widest opacity-40 h-6">
            <span className="w-10 text-right tabular-nums">
              {formatDuration(currentTime)}
            </span>

            <div className="flex-1 relative h-1.5 group">
               <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-full bg-base-content/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary/40 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
               </div>
               <input
                aria-label="Seek track"
                type="range"
                className="range range-xs range-primary absolute inset-0 opacity-0 cursor-pointer z-10"
                min="0"
                max="100"
                step="0.1"
                value={progress || 0}
                onChange={(e) => handleSeek(parseFloat(e.target.value) / 100)}
              />
            </div>

            <span className="w-10 tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Volume & Extras */}
        <div className="flex items-center gap-6 w-1/4 justify-end">
          <div className="hidden lg:flex items-center gap-3">
            <Volume2
              size={16}
              className={clsx("opacity-40", volume === 0 && "text-error opacity-100")}
            />
            <input
              aria-label="Volume"
              type="range"
              className="range range-xs w-20 range-primary opacity-60 hover:opacity-100 transition-opacity"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>
          <div className="flex gap-1 h-10 items-center border-l border-base-content/5 pl-4 ml-2">
            {(useAuthStore.getState().user?.isAdmin || 
              (currentTrack.owner_id && String(currentTrack.owner_id) === String(useAuthStore.getState().user?.id)) ||
              (currentTrack.artistId && String(currentTrack.artistId) === String(useAuthStore.getState().user?.artistId))) && (
              <a
                href={API.getTrackDownloadUrl(currentTrack.id)}
                target="_blank"
                className="btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100 text-success"
                title="Download original file"
              >
                <Download size={18} />
              </a>
            )}
            <button
              aria-label="Toggle lyrics"
              className={clsx("btn btn-ghost btn-sm btn-square", isShuffled ? "text-primary" : "opacity-40")}
              onClick={toggleLyrics}
            >
              <Mic2 size={18} />
            </button>
            <button
              aria-label="Toggle queue"
              className={clsx("btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100")}
              onClick={toggleQueue}
            >
              <ListMusic size={18} />
            </button>
            <button
              aria-label="Toggle Canvas View"
              className="btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100 text-primary"
              onClick={toggleCanvas}
            >
              <Maximize2 size={18} />
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

