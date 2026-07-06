import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { LogIn, UserPlus, Shield, KeyRound } from 'lucide-react';
import { match } from 'ts-pattern';

export const AuthModal = () => {
    const { t } = useTranslation('auth');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [mode, setMode] = useState<'login' | 'register' | 'setup' | 'forgot'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotMessage, setForgotMessage] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const { login, register, checkAuth, error, clearError, isFirstRun } = useAuthStore();
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
            setForgotMessage(err?.message ?? t('errors.somethingWrong'));
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
            // ponytail: sentinel string stays English — it's an internal control signal, not shown; UI copy uses t() below
            } else {
                await login(username, password);
            }

            // Close on success
            dialogRef.current?.close();
            setUsername('');
        } catch (err: any) {
            if (err.message === 'Passwords do not match') {
                setLocalError(t('errors.passwordsDoNotMatch'));
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
                        .with('register', () => <><UserPlus size={20}/> {t('titles.createAccount')}</>)
                        .with('setup', () => <><Shield size={20}/> {t('titles.createFirstAdmin')}</>)
                        .with('forgot', () => <><KeyRound size={20}/> {t('titles.resetPassword')}</>)
                        .otherwise(() => <><LogIn size={20}/> {t('titles.signIn')}</>)
                    }
                </h3>

                {mode !== 'forgot' && (
                    <div className="tabs tabs-boxed bg-base-200 p-1 mb-6 flex flex-wrap" role="tablist">
                        <button
                            className={`tab flex-auto ${mode === 'login' ? 'tab-active' : ''}`}
                            onClick={() => switchMode('login')}
                            role="tab"
                            aria-selected={mode === 'login'}
                        >{t('tabs.login')}</button>
                        <button
                            className={`tab flex-auto ${mode === 'register' ? 'tab-active' : ''}`}
                            onClick={() => switchMode('register')}
                            role="tab"
                            aria-selected={mode === 'register'}
                        >{t('tabs.register')}</button>
                    </div>
                )}

                {mode === 'forgot' ? (
                    <form onSubmit={handleForgotSubmit} className="space-y-4">
                        <p className="text-sm opacity-70">
                            {t('forgot.prompt')}
                        </p>
                        <div className="form-control">
                            <label className="label" htmlFor="forgot-email">
                                <span className="label-text">{t('fields.email')}</span>
                            </label>
                            <input
                                id="forgot-email"
                                type="email"
                                placeholder={t('fields.emailPlaceholder')}
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
                                t('actions.sendResetLink')
                            )}
                        </button>

                        <button
                            type="button"
                            className="link link-hover text-sm w-full text-center block opacity-70"
                            onClick={() => switchMode('login')}
                        >
                            {t('actions.backToSignIn')}
                        </button>
                    </form>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                                <label className="label" htmlFor="username">
                                    <span className="label-text">{t('fields.username')}</span>
                                </label>
                                <input
                                    id="username"
                                    type="text"
                                    placeholder={t('fields.usernamePlaceholder')}
                                    className="input input-bordered w-full"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    required
                                    autoComplete="username"
                                />
                            </div>

                            <div className="form-control">
                                <label className="label" htmlFor="password">
                                    <span className="label-text">{t('fields.password')}</span>
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
                                    {t('actions.forgotPassword')}
                                </button>
                            )}

                            {mode === 'register' && (
                                <div className="form-control">
                                    <label className="label" htmlFor="confirmPass">
                                        <span className="label-text">{t('fields.confirmPassword')}</span>
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
                                    <Trans
                                        t={t}
                                        i18nKey="terms.agreement"
                                        components={{
                                            terms: <Link to="/terms" className="link" onClick={() => dialogRef.current?.close()} />,
                                            privacy: <Link to="/privacy" className="link" onClick={() => dialogRef.current?.close()} />,
                                        }}
                                    />
                                </p>
                            )}

                    {(error || localError) && (
                        <div className="text-error text-sm text-center">{localError || error}</div>
                    )}

                    {showSetupOffer && (
                        <div className="bg-primary/10 p-4 rounded-lg flex flex-col gap-3">
                            <p className="text-sm opacity-90 text-center">
                                {t('setupOffer.prompt')}
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
                                        setLocalError(e?.message ?? t('errors.setupFailed'));
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                            >
                                {isLoading ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                ) : (
                                    t('actions.createAdminAccount')
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
                                    .with('register', () => t('actions.signUp'))
                                    .with('setup', () => t('actions.createAdmin'))
                                    .otherwise(() => t('actions.signIn'))
                            )}
                        </button>
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

