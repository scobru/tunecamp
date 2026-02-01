import { useState, useRef } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { LogIn, UserPlus } from 'lucide-react';

export const AuthModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const { login, register, error } = useAuthStore();
    const [localError, setLocalError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');
        
        try {
            if (isRegister) {
                if (password !== confirmPass) {
                    setLocalError('Passwords do not match');
                    return;
                }
                await register(username, password);
            } else {
                await login(username, password);
            }
            // Close on success
            dialogRef.current?.close();
            setUsername('');
            setPassword('');
            setConfirmPass('');
        } catch (err) {
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
                    {isRegister ? <><UserPlus size={20}/> Create Account</> : <><LogIn size={20}/> Login</>}
                </h3>

                <div className="tabs tabs-boxed bg-base-200 p-1 mb-6">
                    <button 
                        className={`tab flex-1 ${!isRegister ? 'tab-active' : ''}`}
                        onClick={() => setIsRegister(false)}
                    >Login</button>
                    <button 
                        className={`tab flex-1 ${isRegister ? 'tab-active' : ''}`}
                        onClick={() => setIsRegister(true)}
                    >Register</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
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
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Password</span>
                        </label>
                        <input 
                            type="password" 
                            placeholder="••••••" 
                            className="input input-bordered w-full" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete={isRegister ? "new-password" : "current-password"}
                        />
                    </div>
                    
                    {isRegister && (
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
                        {isRegister ? 'Sign Up' : 'Sign In'}
                    </button>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
