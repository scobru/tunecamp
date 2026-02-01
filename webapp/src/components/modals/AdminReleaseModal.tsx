import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Disc } from 'lucide-react';
// import type { Release } from '../../types';

interface AdminReleaseModalProps {
    onReleaseUpdated: () => void;
}

export const AdminReleaseModal = ({ onReleaseUpdated }: AdminReleaseModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [title, setTitle] = useState('');
    const [artistId, setArtistId] = useState(''); // Could be dropdown in future
    const [type, setType] = useState<'album'|'single'|'ep'>('album');
    const [year, setYear] = useState(new Date().getFullYear());
    
    // For simplicity, just text fields. In a real app, this would be more complex.
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [artists, setArtists] = useState<any[]>([]);

    useEffect(() => {
        const handleOpen = () => {
            setTitle('');
            setArtistId(''); // Reset or keep prev?
            setType('album');
            setError('');
            loadArtists();
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-release-modal', handleOpen);
        return () => document.removeEventListener('open-admin-release-modal', handleOpen);
    }, []);

    const loadArtists = async () => {
        try {
            const data = await API.getArtists();
            setArtists(data);
        } catch (e) { console.error(e); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await API.createRelease({ 
                title, 
                artistId: artistId || undefined, 
                type, 
                year 
            });
            onReleaseUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            setError(e.message || 'Failed to create release');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="admin-release-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Disc size={20}/> Create Release
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Type</span>
                            </label>
                            <select 
                                className="select select-bordered w-full"
                                value={type}
                                onChange={e => setType(e.target.value as any)}
                            >
                                <option value="album">Album</option>
                                <option value="ep">EP</option>
                                <option value="single">Single</option>
                            </select>
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Year</span>
                            </label>
                            <input 
                                type="number" 
                                className="input input-bordered w-full" 
                                value={year}
                                onChange={e => setYear(parseInt(e.target.value))}
                            />
                        </div>
                    </div>
                    
                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Release'}
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
