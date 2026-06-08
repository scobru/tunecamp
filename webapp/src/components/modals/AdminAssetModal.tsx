import { useState, useRef, useEffect } from 'react';
import { PackagePlus, Upload, Trash2, Image } from 'lucide-react';
import API from '../../services/api';
import type { Asset, Artist } from '../../types';
import { useAuthStore } from '../../stores/useAuthStore';

export const AdminAssetModal = ({ onSaved }: { onSaved?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const { user, role } = useAuthStore();

    const isSystemAdmin = role === 'root_admin' || role === 'admin';

    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [artists, setArtists] = useState<Artist[]>([]);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'digital' | 'video' | 'membership'>('digital');
    const [artistId, setArtistId] = useState('');
    const [price, setPrice] = useState('');
    const [priceUsdc, setPriceUsdc] = useState('');
    const [currency, setCurrency] = useState('ETH');
    const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>('public');
    const [requiresSubscription, setRequiresSubscription] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [cover, setCover] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const handleOpen = async (e: any) => {
            const detail: Asset | null = e.detail || null;
            resetForm();
            if (isSystemAdmin) {
                try { const data = await API.getArtists(); setArtists(data); } catch {}
            }

            if (detail) {
                setIsEditing(true);
                setEditId(detail.id);
                setTitle(detail.title || '');
                setDescription(detail.description || '');
                setType((detail.type as any) || 'digital');
                setArtistId(String(detail.artist_id || detail.artistId || ''));
                setPrice(String(detail.price || ''));
                setPriceUsdc(String(detail.price_usdc || detail.priceUsdc || ''));
                setCurrency(detail.currency || 'ETH');
                setVisibility(detail.visibility || 'public');
                setRequiresSubscription(!!(detail.requires_subscription || detail.requiresSubscription));
                if (detail.cover_path || detail.coverPath) {
                    setCoverPreview(`/api/assets/cover/${detail.id}`);
                }
            } else {
                setIsEditing(false);
                if (user?.artistId && !isSystemAdmin) setArtistId(String(user.artistId));
            }
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-asset-modal', handleOpen);
        return () => document.removeEventListener('open-admin-asset-modal', handleOpen);
    }, [user, isSystemAdmin]);

    const resetForm = () => {
        setIsEditing(false); setEditId(null);
        setTitle(''); setDescription(''); setType('digital');
        setArtistId(''); setPrice(''); setPriceUsdc('');
        setCurrency('ETH'); setVisibility('public');
        setRequiresSubscription(false);
        setFile(null); setCover(null); setCoverPreview(null);
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) { setError('Title required'); return; }
        setLoading(true); setError('');

        try {
            const fd = new FormData();
            fd.append('title', title);
            fd.append('description', description);
            fd.append('type', type);
            if (artistId) fd.append('artist_id', artistId);
            fd.append('price', price || '0');
            fd.append('price_usdc', priceUsdc || '0');
            fd.append('currency', currency);
            fd.append('visibility', visibility);
            fd.append('requires_subscription', String(requiresSubscription));
            if (file) fd.append('file', file);

            let savedId: number;
            if (isEditing && editId) {
                const res: any = await API.updateAsset(editId, fd);
                savedId = res.id;
            } else {
                const res: any = await API.createAsset(fd);
                savedId = res.id;
            }

            // Upload cover separately if provided
            if (cover && savedId) {
                const cfd = new FormData();
                cfd.append('cover', cover);
                await API.uploadAssetCover(savedId, cfd);
            }

            onSaved?.();
            dialogRef.current?.close();
        } catch (err: any) {
            setError(err.message || 'Failed to save asset');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!editId) return;
        if (!confirm('Delete this asset? This cannot be undone.')) return;
        try {
            await API.deleteAsset(editId);
            onSaved?.();
            dialogRef.current?.close();
        } catch (err: any) {
            setError(err.message || 'Failed to delete');
        }
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setCover(f);
        setCoverPreview(URL.createObjectURL(f));
    };

    return (
        <dialog id="admin-asset-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 w-11/12 max-w-2xl rounded-2xl shadow-level-1 p-6">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 rounded-full">✕</button>
                </form>

                <h3 className="font-bold text-xl mb-6 flex items-center gap-2 tracking-tight">
                    <PackagePlus size={22} className="text-primary" />
                    {isEditing ? 'Edit Asset' : 'New Asset'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Cover */}
                    <div className="flex gap-4 items-start">
                        <div
                            className="w-24 h-24 rounded-xl bg-base-200 border-2 border-dashed border-base-content/20 flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0 hover:border-primary transition-colors"
                            onClick={() => coverInputRef.current?.click()}
                        >
                            {coverPreview ? (
                                <img src={coverPreview} alt="cover" className="w-full h-full object-cover" />
                            ) : (
                                <Image size={28} className="opacity-30" />
                            )}
                        </div>
                        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />

                        <div className="flex-1 space-y-3">
                            <div className="form-control">
                                <label className="label"><span className="label-text text-xs font-bold opacity-60">Title *</span></label>
                                <input type="text" className="input input-bordered input-sm rounded-xl" value={title} onChange={e => setTitle(e.target.value)} required />
                            </div>
                            <div className="form-control">
                                <label className="label"><span className="label-text text-xs font-bold opacity-60">Type</span></label>
                                <select className="select select-bordered select-sm rounded-xl" value={type} onChange={e => setType(e.target.value as any)}>
                                    <option value="digital">Digital File (PDF, ZIP, Image)</option>
                                    <option value="video">Video</option>
                                    <option value="membership">Membership Content</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="form-control">
                        <label className="label"><span className="label-text text-xs font-bold opacity-60">Description</span></label>
                        <textarea className="textarea textarea-bordered rounded-xl text-sm h-20 resize-none" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what buyers get..." />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Artist */}
                        {isSystemAdmin && (
                            <div className="form-control col-span-2">
                                <label className="label"><span className="label-text text-xs font-bold opacity-60">Artist</span></label>
                                <select className="select select-bordered select-sm rounded-xl" value={artistId} onChange={e => setArtistId(e.target.value)}>
                                    <option value="">— Instance (no artist) —</option>
                                    {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Price */}
                        <div className="form-control">
                            <label className="label"><span className="label-text text-xs font-bold opacity-60">Price (ETH/USD)</span></label>
                            <input type="number" step="any" min="0" className="input input-bordered input-sm rounded-xl" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
                        </div>
                        <div className="form-control">
                            <label className="label"><span className="label-text text-xs font-bold opacity-60">Price USDC</span></label>
                            <input type="number" step="any" min="0" className="input input-bordered input-sm rounded-xl" value={priceUsdc} onChange={e => setPriceUsdc(e.target.value)} placeholder="0" />
                        </div>

                        {/* Currency */}
                        <div className="form-control">
                            <label className="label"><span className="label-text text-xs font-bold opacity-60">Currency</span></label>
                            <select className="select select-bordered select-sm rounded-xl" value={currency} onChange={e => setCurrency(e.target.value)}>
                                <option value="ETH">ETH</option>
                                <option value="USD">USD</option>
                                <option value="USDC">USDC</option>
                            </select>
                        </div>

                        {/* Visibility */}
                        <div className="form-control">
                            <label className="label"><span className="label-text text-xs font-bold opacity-60">Visibility</span></label>
                            <select className="select select-bordered select-sm rounded-xl" value={visibility} onChange={e => setVisibility(e.target.value as any)}>
                                <option value="public">Public</option>
                                <option value="unlisted">Unlisted</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                    </div>

                    {/* Subscription toggle */}
                    <label className="flex items-center gap-3 cursor-pointer p-3 bg-primary/5 rounded-xl border border-primary/10">
                        <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={requiresSubscription} onChange={e => setRequiresSubscription(e.target.checked)} />
                        <span className="text-sm font-medium">Free with active subscription</span>
                    </label>

                    {/* File upload */}
                    <div
                        className="border-2 border-dashed border-base-content/20 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload size={18} className="opacity-50" />
                        <span className="text-sm opacity-60">{file ? file.name : (isEditing ? 'Replace file (optional)' : 'Upload asset file')}</span>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                    </div>

                    {error && <div className="text-error text-xs font-bold bg-error/5 p-3 rounded-xl border border-error/10">{error}</div>}

                    <div className="flex justify-between pt-2">
                        {isEditing && (
                            <button type="button" className="btn btn-sm btn-ghost text-error gap-1.5 rounded-full" onClick={handleDelete}>
                                <Trash2 size={14} /> Delete
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <button type="button" className="btn btn-sm btn-ghost rounded-full" onClick={() => dialogRef.current?.close()}>Cancel</button>
                            <button type="submit" className="btn btn-sm btn-primary rounded-full px-5" disabled={loading}>
                                {loading ? <span className="loading loading-spinner loading-xs" /> : (isEditing ? 'Save' : 'Create')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop"><button>close</button></form>
        </dialog>
    );
};
