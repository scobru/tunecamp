import React, { useState, useEffect } from "react";
import { ShieldCheck, Globe, Copy, Check, RefreshCw, Link as LinkIcon, AlertCircle, ArrowRight, FileCheck } from "lucide-react";
import API from "../../services/api";
import { notify } from "../../utils/notify";

const CHALLENGE_KEY = "tunecamp_zen_challenge";
const LINKED_KEY = "tunecamp_zen_linked";

export const ZenIdentityCard: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [challenge, setChallenge] = useState<any>(() => {
        const saved = localStorage.getItem(CHALLENGE_KEY);
        return saved ? JSON.parse(saved) : null;
    });
    const [signedJsonInput, setSignedJsonInput] = useState("");
    const [linked, setLinked] = useState<any>(() => {
        const saved = localStorage.getItem(LINKED_KEY);
        return saved ? JSON.parse(saved) : null;
    });
    const [copiedChallenge, setCopiedChallenge] = useState(false);
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

    const handleLinkZen = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!challenge) {
            notify.error("Genera prima un challenge di vincolo");
            return;
        }

        let zenPubKey: string;
        let seaSignature: string;
        try {
            const parsed = JSON.parse(signedJsonInput.trim());
            if (!parsed.zenPubKey || !parsed.seaSignature) {
                throw new Error("JSON malformato: servono i campi zenPubKey e seaSignature");
            }
            zenPubKey = parsed.zenPubKey;
            seaSignature = parsed.seaSignature;
        } catch (pErr: any) {
            notify.error(pErr.message || "Incolla il JSON firmato restituito da tunecamp.org", "Errore importazione");
            return;
        }

        setLoading(true);
        try {
            const res = await API.setZenAccount(zenPubKey, challenge, seaSignature);
            if (res.success) {
                const state = { zenPubKey: res.zenPub, instanceDomain: window.location.hostname, linkedAt: Date.now() };
                setLinked(state);
                localStorage.setItem(LINKED_KEY, JSON.stringify(state));
                setChallenge(null);
                setSignedJsonInput("");
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
        localStorage.removeItem(LINKED_KEY);
        localStorage.removeItem(CHALLENGE_KEY);
        setLinked(null);
        setChallenge(null);
        setSignedJsonInput("");
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

            {linked ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                            <ShieldCheck className="w-5 h-5" /> Istanza Collegata a Zen SEA
                        </span>
                        <button
                            onClick={handleUnlink}
                            className="text-xs text-rose-400 hover:text-rose-300 underline font-medium"
                        >
                            Scollega
                        </button>
                    </div>

                    <div className="text-xs text-text-secondary space-y-1.5 font-mono bg-black/30 p-3 rounded-lg border border-emerald-500/20">
                        <div><strong className="text-text-muted font-sans">Zen PubKey:</strong> {linked.zenPubKey}</div>
                        <div><strong className="text-text-muted font-sans">Dominio Istanza:</strong> {linked.instanceDomain}</div>
                        <div><strong className="text-text-muted font-sans">Collegato il:</strong> {new Date(linked.linkedAt).toLocaleString()}</div>
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
                            <li>Il sito web firmerà il Challenge con la tua chiave privata Zen SEA e ti restituirà un JSON <code>{"{ zenPubKey, seaSignature }"}</code>.</li>
                            <li>Incolla qui quel JSON per verificare la firma e attivare il collegamento.</li>
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
                                    <ArrowRight className="w-3.5 h-3.5 text-primary" /> Passo 2: Incolla il JSON firmato
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1">
                                        JSON firmato di ritorno da tunecamp.org (<code>{"{ zenPubKey, seaSignature }"}</code>)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={signedJsonInput}
                                        onChange={(e) => setSignedJsonInput(e.target.value)}
                                        placeholder='{"zenPubKey": "...", "seaSignature": "..."}'
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
