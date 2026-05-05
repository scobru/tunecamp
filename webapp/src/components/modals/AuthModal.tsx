import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { LogIn, UserPlus, Shield } from 'lucide-react';
import { match } from 'ts-pattern';

export const AuthModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [mode, setMode] = useState<'login' | 'register' | 'setup' | 'pair'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [pairJson, setPairJson] = useState('');
    const { login, register, loginWithPair, checkAuth, error, clearError, isFirstRun } = useAuthStore();
    const [localError, setLocalError] = useState('');
    const [showSetupOffer, setShowSetupOffer] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const handleOpen = () => {
            dialogRef.current?.showModal();
            if (isFirstRun) {
                setMode('login'); // Show setup offer if first run
                setShowSetupOffer(true);
            } else {
                setMode('login'); 
                setShowSetupOffer(false);
            }
            clearError();
            setLocalError('');
        };
        document.addEventListener('open-auth-modal', handleOpen);
        return () => document.removeEventListener('open-auth-modal', handleOpen);
    }, [isFirstRun]);

    const switchMode = (newMode: 'login' | 'register' | 'setup' | 'pair') => {
        setMode(newMode);
        clearError();
        setLocalError('');
        setShowSetupOffer(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');
        clearError();
        setIsLoading(true);
        
        try {
            if (mode === 'register') {
                if (password !== confirmPass) {
                    throw new Error('Passwords do not match');
                }
                await register(username, password);
            } else if (mode === 'pair') {
                try {
                    const parsedPair = JSON.parse(pairJson);
                    if (!parsedPair.pub || !parsedPair.priv || !parsedPair.epub || !parsedPair.epriv) {
                        throw new Error('Invalid Pair JSON structure');
                    }
                    await loginWithPair(parsedPair);
                } catch (e: any) {
                    throw new Error('Invalid JSON Pair: ' + e.message);
                }
            } else {
                await login(username, password);
            }

            // Close on success
            dialogRef.current?.close();
            setUsername('');
            setPairJson('');
        } catch (err: any) {
            if (err.message === 'Passwords do not match') {
                setLocalError('Passwords do not match');
            } else if (err.message.includes('JSON Pair')) {
                setLocalError(err.message);
            }
            // Error managed by store usually
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <dialog id="auth-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 max-w-sm">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="Close">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    {match(mode)
                        .with('register', () => <><UserPlus size={20}/> Create Account</>)
                        .with('setup', () => <><Shield size={20}/> Create First Admin</>)
                        .with('pair', () => <><Shield size={20}/> Pair Login</>)
                        .otherwise(() => <><LogIn size={20}/> Sign In</>)
                    }
                </h3>

                <div className="tabs tabs-boxed bg-base-200 p-1 mb-6 flex flex-wrap" role="tablist">
                    <button 
                        className={`tab flex-auto ${mode === 'login' ? 'tab-active' : ''}`}
                        onClick={() => switchMode('login')}
                        role="tab"
                        aria-selected={mode === 'login'}
                    >Login</button>
                    <button 
                        className={`tab flex-auto ${mode === 'register' ? 'tab-active' : ''}`}
                        onClick={() => switchMode('register')}
                        role="tab"
                        aria-selected={mode === 'register'}
                    >Register</button>
                    <button 
                        className={`tab flex-auto ${mode === 'pair' ? 'tab-active' : ''}`}
                        onClick={() => switchMode('pair')}
                        role="tab"
                        aria-selected={mode === 'pair'}
                    >Pair</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'pair' ? (
                        <div className="form-control">
                            <label className="label" htmlFor="pairJson">
                                <span className="label-text">Gun Pair (JSON)</span>
                            </label>
                            <textarea 
                                id="pairJson"
                                placeholder='{"pub": "...", "priv": "..."}' 
                                className="textarea textarea-bordered h-32 w-full font-mono text-xs" 
                                value={pairJson}
                                onChange={e => setPairJson(e.target.value)}
                                required
                            />
                            <label className="label">
                                <span className="label-text-alt opacity-70">Paste your exported account pair here to log in.</span>
                            </label>
                        </div>
                    ) : (
                        <>
                            <div className="form-control">
                                <label className="label" htmlFor="username">
                                    <span className="label-text">Username</span>
                                </label>
                                <input 
                                    id="username"
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
                                <label className="label" htmlFor="password">
                                    <span className="label-text">Password</span>
                                </label>
                                <input 
                                    id="password"
                                    type="password" 
                                    placeholder="••••••" 
                                    className="input input-bordered w-full" 
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    autoComplete={mode === 'register' ? "new-password" : "current-password"}
                                />
                            </div>
                            
                            {mode === 'register' && (
                                <div className="form-control">
                                    <label className="label" htmlFor="confirmPass">
                                        <span className="label-text">Confirm Password</span>
                                    </label>
                                    <input 
                                        id="confirmPass"
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
                        </>
                    )}

                    {(error || localError) && (
                        <div className="text-error text-sm text-center">{localError || error}</div>
                    )}

                    {showSetupOffer && (
                        <div className="bg-primary/10 p-4 rounded-lg flex flex-col gap-3">
                            <p className="text-sm opacity-90 text-center">
                                No admin account yet. Create the first admin with the credentials above.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm w-full"
                                disabled={isLoading}
                                onClick={async () => {
                                    setLocalError('');
                                    setIsLoading(true);
                                    try {
                                        const result = await API.setup(username, password);
                                        API.setToken(result.token);
                                        await checkAuth();
                                        dialogRef.current?.close();
                                        setUsername('');
                                        setPassword('');
                                        setShowSetupOffer(false);
                                    } catch (e: any) {
                                        setLocalError(e?.message ?? 'Setup failed');
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                            >
                                {isLoading ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                ) : (
                                    'Create Admin Account'
                                )}
                            </button>
                        </div>
                    )}
                    
                    {!showSetupOffer && (
                        <button type="submit" className="btn btn-primary w-full mt-2" disabled={isLoading}>
                            {isLoading ? (
                                <span className="loading loading-spinner loading-sm"></span>
                            ) : (
                                match(mode)
                                    .with('register', () => 'Sign Up')
                                    .with('setup', () => 'Create Admin')
                                    .otherwise(() => 'Sign In')
                            )}
                        </button>
                    )}
                </form>
            </div>

            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};

