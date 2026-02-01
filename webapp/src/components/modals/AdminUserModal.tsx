import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { UserPlus } from 'lucide-react';
// import type { User as UserType } from '../../types';

interface AdminUserModalProps {
    onUserUpdated: () => void;
}

export const AdminUserModal = ({ onUserUpdated }: AdminUserModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleOpen = () => {
            setUsername('');
            setPassword('');
            setIsAdmin(false);
            setError('');
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-user-modal', handleOpen);
        return () => document.removeEventListener('open-admin-user-modal', handleOpen);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await API.createUser({ username, password, isAdmin });
            onUserUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            setError(e.message || 'Failed to create user');
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
                    <UserPlus size={20}/> Add User
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
                            <span className="label-text">Password</span>
                        </label>
                        <input 
                            type="password" 
                            className="input input-bordered w-full" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
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
                            {loading ? 'Creating...' : 'Create User'}
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
