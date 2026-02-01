import { useRef, useEffect } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import API from '../../services/api';
import { Play, Pause, SkipBack, SkipForward, Volume2, Mic2, ListMusic } from 'lucide-react';

export const PlayerBar = () => {
    const { 
        currentTrack, isPlaying, volume, 
        togglePlay, next, prev, 
        setIsPlaying, setProgress, setVolume 
    } = usePlayerStore();
    
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!currentTrack || !audioRef.current) return;
        
        const audio = audioRef.current;
        audio.src = API.getStreamUrl(currentTrack.id);
        if (isPlaying) audio.play();

        const updateTime = () => setProgress(audio.currentTime, audio.duration);
        const handleEnded = () => next();

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('ended', handleEnded);
        
        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [currentTrack]); // Only re-run if track changes. Playing state handled separately.

    useEffect(() => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.play().catch(() => setIsPlaying(false));
        else audioRef.current.pause();
    }, [isPlaying]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    if (!currentTrack) return <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-white/5 flex items-center justify-center text-sm opacity-50">Select a track to play</div>;

    return (
        <div className="fixed bottom-0 left-0 right-0 h-24 bg-base-200/90 backdrop-blur-xl border-t border-white/5 px-6 flex items-center gap-4 z-50">
            <audio ref={audioRef} />
            
            {/* Track Info */}
            <div className="flex items-center gap-4 w-64 shrink-0">
                <img 
                    src={currentTrack.albumId ? API.getCoverUrl(currentTrack.albumId) : undefined} 
                    alt="Cover" 
                    className="w-14 h-14 rounded-lg bg-base-300 shadow-lg object-cover"
                />
                <div className="min-w-0">
                    <div className="font-bold truncate">{currentTrack.title}</div>
                    <div className="text-sm opacity-60 truncate">{currentTrack.artistName}</div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center flex-1 max-w-2xl mx-auto gap-2">
                <div className="flex items-center gap-6">
                    <button className="btn btn-ghost btn-circle btn-sm" onClick={prev}><SkipBack size={20} /></button>
                    <button 
                        className="btn btn-circle btn-primary text-white shadow-lg hover:scale-105" 
                        onClick={togglePlay}
                    >
                        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>
                    <button className="btn btn-ghost btn-circle btn-sm" onClick={next}><SkipForward size={20} /></button>
                </div>
                {/* Progress Bar (Simple for now, restore Canvas later) */}
                <div className="w-full flex items-center gap-3 text-xs font-mono opacity-70">
                    <span>--:--</span>
                    <input type="range" className="range range-xs range-primary flex-1" />
                    <span>--:--</span>
                </div>
            </div>

            {/* Volume & Extras */}
            <div className="flex items-center gap-4 w-64 justify-end">
                <div className="flex items-center gap-2">
                   <Volume2 size={18} className="opacity-70" />
                   <input 
                        type="range" className="range range-xs w-24" 
                        min="0" max="1" step="0.05"
                        value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} 
                   />
                </div>
                <div className="border-l border-white/10 pl-4 flex gap-2">
                    <button className="btn btn-ghost btn-circle btn-xs"><Mic2 size={16} /></button>
                    <button className="btn btn-ghost btn-circle btn-xs"><ListMusic size={16} /></button>
                </div>
            </div>
        </div>
    );
};
