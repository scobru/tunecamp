import { useState, useEffect } from 'react';
import API from '../services/api';
import { BarChart2, TrendingUp, User, Music } from 'lucide-react';
import type { Track } from '../types';

export const Stats = () => {
    const [topTracks, setTopTracks] = useState<any[]>([]);
    const [topArtists, setTopArtists] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            API.getTopTracks(10),
            API.getTopArtists(10)
        ]).then(([tracks, artists]) => {
            setTopTracks(tracks);
            setTopArtists(artists);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-12 text-center opacity-50">Loading stats...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
             <h1 className="text-3xl font-bold flex items-center gap-3">
                <BarChart2 size={32} className="text-primary"/> Statistics
            </h1>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Top Tracks */}
                <div className="card bg-base-200 border border-white/5">
                    <div className="card-body">
                        <h2 className="card-title flex items-center gap-2 mb-4">
                            <Music className="text-secondary"/> Top Tracks
                        </h2>
                        <div className="space-y-2">
                            {topTracks.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-mono text-xl opacity-30 w-6">{i + 1}</span>
                                        <div className="min-w-0">
                                            <div className="font-bold truncate">{item.title}</div>
                                            <div className="text-xs opacity-50 truncate">{item.artistName}</div>
                                        </div>
                                    </div>
                                    <div className="font-mono font-bold opacity-70">{item.playCount} plays</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Top Artists */}
                <div className="card bg-base-200 border border-white/5">
                    <div className="card-body">
                        <h2 className="card-title flex items-center gap-2 mb-4">
                            <User className="text-accent"/> Top Artists
                        </h2>
                        <div className="space-y-2">
                            {topArtists.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-mono text-xl opacity-30 w-6">{i + 1}</span>
                                        <div className="min-w-0">
                                            <div className="font-bold truncate">{item.name}</div>
                                        </div>
                                    </div>
                                    <div className="font-mono font-bold opacity-70">{item.playCount} plays</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
