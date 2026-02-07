import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Music, Trash2, Save } from 'lucide-react';

interface AdminTrackModalProps {
    onTrackUpdated: () => void;
}

export const AdminTrackModal = ({ onTrackUpdated }: AdminTrackModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [title, setTitle] = useState('');
    const [artistId, setArtistId] = useState('');
    const [albumId, setAlbumId] = useState('');
    const [trackId, setTrackId] = useState<string | null>(null);
    const [trackNum, setTrackNum] = useState<string>('');
    
    // Dropdown data
    const [artists, setArtists] = useState<any[]>([]);
    const [albums, setAlbums] = useState<any[]>([]);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleOpen = async (e: CustomEvent) => {
            if (e.detail) {
                setTrackId(e.detail.id);
                setTitle(e.detail.title || '');
                setArtistId(e.detail.artist_id ? String(e.detail.artist_id) : '');
                setAlbumId(e.detail.album_id ? String(e.detail.album_id) : '');
                setTrackNum(e.detail.track_num ? String(e.detail.track_num) : '');
                
                loadData();
                dialogRef.current?.showModal();
            }
        };

        document.addEventListener('open-admin-track-modal', handleOpen as unknown as EventListener);
        return () => document.removeEventListener('open-admin-track-modal', handleOpen as unknown as EventListener);
    }, []);

    const loadData = async () => {
        try {
            const [artistsData, albumsData] = await Promise.all([
                API.getArtists(),
                API.getAlbums()
            ]);
            setArtists(artistsData);
            setAlbums(albumsData);
        } catch (e) { console.error(e); }
    };

    const handleDelete = async () => {
        if (!trackId || !confirm('Are you sure you want to delete this track? This cannot be undone.')) return;
        
        const deleteFile = confirm('Do you also want to delete the audio file from the disk?');
        
        setLoading(true);
        setError('');
        try {
            await API.deleteTrack(trackId, deleteFile);
            onTrackUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            setError(e.message || 'Failed to delete track');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackId) return;

        setLoading(true);
        setError('');

        try {
            await API.updateTrack(trackId, {
                title,
                artistId: artistId ? artistId : null, // explicit null if empty
                albumId: albumId ? albumId : null,
                trackNumber: trackNum ? parseInt(trackNum) : undefined
            } as any); 

            onTrackUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            setError(e.message || 'Failed to update track');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="admin-track-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Music size={20}/> Edit Track
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Title</span>
                        </label>
                        <input 
                            type="text" 
                            className="input input-bordered w-full" 
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Artist</span>
                        </label>
                        <select 
                            className="select select-bordered w-full"
                            value={artistId}
                            onChange={e => setArtistId(e.target.value)}
                        >
                            <option value="">(Various / Unknown)</option>
                            {artists.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Album</span>
                        </label>
                        <select 
                            className="select select-bordered w-full"
                            value={albumId}
                            onChange={e => setAlbumId(e.target.value)}
                        >
                            <option value="">(None / Single)</option>
                            {albums.map(a => (
                                <option key={a.id} value={a.id}>{a.title}</option>
                            ))}
                        </select>
                    </div>

                     <div className="form-control">
                        <label className="label">
                            <span className="label-text">Track Number</span>
                        </label>
                        <input 
                            type="number" 
                            className="input input-bordered w-full" 
                            value={trackNum}
                            onChange={e => setTrackNum(e.target.value)}
                        />
                    </div>

                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <div className="modal-action flex justify-between items-center">
                        <div>
                            <button 
                                type="button" 
                                className="btn btn-error btn-outline" 
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                <Trash2 size={18} /> Delete Track
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                            <button type="submit" className="btn btn-primary gap-2" disabled={loading}>
                                <Save size={18} /> {loading ? 'Saving...' : 'Update Track'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
