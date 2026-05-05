import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { Plus, Save } from 'lucide-react';

export const CreatePlaylistModal = ({ onCreated }: { onCreated?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const { isAdminAuthenticated } = useAuthStore();
    const [error, setError] = useState('');

    useEffect(() => {
        const handleOpen = () => {
            if (isAdminAuthenticated) {
                dialogRef.current?.showModal();
            }
        };
        document.addEventListener('open-create-playlist-modal', handleOpen);
        return () => document.removeEventListener('open-create-playlist-modal', handleOpen);
    }, [isAdminAuthenticated]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        setLoading(true);
        setError('');

        try {
            await API.createPlaylist(name, description);
            onCreated?.();
            window.dispatchEvent(new CustomEvent('refresh-playlists'));
            dialogRef.current?.close();
            setName('');
            setDescription('');
        } catch (e: any) {
            setError(e.message || 'Failed to create playlist');
        } finally {
            setLoading(false);
        }
    };

    if (!isAdminAuthenticated) return null;

    return (
        <dialog id="create-playlist-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Plus size={24} className="text-primary"/> Create Playlist
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Name</span>
                        </label>
                        <input 
                            type="text" 
                            className="input input-bordered w-full" 
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            placeholder="My Awesome Playlist"
                            autoFocus
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Description</span>
                        </label>
                        <textarea 
                            className="textarea textarea-bordered h-24" 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Optional description..."
                        />
                    </div>

                    {error && <div className="text-error text-sm">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                        <button type="submit" className="btn btn-primary gap-2" disabled={loading}>
                            <Save size={16}/> Create
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};

