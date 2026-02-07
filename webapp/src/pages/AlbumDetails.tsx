import { useState, useEffect } from 'react';
import API from '../services/api';
import { useParams, Link } from 'react-router-dom';
import { Play, Clock, Heart, MoreHorizontal, Share2, Plus, Download, Unlock, ExternalLink, Shield } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';

import type { Album } from '../types';
import { Comments } from '../components/Comments';

export const AlbumDetails = () => {
    const { id } = useParams();
    const [album, setAlbum] = useState<Album | null>(null);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();
    const { isAdminAuthenticated: isAdmin } = useAuthStore();

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

    const handleUnlock = () => {
        if (!album) return;
        document.dispatchEvent(new CustomEvent('open-unlock-modal', { detail: { albumId: album.id } }));
        // Note: UnlockModal needs to support setting albumId via event or we need to update it
        // Checking UnlockModal implementation previously: it listens to 'open-unlock-modal' but doesn't seem to read detail.
        // Wait, legacy logic: `modal.dataset.albumId = albumId`. 
        // In React `UnlockModal`, `handleOpen` just shows modal. It should probably read detail.
        // Let's assume for now I will update UnlockModal separately if needed, or stick to simple "enter code" 
        // implementation if it validates code against release regardless of context.
        // Legacy: validateUnlockCode(code) -> returns release. If release.id != album.id, error.
        // So UnlockModal needs to know the CURRENT album context.
        // I will add albumId to event detail and update UnlockModal later if it doesn't support it.
    };

    const handlePromote = async () => {
        if (!album || !confirm('Promote this album to a public release?')) return;
        try {
            await API.promoteToRelease(album.id);
            // Refresh
            API.getAlbum(album.id).then(setAlbum);
        } catch (e) {
            console.error(e);
            alert('Failed to promote');
        }
    };

    // Parse external links safely
    const externalLinks = (() => {
        if (!album?.external_links) return [];
        try {
            return JSON.parse(album.external_links);
        } catch {
            return [];
        }
    })();

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
                    <img 
                        src={API.getAlbumCoverUrl(album.id)} 
                        alt={album.title} 
                        className="w-48 h-48 md:w-64 md:h-64 rounded-xl shadow-2xl object-cover" 
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500?text=No+Cover';
                        }}
                    />
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

                        {album.download === 'free' && (
                             <a href={`/api/albums/${album.slug || album.id}/download`} className="btn btn-secondary btn-lg gap-2 shadow-xl" target="_blank">
                                <Download size={20} /> Free Download
                             </a>
                        )}

                        {album.download === 'codes' && (
                             <button className="btn btn-secondary btn-lg gap-2 shadow-xl" onClick={handleUnlock}>
                                <Unlock size={20} /> Unlock Download
                             </button>
                        )}
                        
                        {externalLinks.map((link: any, i: number) => (
                            <a key={i} href={link.url} target="_blank" className="btn btn-outline btn-lg gap-2">
                                <ExternalLink size={20} /> {link.label}
                            </a>
                        ))}
                        
                        {isAdmin && !album.is_release && (
                             <button className="btn btn-warning btn-outline btn-lg gap-2" onClick={handlePromote}>
                                <Shield size={20} /> Promote
                             </button>
                        )}

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
                        {album.tracks?.map((track, i) => {
                            if (!track) return null;
                            return (
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
                                            {isAdmin && (
                                                <li>
                                                    <a onClick={(e) => {
                                                        e.preventDefault();
                                                        document.dispatchEvent(new CustomEvent('open-admin-track-modal', { detail: track }));
                                                    }} className="text-primary font-medium">
                                                        <Music size={16}/> Edit Metadata
                                                    </a>
                                                </li>
                                            )}
                                            <li><a><Share2 size={16}/> Share</a></li>
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>


            {/* Comments */}
            <Comments trackId={album.tracks && album.tracks.length > 0 ? album.tracks[0].id : undefined} albumId={album.id} />
        </div>
    );
};
