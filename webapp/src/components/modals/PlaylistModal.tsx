import { useState, useEffect, useRef } from 'react';
import API from '../../services/api';
import type { Playlist } from '../../types';
import { Plus, ListMusic } from 'lucide-react';

export const PlaylistModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Track ID to add is usually passed via global state or event. 
    // For simplicity, we can listen to a custom event 'open-playlist-modal'
    const [targetTrackId, setTargetTrackId] = useState<string | null>(null);

    const loadPlaylists = async () => {
        setLoading(true);
        try {
            const data = await API.getPlaylists();
            setPlaylists(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleOpen = (e: CustomEvent) => {
            setTargetTrackId(e.detail?.trackId);
            loadPlaylists();
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-playlist-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-playlist-modal', handleOpen as EventListener);
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newPl = await API.createPlaylist(newPlaylistName);
            setPlaylists([...playlists, newPl]);
            setNewPlaylistName('');
            setIsCreating(false);
            
            // If target track, add it immediately
            if (targetTrackId) {
                addToPlaylist(newPl.id);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const addToPlaylist = async (playlistId: string) => {
        if (!targetTrackId) return;
        try {
            await API.addTrackToPlaylist(playlistId, targetTrackId);
            dialogRef.current?.close();
            // Show toast?
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <dialog id="playlist-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <ListMusic size={20}/> Add to Playlist
                </h3>

                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto mb-4">
                    {loading ? (
                        <div className="text-center opacity-50 py-4">Loading...</div>
                    ) : playlists.length === 0 ? (
                        <div className="text-center opacity-50 py-4">No playlists found</div>
                    ) : (
                        playlists.map(p => (
                            <button 
                                key={p.id} 
                                className="btn btn-ghost justify-start"
                                onClick={() => addToPlaylist(p.id)}
                            >
                                <span className="font-bold">{p.name}</span>
                                <span className="opacity-50 text-xs ml-auto">{p.trackCount} tracks</span>
                            </button>
                        ))
                    )}
                </div>

                {isCreating ? (
                    <form onSubmit={handleCreate} className="flex gap-2">
                        <input 
                            type="text" 
                            className="input input-bordered flex-1" 
                            placeholder="Playlist Name" 
                            value={newPlaylistName}
                            onChange={e => setNewPlaylistName(e.target.value)}
                            autoFocus
                        />
                        <button type="submit" className="btn btn-primary">Create</button>
                        <button type="button" className="btn btn-ghost" onClick={() => setIsCreating(false)}>Cancel</button>
                    </form>
                ) : (
                    <button className="btn btn-outline btn-primary w-full gap-2" onClick={() => setIsCreating(true)}>
                        <Plus size={16}/> Create New Playlist
                    </button>
                )}
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
