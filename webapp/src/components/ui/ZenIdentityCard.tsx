import React, { useState } from "react";
import { ShieldCheck, Globe, Copy, Check, RefreshCw, Link as LinkIcon } from "lucide-react";
import API from "../../services/api";
import { notify } from "../../utils/notify";

export const ZenIdentityCard: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [challenge, setChallenge] = useState<any>(null);
    const [zenPubKeyInput, setZenPubKeyInput] = useState("");
    const [passport, setPassport] = useState<any>(() => {
        const saved = localStorage.getItem("tunecamp_zen_passport");
        return saved ? JSON.parse(saved) : null;
    });
    const [copied, setCopied] = useState(false);
    const [copiedPassport, setCopiedPassport] = useState(false);

    const handleGetChallenge = async () => {
        setLoading(true);
        try {
            const res = await API.getZenChallenge();
            if (res.success && res.challenge) {
                setChallenge(res.challenge);
                notify.success("Challenge Zen generato con successo!");
            }
        } catch (err: any) {
            console.error("Errore generazione challenge Zen:", err);
            notify.error(err, "Impossibile generare il challenge Zen");
        } finally {
            setLoading(false);
        }
    };

    const handleCopyChallenge = () => {
        if (!challenge) return;
        navigator.clipboard.writeText(JSON.stringify(challenge));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        notify.success("Challenge copiato negli appunti! Incollalo su tunecamp.org per firmare.");
    };

    const handleCopyPassport = () => {
        if (!passport) return;
        navigator.clipboard.writeText(JSON.stringify(passport));
        setCopiedPassport(true);
        setTimeout(() => setCopiedPassport(false), 2000);
        notify.success("JSON del Passaporto copiato! Incollalo su tunecamp.org per completare il collegamento.");
    };

    const handleLinkZen = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!challenge || !zenPubKeyInput) {
            notify.error("Inserisci la tua Zen PubKey e genera prima un challenge");
            return;
        }

        setLoading(true);
        try {
            // Simulated / local signature proof handshake
            const seaSignature = `sea_signed_${Date.now()}`;
            const res = await API.linkZenAccount(zenPubKeyInput, challenge, seaSignature);
            if (res.success && res.passport) {
                setPassport(res.passport);
                localStorage.setItem("tunecamp_zen_passport", JSON.stringify(res.passport));
                notify.success("Identità Zen SEA collegata con successo!");
                setChallenge(null);
            }
        } catch (err: any) {
            console.error("Errore durante il linking Zen:", err);
            notify.error(err, "Errore collegamento identità Zen");
        } finally {
            setLoading(false);
        }
    };

    const handleUnlink = () => {
        localStorage.removeItem("tunecamp_zen_passport");
        setPassport(null);
        setChallenge(null);
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
                        Collega questo account al tuo profilo unico su <code>tunecamp.org</code> tramite la rete peer-to-peer <code>delay.scobrudot.dev</code>
                    </p>
                </div>
            </div>

            {passport ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                            <ShieldCheck className="w-4 h-4" /> Istanza collegata a Zen SEA
                        </span>
                        <div className="flex gap-4">
                            <button
                                onClick={handleCopyPassport}
                                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                            >
                                {copiedPassport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedPassport ? "Copiato!" : "Copia Passaporto JSON"}
                            </button>
                            <button
                                onClick={handleUnlink}
                                className="text-xs text-rose-400 hover:text-rose-300 underline"
                            >
                                Scollega
                            </button>
                        </div>
                    </div>
                    <div className="text-xs text-text-secondary space-y-1 font-mono">
                        <div><strong className="text-text-muted font-sans">Zen PubKey:</strong> {passport.zenPubKey.slice(0, 16)}...{passport.zenPubKey.slice(-8)}</div>
                        <div><strong className="text-text-muted font-sans">Istanza:</strong> {passport.instanceDomain}</div>
                        <div><strong className="text-text-muted font-sans">Rilasciato il:</strong> {new Date(passport.issuedAt).toLocaleString()}</div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-text-secondary">
                        Puoi associare la tua utenza locale su questa istanza al tuo profilo globale su <code>tunecamp.org</code> per aggregare i tuoi brani pubblici e preferiti.
                    </p>

                    {!challenge ? (
                        <button
                            onClick={handleGetChallenge}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                            Genera Challenge di Vincolo
                        </button>
                    ) : (
                        <div className="space-y-3 p-4 bg-surface/50 border border-surface-border rounded-lg">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-text-muted">Challenge Nonce: {challenge.nonce}</span>
                                <button
                                    onClick={handleCopyChallenge}
                                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? "Copiato" : "Copia Challenge Payload"}
                                </button>
                            </div>

                            <form onSubmit={handleLinkZen} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1">
                                        Zen PubKey Globale (`~pubKey`)
                                    </label>
                                    <input
                                        type="text"
                                        value={zenPubKeyInput}
                                        onChange={(e) => setZenPubKeyInput(e.target.value)}
                                        placeholder="Inserisci la tua chiave pubblica Zen..."
                                        className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary font-mono text-xs"
                                        required
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        {loading ? "Collegamento in corso..." : "Conferma e Genera Passaporto"}
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
