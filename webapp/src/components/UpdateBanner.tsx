import { useState } from "react";
import { useVersionCheck } from "../hooks/useVersionCheck";

export function UpdateBanner() {
    const updateAvailable = useVersionCheck();
    const [dismissed, setDismissed] = useState(false);

    if (!updateAvailable || dismissed) return null;

    return (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-2.5 rounded-xl bg-base-200 border border-primary/30 shadow-level-3 text-base-content text-sm font-medium">
            <span className="text-primary">✦</span>
            <span>Nuova versione disponibile</span>
            <button
                className="btn btn-primary btn-xs rounded-lg"
                onClick={() => window.location.reload()}
            >
                Aggiorna ora
            </button>
            <button
                className="btn btn-ghost btn-xs btn-square rounded-lg"
                aria-label="Chiudi"
                onClick={() => setDismissed(true)}
            >
                ✕
            </button>
        </div>
    );
}
