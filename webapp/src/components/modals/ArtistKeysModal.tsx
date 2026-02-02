import { useState, useEffect, useRef } from 'react';
import API from '../../services/api';
import { Key, Copy, AlertTriangle } from 'lucide-react';

export const ArtistKeysModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [artistName, setArtistName] = useState('');
    const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [privateRevealed, setPrivateRevealed] = useState(false);

    useEffect(() => {
        const handleOpen = async (e: CustomEvent<{ artistId: string; artistName?: string }>) => {
            const id = e.detail?.artistId;
            const name = e.detail?.artistName ?? 'Artist';
            if (!id) return;
            setArtistName(name);
            setKeys(null);
            setError('');
            setPrivateRevealed(false);
            dialogRef.current?.showModal();

            setLoading(true);
            try {
                const data = await API.getArtistIdentity(id);
                setKeys({ publicKey: data.publicKey ?? '', privateKey: data.privateKey ?? '' });
            } catch (err: any) {
                setError(err?.message ?? 'Failed to load keys');
                setKeys(null);
            } finally {
                setLoading(false);
            }
        };

        document.addEventListener('open-artist-keys-modal', handleOpen as unknown as EventListener);
        return () => document.removeEventListener('open-artist-keys-modal', handleOpen as unknown as EventListener);
    }, []);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add a small toast; for now just copy
    };

    return (
        <dialog ref={dialogRef} className="modal">
            <div className="modal-box bg-base-100 border border-white/5 max-w-xl">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Key size={20} className="text-primary" /> Chiavi ActivityPub – {artistName}
                </h3>

                <div className="alert alert-warning text-sm mb-4">
                    <AlertTriangle size={18} />
                    <span>Le chiavi private danno il controllo completo sull’identità di questo artista. Non condividerle.</span>
                </div>

                {loading && <div className="py-8 text-center opacity-50">Caricamento...</div>}
                {error && <div className="text-error text-sm mb-4">{error}</div>}
                {keys && !loading && (
                    <div className="space-y-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-medium">Chiave pubblica</span>
                            </label>
                            <textarea
                                readOnly
                                className="textarea textarea-bordered font-mono text-xs h-24 bg-base-300"
                                value={keys.publicKey || 'Non disponibile'}
                            />
                            <button
                                type="button"
                                className="btn btn-xs btn-ghost mt-1 gap-1"
                                onClick={() => copyToClipboard(keys.publicKey)}
                            >
                                <Copy size={12} /> Copia
                            </button>
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-medium">Chiave privata</span>
                            </label>
                            <div className="relative">
                                <textarea
                                    readOnly
                                    className={`textarea textarea-bordered font-mono text-xs h-28 bg-base-300 transition-all ${!privateRevealed ? 'blur-md' : ''}`}
                                    value={keys.privateKey || 'Non disponibile'}
                                />
                                {!privateRevealed && (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center bg-base-300/80 cursor-pointer rounded-lg"
                                        onClick={() => setPrivateRevealed(true)}
                                    >
                                        <span className="btn btn-sm btn-ghost">Click per mostrare</span>
                                    </div>
                                )}
                            </div>
                            {privateRevealed && (
                                <button
                                    type="button"
                                    className="btn btn-xs btn-ghost mt-1 gap-1"
                                    onClick={() => copyToClipboard(keys.privateKey)}
                                >
                                    <Copy size={12} /> Copia chiave privata
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </div>
        </dialog>
    );
};
