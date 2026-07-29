import React, { useState, useEffect } from "react";
import { Network, Plus, Trash2, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import API from "../../services/api";
import { notify } from "../../utils/notify";

export const FidRegistryCard: React.FC = () => {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [jsonInput, setJsonInput] = useState("");
    const [error, setError] = useState<string | null>(null);

    const loadEntries = async () => {
        try {
            const res = await API.getFidRegistry();
            if (res.success) setEntries(res.entries || []);
        } catch (err: any) {
            console.error("[FidRegistryCard] Errore caricamento registry:", err);
        }
    };

    useEffect(() => {
        loadEntries();
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        let entry: any;
        try {
            entry = JSON.parse(jsonInput.trim());
            if (!entry.instanceDomain) {
                throw new Error("JSON malformato: manca il campo instanceDomain");
            }
        } catch (pErr: any) {
            notify.error(pErr.message || "JSON non valido", "Errore importazione");
            return;
        }

        setLoading(true);
        try {
            const res = await API.addFidRegistryEntry(entry);
            if (res.success) {
                setJsonInput("");
                notify.success("Collegamento cross-instance registrato con successo!");
                await loadEntries();
            } else {
                throw new Error("Risposta del server non valida");
            }
        } catch (err: any) {
            const msg = err?.message || "Errore registrazione collegamento";
            console.error("[FidRegistryCard] Errore linking:", err);
            setError(msg);
            notify.error(msg, "Errore registrazione");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await API.deleteFidRegistryEntry(id);
            setEntries((prev) => prev.filter((e) => e.id !== id));
            notify.info("Collegamento rimosso.");
        } catch (err: any) {
            notify.error(err?.message || "Errore rimozione collegamento", "Errore");
        }
    };

    return (
        <div className="bg-surface-elevated/80 border border-surface-border rounded-xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                    <Network className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-semibold text-text-primary text-base">Collegamenti Cross-Instance (FID Registry)</h3>
                    <p className="text-text-muted text-xs">
                        Artisti o account che hai collegato su altre istanze TuneCamp tramite il portale FID o <code>tunecamp.org</code>.
                    </p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="space-y-2 mb-5">
                {entries.length === 0 ? (
                    <p className="text-xs text-text-muted italic">Nessun collegamento registrato.</p>
                ) : (
                    entries.map((entry) => (
                        <div
                            key={entry.id}
                            className="flex items-center justify-between gap-3 bg-black/20 border border-surface-border rounded-lg p-3 text-xs"
                        >
                            <div className="min-w-0">
                                <div className="font-mono text-text-primary truncate">{entry.instanceDomain}</div>
                                <div className="text-text-muted truncate">
                                    {entry.artistName || "Artista sconosciuto"} {entry.artistSlug ? `(${entry.artistSlug})` : ""}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {entry.verified ? (
                                    <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /> Verificato</span>
                                ) : (
                                    <span className="text-amber-400">In sospeso</span>
                                )}
                                <button onClick={() => handleDelete(entry.id)} className="text-rose-400 hover:text-rose-300">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={handleAdd} className="space-y-2">
                <label className="block text-xs font-medium text-text-secondary">
                    Incolla il JSON del collegamento (<code>{"{ instanceDomain, artistName, artistSlug, publicKey, passportSignature }"}</code>)
                </label>
                <textarea
                    rows={3}
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='{"instanceDomain": "...", "artistName": "...", "publicKey": "...", "passportSignature": "..."}'
                    className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary font-mono text-xs resize-none"
                ></textarea>
                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Aggiungi Collegamento
                </button>
            </form>
        </div>
    );
};
