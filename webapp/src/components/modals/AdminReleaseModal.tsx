import { confirm } from '@/utils/confirm';
import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Disc, Trash2, Search } from 'lucide-react';
import { MetadataMatchModal } from '../MetadataMatchModal';
import { useConfigStore } from '../../stores/useConfigStore';

interface AdminReleaseModalProps {
    onReleaseUpdated: () => void;
}

export const AdminReleaseModal = ({ onReleaseUpdated }: AdminReleaseModalProps) => {
    const { cacheBuster } = useConfigStore();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [title, setTitle] = useState('');
    const [artistId, setArtistId] = useState(''); // Could be dropdown in future
    const [type, setType] = useState<'album'|'single'|'liveset'|'podcast'>('album');
    const [year, setYear] = useState(new Date().getFullYear());
    const [price, setPrice] = useState<string>('');
    const [priceUsdc, setPriceUsdc] = useState<string>('');
    const [currency, setCurrency] = useState<'ETH' | 'USD' | 'USDC'>('ETH');
    
    const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>('private');
    const [genre, setGenre] = useState('');
    
    // For simplicity, just text fields. In a real app, this would be more complex.
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [artists, setArtists] = useState<any[]>([]);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [allTracks, setAllTracks] = useState<any[]>([]);
    const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
    const [license, setLicense] = useState<string>('copyright');
    const [showMetadataModal, setShowMetadataModal] = useState(false);
    const [currentAlbumData, setCurrentAlbumData] = useState<any>(null);

    const isLibrary = !!(isEditing && currentAlbumData && !currentAlbumData.is_release && !currentAlbumData.is_formal_release);

    useEffect(() => {
        const handleOpen = async (e: CustomEvent) => {
            loadAllTracks();
            // Check if editing (passed via detail)
            if (e.detail && e.detail.id) {
                setCurrentAlbumData(e.detail);
                setIsEditing(true);
                setEditId(e.detail.id);
                setTitle(e.detail.title || '');
                setArtistId(e.detail.artist_id || ''); // Fixed property name
                setType(e.detail.type || 'album');
                setYear(e.detail.year ? parseInt(e.detail.year) : new Date().getFullYear()); // Ensure year is a number
                setGenre(e.detail.genre || '');
                // Handle visibility: check new field, then fallback to is_public (boolean)
                setVisibility(e.detail.visibility || (e.detail.is_public ? 'public' : 'private'));
                setLicense(e.detail.license || 'copyright');
                setPrice(e.detail.price ? String(e.detail.price) : '');
                setPriceUsdc(e.detail.price_usdc ? String(e.detail.price_usdc) : '');
                setCurrency(e.detail.price_usdc ? 'USDC' : (e.detail.currency || 'ETH'));
                
                // Fetch release tracks and set selected IDs
                // Fetch release tracks and set selected IDs
                const releaseDetails = await API.getAlbum(e.detail.id);
                if (releaseDetails && releaseDetails.tracks) {
                    setSelectedTrackIds(releaseDetails.tracks.map((t: any) => t.id));
                } else {
                    setSelectedTrackIds([]);
                }

            } else {
                setIsEditing(false);
                setEditId(null);
                setTitle('');
                setArtistId(''); 
                setType('album');
                setYear(new Date().getFullYear());
                setGenre('');
                setVisibility('private');
                setVisibility('private');
                setLicense('copyright');
                setPrice('');
                setPriceUsdc('');
                setCurrency('ETH');
                setSelectedTrackIds([]);
                setCurrentAlbumData(null);
            }
            
            setCoverFile(null);
            setError('');
            loadArtists();
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-release-modal', handleOpen as unknown as EventListener);
        return () => document.removeEventListener('open-admin-release-modal', handleOpen as unknown as EventListener);
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
        if (!editId) return;
        
        const itemType = isLibrary ? (type === 'single' || selectedTrackIds.length <= 1 ? 'track' : 'album') : 'release';
        
        if (!await confirm(`Are you sure you want to delete this ${itemType}? This will remove the database entries. You will be asked next if you want to delete the files from disk.`)) return;
        
        const deleteFiles = await confirm('PERMANENTLY DELETE FILES? \nOK = Delete files from disk (Cannot be undone) \nCancel = Keep files on disk (Will be re-scanned if not moved)');
        
        setLoading(true);
        setError('');
        try {
            await API.deleteRelease(editId, !deleteFiles);
            onReleaseUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            setError(e.message || `Failed to delete ${itemType}`);
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
                    genre,
                    visibility,
                    license: isLibrary ? undefined : license,
                    track_ids: selectedTrackIds,
                    price: isLibrary ? undefined : (price ? Number(price) : undefined),
                    priceUsdc: isLibrary ? undefined : (priceUsdc ? Number(priceUsdc) : undefined),
                    currency: isLibrary ? undefined : (currency !== 'USDC' ? currency : 'ETH'), // Default to ETH if USDC selected as primary currency is stored in price_usdc
                });
            } else {
                release = await API.createRelease({ 
                    title, 
                    artistId: artistId || undefined, 
                    type, 
                    year,
                    genre,
                    visibility,
                    license,
                    track_ids: selectedTrackIds,
                    price: price ? Number(price) : undefined,
                    priceUsdc: priceUsdc ? Number(priceUsdc) : undefined,
                    currency: currency !== 'USDC' ? currency : 'ETH',
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
            <div className="modal-box bg-base-100 border border-base-content/5">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Disc size={20}/> {isLibrary ? (type === 'single' || selectedTrackIds.length <= 1 ? 'Edit Track' : 'Edit Album') : (isEditing ? 'Edit Release' : 'Create Release')}
                    </h3>
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost gap-2 text-primary"
                        onClick={() => setShowMetadataModal(true)}
                    >
                        <Search size={14} /> Match Metadata
                    </button>
                </div>

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
                                <option value="single">Single</option>
                                <option value="liveset">Liveset</option>
                                <option value="podcast">Podcast</option>
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
                            <span className="label-text">Genre</span>
                        </label>
                        <input 
                            type="text" 
                            className="input input-bordered w-full" 
                            value={genre}
                            onChange={e => setGenre(e.target.value)}
                            placeholder="e.g. Rock, Electronic"
                        />
                    </div>

                    {!isLibrary && (
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Price</span>
                            </label>
                            <div className="flex gap-2">
                                <select 
                                    className="select select-bordered"
                                    value={currency}
                                    onChange={e => setCurrency(e.target.value as any)}
                                >
                                    <option value="ETH">ETH</option>
                                    <option value="USD">USD</option>
                                    <option value="USDC">USDC</option>
                                </select>
                                <input 
                                    type="number" 
                                    step="any"
                                    className="input input-bordered w-full" 
                                    value={currency === 'USDC' ? priceUsdc : price}
                                    onChange={e => {
                                        if (currency === 'USDC') setPriceUsdc(e.target.value);
                                        else setPrice(e.target.value);
                                    }}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    )}

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
                                {visibility === 'private' && (isLibrary ? "Only admins can see this album/track." : "Only admins can see this release.")}
                                {visibility === 'public' && "Visible to everyone and federated to the network."}
                                {visibility === 'unlisted' && "Accessible if you have the link/ID, but not shown in public catalogs."}
                            </span>
                        </label>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Cover Art</span>
                        </label>
                        {isEditing && editId && !coverFile && (
                            <div className="mb-2">
                                <img src={API.getAlbumCoverUrl(editId, cacheBuster)} className="w-24 h-24 rounded object-cover shadow border border-base-content/10" />
                            </div>
                        )}
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

                    {!isLibrary && (
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">License</span>
                            </label>
                            <select 
                                className="select select-bordered w-full"
                                value={license}
                                onChange={e => setLicense(e.target.value)}
                            >
                                <option value="copyright">All Rights Reserved (Copyright)</option>
                                <option value="cc-by">Creative Commons BY (Attribution)</option>
                                <option value="cc-by-sa">Creative Commons BY-SA (ShareAlike)</option>
                                <option value="cc-by-nc">Creative Commons BY-NC (Non-Commercial)</option>
                                <option value="cc-by-nc-sa">Creative Commons BY-NC-SA (Non-Commercial ShareAlike)</option>
                                <option value="cc-by-nd">Creative Commons BY-ND (NoDerivs)</option>
                                <option value="cc-by-nc-nd">Creative Commons BY-NC-ND (Non-Commercial NoDerivs)</option>
                                <option value="public-domain">Public Domain / CC0</option>
                            </select>
                        </div>
                    )}
                    
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
                                    <Trash2 size={18} /> {isLibrary ? (type === 'single' || selectedTrackIds.length <= 1 ? 'Delete Track' : 'Delete Album') : 'Delete Release'}
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {loading ? 'Saving...' : (isEditing ? (isLibrary ? (type === 'single' || selectedTrackIds.length <= 1 ? 'Update Track' : 'Update Album') : 'Update Release') : 'Create Release')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>

            {showMetadataModal && (
                <MetadataMatchModal
                    item={currentAlbumData || { title }}
                    type="album"
                    onClose={() => setShowMetadataModal(false)}
                    onMatched={(updated) => {
                        setTitle(updated.title || title);
                        if (updated.genre) setGenre(updated.genre);
                        if (updated.year) setYear(updated.year);
                        if (updated.artistName) {
                            // Try to find artist ID from name if possible
                            const matched = artists.find(a => a.name.toLowerCase() === updated.artistName.toLowerCase());
                            if (matched) setArtistId(String(matched.id));
                        }
                        onReleaseUpdated();
                        setShowMetadataModal(false);
                    }}
                />
            )}
        </dialog>
    );
};

