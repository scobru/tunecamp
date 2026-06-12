import { useState, useEffect, useRef } from 'react';
import API from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';
import type { Playlist } from '../../types';
import { Plus, ListMusic, Lock, Globe, Check, Loader2 } from 'lucide-react';
import { notify } from '../../utils/notify';
import clsx from 'clsx';

export const PlaylistModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { user, isAuthenticated } = useAuthStore();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [successId, setSuccessId] = useState<string | null>(null);

    // Track ID to add
    const [targetTrackId, setTargetTrackId] = useState<string | number | null>(null);

    const loadPlaylists = async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const data = await API.getPlaylists();
            // Filter: priority to mine, then public others
            const myPlaylists = data.filter(p => p.username === user?.username);
            const otherPublic = data.filter(p => p.username !== user?.username && p.isPublic);
            setPlaylists([...myPlaylists, ...otherPublic]);
        } catch (e) {
            console.error('Failed to load playlists:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleOpen = (e: CustomEvent) => {
            const trackId = e.detail?.trackId;
            if (!trackId) return;
            
            setTargetTrackId(trackId);
            setSuccessId(null);
            setIsCreating(false);
            loadPlaylists();
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-playlist-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-playlist-modal', handleOpen as EventListener);
    }, [isAuthenticated, user?.username]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPlaylistName.trim()) return;
        
        setLoading(true);
        try {
            const newPl = await API.createPlaylist(newPlaylistName.trim());
            setPlaylists([newPl, ...playlists]);
            setNewPlaylistName('');
            setIsCreating(false);
            
            // If target track, add it immediately
            if (targetTrackId) {
                await addToPlaylist(String(newPl.id));
            }
        } catch (e) {
            console.error('Failed to create playlist:', e);
        } finally {
            setLoading(false);
        }
    };

    const addToPlaylist = async (playlistId: string) => {
        if (!targetTrackId) return;
        
        setSuccessId(null);
        try {
            // Ensure trackId is handled correctly (backend expects number usually for internal API)
            const id = typeof targetTrackId === 'string' && /^\d+$/.test(targetTrackId) 
                ? parseInt(targetTrackId) 
                : targetTrackId;

            await API.addTrackToPlaylist(playlistId, id as any);
            
            setSuccessId(playlistId);
            
            // Auto close after short delay
            setTimeout(() => {
                dialogRef.current?.close();
            }, 1000);
        } catch (e) {
            console.error('Failed to add track to playlist:', e);
            notify.error(e, 'Failed to add track to playlist');
        }
    };

    return (
        <dialog id="playlist-modal" className="modal modal-bottom sm:modal-middle" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 p-0 overflow-hidden max-w-md">
                <div className="p-6 pb-0 flex justify-between items-center">
                    <h3 className="font-black text-xl flex items-center gap-3 tracking-tighter">
                        <ListMusic size={24} className="text-primary"/> Add to Playlist
                    </h3>
                    <form method="dialog">
                        <button className="btn btn-sm btn-circle btn-ghost">✕</button>
                    </form>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        {loading && playlists.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 opacity-30 gap-4">
                                <Loader2 className="animate-spin" size={32} />
                                <p className="text-xs font-bold tracking-normal">Loading Playlists...</p>
                            </div>
                        ) : playlists.length === 0 ? (
                            <div className="text-center py-12 bg-base-200/50 rounded-3xl border border-dashed border-base-content/5">
                                <p className="opacity-40 text-sm font-medium italic">No playlists found.</p>
                            </div>
                        ) : (
                            playlists.map(p => {
                                const isMine = p.username === user?.username;
                                const isSuccess = successId === p.id;
                                
                                return (
                                    <button 
                                        key={p.id} 
                                        className={clsx(
                                            "flex items-center gap-4 p-3 rounded-2xl transition-all text-left group",
                                            isSuccess ? "bg-success/10 text-success" : "hover:bg-base-content/5"
                                        )}
                                        onClick={() => addToPlaylist(String(p.id))}
                                        disabled={!!successId}
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-base-300 flex items-center justify-center overflow-hidden shrink-0 border border-base-content/5">
                                            {p.coverPath ? (
                                                <img src={p.coverPath} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <ListMusic size={20} className="opacity-20" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold truncate flex items-center gap-2">
                                                {p.name}
                                                {isMine ? (
                                                    p.isPublic ? <Globe size={12} className="opacity-30" /> : <Lock size={12} className="opacity-30" />
                                                ) : (
                                                    <span className="badge badge-xs opacity-40 font-black">PUBLIC</span>
                                                )}
                                            </div>
                                            <div className="text-xs font-black tracking-normal opacity-30">
                                                {isMine ? 'My Playlist' : `By ${p.username}`}
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            {isSuccess ? (
                                                <Check size={20} className="animate-in zoom-in" />
                                            ) : (
                                                <Plus size={20} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="divider opacity-5 mt-0 mb-0"></div>

                    {isCreating ? (
                        <form onSubmit={handleCreate} className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text text-xs font-black tracking-normal opacity-40">New Playlist Name</span>
                                </label>
                                <input 
                                    type="text" 
                                    className="input input-bordered bg-base-200 border-base-content/5 focus:border-primary/30 rounded-2xl w-full" 
                                    placeholder="e.g. Summer Vibes 2026" 
                                    value={newPlaylistName}
                                    onChange={e => setNewPlaylistName(e.target.value)}
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>
                            <div className="flex gap-2">
                                <button type="submit" className="btn btn-primary flex-1 rounded-xl" disabled={loading || !newPlaylistName.trim()}>
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Create & Add'}
                                </button>
                                <button type="button" className="btn btn-ghost rounded-xl" onClick={() => setIsCreating(false)} disabled={loading}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <button 
                            className="btn btn-ghost bg-primary/5 hover:bg-primary/10 text-primary border-primary/10 w-full gap-2 rounded-2xl h-14" 
                            onClick={() => setIsCreating(true)}
                            disabled={!!successId}
                        >
                            <Plus size={20}/> Create New Playlist
                        </button>
                    )}
                </div>
            </div>
            <form method="dialog" className="modal-backdrop bg-black/60 backdrop-blur-sm">
                <button>close</button>
            </form>
        </dialog>
    );
};

