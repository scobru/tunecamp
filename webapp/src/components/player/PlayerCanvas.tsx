import { usePlayerStore } from "../../stores/usePlayerStore";
import API from "../../services/api";
import { 
  X, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Disc
} from "lucide-react";
import { Waveform } from "./Waveform";
import clsx from "clsx";
import { useEffect, useState } from "react";

export const PlayerCanvas = () => {
    const { 
        currentTrack, 
        isPlaying, 
        progress, 
        togglePlay, 
        next, 
        prev, 
        isCanvasOpen, 
        toggleCanvas,
        dominantColor 
    } = usePlayerStore();

    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        if (isCanvasOpen) {
            setIsMounted(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsMounted(false), 500);
            document.body.style.overflow = '';
            return () => clearTimeout(timer);
        }
    }, [isCanvasOpen]);

    if (!isMounted || !currentTrack) return null;

    let coverUrl = (
        currentTrack.coverImage ||
        currentTrack.coverUrl ||
        (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId) : "") ||
        (currentTrack.id ? API.getTrackCoverUrl(currentTrack.id) : "")
    );

    // Fix relative paths
    if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('/') && !coverUrl.startsWith('data:')) {
        coverUrl = `/${coverUrl}`;
    }

    return (
        <div className={clsx(
            "fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all duration-500 bg-black",
            isCanvasOpen ? "opacity-100 visible" : "opacity-0 invisible"
        )}>
            {/* Immersive Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div 
                    className="absolute inset-0 bg-cover bg-center scale-110 blur-[100px] opacity-40 transition-all duration-1000"
                    style={{ backgroundImage: `url(${coverUrl})` }}
                />
                <div 
                    className="absolute inset-0 transition-colors duration-1000"
                    style={{ backgroundColor: dominantColor ? `${dominantColor}20` : "transparent" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
            </div>

            {/* Close Button */}
            <button 
                onClick={toggleCanvas}
                className="absolute top-8 right-8 btn btn-circle btn-ghost text-white/50 hover:text-white hover:bg-white/10 z-10"
            >
                <X size={24} />
            </button>

            {/* Main Content */}
            <div className="relative w-full max-w-4xl px-8 flex flex-col items-center gap-12 z-10 animate-fade-in">
                {/* Large Cover Art */}
                <div className="relative group">
                    <div 
                        className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000"
                        style={{ backgroundColor: dominantColor ? `${dominantColor}40` : undefined }}
                    />
                    <div className="relative aspect-square w-64 md:w-80 lg:w-96 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] ring-1 ring-white/20 transition-transform duration-700 group-hover:scale-[1.02]">
                        {coverUrl ? (
                            <img 
                                src={coverUrl} 
                                alt={currentTrack.title} 
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-neutral flex items-center justify-center">
                                <Disc size={128} className="text-white/10" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Track Info */}
                <div className="text-center space-y-2">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white">
                        {currentTrack.title}
                    </h2>
                    <p 
                        className="text-lg md:text-2xl font-bold opacity-60 tracking-[0.2em]"
                        style={{ color: dominantColor || 'var(--p)' }}
                    >
                        {currentTrack.artistName}
                    </p>
                </div>

                {/* Large Waveform */}
                <div className="w-full h-48 md:h-64 group cursor-pointer relative">
                    <Waveform 
                        data={currentTrack.waveform} 
                        progress={progress / 100}
                        height={240}
                        colorPlayed={dominantColor || '#1db954'}
                        colorRemaining="rgba(255, 255, 255, 0.05)"
                    />
                </div>

                {/* Simplified Controls */}
                <div className="flex items-center gap-12">
                    <button 
                        onClick={prev}
                        className="btn btn-ghost btn-circle btn-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <SkipBack size={32} fill="currentColor" />
                    </button>

                    <button 
                        onClick={togglePlay}
                        className="btn btn-circle btn-primary btn-xl w-20 h-20 shadow-level-1 shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
                    >
                        {isPlaying ? (
                            <Pause size={40} fill="currentColor" />
                        ) : (
                            <Play size={40} fill="currentColor" className="ml-2" />
                        )}
                    </button>

                    <button 
                        onClick={next}
                        className="btn btn-ghost btn-circle btn-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <SkipForward size={32} fill="currentColor" />
                    </button>
                </div>
            </div>

            {/* Bottom Bar Hints */}
            <div className="absolute bottom-12 flex items-center gap-8 text-xs font-black tracking-[0.3em] text-white/20">
                <span>Lossless Audio</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>Premium Quality</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>{currentTrack.year || new Date().getFullYear()}</span>
            </div>
        </div>
    );
};
