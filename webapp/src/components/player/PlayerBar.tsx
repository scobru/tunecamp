import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import API from '../../services/api';
import { Play, Pause, SkipBack, SkipForward, Volume2, Mic2, ListMusic, Shuffle, Repeat } from 'lucide-react';
import { Waveform } from './Waveform';
import { LyricsPanel } from './LyricsPanel';
import { QueuePanel } from './QueuePanel';
import { StringUtils } from '../../utils/stringUtils';
import { ScrollingText } from '../ui/ScrollingText';

export const PlayerBar = () => {
    const { 
        currentTrack, isPlaying, volume, 
        togglePlay, next, prev, 
        setIsPlaying, setProgress, setVolume,
        isShuffled, repeatMode, toggleShuffle, toggleRepeat,
        toggleLyrics, toggleQueue, progress, currentTime, duration
    } = usePlayerStore();
    
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!currentTrack || !audioRef.current) return;
        
        const audio = audioRef.current;
        
        let newSrc = currentTrack.streamUrl || API.getStreamUrl(currentTrack.id);
        
        // Auto-transcode lossless/heavy formats to MP3 for streaming (matching legacy behavior)
        if (!currentTrack.streamUrl && currentTrack.format && ['wav', 'flac'].includes(currentTrack.format.toLowerCase())) {
            newSrc += '?format=mp3';
        }

        // Only update source if it changed to avoid reloading same track
        if (audio.src !== newSrc && !audio.src.endsWith(newSrc) && audio.src !== newSrc + '/') { 
             console.log('Playing:', newSrc);
             audio.src = newSrc;
             if (isPlaying) {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.error("Playback failed:", error);
                        setIsPlaying(false);
                    });
                }
             }
        }

        const updateTime = () => setProgress(audio.currentTime, audio.duration);
        const handleEnded = () => {
             // Let store handle logic based on repeat mode
             next();
        };
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleDurationChange = () => {
            if (audio.duration && Number.isFinite(audio.duration)) {
                setProgress(audio.currentTime, audio.duration);
            }
        };
        const handleLoadedMetadata = () => {
            if (audio.duration && Number.isFinite(audio.duration)) {
                setProgress(audio.currentTime, audio.duration);
            }
        };

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        
        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
    }, [currentTrack, setIsPlaying, setProgress, next]); 

    // Sync play/pause state
    useEffect(() => {
        if (!audioRef.current) return;
        if (isPlaying && audioRef.current.paused) {
             audioRef.current.play().catch(() => setIsPlaying(false));
        } else if (!isPlaying && !audioRef.current.paused) {
            audioRef.current.pause();
        }
    }, [isPlaying, setIsPlaying]);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    // Handle manual seek from waveform/progress bar
    const handleSeek = useCallback((percent: number) => {
        if (audioRef.current) {
            const d = (Number.isFinite(duration) && duration > 0) ? duration : audioRef.current.duration;
            if (Number.isFinite(d) && d > 0) {
                audioRef.current.currentTime = percent * d;
            } else {
                console.warn('Cannot seek: duration not available', { duration, audioDuration: audioRef.current.duration });
            }
        }
    }, [duration]);

    if (!currentTrack) return <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-white/5 flex items-center justify-center text-sm opacity-50 z-50">Select a track to play</div>;

    // Resolve cover URL
    const coverUrl = currentTrack.coverUrl || 
                    currentTrack.coverImage ||
                    (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId) : '') ||
                    (currentTrack.artistId ? API.getArtistCoverUrl(currentTrack.artistId) : '');

    return (
        <>
            <div className="fixed bottom-0 left-0 right-0 lg:h-24 bg-base-200/90 backdrop-blur-xl border-t border-white/5 lg:px-6 flex flex-col lg:flex-row items-center gap-4 z-50 shadow-2xl pb-safe lg:pb-0">
                <audio 
                    ref={audioRef} 
                    className="hidden"
                    onError={(e) => console.error("Audio Element Error:", e.currentTarget.error, e.currentTarget.src)}
                />
                
                <div className="flex items-center gap-3 lg:gap-4 w-full lg:w-64 shrink-0 px-4 lg:px-0 pt-2 lg:pt-0">
                    {coverUrl ? (
                        <img 
                            src={coverUrl} 
                            alt="Cover" 
                            className="w-12 h-12 lg:w-14 lg:h-14 rounded-lg bg-base-300 shadow-lg object-cover"
                        />
                    ) : (
                         <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-lg bg-base-300 shadow-lg flex items-center justify-center">
                            <span className="text-xs opacity-50">?</span>
                         </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <ScrollingText className="font-bold text-sm lg:text-base">{currentTrack.title}</ScrollingText>
                        <ScrollingText className="text-xs lg:text-sm opacity-60">{currentTrack.artistName}</ScrollingText>
                    </div>
                </div>

                {/* Controls & Waveform */}
                <div className="flex flex-col items-center flex-1 max-w-2xl mx-auto gap-1 lg:gap-2 w-full px-2 lg:px-0">
                    {/* Buttons */}
                    <div className="flex items-center gap-4 lg:gap-6">
                        <button 
                            className={`btn btn-ghost btn-circle btn-xs ${isShuffled ? 'text-primary' : 'opacity-50'}`} 
                            onClick={toggleShuffle}
                        >
                            <Shuffle size={16} />
                        </button>

                        <button className="btn btn-ghost btn-circle btn-sm" onClick={prev}><SkipBack size={20} /></button>
                        
                        <button 
                            className="btn btn-circle btn-primary text-white shadow-lg lg:scale-110 hover:scale-110 transition-transform" 
                            onClick={togglePlay}
                        >
                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                        </button>
                        
                        <button className="btn btn-ghost btn-circle btn-sm" onClick={next}><SkipForward size={20} /></button>
                        
                        <button 
                            className={`btn btn-ghost btn-circle btn-xs ${repeatMode !== 'none' ? 'text-primary' : 'opacity-50'}`} 
                            onClick={toggleRepeat}
                        >
                            <Repeat size={16} />
                            {repeatMode === 'one' && <span className="absolute text-[8px] font-bold bottom-1 right-1">1</span>}
                        </button>
                    </div>

                    {/* Progress / Waveform */}
                    <div className="w-full flex items-center gap-3 text-xs font-mono opacity-100 h-10 lg:h-12 relative group">
                         {currentTrack.waveform ? (
                             <div className="flex items-center w-full gap-2">
                                 <span className="min-w-[40px] text-right opacity-50">
                                     {Number.isFinite(currentTime) ? new Date(currentTime * 1000).toISOString().substr(14, 5) : '0:00'}
                                 </span>
                                 <Waveform 
                                    data={currentTrack.waveform} 
                                    progress={progress / 100} 
                                    onSeek={handleSeek}
                                    height={40}
                                    colorPlayed="oklch(var(--color-primary))" 
                                 />
                                 <span className="min-w-[40px] opacity-50">
                                     {Number.isFinite(duration) && duration > 0 ? new Date(duration * 1000).toISOString().substr(14, 5) : '0:00'}
                                 </span>
                             </div>
                         ) : (
                            // Fallback simple progress bar
                            <div className="flex items-center w-full gap-2">
                                <span className="min-w-[40px] text-right opacity-50">
                                    {StringUtils.formatTimeAgo(0, currentTime * 1000).replace(' ago', '') === 'just now' 
                                        ? '0:00' 
                                        : (Number.isFinite(currentTime) ? new Date(currentTime * 1000).toISOString().substr(14, 5) : '0:00')}
                                </span>
                                <input 
                                    type="range" 
                                    className="range range-xs range-primary flex-1" 
                                    min="0" max="100" 
                                    value={progress || 0}
                                    onChange={(e) => handleSeek(parseFloat(e.target.value) / 100)}
                                />
                                <span className="min-w-[40px] opacity-50">
                                    {Number.isFinite(duration) && duration > 0 ? new Date(duration * 1000).toISOString().substr(14, 5) : '0:00'}
                                </span>
                            </div>
                         )}
                    </div>
                </div>

                {/* Volume & Extras */}
                <div className="hidden lg:flex items-center gap-4 w-64 justify-end">
                    <div className="flex items-center gap-2 group">
                       <Volume2 size={18} className="opacity-70 group-hover:text-primary transition-colors" />
                       <input 
                            type="range" className="range range-xs w-24" 
                            min="0" max="1" step="0.05"
                            value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} 
                       />
                    </div>
                    <div className="border-l border-white/10 pl-4 flex gap-2">
                        <button className="btn btn-ghost btn-circle btn-sm" onClick={toggleLyrics}><Mic2 size={18} /></button>
                        <button className="btn btn-ghost btn-circle btn-sm" onClick={toggleQueue}><ListMusic size={18} /></button>
                    </div>
                </div>
            </div>
            
            {/* Panels */}
            <LyricsPanel />
            <QueuePanel />
        </>
    );
};
