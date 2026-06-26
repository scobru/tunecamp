import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { User, Image as ImageIcon, Globe, AlertTriangle, Search } from 'lucide-react';
import type { User as DbUser, ArtistLink } from '../../types';
import { ArtistStripeConnectCard } from '../artist/ArtistStripeConnectCard';
import { LinksEditor } from '../ui/LinksEditor';

interface AdminArtistModalProps {
    onArtistUpdated: () => void;
}

export const AdminArtistModal = ({ onArtistUpdated }: AdminArtistModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [bio, setBio] = useState('');
    
    // ActivityPub / Mastodon Conf
    const [mastodonInstance, setMastodonInstance] = useState('');
    const [mastodonToken, setMastodonToken] = useState('');
    
    // Links
    const [donationUrl, setDonationUrl] = useState('');
    const [socialLinks, setSocialLinks] = useState<{platform: string, url: string}[]>([]);
    
    const [walletAddress, setWalletAddress] = useState('');
    
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | number | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarUrl, setAvatarUrl] = useState('');
    const [candidates, setCandidates] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<DbUser | null>(null);
    const [isLibraryOnly, setIsLibraryOnly] = useState(false);
    const [canSell, setCanSell] = useState(true);

    const isRootAdmin = !!currentUser?.isRootAdmin;
    const isAdminUser = isRootAdmin || !!currentUser?.isAdmin;
    const isSelf = currentUser && editId && String(currentUser.artistId) === String(editId);
    const canEditSensitive = !isEditing || isSelf || isRootAdmin; // Can edit sensitive fields on create, if it's self, or if root admin

    useEffect(() => {
        API.getCurrentUser().then(setCurrentUser).catch(console.error);

        const handleOpen = (e: CustomEvent) => {
            if (e.detail && e.detail.id) {
                // Edit Mode
                const artist = e.detail;
                setIsEditing(true);
                setEditId(String(artist.id));
                setName(artist.name || '');
                setSlug(artist.slug || '');
                setBio(artist.bio || artist.description || '');
                
                // Parse postParams for Mastodon
                if (artist.postParams) {
                    let params = artist.postParams;
                    if (typeof params === 'string') {
                        try { params = JSON.parse(params); } catch { params = {}; }
                    }
                    setMastodonInstance(params.instance || '');
                    setMastodonToken(params.token || '');
                } else {
                    setMastodonInstance('');
                    setMastodonToken('');
                }

                // Parse links
                if (artist.links) {
                    let linksArr = artist.links;
                    if (typeof linksArr === 'string') {
                        try { linksArr = JSON.parse(linksArr); } catch { linksArr = []; }
                    }
                    if (Array.isArray(linksArr)) {
                        const donation = (linksArr as Array<{ type?: string; platform?: string; url?: string }>).find(l => l.type === 'support' || l.platform?.toLowerCase() === 'donation');
                        setDonationUrl(donation && donation.url ? donation.url : "");
                        setSocialLinks((linksArr as Array<{ type?: string; platform?: string; url: string }>).filter(l => l.type !== 'support' && l.platform?.toLowerCase() !== 'donation').map(l => ({
                            platform: l.platform || 'Social',
                            url: l.url
                        })));
                    }
                } else {
                    setDonationUrl('');
                    setSocialLinks([]);
                }
                
                
                setWalletAddress(artist.walletAddress || '');
                setIsLibraryOnly(!!artist.isLibraryArtist);
                setCanSell(artist.can_sell !== 0);

            } else {
                // Create Mode
                setIsEditing(false);
                setEditId(null);
                setName('');
                setSlug('');
                setBio('');
                setMastodonInstance('');
                setMastodonToken('');
                setDonationUrl('');
                setSocialLinks([]);
                setWalletAddress('');
                setIsLibraryOnly(false); // Manually created artists get all fields
                setCanSell(true);
            }
            
            setAvatarFile(null);
            setAvatarUrl('');
            setCandidates([]);
            setError('');
            setWarning('');
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-artist-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-admin-artist-modal', handleOpen as EventListener);
    }, []);

    const handleSelectCandidate = (match: any) => {
        if (match.bioIT || match.bio) {
            setBio(match.bioIT || match.bio);
        }
        
        if (match.avatarUrl) {
            setAvatarUrl(match.avatarUrl);
        }
        
        // Merge links
        if (match.links && match.links.length > 0) {
            setSocialLinks(prev => {
                const existingUrls = new Set(prev.map(l => l.url.toLowerCase()));
                // handle both arrays of structures and simple key-value structures from various providers
                let incomingLinks = [];
                if (Array.isArray(match.links)) {
                    incomingLinks = match.links;
                } else if (typeof match.links === 'object') {
                    incomingLinks = Object.entries(match.links).map(([platform, url]) => ({
                        platform: platform.charAt(0).toUpperCase() + platform.slice(1),
                        url: url as string
                    }));
                }
                const newLinks = incomingLinks.filter((l: any) => l.url && !existingUrls.has(l.url.toLowerCase()));
                return [...prev, ...newLinks];
            });
        }
        setCandidates([]);
    };

    const handleFetchArtistMetadata = async () => {
        if (!name) {
            setError("Please enter an artist name first");
            return;
        }
        setLoading(true);
        setError('');
        setCandidates([]);
        try {
            const results = await API.searchArtistMetadata(name);
            if (results && results.length > 0) {
                if (results.length === 1) {
                    // Auto-apply if only one match is found
                    handleSelectCandidate(results[0]);
                } else {
                    setCandidates(results);
                }
            } else {
                setError("No artist info found on any provider");
            }
        } catch (err: any) {
            console.error(err);
            setError("Failed to fetch artist metadata");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setWarning('');

        try {
            const postParamsValue = (mastodonInstance || mastodonToken) ? {
                instance: mastodonInstance,
                token: mastodonToken
            } : null;

            const allLinks: Array<ArtistLink> = socialLinks.map(l => ({ ...l, type: 'social' as const }));
            if (donationUrl) {
                allLinks.unshift({ platform: 'Donation', url: donationUrl, type: 'support' });
            }

            let artist;
            
            if (isEditing && editId) {
                artist = await API.updateArtist(String(editId), {
                    name,
                    slug: slug || undefined,
                    bio,
                    links: allLinks,
                    postParams: postParamsValue,
                    walletAddress: walletAddress || undefined,
                    ...(isAdminUser ? { canSell } : {})
                });
            } else {
                artist = await API.createArtist({ 
                    name, 
                    slug: slug || undefined, 
                    bio,
                    links: allLinks,
                    postParams: postParamsValue,
                    walletAddress: walletAddress || undefined
                });
            }

            // Upload avatar if selected (file takes precedence over URL)
            if (avatarFile && artist) {
                try {
                    await API.uploadArtistAvatar(String(artist.id), avatarFile);
                } catch (err: any) {
                    setWarning("Profile saved, but avatar file upload failed.");
                }
            } else if (avatarUrl && artist) {
                try {
                    await API.uploadArtistAvatarUrl(String(artist.id), avatarUrl);
                } catch (err: any) {
                    console.warn("Avatar URL download failed:", err);
                    setWarning("Profile saved, but failed to download avatar from URL. You can try a different URL or upload a file.");
                }
            }

            if (!warning) {
                onArtistUpdated();
                dialogRef.current?.close();
            } else {
                // If there's a warning, we don't close automatically so user sees it
                onArtistUpdated();
                setLoading(false);
            }
        } catch (e: unknown) {
            console.error(e);
            setError((e as Error).message || 'Failed to save artist');
            setLoading(false);
        } finally {
            if (!warning) setLoading(false);
        }
    };

    return (
        <dialog id="admin-artist-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 w-11/12 max-w-2xl max-h-[90vh] overflow-y-auto">
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
                                <button 
                                    type="button" 
                                    className="label-text-alt btn btn-xs btn-ghost gap-1 h-auto min-h-0 py-1"
                                    onClick={handleFetchArtistMetadata}
                                    disabled={loading}
                                >
                                    <Search size={12}/> {loading ? 'Fetching...' : 'Fetch Info & Avatar'}
                                </button>
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

                    {candidates.length > 0 && (
                        <div className="bg-base-200/50 border border-base-content/10 rounded-xl p-4 mt-2 space-y-3 shadow-inner backdrop-blur-md">
                            <div className="flex justify-between items-center text-xs font-semibold tracking-normal opacity-75">
                                <span className="flex items-center gap-1.5 text-primary">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    Select artist info to import:
                                </span>
                                <button type="button" className="btn btn-xs btn-ghost btn-circle" onClick={() => setCandidates([])}>✕</button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {candidates.map((c, idx) => (
                                    <div 
                                        key={`${c.source}-${c.id}-${idx}`} 
                                        className="flex items-center gap-3 p-3 rounded-lg bg-base-100 hover:bg-base-300 border border-base-content/5 hover:border-base-content/10 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md"
                                        onClick={() => handleSelectCandidate(c)}
                                    >
                                        <div className="avatar shrink-0">
                                            <div className="w-12 h-12 rounded-full ring-2 ring-base-content/5 bg-neutral text-neutral-content flex items-center justify-center overflow-hidden">
                                                {c.avatarUrl ? (
                                                    <img 
                                                        src={c.avatarUrl} 
                                                        alt={c.name} 
                                                        className="object-cover w-full h-full"
                                                        onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold">{c.name.substring(0, 2)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm truncate text-base-content">{c.name}</div>
                                            {c.bio && <div className="text-[11px] opacity-60 line-clamp-2 mt-0.5 leading-tight">{c.bio}</div>}
                                        </div>
                                        <span className={`badge badge-sm badge-outline shrink-0 capitalize ${
                                            c.source === 'theaudiodb' ? 'text-secondary border-secondary/30' :
                                            c.source === 'soundcloud' ? 'text-warning border-warning/30' :
                                            c.source === 'bandcamp' ? 'text-accent border-accent/30' :
                                            'text-info border-info/30'
                                        }`}>
                                            {c.source}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!isLibraryOnly && (
                        <>
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Description / Bio</span>
                                </label>
                                <textarea 
                                    className="textarea textarea-bordered h-24" 
                                    value={bio}
                                    onChange={e => setBio(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text font-bold text-success">Donation / Support URL</span>
                                    </label>
                                    <input 
                                        type="url" 
                                        className="input input-bordered w-full border-success/30" 
                                        value={donationUrl}
                                        onChange={e => setDonationUrl(e.target.value)}
                                        placeholder="https://ko-fi.com/..."
                                    />
                                </div>
                                <LinksEditor
                                    label="Social Links"
                                    links={socialLinks}
                                    onChange={setSocialLinks}
                                />
                            </div>
                            
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-bold text-accent">Payment Wallet Address (optional)</span>
                                </label>
                                <input 
                                    type="text" 
                                    className="input input-bordered w-full border-accent/30 font-mono text-sm" 
                                    value={walletAddress}
                                    onChange={e => setWalletAddress(e.target.value)}
                                    placeholder="0x..."
                                    disabled={!canEditSensitive && walletAddress !== ''}
                                />
                                <label className="label">
                                    <span className="label-text-alt opacity-70">
                                        {(!canEditSensitive && walletAddress !== '') ?
                                            "Only the artist can change their wallet once set." :
                                            "If provided, payments for this artist's releases will be sent directly to this address."
                                        }
                                    </span>
                                </label>
                            </div>

                            {isEditing && (isAdminUser || isSelf) && editId && (
                                <ArtistStripeConnectCard artistId={editId} />
                            )}

                            {isEditing && isAdminUser && (
                                <div className="form-control bg-base-200/50 rounded-lg p-4 border border-base-content/5">
                                    <label className="label cursor-pointer justify-between py-0">
                                        <div>
                                            <span className="label-text font-bold">Sales enabled (verified artist)</span>
                                            <p className="text-xs opacity-50 mt-1">
                                                Off: this artist publishes free content only — prices are stripped and checkout refuses purchases. Turn on once you have verified the artist owns the rights to what they sell.
                                            </p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="toggle toggle-success"
                                            checked={canSell}
                                            onChange={e => setCanSell(e.target.checked)}
                                        />
                                    </label>
                                </div>
                            )}

                            <div className="divider text-xs opacity-50 tracking-normal">ActivityPub / Mastodon Config</div>
                            <div className="bg-base-200 p-4 rounded-lg space-y-4">
                                <div className="alert alert-info py-2 text-xs bg-info/10 border-info/20 mb-2">
                                    <Globe size={16}/> 
                                    <div>
                                        <p className="font-bold">Mastodon Auto-Posting</p>
                                        <p>This section is for cross-posting your releases to an <strong>external</strong> Mastodon account. 
                                        Internal ActivityPub federation uses keys automatically managed by the system.</p>
                                    </div>
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
                                        disabled={!canEditSensitive}
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
                                        disabled={!canEditSensitive}
                                    />
                                </div>
                                {!canEditSensitive && (
                                    <p className="text-xs opacity-40 px-1 italic">Note: Only the artist can manage their Mastodon cross-posting credentials.</p>
                                )}
                            </div>
                        </>
                    )}

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Artist Avatar</span>
                        </label>
                         <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                {isEditing && editId && !avatarFile && (
                                    <div className="avatar">
                                        <div className="w-16 h-16 rounded-full border border-base-content/10">
                                            <img src={API.getArtistCoverUrl(String(editId), Date.now())} />
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 space-y-2">
                                    <input 
                                        type="url" 
                                        className="input input-bordered w-full text-sm"
                                        placeholder="Paste image URL here..."
                                        value={avatarUrl}
                                        onChange={e => setAvatarUrl(e.target.value)}
                                    />
                                    <div className="divider text-xs opacity-30 my-0">OR UPLOAD FILE</div>
                                    <input 
                                        type="file" 
                                        className="file-input file-input-bordered w-full file-input-sm"
                                        accept="image/*"
                                        onChange={e => setAvatarFile(e.target.files ? e.target.files[0] : null)}
                                    />
                                </div>
                                {avatarFile && <ImageIcon className="text-success" size={24}/>}
                            </div>
                         </div>
                         <label className="label">
                            <span className="label-text-alt opacity-70">JPG or PNG, max 5MB. Providing a URL will download the image to the server.</span>
                        </label>
                    </div>
                    
                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    {warning && (
                        <div className="alert alert-warning text-sm py-2 bg-warning/10 border-warning/20 text-warning">
                            <AlertTriangle size={16} />
                            <span>{warning}</span>
                        </div>
                    )}

                    <div className="modal-action flex justify-between items-center">
                        {warning ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialogRef.current?.close()}>
                                Close Anyway
                            </button>
                        ) : (
                            <div />
                        )}
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {loading ? 'Saving...' : (isEditing ? 'Update Artist' : 'Create Artist')}
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

