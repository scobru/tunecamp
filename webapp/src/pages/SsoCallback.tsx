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
                // Preferred flow: the portal already POSTed the SSO token and the derived
                // ActivityPub seed to this instance and left only a one-time code here, so no
                // key material ever touches the URL. Scrub the code as soon as it is read —
                // it is single-use, but it should not linger in history either.
                const search = new URLSearchParams(window.location.search);
                const code = search.get('fid_code');
                const hash = window.location.hash;
                if (code || hash) {
                    search.delete('fid_code');
                    const query = search.toString();
                    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
                }

                if (code) {
                    const exchanged = await (API as any).exchangeSsoCode(code);
                    if (!exchanged.success || !exchanged.token) {
                        throw new Error("Risposta invalida dal server");
                    }
                    API.setToken(exchanged.token);
                    await checkAuth();
                    notify.success(exchanged.isNewUser ? "Benvenuto! Identità FID creata con successo." : "Accesso effettuato con FID!");
                    navigate('/', { replace: true });
                    return;
                }

                // Legacy flow: older portals put { ssoToken, apSeed } in the hash fragment.
                // The fragment is never sent to a server and never appears in a Referer, but it
                // does survive in the back button and in session restore, hence the scrub above.
                let ssoToken: any = null;
                let apSeed: string = '';

                if (hash && hash.startsWith('#payload=')) {
                    const payloadRaw = decodeURIComponent(hash.replace('#payload=', ''));
                    const parsed = JSON.parse(payloadRaw);
                    ssoToken = parsed.ssoToken;
                    apSeed = parsed.apSeed;
                } else if (hash && hash.includes('ssoToken=')) {
                    const hashClean = hash.startsWith('#') ? hash.substring(1) : hash;
                    const params = new URLSearchParams(hashClean);
                    const tokenRaw = params.get('ssoToken');
                    if (tokenRaw) {
                        ssoToken = JSON.parse(decodeURIComponent(tokenRaw));
                    }
                    apSeed = params.get('apSeed') || '';
                } else {
                    throw new Error("Manca il payload SSO nella URL (hash fragment)");
                }

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
