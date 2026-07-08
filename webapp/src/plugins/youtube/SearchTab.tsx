import React, { useState } from 'react';
import { Search, Globe, Activity, Play, Pause, Download } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import clsx from 'clsx';
import { usePlayerStore } from '../../stores/usePlayerStore';
import type { Track } from '../../types';

export const StreamingSearchTab: React.FC = () => {
    const [query, setQuery] = useState('');
    const [streamingResults, setStreamingResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;

        setLoading(true);
        setStreamingResults([]);
        try {
            const data = await API.globalSearch(query);
            setStreamingResults([
                ...(data.streaming || []),
                ...(data.external || [])
            ]);
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
            notify.error("Search service is currently limited.", "Search Failed");
        } finally {
            setLoading(false);
        }
    };

    const handlePlayStreaming = (item: any) => {
        const trackId = `ext:${item.source}:${item.id || item.originalId}`;
        const isCurrent = currentTrack?.id === trackId;

        if (isCurrent) {
            togglePlay();
        } else {
            const virtualTrack: Track = {
                id: trackId,
                title: item.title,
                artistName: item.artist,
                artistId: 0,
                albumId: 0,
                duration: item.duration || 0,
                path: '',
                filename: '',
                playCount: 0,
                streamUrl: item.streamUrl || item.url,
                coverUrl: item.thumbnail || item.coverUrl,
                external_id: trackId
            };
            playTrack(virtualTrack);
        }
    };

    const handleRipStreaming = async (item: any) => {
        setLoading(true);
        try {
            const trackId = `ext:${item.source}:${item.id || item.originalId}`;
            const metadata = {
                title: item.title,
                artist: item.artist,
                coverUrl: item.coverUrl || item.thumbnail,
                duration: item.duration,
                url: item.url
            };
            const starRes = await API.starTrack(trackId, metadata);
            const dbTrackId = starRes.trackId;

            if (!dbTrackId) throw new Error("Failed to create local record for track");

            await API.localizeTrack(dbTrackId);
            notify.success(`Localization started for "${item.title}". It will appear in your library soon.`);
        } catch (err: any) {
            console.error(`Failed to rip track: ${err.message}`);
            notify.error(err, "Rip failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Search Column */}
            <div className="lg:col-span-2">
                <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
                        <input 
                            type="text" 
                            placeholder={`Search YouTube, SoundCloud, Bandcamp...`}
                            className="input input-bordered w-full pl-10"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary gap-2 min-w-[120px]" disabled={loading}>
                        {loading ? <span className="loading loading-spinner loading-xs"></span> : <Search size={18} />}
                        Search
                    </button>
                </form>

                <div className="grid gap-3">
                    {streamingResults.length === 0 && !loading && (
                        <div className="text-center py-20 bg-base-200/50 border border-dashed border-base-300 rounded-2xl">
                            <div className="bg-base-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Globe className="opacity-20" size={32} />
                            </div>
                            <p className="opacity-40 font-medium">Search providers to preview streams...</p>
                        </div>
                    )}

                    {streamingResults.map((res: any, i: number) => (
                        <div key={i} className="group card bg-base-200/50 hover:bg-base-200 border border-base-300/50 hover:border-primary/30 transition-all duration-200">
                            <div className="card-body p-4 flex-row justify-between items-center overflow-hidden">
                                <div className="flex gap-3 items-center flex-1 min-w-0 overflow-hidden pr-4">
                                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-base-300 flex items-center justify-center">
                                        {res.thumbnail || res.coverUrl ? (
                                            <img src={res.thumbnail || res.coverUrl} alt="" className="w-full h-full object-cover" />
                                        ) : <Activity size={16} className="opacity-20" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold truncate text-sm lg:text-base group-hover:text-primary transition-colors" title={res.title}>
                                            {res.title}
                                        </h3>
                                        <div className="text-xs opacity-50 truncate font-medium">
                                            {res.artist} • <span className="font-bold text-primary">{res.source || res.provider}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button 
                                        onClick={() => handlePlayStreaming(res)}
                                        className={clsx(
                                            "btn btn-circle btn-sm",
                                            currentTrack?.id === `ext:${res.source}:${res.id || res.originalId}` && isPlaying 
                                                ? "btn-primary" 
                                                : "btn-ghost hover:bg-primary/20"
                                        )}
                                        title="Preview"
                                    >
                                        {currentTrack?.id === `ext:${res.source}:${res.id || res.originalId}` && isPlaying 
                                            ? <Pause size={16} /> 
                                            : <Play size={16} className="ml-0.5" />
                                        }
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-6">
                <div className="card bg-primary/5 border border-primary/20 p-5">
                    <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                        <Globe size={16} /> Stream Preview
                    </h3>
                    <p className="text-xs opacity-70 leading-relaxed">
                        Use this tab to search for tracks on streaming providers and preview them directly in the audio player. Ripping tracks is no longer supported on TuneCamp; please use Sidecamp instead.
                    </p>
                </div>
            </div>
        </div>
    );
};
