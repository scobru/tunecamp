import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { PenTool, Save } from 'lucide-react';
import type { Artist } from '../../types';

export const CreatePostModal = ({ onPostCreated }: { onPostCreated?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [content, setContent] = useState('');
    const [artistId, setArtistId] = useState('');
    const [artists, setArtists] = useState<Artist[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const handleOpen = () => {
             loadArtists();
             setContent('');
             setArtistId('');
             setError('');
             dialogRef.current?.showModal();
        };

        document.addEventListener('open-create-post-modal', handleOpen);
        return () => document.removeEventListener('open-create-post-modal', handleOpen);
    }, []);

    const loadArtists = async () => {
        try {
            const data = await API.getArtists();
            setArtists(data);
             // Default to first artist if available
            if (data.length > 0) setArtistId(data[0].id);
        } catch (e) { console.error(e); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await API.createPost(artistId, content, 'public');
            if (onPostCreated) onPostCreated();
            dialogRef.current?.close();
        } catch (e: any) {
             setError(e.message || 'Failed to create post');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="create-post-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5 w-11/12 max-w-2xl">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <PenTool size={20} className="text-secondary"/> Create New Post
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                     <div className="form-control">
                        <label className="label">
                            <span className="label-text">Post as Artist</span>
                        </label>
                        <select 
                            className="select select-bordered w-full"
                            value={artistId}
                            onChange={e => setArtistId(e.target.value)}
                            required
                        >
                            {artists.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Content</span>
                        </label>
                        <textarea 
                            className="textarea textarea-bordered h-48 text-base" 
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="Write something..."
                            required
                        />
                    </div>

                    {error && <div className="text-error text-sm">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                        <button type="submit" className="btn btn-secondary gap-2" disabled={loading}>
                            <Save size={16}/> Publish
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
