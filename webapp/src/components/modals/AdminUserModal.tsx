import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { UserPlus, UserCog, User } from 'lucide-react';
// import type { User as UserType } from '../../types';

interface AdminUserModalProps {
    onUserUpdated: () => void;
    user?: any | null; // User to edit, if null then create mode
}

export const AdminUserModal = ({ onUserUpdated, user }: AdminUserModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState(''); // Optional if editing
    const [isAdmin, setIsAdmin] = useState(false);
    const [artistId, setArtistId] = useState<string>(''); // For linking to artist
    const [artists, setArtists] = useState<any[]>([]); // List of artists
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Fetch artists for dropdown
        const loadArtists = async () => {
             try {
                // Assuming we have an API to get simple list of artists for admin usage
                // API.getArtists() usually returns public artist list.
                // In Admin context we might want all artists? 
                // For now use public getArtists.
                const data = await API.getArtists();
                setArtists(data);
             } catch (e) {
                 console.error('Failed to load artists', e);
             }
        };
        loadArtists();
    }, []);

    useEffect(() => {
        const handleOpen = () => {
            if (user) {
                // Edit mode
                setUsername(user.username);
                setPassword(''); // Leave blank to keep unchanged
                setIsAdmin(user.isAdmin);
                setArtistId(user.artistId || '');
            } else {
                // Create mode
                setUsername('');
                setPassword('');
                setIsAdmin(false);
                setArtistId('');
            }
            setError('');
            dialogRef.current?.showModal();
        };

        // Listen for internal event OR just rely on prop change if we controlled it from parent?
        // The parent uses `document.dispatchEvent` to open. 
        // But if we pass `user` prop, we need to know when that prop changes to open?
        // Actually the parent architecture uses `CustomEvent` to open modals. 
        // We should probably stick to that or refactor parent to control open state.
        // Given the existing pattern in Admin.tsx:
        // <AdminUserModal onUserUpdated={...} /> 
        // and dispatching 'open-admin-user-modal'.
        // We should listen to the event, and maybe the event detail contains the user to edit?
        
             if (!dialogRef.current) return;

             const userToEdit = e.detail;
             if (userToEdit) {
                // Edit
                setUsername(userToEdit.username);
                setPassword('');
                setIsAdmin(userToEdit.isAdmin);
                setArtistId(userToEdit.artistId || '');
                // We need to persist the ID of user being edited if we want to update
                // But `user` prop in this component signature is likely stale if we use event.
                // Let's store user ID in state or ref.
                dialogRef.current.dataset.userId = userToEdit.id;
                dialogRef.current.dataset.mode = 'edit';
             } else {
                // Create
                setUsername('');
                setPassword('');
                setIsAdmin(false);
                setArtistId('');
                dialogRef.current.dataset.mode = 'create';
             }
             setError('');
             dialogRef.current.showModal();
        };

        document.addEventListener('open-admin-user-modal', eventListener as EventListener);
        return () => document.removeEventListener('open-admin-user-modal', eventListener as EventListener);
    }, [user]); // user dependency might be irrelevant if we use event, but let's keep it clean

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (dialogRef.current) {
            dialogRef.current.dataset.mode = mode;
            if (targetUserId) dialogRef.current.dataset.userId = targetUserId;
        }

        try {
            const payload: any = { username, isAdmin };
            if (password) payload.password = password; // Only send if set
            if (artistId) payload.artistId = artistId;
            else payload.artistId = null; // Explicitly unlink if empty

            if (mode === 'edit' && targetUserId) {
                await API.updateUser(targetUserId, payload);
            } else {
                await API.createUser({ ...payload, password }); // Password required for create
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
            <div className="modal-box bg-base-100 border border-white/5">
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
                        <select 
                            className="select select-bordered w-full"
                            value={artistId}
                            onChange={e => setArtistId(e.target.value)}
                        >
                            <option value="">None (Admin/Listener only)</option>
                            {artists.map(artist => (
                                <option key={artist.id} value={artist.id}>
                                    {artist.name}
                                </option>
                            ))}
                        </select>
                         <label className="label">
                            <span className="label-text-alt opacity-50">Linking to an artist allows this user to manage that artist's profile.</span>
                        </label>
                    </div>

                    <div className="form-control">
                        <label className="label cursor-pointer justify-start gap-4">
                            <span className="label-text">Admin Access</span>
                            <input 
                                type="checkbox" 
                                className="toggle toggle-primary"
                                checked={isAdmin}
                                onChange={e => setIsAdmin(e.target.checked)}
                            />
                        </label>
                    </div>
                    
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

