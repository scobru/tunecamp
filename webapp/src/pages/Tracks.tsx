import { useState, useEffect } from 'react';
import API from '../services/api';
import { Music, Play, Heart, Plus, MoreHorizontal, Clock, Search, LogIn, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import type { Track } from '../types';

export const Tracks = () => {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const { playTrack } = usePlayerStore();
    const { isAuthenticated, isAdminAuthenticated } = useAuthStore();

    useEffect(() => {
        if (!isAuthenticated && !isAdminAuthenticated) return;
        
        setLoading(true);
        API.getTracks()
            .then(data => {
                setTracks(data);
                setFilteredTracks(data);
                setLoading(false);
            })
            .catch(error => {
                console.error(error);
                setLoading(false);
            });
    }, [isAuthenticated, isAdminAuthenticated]);

    useEffect(() => {
        const lower = filter.toLowerCase();
        setFilteredTracks(tracks.filter(t => {
            if (!t || !t.title) return false;
            return t.title.toLowerCase().includes(lower) || 
            t.artistName?.toLowerCase().includes(lower) || 
            t.albumName?.toLowerCase().includes(lower);
        }));
    }, [filter, tracks]);

    const handleAddToPlaylist = (trackId: string) => {
        document.dispatchEvent(new CustomEvent('open-playlist-modal', { detail: { trackId } }));
    };



    if (!isAuthenticated && !isAdminAuthenticated) {
        return (
            <div className="p-12 text-center opacity-70 animate-fade-in">
                <Music size={48} className="mx-auto mb-4 text-primary opacity-50"/>
                <h2 className="text-xl font-bold mb-2">Login Required</h2>
                <p className="mb-4">Please login to view specific tracks.</p>
                <div className="flex justify-center gap-4">
                     <button className="btn btn-primary btn-sm gap-2" onClick={() => document.dispatchEvent(new CustomEvent('open-auth-modal'))}>
                        <LogIn size={16}/> Community Login
                    </button>
                    <button className="btn btn-secondary btn-sm gap-2" onClick={() => document.dispatchEvent(new CustomEvent('open-signin-modal'))}>
                        <LogIn size={16}/> Admin Login
                    </button>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-12 text-center opacity-50">Loading tracks...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Music size={32} className="text-primary"/> Tracks
                </h1>
                
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" size={16}/>
                    <input 
                        type="text" 
                        placeholder="Filter tracks..." 
                        className="input input-sm input-bordered pl-10 w-64"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
             </div>

             <div className="overflow-x-auto bg-base-200/30 rounded-xl border border-white/5">
                <table className="table w-full table-sm md:table-md">
                    <thead>
                        <tr className="border-b border-white/10 text-xs uppercase opacity-50">
                            <th className="w-12 text-center">#</th>
                            <th>Title</th>
                            <th>Album</th>
                            <th className="text-right"><Clock size={16} /></th>
                            <th className="w-12"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTracks.slice(0, 100).map((track, i) => {
                            if (!track || !track.title) return null;
                            return (
                            <tr key={track.id} className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors">
                                <td className="text-center opacity-50 font-mono w-12 group-hover:text-primary">
                                    <span className="group-hover:hidden">{i + 1}</span>
                                    <button 
                                        onClick={() => playTrack(track, filteredTracks)}
                                        className="hidden group-hover:flex items-center justify-center w-full"
                                    >
                                        <Play size={12} fill="currentColor"/>
                                    </button>
                                </td>
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="avatar rounded-lg overflow-hidden w-10 h-10 shrink-0 opacity-80">
                                            <img 
                                                src={track.albumId ? API.getAlbumCoverUrl(track.albumId) : API.getArtistCoverUrl(track.artistId)} 
                                                loading="lazy"
                                                alt={track.title}
                                                onError={(e) => {
                                                    // Fallback to placeholder if both fail
                                                    e.currentTarget.style.display = 'none';
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <div className="font-bold flex items-center gap-2">
                                                {track.title}
                                                {track.liked && <Heart size={12} className="text-primary" fill="currentColor"/>}
                                            </div>
                                            <div className="text-xs opacity-50">{track.artistName}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="opacity-60 text-sm truncate max-w-[150px]">{track.albumName}</td>
                                <td className="text-right opacity-50 font-mono text-xs">
                                     {new Date(track.duration * 1000).toISOString().substr(14, 5)}
                                </td>
                                <td>
                                    <div className="dropdown dropdown-end dropdown-hover opacity-0 group-hover:opacity-100 transition-opacity">
                                        <label tabIndex={0} className="btn btn-ghost btn-xs btn-circle"><MoreHorizontal size={16}/></label>
                                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52 text-sm border border-white/10">
                                            <li><a onClick={() => handleAddToPlaylist(track.id)}><Plus size={16}/> Add to Playlist</a></li>
                                             <li><a><Heart size={16}/> Like Song</a></li>
                                             {isAdminAuthenticated && (
                                                 <>
                                                     <li>
                                                         <a onClick={(e) => {
                                                             e.preventDefault();
                                                             document.dispatchEvent(new CustomEvent('open-admin-track-modal', { detail: track }));
                                                         }} className="text-primary font-medium">
                                                             <Music size={16}/> Edit Metadata
                                                         </a>
                                                     </li>
                                                     <li>
                                                         <a onClick={async (e) => {
                                                              e.preventDefault();
                                                              if (confirm(`Are you sure you want to delete "${track.title}"? This will remove it from the library database and disk.`)) {
                                                                  try {
                                                                      await API.deleteTrack(track.id, true);
                                                                      setTracks(tracks.filter(t => t.id !== track.id));
                                                                  } catch (err: any) {
                                                                      alert("Failed to delete track: " + err.message);
                                                                  }
                                                              }
                                                         }} className="text-error">
                                                             <Trash2 size={16}/> Delete Track
                                                         </a>
                                                     </li>
                                                 </>
                                             )}
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
                {filteredTracks.length > 100 && (
                    <div className="text-center py-4 text-xs opacity-50">Showing first 100 tracks. Filter to see more.</div>
                )}
             </div>
        </div>
    );
};
