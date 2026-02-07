import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Music, Save, AlertCircle } from 'lucide-react';
import type { Track, Artist, Album } from '../../types';

interface AdminTrackModalProps {
    onTrackUpdated: () => void;
}

export const AdminTrackModal = ({ onTrackUpdated }: AdminTrackModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [track, setTrack] = useState<Track | null>(null);
    const [title, setTitle] = useState('');
    const [artistName, setArtistName] = useState('');
    const [albumTitle, setAlbumTitle] = useState('');
    const [trackNum, setTrackNum] = useState<number | ''>('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const handleOpen = (e: CustomEvent) => {
            const t = e.detail as Track;
            setTrack(t);
            setTitle(t.title || '');
            setArtistName(t.artistName || '');
            setAlbumTitle(t.albumName || '');
            // track_num might be in the raw DB object but in frontend interface it might be missing or under different name
            // Let's assume it might be there as any
            setTrackNum((t as any).track_num || '');
            
            setError('');
            setSuccess(false);
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-track-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-admin-track-modal', handleOpen as EventListener);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!track) return;

        setLoading(true);
        setError('');
        setSuccess(false);

        try {
            await API.updateTrack(track.id, {
                title,
                artist: artistName,
                album: albumTitle,
                trackNumber: trackNum || undefined,
            } as any);

            setSuccess(true);
            setTimeout(() => {
                onTrackUpdated();
                dialogRef.current?.close();
            }, 1000);
        } catch (err: any) {
            setError(err.message || 'Failed to update track');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="admin-track-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/10 shadow-2xl max-w-md">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-primary/10 rounded-xl text-primary">
                        <Music size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-xl">Edit Track Metadata</h3>
                        <p className="text-xs opacity-50 font-mono">ID: {track?.id}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Track Title</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Enter track title"
                            className="input input-bordered w-full focus:input-primary transition-all"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Artist Name</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Enter artist name"
                            className="input input-bordered w-full focus:input-primary transition-all"
                            value={artistName}
                            onChange={e => setArtistName(e.target.value)}
                        />
                        <label className="label">
                            <span className="label-text-alt opacity-50">Updates DB and ID3 tags</span>
                        </label>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Album Title</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Enter album title"
                            className="input input-bordered w-full focus:input-primary transition-all"
                            value={albumTitle}
                            onChange={e => setAlbumTitle(e.target.value)}
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Track Number</span>
                        </label>
                        <input
                            type="number"
                            placeholder="e.g. 1"
                            className="input input-bordered w-full focus:input-primary transition-all"
                            value={trackNum}
                            onChange={e => setTrackNum(e.target.value ? parseInt(e.target.value) : '')}
                        />
                    </div>

                    {error && (
                        <div className="alert alert-error py-2 text-sm">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="alert alert-success py-2 text-sm">
                            <span>Track updated successfully!</span>
                        </div>
                    )}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary gap-2" disabled={loading || success}>
                            {loading ? <span className="loading loading-spinner loading-xs"></span> : <Save size={18} />}
                            {loading ? 'Saving...' : 'Save Changes'}
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
