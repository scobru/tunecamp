import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { UserPlus, UserCog, ExternalLink } from 'lucide-react';

interface AdminUserModalProps {
    onUserUpdated: () => void;
    user?: any | null; // User to edit, if null then create mode
}

export const AdminUserModal = ({ onUserUpdated, user }: AdminUserModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState(''); // Optional if editing
    const [role, setRole] = useState('user');
    const [artistId, setArtistId] = useState<string>(''); // For linking to artist
    const [artists, setArtists] = useState<any[]>([]); // List of artists
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRoot, setIsRoot] = useState(false);
    const [isAdminUser, setIsAdminUser] = useState(false);
    const [salesEnabled, setSalesEnabled] = useState(true);
    const [initialSalesEnabled, setInitialSalesEnabled] = useState(true);
    const [isActive, setIsActive] = useState(true);
    const [initialIsActive, setInitialIsActive] = useState(true);
    const [storageQuota, setStorageQuota] = useState<number>(0);
    const [canPeer, setCanPeer] = useState(false);
    const [initialCanPeer, setInitialCanPeer] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // Publishing requires Curator+ with an artist link: listeners are
    // consumers, so changing the role to Listener clears the artist link.
    useEffect(() => {
        if (role === 'user') {
            setArtistId('');
        }
    }, [role]);

    // Sales-enabled is a property of the linked artist, but it's managed here so
    // the admin controls it from the user that owns the artist. Mirror the
    // artist's current can_sell whenever the linked artist changes/loads.
    useEffect(() => {
        if (!isEditMode || !artistId) {
            setSalesEnabled(true);
            setInitialSalesEnabled(true);
            return;
        }
        const linked = artists.find(a => String(a.id) === String(artistId));
        if (linked) {
            const cs = linked.can_sell !== 0;
            setSalesEnabled(cs);
            setInitialSalesEnabled(cs);
        }
    }, [artistId, artists, isEditMode]);

    useEffect(() => {
        const loadData = async () => {
             try {
                const [artistsData, meData] = await Promise.all([
                    API.getArtists(),
                    API.getCurrentUser()
                ]);
                setArtists(artistsData);
                setIsRoot(!!meData.isRootAdmin);
                setIsAdminUser(!!meData.isRootAdmin || !!meData.isAdmin);
             } catch (e) {
                 console.error('Failed to load data', e);
             }
        };
        loadData();
        
        const refreshListener = () => loadData();
        window.addEventListener('refresh-admin-artists', refreshListener);
        return () => window.removeEventListener('refresh-admin-artists', refreshListener);
    }, []);

    useEffect(() => {

        // If parent controls it purely via props/boolean, this would be used.
        // But the architecture seems to use events.
        
        const eventListener = (e: CustomEvent) => {
             if (!dialogRef.current) return;

             const userToEdit = e.detail;
             if (userToEdit) {
                // Edit
                setUsername(userToEdit.username);
                setPassword('');
                setRole(userToEdit.role || (userToEdit.isAdmin ? 'admin' : 'user'));
                setArtistId(userToEdit.artistId || userToEdit.artist_id || '');
                setIsActive(userToEdit.is_active !== 0);
                setInitialIsActive(userToEdit.is_active !== 0);
                setStorageQuota(userToEdit.storage_quota !== undefined ? userToEdit.storage_quota : 0);
                setCanPeer(userToEdit.can_peer === 1);
                setInitialCanPeer(userToEdit.can_peer === 1);
                setIsEditMode(true);

                dialogRef.current.dataset.userId = userToEdit.id;
                dialogRef.current.dataset.mode = 'edit';
             } else {
                // Create
                setUsername('');
                setPassword('');
                setRole('user');
                setArtistId('');
                setIsActive(true);
                setInitialIsActive(true);
                setStorageQuota(1024 * 1024 * 1024); // default 1GB for new users
                setCanPeer(false);
                setInitialCanPeer(false);
                setIsEditMode(false);
                dialogRef.current.dataset.mode = 'create';
             }
             setError('');
             dialogRef.current.showModal();
        };

        document.addEventListener('open-admin-user-modal', eventListener as EventListener);
        return () => document.removeEventListener('open-admin-user-modal', eventListener as EventListener);
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const mode = dialogRef.current?.dataset.mode || 'create';
        const targetUserId = dialogRef.current?.dataset.userId;

        try {
            const payload: any = { username, role, storageQuota };
            if (password) payload.password = password; // Only send if set
            if (artistId) payload.artistId = artistId;
            else payload.artistId = null; // Explicitly unlink if empty

            if (mode === 'edit' && targetUserId) {
                await API.updateUser(targetUserId, payload);
                
                // Update status if changed (only root admin can do this)
                if (isRoot && isActive !== initialIsActive) {
                    await API.updateUserStatus(targetUserId, isActive);
                }

                // Update peer sharing permission if changed (only root admin can do this)
                if (isRoot && canPeer !== initialCanPeer) {
                    await API.updateUserCanPeer(Number(targetUserId), canPeer);
                }

                // Sales-enabled lives on the linked artist; admins toggle it here.
                if (isAdminUser && artistId && salesEnabled !== initialSalesEnabled) {
                    await API.updateArtist(String(artistId), { canSell: salesEnabled });
                }
            } else {
                const res = await API.createUser({ ...payload, password }); // Password required for create
                if (isRoot && canPeer && res?.id) {
                    await API.updateUserCanPeer(Number(res.id), true);
                }
            }
            
            onUserUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Failed to save user');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="admin-user-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 max-h-[90vh] overflow-y-auto">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    {dialogRef.current?.dataset.mode === 'edit' ? <UserCog size={20}/> : <UserPlus size={20}/>} 
                    {dialogRef.current?.dataset.mode === 'edit' ? 'Edit User' : 'Add User'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Username</span>
                        </label>
                        <input 
                            type="text" 
                            className="input input-bordered w-full" 
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">
                                Password 
                                {dialogRef.current?.dataset.mode === 'edit' && <span className="opacity-50 text-xs font-normal ml-2">(Leave blank to keep current)</span>}
                            </span>
                        </label>
                        <input 
                            type="password" 
                            className="input input-bordered w-full" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            // Required only on create
                            required={dialogRef.current?.dataset.mode !== 'edit'}
                        />
                    </div>

                    <div className="form-control">
                         <label className="label">
                            <span className="label-text">Link to Artist</span>
                        </label>
                        <div className="flex gap-2">
                            <select
                                className="select select-bordered w-full"
                                value={artistId}
                                onChange={e => setArtistId(e.target.value)}
                            >
                                <option value="">None</option>
                                {artists.map(artist => (
                                    <option key={artist.id} value={artist.id}>
                                        {artist.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn btn-square btn-outline btn-primary"
                                title="Create New Artist"
                                onClick={() => document.dispatchEvent(new CustomEvent('open-admin-artist-modal'))}
                            >
                                +
                            </button>
                        </div>
                         <label className="label">
                            <span className="label-text-alt opacity-50">
                                {role === 'user'
                                    ? "Listeners (Standard Users) cannot be linked to an artist profile — promote them to Curator first."
                                    : "Linking to an artist lets this user manage that artist's profile and publish music for it."}
                            </span>
                        </label>
                        {isEditMode && artistId && (
                            <div className="flex justify-center mt-1">
                                <button
                                    type="button"
                                    className="btn btn-xs btn-ghost gap-1 text-primary h-auto min-h-0 py-1"
                                    onClick={() => {
                                        const fullArtist = artists.find(a => String(a.id) === String(artistId));
                                        dialogRef.current?.close();
                                        document.dispatchEvent(new CustomEvent('open-admin-artist-modal', { detail: fullArtist ?? { id: artistId } }));
                                    }}
                                >
                                    <ExternalLink size={11} /> Edit Artist Profile
                                </button>
                            </div>
                        )}
                    </div>

                    {isEditMode && artistId && isAdminUser && (
                        <div className="bg-base-200/50 rounded-lg p-4 border border-base-content/5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-bold">Sales enabled (verified artist)</span>
                                    <p className="text-xs opacity-50 mt-1">
                                        Off: the linked artist publishes free content only — prices are stripped and checkout refuses purchases. Turn on once you have verified the artist owns the rights to what they sell.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-success shrink-0 mt-0.5"
                                    checked={salesEnabled}
                                    onChange={e => setSalesEnabled(e.target.checked)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">User Role</span>
                        </label>
                        <select 
                            className="select select-bordered w-full"
                            value={role}
                            onChange={e => setRole(e.target.value)}
                            disabled={dialogRef.current?.dataset.userId === '1'} // Cannot change root admin role
                        >
                            <option value="user">Listener (Standard User)</option>
                            <option value="super_user">Curator (Super User / Library Management)</option>
                            <option value="admin">Manager (Full Admin)</option>
                            {role === 'root_admin' && <option value="root_admin">Root Admin</option>}
                        </select>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Storage Quota</span>
                        </label>
                        <select 
                            className="select select-bordered w-full"
                            value={storageQuota}
                            onChange={e => setStorageQuota(Number(e.target.value))}
                            disabled={dialogRef.current?.dataset.userId === '1'} // Root admin is unlimited
                        >
                            <option value="0">Unlimited (Root/Managers)</option>
                            <option value="1073741824">1 GB</option>
                            <option value="5368709120">5 GB</option>
                            <option value="10737418240">10 GB</option>
                            <option value="21474836480">20 GB</option>
                            <option value="53687091200">50 GB</option>
                            <option value="107374182400">100 GB</option>
                            {![0, 1073741824, 5368709120, 10737418240, 21474836480, 53687091200, 107374182400].includes(Number(storageQuota)) && (
                                <option value={storageQuota}>Custom ({(Number(storageQuota) / 1024 / 1024 / 1024).toFixed(1)} GB)</option>
                            )}
                        </select>
                    </div>

                    {isRoot && dialogRef.current?.dataset.mode === 'edit' && (
                         <div className="form-control">
                            <label className="label cursor-pointer justify-start gap-4">
                                <span className="label-text">Active Status</span>
                                <input 
                                    type="checkbox" 
                                    className="toggle toggle-success"
                                    checked={isActive}
                                    onChange={e => setIsActive(e.target.checked)}
                                    disabled={dialogRef.current?.dataset.userId === '1'} // Cannot disable root
                                />
                            </label>
                        </div>
                    )}


                    
                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : (dialogRef.current?.dataset.mode === 'edit' ? 'Update User' : 'Create User')}
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

