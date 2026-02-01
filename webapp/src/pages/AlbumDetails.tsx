import { useState, useEffect } from 'react';
import API from '../services/api';
import { useParams, Link } from 'react-router-dom';
import { Play, Clock, Heart, MoreHorizontal, Disc, Share2, Plus } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
// import { GleamUtils } from '../utils/gleam';
import type { Album } from '../types';
import { Comments } from '../components/Comments';

export const AlbumDetails = () => {
    const { id } = useParams();
    const [album, setAlbum] = useState<Album | null>(null);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();

    useEffect(() => {
        if (id) {
            API.getAlbum(id)
                .then(setAlbum)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [id]);

    const handlePlay = () => {
        if (album?.tracks && album.tracks.length > 0) {
            playTrack(album.tracks[0], album.tracks);
        }
    };

    const handleAddToPlaylist = (trackId: string) => {
        document.dispatchEvent(new CustomEvent('open-playlist-modal', { detail: { trackId } }));
    };

    if (loading) return <div className="p-12 text-center opacity-50">Loading album...</div>;
    if (!album) return <div className="p-12 text-center opacity-50">Album not found.</div>;

    const totalDuration = album.tracks?.reduce((acc, t) => acc + t.duration, 0) || 0;

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-8 items-end md:items-center bg-gradient-to-b from-white/5 to-transparent p-6 rounded-2xl border border-white/5 relative overflow-hidden">
                {/* Background Blur */}
                <div className="absolute inset-0 z-0">
                     {album.coverImage && (
                        <img src={API.getAlbumCoverUrl(album.id)} className="w-full h-full object-cover opacity-[0.05] blur-3xl scale-110" />
                     )}
                </div>

                <div className="relative z-10 shrink-0 group">
                    {album.coverImage ? (
                        <img 
                            src={API.getAlbumCoverUrl(album.id)} 
                            alt={album.title} 
                            className="w-48 h-48 md:w-64 md:h-64 rounded-xl shadow-2xl object-cover" 
                        />
                    ) : (
                        <div className="w-48 h-48 md:w-64 md:h-64 bg-neutral rounded-xl flex items-center justify-center opacity-30 shadow-2xl"><Disc size={64}/></div>
                    )}
                </div>
                
                <div className="relative z-10 flex-1 space-y-4">
                    <div className="opacity-70 text-sm font-bold tracking-wider uppercase">{album.type}</div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none">{album.title}</h1>
                    <div className="text-xl md:text-2xl font-medium opacity-80 flex items-center gap-2">
                        {album.artistId ? (
                             <Link to={`/artists/${album.artistId}`} className="hover:underline">{album.artistName}</Link>
                        ) : (
                             <span>{album.artistName}</span>
                        )}
                        <span className="opacity-40">•</span>
                        <span className="text-base opacity-60 font-mono">{album.year}</span>
                        <span className="opacity-40">•</span>
                        <span className="text-base opacity-60">{album.tracks?.length} songs, {Math.floor(totalDuration / 60)} min</span>
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                        <button className="btn btn-primary btn-lg gap-2 shadow-xl hover:scale-105 transition-transform" onClick={handlePlay}>
                            <Play fill="currentColor" /> Play
                        </button>
                        <button className="btn btn-ghost btn-lg btn-circle"><Heart /></button>
                        <button className="btn btn-ghost btn-lg btn-circle"><MoreHorizontal /></button>
                    </div>
                </div>
            </div>

            {/* Tracklist */}
            <div className="overflow-x-auto">
                <table className="table w-full">
                    <thead>
                        <tr className="border-b border-white/10 text-xs uppercase opacity-50">
                            <th className="w-12 text-center">#</th>
                            <th>Title</th>
                            <th className="hidden md:table-cell">Plays</th>
                            <th className="w-16 text-right"><Clock size={16} /></th>
                            <th className="w-12"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {album.tracks?.map((track, i) => (
                            <tr key={track.id} className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors">
                                <td className="text-center opacity-50 font-mono w-12 group-hover:text-primary">
                                    <span className="group-hover:hidden">{i + 1}</span>
                                    <button 
                                        onClick={() => playTrack(track, album.tracks)}
                                        className="hidden group-hover:flex items-center justify-center w-full"
                                    >
                                        <Play size={12} fill="currentColor"/>
                                    </button>
                                </td>
                                <td>
                                    <div className="font-bold flex items-center gap-2">
                                        {track.title}
                                        {track.liked && <Heart size={12} className="text-primary" fill="currentColor"/>}
                                    </div>
                                    <div className="md:hidden text-xs opacity-50">{track.artistName}</div>
                                </td>
                                <td className="hidden md:table-cell opacity-50 text-xs font-mono">{track.playCount?.toLocaleString()}</td>
                                <td className="text-right opacity-50 font-mono text-xs">
                                     {new Date(track.duration * 1000).toISOString().substr(14, 5)}
                                </td>
                                <td>
                                    <div className="dropdown dropdown-end dropdown-hover opacity-0 group-hover:opacity-100 transition-opacity">
                                        <label tabIndex={0} className="btn btn-ghost btn-xs btn-circle"><MoreHorizontal size={16}/></label>
                                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52 text-sm border border-white/10">
                                            <li><a onClick={() => handleAddToPlaylist(track.id)}><Plus size={16}/> Add to Playlist</a></li>
                                            <li><a><Heart size={16}/> Like Song</a></li>
                                            <li><a><Share2 size={16}/> Share</a></li>
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>


            {/* Comments */}
            <Comments trackId={album.tracks && album.tracks.length > 0 ? album.tracks[0].id : undefined} albumId={album.id} />
        </div>
    );
};
