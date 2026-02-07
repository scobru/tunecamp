import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Disc, Trash2 } from 'lucide-react';
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
    
    const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>('private');
    
    // For simplicity, just text fields. In a real app, this would be more complex.
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [artists, setArtists] = useState<any[]>([]);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [allTracks, setAllTracks] = useState<any[]>([]);
    const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);

    useEffect(() => {
        const handleOpen = async (e: CustomEvent) => {
            loadAllTracks();
            // Check if editing (passed via detail)
            if (e.detail && e.detail.id) {
                setIsEditing(true);
                setEditId(e.detail.id);
                setTitle(e.detail.title || '');
                setArtistId(e.detail.artist_id || ''); // Fixed property name
                setType(e.detail.type || 'album');
                setYear(e.detail.year ? parseInt(e.detail.year) : new Date().getFullYear()); // Ensure year is a number
                // Handle visibility: check new field, then fallback to is_public (boolean)
                setVisibility(e.detail.visibility || (e.detail.is_public ? 'public' : 'private'));
                
                // Fetch release tracks and set selected IDs
                const releaseDetails = await API.getAlbum(e.detail.id);
                setSelectedTrackIds(releaseDetails.tracks.map((t: any) => t.id));

            } else {
                setIsEditing(false);
                setEditId(null);
                setTitle('');
                setArtistId(''); 
                setType('album');
                setYear(new Date().getFullYear());
                setVisibility('private');
                setSelectedTrackIds([]);
            }
            
            setCoverFile(null);
            setError('');
            loadArtists();
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-release-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-admin-release-modal', handleOpen as EventListener);
    }, []);

    const loadArtists = async () => {
        try {
            const data = await API.getArtists();
            setArtists(data);
        } catch (e) { console.error(e); }
    };

    const loadAllTracks = async () => {
        try {
            const data = await API.getTracks();
            setAllTracks(data);
        } catch (e) { console.error(e); }
    };

    const handleTrackSelect = (trackId: number) => {
        setSelectedTrackIds(prev => 
            prev.includes(trackId) 
                ? prev.filter(id => id !== trackId) 
                : [...prev, trackId]
        );
    };

    const handleDelete = async () => {
        if (!editId || !confirm('Are you sure you want to delete this release? This will remove all associated database entries.')) return;
        
        const deleteFiles = confirm('Do you also want to delete the audio files from the disk?');
        
        setLoading(true);
        setError('');
        try {
            await API.deleteRelease(editId, !deleteFiles);
            onReleaseUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            setError(e.message || 'Failed to delete release');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            let release;
            
            if (isEditing && editId) {
                release = await API.updateRelease(editId, {
                    title,
                    artistId: artistId || undefined,
                    type,
                    year,
                    visibility,
                    track_ids: selectedTrackIds,
                });
            } else {
                release = await API.createRelease({ 
                    title, 
                    artistId: artistId || undefined, 
                    type, 
                    year,
                    visibility,
                    track_ids: selectedTrackIds,
                });
            }

            // Upload cover if selected
            if (coverFile && release) {
                await API.uploadCover(coverFile, release.slug);
            }

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
                    <Disc size={20}/> {isEditing ? 'Edit Release' : 'Create Release'}
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

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Network Visibility</span>
                        </label>
                        <select 
                            className="select select-bordered w-full"
                            value={visibility}
                            onChange={e => setVisibility(e.target.value as any)}
                        >
                            <option value="private">Private (Admin only)</option>
                            <option value="public">Public (Visible to Network)</option>
                            <option value="unlisted">Unlisted (Hidden from Lists, Accessible via Link)</option>
                        </select>
                        <label className="label">
                            <span className="label-text-alt opacity-70">
                                {visibility === 'private' && "Only admins can see this release."}
                                {visibility === 'public' && "Visible to everyone and federated to the network."}
                                {visibility === 'unlisted' && "Accessible if you have the link/ID, but not shown in public catalogs."}
                            </span>
                        </label>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Cover Art</span>
                        </label>
                        <input 
                            type="file" 
                            className="file-input file-input-bordered w-full"
                            accept="image/*"
                            onChange={e => setCoverFile(e.target.files ? e.target.files[0] : null)}
                        />
                         <label className="label">
                            <span className="label-text-alt opacity-70">JPG or PNG, max 5MB.</span>
                        </label>
                    </div>
                    
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Tracks</span>
                        </label>
                        <div className="border border-base-content/10 rounded-box max-h-60 overflow-y-auto">
                            {allTracks.map(track => (
                                <div key={track.id} className="flex items-center gap-3 p-2 border-b border-base-content/5">
                                    <input 
                                        type="checkbox" 
                                        className="checkbox checkbox-sm"
                                        checked={selectedTrackIds.includes(track.id)}
                                        onChange={() => handleTrackSelect(track.id)}
                                    />
                                    <div>
                                        <div className="font-bold">{track.title}</div>
                                        <div className="text-xs opacity-60">{track.artist_name || 'Unknown Artist'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <div className="modal-action flex justify-between items-center">
                        <div>
                            {isEditing && (
                                <button 
                                    type="button" 
                                    className="btn btn-error btn-outline" 
                                    onClick={handleDelete}
                                    disabled={loading}
                                >
                                    <Trash2 size={18} /> Delete Release
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {loading ? 'Saving...' : (isEditing ? 'Update Release' : 'Create Release')}
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
