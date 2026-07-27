import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { LogIn, UserPlus, Shield, KeyRound, Settings, RotateCcw } from 'lucide-react';
import { match } from 'ts-pattern';

export const AuthModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [mode, setMode] = useState<'login' | 'register' | 'setup' | 'forgot'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotMessage, setForgotMessage] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [showSetupOffer, setShowSetupOffer] = useState(false);
    const { login, register, checkAuth, error, clearError, isFirstRun } = useAuthStore();
    const [localError, setLocalError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFidLoading, setIsFidLoading] = useState(false);
    
    // Custom FID Portal URL selection
    const DEFAULT_PORTAL = import.meta.env.VITE_GLOBAL_PORTAL_URL || "https://www.tunecamp.org";
    const [customPortalUrl, setCustomPortalUrl] = useState(() => {
        return localStorage.getItem('tunecamp_custom_fid_portal') || '';
    });
    const [showPortalConfig, setShowPortalConfig] = useState(false);

    const getEffectivePortalUrl = () => {
        const trimmed = customPortalUrl.trim();
        if (!trimmed) return DEFAULT_PORTAL;
        let url = trimmed;
        if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
        }
        return url.replace(/\/+$/, '');
    };

    const handleFidLogin = async () => {
        setLocalError('');
        clearError();
        setIsFidLoading(true);
        try {
            const clientId = "tunecamp-instance";
            const redirectUri = `${window.location.origin}/auth/sso/callback`;
            const instanceDomain = window.location.hostname;
            const portalUrl = getEffectivePortalUrl();

            if (customPortalUrl.trim()) {
                localStorage.setItem('tunecamp_custom_fid_portal', portalUrl);
            } else {
                localStorage.removeItem('tunecamp_custom_fid_portal');
            }

            const ssoUrl = `${portalUrl}/sso.html?clientId=${encodeURIComponent(clientId)}&redirectUri=${encodeURIComponent(redirectUri)}&instanceDomain=${encodeURIComponent(instanceDomain)}`;
            
            window.location.href = ssoUrl;
        } catch (err: any) {
            setLocalError(err?.message || 'FID Login redirect failed');
            setIsFidLoading(false);
        }
    };

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

    const switchMode = (newMode: 'login' | 'register' | 'setup' | 'forgot') => {
        setMode(newMode);
        clearError();
        setLocalError('');
        setShowSetupOffer(false);
        setForgotMessage('');
    };

    const handleForgotSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotMessage('');
        try {
            const result = await API.forgotPassword(forgotEmail);
            setForgotMessage(result.message);
        } catch (err: any) {
            setForgotMessage(err?.message ?? 'Something went wrong. Please try again.');
        } finally {
            setForgotLoading(false);
        }
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
            } else {
                await login(username, password);
            }

            // Close on success
            dialogRef.current?.close();
            setUsername('');
        } catch (err: any) {
            if (err.message === 'Passwords do not match') {
                setLocalError('Passwords do not match');
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
                        .with('forgot', () => <><KeyRound size={20}/> Reset Password</>)
                        .otherwise(() => <><LogIn size={20}/> Sign In</>)
                    }
                </h3>

                {mode !== 'forgot' && (
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
                    </div>
                )}

                {mode === 'forgot' ? (
                    <form onSubmit={handleForgotSubmit} className="space-y-4">
                        <p className="text-sm opacity-70">
                            Enter the email linked to your account and we'll send you a reset link.
                        </p>
                        <div className="form-control">
                            <label className="label" htmlFor="forgot-email">
                                <span className="label-text">Email</span>
                            </label>
                            <input
                                id="forgot-email"
                                type="email"
                                placeholder="you@example.com"
                                className="input input-bordered w-full"
                                value={forgotEmail}
                                onChange={e => setForgotEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        {forgotMessage && (
                            <div className="text-sm text-center opacity-80">{forgotMessage}</div>
                        )}

                        <button type="submit" className="btn btn-primary w-full mt-2" disabled={forgotLoading}>
                            {forgotLoading ? (
                                <span className="loading loading-spinner loading-sm"></span>
                            ) : (
                                'Send Reset Link'
                            )}
                        </button>

                        <div className="flex flex-col gap-2 mt-4">
                            <Link
                                to="/reset-password-security"
                                className="link link-hover text-sm w-full text-center block opacity-70"
                                onClick={() => dialogRef.current?.close()}
                            >
                                Recover via Security Questions
                            </Link>

                            <button
                                type="button"
                                className="link link-hover text-sm w-full text-center block opacity-70"
                                onClick={() => switchMode('login')}
                            >
                                Back to Sign In
                            </button>
                        </div>
                    </form>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
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

                            {mode === 'login' && (
                                <button
                                    type="button"
                                    className="link link-hover text-xs opacity-70 -mt-2"
                                    onClick={() => switchMode('forgot')}
                                >
                                    Forgot password?
                                </button>
                            )}

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

                            {mode === 'register' && (
                                <p className="text-xs opacity-60 text-center">
                                    By creating an account you agree to this instance's{' '}
                                    <Link to="/terms" className="link" onClick={() => dialogRef.current?.close()}>Terms of Service</Link>
                                    {' '}and{' '}
                                    <Link to="/privacy" className="link" onClick={() => dialogRef.current?.close()}>Privacy Policy</Link>.
                                </p>
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
                        <>
                            <button type="submit" className="btn btn-primary w-full mt-2" disabled={isLoading || isFidLoading}>
                                {isLoading ? (
                                    <span className="loading loading-spinner loading-sm"></span>
                                ) : (
                                    match(mode)
                                        .with('register', () => 'Sign Up')
                                        .with('setup', () => 'Create Admin')
                                        .otherwise(() => 'Sign In')
                                )}
                            </button>

                            {mode === 'login' && (
                                <>
                                    <div className="divider text-xs opacity-40 my-2">OR</div>
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-secondary w-full gap-2 text-xs font-semibold"
                                        disabled={isLoading || isFidLoading}
                                        onClick={handleFidLogin}
                                    >
                                        {isFidLoading ? (
                                            <span className="loading loading-spinner loading-xs"></span>
                                        ) : (
                                            <>
                                                <Shield className="w-4 h-4 text-secondary" /> Sign in with FID
                                            </>
                                        )}
                                    </button>

                                    {/* Custom FID Portal Configuration */}
                                    <div className="mt-2 text-center">
                                        <button
                                            type="button"
                                            className="text-[11px] text-text-muted hover:text-primary transition-colors inline-flex items-center justify-center gap-1 mx-auto"
                                            onClick={() => setShowPortalConfig(!showPortalConfig)}
                                        >
                                            <Settings className="w-3 h-3" />
                                            <span>
                                                {customPortalUrl.trim() ? `FID Portal: ${getEffectivePortalUrl()}` : 'Configura Portale FID'}
                                            </span>
                                        </button>

                                        {showPortalConfig && (
                                            <div className="mt-2 p-3 bg-base-200/80 border border-base-300 rounded-lg text-left space-y-2 text-xs animate-fadeIn">
                                                <label className="block text-[11px] font-medium text-text-muted">
                                                    Indirizzo Portale FID (Provider SSO)
                                                </label>
                                                <div className="flex gap-1.5">
                                                    <input
                                                        type="text"
                                                        className="input input-xs input-bordered w-full font-mono text-xs"
                                                        placeholder={DEFAULT_PORTAL}
                                                        value={customPortalUrl}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setCustomPortalUrl(val);
                                                            if (val.trim()) {
                                                                localStorage.setItem('tunecamp_custom_fid_portal', val.trim());
                                                            } else {
                                                                localStorage.removeItem('tunecamp_custom_fid_portal');
                                                            }
                                                        }}
                                                    />
                                                    {customPortalUrl && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-xs btn-ghost text-rose-400 shrink-0"
                                                            title="Ripristina Predefinito"
                                                            onClick={() => {
                                                                setCustomPortalUrl('');
                                                                localStorage.removeItem('tunecamp_custom_fid_portal');
                                                            }}
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                    <span className="text-[10px] text-text-muted">Preset:</span>
                                                    <button
                                                        type="button"
                                                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${!customPortalUrl.trim() ? 'bg-primary/20 border-primary text-primary font-semibold' : 'bg-base-300 border-base-100 hover:bg-base-100'}`}
                                                        onClick={() => {
                                                            setCustomPortalUrl('');
                                                            localStorage.removeItem('tunecamp_custom_fid_portal');
                                                        }}
                                                    >
                                                        tunecamp.org
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${customPortalUrl.includes('5173') ? 'bg-primary/20 border-primary text-primary font-semibold' : 'bg-base-300 border-base-100 hover:bg-base-100'}`}
                                                        onClick={() => {
                                                            const localUrl = 'http://localhost:5173';
                                                            setCustomPortalUrl(localUrl);
                                                            localStorage.setItem('tunecamp_custom_fid_portal', localUrl);
                                                        }}
                                                    >
                                                        localhost:5173
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </form>
                )}
            </div>

            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};

