import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { User, Image as ImageIcon, Globe } from 'lucide-react';

interface AdminArtistModalProps {
    onArtistUpdated: () => void;
}

export const AdminArtistModal = ({ onArtistUpdated }: AdminArtistModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    
    // ActivityPub / Mastodon Conf
    const [mastodonInstance, setMastodonInstance] = useState('');
    const [mastodonToken, setMastodonToken] = useState('');
    
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleOpen = (e: CustomEvent) => {
            if (e.detail && e.detail.id) {
                // Edit Mode
                const artist = e.detail;
                setIsEditing(true);
                setEditId(artist.id);
                setName(artist.name || '');
                setSlug(artist.slug || '');
                setDescription(artist.description || '');
                
                // Parse postParams for Mastodon
                if (artist.postParams) {
                    // Start by assuming it's an object, handle if it's a JSON string
                    let params = artist.postParams;
                    if (typeof params === 'string') {
                        try { params = JSON.parse(params); } catch (e) { params = {}; }
                    }
                    setMastodonInstance(params.instance || '');
                    setMastodonToken(params.token || '');
                } else {
                    setMastodonInstance('');
                    setMastodonToken('');
                }

            } else {
                // Create Mode
                setIsEditing(false);
                setEditId(null);
                setName('');
                setSlug('');
                setDescription('');
                setMastodonInstance('');
                setMastodonToken('');
            }
            
            setAvatarFile(null);
            setError('');
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-artist-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-admin-artist-modal', handleOpen as EventListener);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const postParamsValue = (mastodonInstance || mastodonToken) ? {
                instance: mastodonInstance,
                token: mastodonToken
            } : null;

            let artist;
            
            if (isEditing && editId) {
                artist = await API.updateArtist(editId, {
                    name,
                    slug: slug || undefined,
                    description,
                    postParams: postParamsValue
                });
            } else {
                artist = await API.createArtist({ 
                    name, 
                    slug: slug || undefined, 
                    description,
                    postParams: postParamsValue
                });
            }

            // Upload avatar if selected
            if (avatarFile && artist) {
                await API.uploadArtistAvatar(artist.id, avatarFile);
            }

            onArtistUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Failed to save artist');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="admin-artist-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5 w-11/12 max-w-2xl">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <User size={20}/> {isEditing ? 'Edit Artist' : 'Create Artist'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Slug (URL)</span>
                            </label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full" 
                                value={slug}
                                onChange={e => setSlug(e.target.value)}
                                placeholder="Auto-generated if empty"
                            />
                        </div>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Description</span>
                        </label>
                        <textarea 
                            className="textarea textarea-bordered h-24" 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>
                    
                    <div className="divider">ActivityPub / Mastodon Config</div>
                    <div className="bg-base-200 p-4 rounded-lg space-y-4">
                         <div className="flex items-center gap-2 text-sm opacity-70 mb-2">
                            <Globe size={16}/> 
                            <span>Configure auto-posting to Mastodon/ActivityPub</span>
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Instance URL</span>
                            </label>
                            <input 
                                type="url" 
                                className="input input-bordered w-full" 
                                value={mastodonInstance}
                                onChange={e => setMastodonInstance(e.target.value)}
                                placeholder="https://mastodon.social"
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Access Token</span>
                            </label>
                            <input 
                                type="password" 
                                className="input input-bordered w-full" 
                                value={mastodonToken}
                                onChange={e => setMastodonToken(e.target.value)}
                                placeholder="Bearer Token"
                            />
                        </div>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Artist Avatar</span>
                        </label>
                         <div className="flex items-center gap-4">
                            <input 
                                type="file" 
                                className="file-input file-input-bordered w-full"
                                accept="image/*"
                                onChange={e => setAvatarFile(e.target.files ? e.target.files[0] : null)}
                            />
                            {avatarFile && <ImageIcon className="text-success" size={24}/>}
                        </div>
                         <label className="label">
                            <span className="label-text-alt opacity-70">JPG or PNG, max 5MB.</span>
                        </label>
                    </div>
                    
                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : (isEditing ? 'Update Artist' : 'Create Artist')}
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
