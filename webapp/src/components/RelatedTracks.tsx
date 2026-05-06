import { useState, useEffect } from "react";
import API from "../services/api";
import { Sparkles, Play } from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import type { Track } from "../types";

interface RelatedTracksProps {
    trackId?: string | number;
}

export const RelatedTracks = ({ trackId }: RelatedTracksProps) => {
    const [related, setRelated] = useState<Track[]>([]);
    const [loading, setLoading] = useState(false);
    const { playTrack } = usePlayerStore();

    useEffect(() => {
        if (trackId) {
            loadRelated();
        }
    }, [trackId]);

    const loadRelated = async () => {
        setLoading(true);
        try {
            const data = await API.getRelatedTracks(trackId!);
            setRelated(data);
        } catch (e) {
            console.error("Failed to load related tracks:", e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-3 p-6 opacity-50">
                <Sparkles className="animate-pulse text-secondary" />
                <span className="text-sm font-bold uppercase tracking-widest">AI finding related vibes...</span>
            </div>
        );
    }

    if (related.length === 0) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 px-4">
                <Sparkles className="text-secondary" size={20} />
                <h3 className="font-black uppercase tracking-[0.2em] text-sm opacity-60">AI Similar Tracks</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {related.map(track => (
                    <div 
                        key={track.id} 
                        className="flex items-center gap-4 p-4 bg-base-200/50 rounded-2xl border border-base-content/5 hover:bg-base-content/5 transition-all group"
                    >
                        <div className="relative shrink-0">
                            <img 
                                src={track.coverImage || "https://placehold.co/100x100?text=No+Cover"} 
                                alt={track.title}
                                className="w-16 h-16 rounded-xl object-cover shadow-lg group-hover:scale-105 transition-transform"
                            />
                            <button 
                                onClick={() => playTrack(track, related)}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                            >
                                <Play size={24} className="text-white fill-current" />
                            </button>
                        </div>

                        <div className="min-w-0">
                            <p className="font-bold truncate text-sm">{track.title}</p>
                            <p className="text-xs opacity-60 truncate">{track.artistName || track.artist_name}</p>
                            {track.genre && (
                                <span className="badge badge-ghost badge-xs mt-2 opacity-50">{track.genre}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
