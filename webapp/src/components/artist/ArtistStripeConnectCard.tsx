import { useEffect, useState } from 'react';
import API from '../../services/api';

type StripeStatus = {
    connected: boolean;
    chargesEnabled?: boolean;
    detailsSubmitted?: boolean;
    country?: string | null;
};

interface ArtistStripeConnectCardProps {
    artistId: string | number;
    /**
     * Same-origin path Stripe returns the artist to after onboarding (e.g.
     * "/profile"). Must start with a single "/". Defaults to the current page,
     * so the artist lands back where they started instead of on /admin.
     */
    returnTo?: string;
    className?: string;
    /** When true, hides connect/unlink actions — admin view only. */
    readOnly?: boolean;
}

/**
 * Self-contained Stripe Connect onboarding card. Loads the artist's connected
 * account status and exposes connect / continue / unlink actions. Server-gated
 * (MANAGE_PRIVATE_LIBRARY) — render it only where that holds. Shared by the
 * admin artist modal and the artist's own profile editor.
 */
export const ArtistStripeConnectCard = ({ artistId, returnTo, className, readOnly }: ArtistStripeConnectCardProps) => {
    const [status, setStatus] = useState<StripeStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        if (artistId) {
            API.getArtistStripeStatus(artistId)
                .then((s) => { if (active) setStatus(s); })
                .catch(() => { if (active) setStatus(null); });
        } else {
            setStatus(null);
        }
        return () => { active = false; };
    }, [artistId]);

    const handleConnect = async () => {
        if (!artistId) return;
        setBusy(true);
        setError('');
        try {
            const dest = returnTo || (window.location.pathname + window.location.search);
            const { url } = await API.startArtistStripeOnboarding(artistId, dest);
            if (url) window.location.href = url; // hosted Stripe onboarding
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to start Stripe onboarding');
            setBusy(false);
        }
    };

    const handleUnlink = async () => {
        if (!artistId) return;
        setBusy(true);
        setError('');
        try {
            await API.unlinkArtistStripe(artistId);
            setStatus({ connected: false });
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to unlink Stripe account');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`form-control bg-base-200/50 rounded-lg p-4 border border-base-content/5 ${className || ''}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <span className="label-text font-bold text-primary">Stripe Connect (card payouts)</span>
                    <p className="text-xs opacity-50 mt-1">
                        Connect this artist's own Stripe account so card payments for their releases are charged <strong>directly to them</strong>, with only the instance fee withheld. Without it, card sales land in the instance's Stripe account (single-artist / self-host).
                    </p>
                </div>
                {status?.connected && (
                    <span className={`badge badge-sm shrink-0 ${status.chargesEnabled ? 'badge-success' : 'badge-warning'}`}>
                        {status.chargesEnabled ? 'Connected' : 'Pending'}
                    </span>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {!readOnly && !status?.connected && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={handleConnect} disabled={busy}>
                        {busy ? 'Redirecting…' : 'Connect Stripe account'}
                    </button>
                )}
                {!readOnly && status?.connected && !status.chargesEnabled && (
                    <>
                        <span className="text-xs text-warning">Onboarding incomplete — charges not yet enabled.</span>
                        <button type="button" className="btn btn-sm btn-warning" onClick={handleConnect} disabled={busy}>
                            {busy ? 'Redirecting…' : 'Continue onboarding'}
                        </button>
                    </>
                )}
                {status?.connected && status.chargesEnabled && (
                    <span className="text-xs text-success">Card payments go directly to this artist's Stripe account.</span>
                )}
                {!readOnly && status?.connected && (
                    <button type="button" className="btn btn-sm btn-ghost text-error" onClick={handleUnlink} disabled={busy}>
                        Unlink
                    </button>
                )}
                {readOnly && !status?.connected && (
                    <span className="text-xs opacity-50">Not connected — only the artist can link their Stripe account.</span>
                )}
            </div>
            {error && <div className="text-error text-xs mt-2">{error}</div>}
        </div>
    );
};
