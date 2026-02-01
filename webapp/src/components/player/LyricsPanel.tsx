import { useEffect, useState } from 'react';
import API from '../../services/api';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { X } from 'lucide-react';

export const LyricsPanel = () => {
    const { currentTrack, toggleLyrics, isLyricsOpen } = usePlayerStore();
    const [lyrics, setLyrics] = useState<string>('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isLyricsOpen && currentTrack) {
            setLoading(true);
            setLyrics('');
            
            API.getLyrics(currentTrack.id)
                .then(data => {
                    const text = typeof data.lyrics === 'string' 
                        ? data.lyrics 
                        : (Array.isArray(data.lyrics) ? data.lyrics.map(l => l.text).join('\n') : '');
                    setLyrics(text || 'No lyrics found.');
                })
                .catch(() => setLyrics('Failed to load lyrics.'))
                .finally(() => setLoading(false));
        }
    }, [currentTrack, isLyricsOpen]);

    if (!isLyricsOpen) return null;

    return (
        <div className="fixed right-0 bottom-24 w-80 max-w-[90vw] h-96 bg-base-200/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-tl-2xl rounded-bl-2xl p-4 flex flex-col z-40 transition-all">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <h3 className="font-bold text-lg">Lyrics</h3>
                <button onClick={toggleLyrics} className="btn btn-ghost btn-circle btn-sm"><X size={16}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed opacity-80 scrollbar-thin">
                {loading ? (
                    <div className="flex justify-center items-center h-full opacity-50">Loading lyrics...</div>
                ) : (
                    lyrics
                )}
            </div>
        </div>
    );
};
