import React, { useState, useEffect } from "react";
import { ShieldCheck, Globe, Copy, Check, RefreshCw, Link as LinkIcon, AlertCircle, ArrowRight, FileCheck } from "lucide-react";
import API from "../../services/api";
import { notify } from "../../utils/notify";

const CHALLENGE_KEY = "tunecamp_zen_challenge";
const PASSPORT_KEY = "tunecamp_zen_passport";

export const ZenIdentityCard: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [challenge, setChallenge] = useState<any>(() => {
        const saved = localStorage.getItem(CHALLENGE_KEY);
        return saved ? JSON.parse(saved) : null;
    });
    const [zenPubKeyInput, setZenPubKeyInput] = useState("");
    const [passportJsonInput, setPassportJsonInput] = useState("");
    const [passport, setPassport] = useState<any>(() => {
        const saved = localStorage.getItem(PASSPORT_KEY);
        return saved ? JSON.parse(saved) : null;
    });
    const [copiedChallenge, setCopiedChallenge] = useState(false);
    const [copiedPassport, setCopiedPassport] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Persist challenge to localStorage
    useEffect(() => {
        if (challenge) {
            localStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
        } else {
            localStorage.removeItem(CHALLENGE_KEY);
        }
    }, [challenge]);

    const handleGetChallenge = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await API.getZenChallenge();
            if (res.success && res.challenge) {
                setChallenge(res.challenge);
                notify.success("Challenge Zen generato con successo!");
            } else {
                throw new Error("Risposta challenge invalida");
            }
        } catch (err: any) {
            const msg = err?.message || "Impossibile generare il challenge Zen";
            console.error("[ZenIdentityCard] Errore generazione challenge:", err);
            setError(msg);
            notify.error(msg, "Errore challenge");
        } finally {
            setLoading(false);
        }
    };

    const handleCopyChallenge = () => {
        if (!challenge) return;
        navigator.clipboard.writeText(JSON.stringify(challenge));
        setCopiedChallenge(true);
        setTimeout(() => setCopiedChallenge(false), 2000);
        notify.success("Challenge copiato! Incollalo su tunecamp.org (sezione 'Firma Challenge') per firmare.");
    };

    const handleCopyPassport = () => {
        if (!passport) return;
        navigator.clipboard.writeText(JSON.stringify(passport, null, 2));
        setCopiedPassport(true);
        setTimeout(() => setCopiedPassport(false), 2000);
        notify.success("JSON del Passaporto copiato negli appunti! Incollalo su tunecamp.org per completare il binding.");
    };

    const handleLinkZen = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Option A: Raw Passport JSON pasted directly
        if (passportJsonInput.trim()) {
            try {
                const parsed = JSON.parse(passportJsonInput.trim());
                if (!parsed.instanceDomain || !parsed.zenPubKey || !parsed.passportSignature) {
                    throw new Error("Passaporto JSON malformato: campi richiesti mancanti");
                }
                setPassport(parsed);
                localStorage.setItem(PASSPORT_KEY, JSON.stringify(parsed));
                setChallenge(null);
                setPassportJsonInput("");
                setZenPubKeyInput("");
                notify.success("Passaporto importato e collegato con successo!");
                return;
            } catch (pErr: any) {
                notify.error(pErr.message || "Passaporto JSON non valido", "Errore Importazione");
                return;
            }
        }

        // Option B: Challenge + Zen PubKey
        if (!challenge || !zenPubKeyInput.trim()) {
            notify.error("Genera prima un challenge oppure incolla la tua Zen PubKey / Passaporto JSON");
            return;
        }

        setLoading(true);
        try {
            const seaSignature = `sea_signed_${Date.now()}`;
            const res = await API.linkZenAccount(zenPubKeyInput.trim(), challenge, seaSignature);
            if (res.success && res.passport) {
                setPassport(res.passport);
                localStorage.setItem(PASSPORT_KEY, JSON.stringify(res.passport));
                setChallenge(null);
                setZenPubKeyInput("");
                setPassportJsonInput("");
                notify.success("Identità Zen SEA collegata con successo!");
            } else {
                throw new Error("Risposta del server non valida");
            }
        } catch (err: any) {
            const msg = err?.message || "Errore collegamento identità Zen";
            console.error("[ZenIdentityCard] Errore linking:", err);
            setError(msg);
            notify.error(msg, "Errore linking");
        } finally {
            setLoading(false);
        }
    };

    const handleUnlink = () => {
        localStorage.removeItem(PASSPORT_KEY);
        localStorage.removeItem(CHALLENGE_KEY);
        setPassport(null);
        setChallenge(null);
        setZenPubKeyInput("");
        setPassportJsonInput("");
        notify.info("Identità Zen scollegata da questa istanza locale.");
    };

    return (
        <div className="bg-surface-elevated/80 border border-surface-border rounded-xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                    <Globe className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-semibold text-text-primary text-base">Identità Globale Decentralizzata (Zen SEA)</h3>
                    <p className="text-text-muted text-xs">
                        Collega questo account al tuo profilo unico su <code>tunecamp.org</code> tramite la rete P2P <code>delay.scobrudot.dev</code>
                    </p>
                </div>
            </div>

            {passport ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                            <ShieldCheck className="w-5 h-5" /> Istanza Collegata a Zen SEA
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCopyPassport}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg text-xs font-semibold transition-colors"
                            >
                                {copiedPassport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedPassport ? "Copiato!" : "Copia Passaporto JSON"}
                            </button>
                            <button
                                onClick={handleUnlink}
                                className="text-xs text-rose-400 hover:text-rose-300 underline font-medium"
                            >
                                Scollega
                            </button>
                        </div>
                    </div>

                    <div className="text-xs text-text-secondary space-y-1.5 font-mono bg-black/30 p-3 rounded-lg border border-emerald-500/20">
                        <div><strong className="text-text-muted font-sans">Zen PubKey:</strong> {passport.zenPubKey}</div>
                        <div><strong className="text-text-muted font-sans">Dominio Istanza:</strong> {passport.instanceDomain}</div>
                        <div><strong className="text-text-muted font-sans">Utente Locale:</strong> @{passport.localUsername}</div>
                        <div><strong className="text-text-muted font-sans">Data Rilascio:</strong> {new Date(passport.issuedAt).toLocaleString()}</div>
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2 text-xs text-text-secondary">
                        <div className="font-semibold text-primary flex items-center gap-1.5 text-sm">
                            <FileCheck className="w-4 h-4" /> Come funziona il collegamento:
                        </div>
                        <ol className="list-decimal list-inside space-y-1 text-text-muted leading-relaxed">
                            <li>Clicca su <strong>"Genera Challenge"</strong> qui sotto per creare il token di vincolo dell'istanza.</li>
                            <li>Copia il Challenge e incollalo su <strong>tunecamp.org/profile.html</strong> (sezione <em>"Firma Challenge"</em>).</li>
                            <li>Il sito web firmerà il Challenge con la tua chiave privata Zen e genererà il <strong>Passaporto JSON</strong>.</li>
                            <li>Incolla qui la tua <strong>Zen PubKey</strong> o il <strong>Passaporto JSON</strong> di ritorno per attivare il collegamento.</li>
                        </ol>
                    </div>

                    {!challenge ? (
                        <button
                            onClick={handleGetChallenge}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                            Passo 1: Genera Challenge di Vincolo
                        </button>
                    ) : (
                        <div className="space-y-4 p-4 bg-surface/60 border border-surface-border rounded-xl">
                            {/* Step 1 Badge & Copy */}
                            <div className="p-3 bg-black/40 border border-surface-border rounded-lg space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-primary flex items-center gap-1">
                                        <ArrowRight className="w-3.5 h-3.5" /> Passo 1: Copia Challenge Istanza
                                    </span>
                                    <button
                                        onClick={handleCopyChallenge}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold rounded transition-colors"
                                    >
                                        {copiedChallenge ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copiedChallenge ? "Copiato!" : "Copia Challenge Payload"}
                                    </button>
                                </div>
                                <div className="text-[11px] font-mono text-text-muted break-all bg-black/50 p-2 rounded">
                                    {JSON.stringify(challenge)}
                                </div>
                            </div>

                            {/* Step 2 Form */}
                            <form onSubmit={handleLinkZen} className="space-y-3 pt-2">
                                <div className="text-xs font-semibold text-text-primary flex items-center gap-1">
                                    <ArrowRight className="w-3.5 h-3.5 text-primary" /> Passo 2: Inserisci Zen PubKey o Passaporto Firmato
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1">
                                        Zen PubKey Globale (`~pubKey`) o Passaporto JSON di ritorno da tunecamp.org
                                    </label>
                                    <input
                                        type="text"
                                        value={zenPubKeyInput}
                                        onChange={(e) => setZenPubKeyInput(e.target.value)}
                                        placeholder="Incolla qui la tua Zen PubKey..."
                                        className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary font-mono text-xs mb-2"
                                    />
                                    <textarea
                                        rows={3}
                                        value={passportJsonInput}
                                        onChange={(e) => setPassportJsonInput(e.target.value)}
                                        placeholder='In alternativa, incolla qui il Passaporto JSON completo {"instanceDomain": "...", "passportSignature": "..."}'
                                        className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary font-mono text-xs resize-none"
                                    ></textarea>
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                        {loading ? "Collegamento in corso..." : "Conferma e Attiva Collegamento"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setChallenge(null)}
                                        className="px-3 py-2 bg-surface border border-surface-border text-text-secondary rounded-lg text-sm hover:text-text-primary"
                                    >
                                        Annulla
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
