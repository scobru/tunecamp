import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { LogIn, UserPlus } from 'lucide-react';

export const AuthModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [mode, setMode] = useState<'admin' | 'user' | 'register'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const { login, register, error } = useAuthStore();
    const [localError, setLocalError] = useState('');

    useEffect(() => {
        const handleOpen = () => {
            dialogRef.current?.showModal();
            setMode('admin'); // Default to admin or user preference? Admin is common for owner.
        };
        document.addEventListener('open-auth-modal', handleOpen);
        return () => document.removeEventListener('open-auth-modal', handleOpen);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');
        
        try {
            if (mode === 'register') {
                if (password !== confirmPass) {
                    setLocalError('Passwords do not match');
                    return;
                }
                await register(username, password);
            } else if (mode === 'admin') {
                await login('admin', password);
            } else {
                await login(username, password);
            }
            // Close on success
            dialogRef.current?.close();
            setUsername('');
            setPassword('');
            setConfirmPass('');
        } catch (err: any) {
            // Error managed by store usually, but set local if needed
        }
    };

    return (
        <dialog id="auth-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5 max-w-sm">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    {mode === 'register' ? <UserPlus size={20}/> : <LogIn size={20}/>} 
                    {mode === 'register' ? 'Create Account' : (mode === 'admin' ? 'Admin Login' : 'User Login')}
                </h3>

                <div className="tabs tabs-boxed bg-base-200 p-1 mb-6">
                    <button 
                        className={`tab flex-1 ${mode === 'admin' ? 'tab-active' : ''}`}
                        onClick={() => setMode('admin')}
                    >Admin</button>
                    <button 
                        className={`tab flex-1 ${mode === 'user' ? 'tab-active' : ''}`}
                        onClick={() => setMode('user')}
                    >User</button>
                    <button 
                        className={`tab flex-1 ${mode === 'register' ? 'tab-active' : ''}`}
                        onClick={() => setMode('register')}
                    >Register</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode !== 'admin' && (
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Username</span>
                            </label>
                            <input 
                                type="text" 
                                placeholder="username" 
                                className="input input-bordered w-full" 
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                            />
                        </div>
                    )}

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Password</span>
                        </label>
                        <input 
                            type="password" 
                            placeholder={mode === 'admin' ? "Admin Password" : "••••••"} 
                            className="input input-bordered w-full" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete={mode === 'register' ? "new-password" : "current-password"}
                        />
                    </div>

                    {/* Hidden username for accessibility/password managers in Admin mode */}
                    {mode === 'admin' && (
                        <input 
                            type="text" 
                            name="username" 
                            value="admin" 
                            readOnly 
                            className="hidden" 
                            autoComplete="username"
                        />
                    )}
                    
                    {mode === 'register' && (
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Confirm Password</span>
                            </label>
                            <input 
                                type="password" 
                                placeholder="••••••" 
                                className="input input-bordered w-full" 
                                value={confirmPass}
                                onChange={e => setConfirmPass(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    {(error || localError) && (
                        <div className="text-error text-sm text-center">{localError || error}</div>
                    )}

                    <button type="submit" className="btn btn-primary w-full mt-2">
                        {mode === 'register' ? 'Sign Up' : 'Sign In'}
                    </button>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
