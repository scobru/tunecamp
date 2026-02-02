import { useEffect, useState } from 'react';
import API from '../services/api';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Album } from '../types';
import { Play } from 'lucide-react';

export const Home = () => {
    const [recentAlbums, setRecentAlbums] = useState<Album[]>([]);
    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const { } = usePlayerStore();

    useEffect(() => {
        const load = async () => {
            try {
                const catalog = await API.getCatalog();
                setRecentAlbums(catalog.recentAlbums || []);
                setStats(catalog.stats || {});
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="w-full p-8 space-y-4 animate-pulse">
                <div className="h-8 bg-base-300 rounded w-1/3 mb-6"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-48 bg-base-300 rounded"></div>)}
                </div>
            </div>
        );
    }

    return (
        <section className="p-4 lg:p-8">
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Welcome to TuneCamp</h1>
            <p className="text-base-content/60 mb-8">Your self-hosted music streaming server.</p>
            
            <div className="stats shadow bg-base-200 border border-white/5 w-full mb-12">
                <div className="stat">
                    <div className="stat-title">Albums</div>
                    <div className="stat-value text-primary">{stats.albums || 0}</div>
                    <div className="stat-desc">Curated releases</div>
                </div>
                
                <div className="stat">
                    <div className="stat-title">Tracks</div>
                    <div className="stat-value text-secondary">{stats.tracks || 0}</div>
                    <div className="stat-desc">Audio files</div>
                </div>
            </div>

            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Recent Releases</h2>
                <a href="#/albums" className="btn btn-ghost btn-sm">View All →</a>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {recentAlbums.map(album => {
                    if (!album) return null;
                    return (
                        <div key={album.id} className="group relative bg-base-200 rounded-xl overflow-hidden hover:bg-base-300 transition-colors shadow-lg">
                            <div className="aspect-square w-full relative">
                                <img 
                                    src={API.getAlbumCoverUrl(album.slug || album.id)} 
                                    alt={album.title} 
                                    className="w-full h-full object-cover"
                                />
                                {/* Play overlay */}
                                <button 
                                    className="absolute right-2 bottom-2 btn btn-circle btn-primary opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        try {
                                            // Fetch full album details including tracks
                                            const fullAlbum = await API.getAlbum(album.id);
                                            if (fullAlbum && fullAlbum.tracks && fullAlbum.tracks.length > 0) {
                                                const { playAlbum } = usePlayerStore.getState();
                                                playAlbum(fullAlbum.tracks, 0); 
                                            }
                                        } catch (error) {
                                            console.error("Failed to play album", error);
                                        }
                                    }}
                                >
                                    <Play fill="currentColor" size={20} />
                                </button>
                            </div>
                            <div className="p-4">
                                <h3 className="font-bold truncate">{album.title}</h3>
                                <p className="text-sm opacity-60 truncate">{album.artistName}</p>
                                <div className="flex gap-2 mt-2">
                                    <span className="badge badge-xs badge-outline opacity-50">{album.year}</span>
                                    <span className="badge badge-xs badge-secondary badge-outline">{album.type}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
