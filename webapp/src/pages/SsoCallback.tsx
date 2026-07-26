import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import API from '../services/api';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { notify } from '../utils/notify';

export const SsoCallback = () => {
    const navigate = useNavigate();
    const { checkAuth } = useAuthStore();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // The global portal sets the payload in the URL hash fragment to prevent leakage
                const hash = window.location.hash;
                if (!hash || !hash.startsWith('#payload=')) {
                    throw new Error("Manca il payload SSO nella URL (hash fragment)");
                }

                const payloadRaw = decodeURIComponent(hash.replace('#payload=', ''));
                const { ssoToken, apSeed } = JSON.parse(payloadRaw);

                if (!ssoToken) {
                    throw new Error("Token SSO mancante nel payload");
                }

                // Chiamata backend per login/registrazione
                const response = await (API as any).loginWithSso(ssoToken, apSeed);
                
                if (response.success && response.token) {
                    API.setToken(response.token);
                    await checkAuth(); // refresh user data
                    notify.success(response.isNewUser ? "Benvenuto! Identità FID creata con successo." : "Accesso effettuato con FID!");
                    navigate('/', { replace: true });
                } else {
                    throw new Error("Risposta invalida dal server");
                }
            } catch (err: any) {
                console.error("SSO Callback Error:", err);
                setError(err?.response?.data?.error || err?.message || "Impossibile completare il login SSO");
            }
        };

        handleCallback();
    }, [navigate, checkAuth]);

    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-4">
            <div className="glass-card max-w-md w-full p-8 text-center space-y-6">
                <div className="flex justify-center">
                    {error ? (
                        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                            <AlertCircle size={32} />
                        </div>
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                            <ShieldCheck size={32} />
                        </div>
                    )}
                </div>
                
                <div>
                    <h1 className="text-xl font-display font-bold text-white mb-2">
                        {error ? "Errore Accesso FID" : "Autenticazione FID in corso..."}
                    </h1>
                    <p className="text-text-muted text-sm">
                        {error ? error : "Stiamo validando la tua identità e accedendo al sistema."}
                    </p>
                </div>

                {!error && (
                    <div className="flex justify-center pt-4">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                )}

                {error && (
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-primary w-full mt-4"
                    >
                        Torna alla Home
                    </button>
                )}
            </div>
        </div>
    );
};

export default SsoCallback;
