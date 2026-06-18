import { useEffect, useState, useCallback } from "react";
import { Headphones, Music, Loader2, EyeOff } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuthStore } from "../stores/useAuthStore";
import { useNowPlayingStore } from "../stores/useNowPlayingStore";
import API, { type NowListeningEntry } from "../services/api";

const NowListening = () => {
    const { isAuthenticated } = useAuthStore();
    const { enabled, loaded, fetchPref, setEnabled } = useNowPlayingStore();

    const [listeners, setListeners] = useState<NowListeningEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { listeners } = await API.getNowListening();
            setListeners(listeners);
        } catch {
            // members-only endpoint: ignore (handled by the auth gate below)
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            setIsLoading(false);
            return;
        }
        if (!loaded) fetchPref();
        refresh();
        const interval = setInterval(refresh, 10_000);
        return () => clearInterval(interval);
    }, [isAuthenticated, loaded, fetchPref, refresh]);

    const toggle = async () => {
        setSaving(true);
        try {
            await setEnabled(!enabled);
            refresh();
        } catch (e) {
            console.error("Failed to update now-listening preference:", e);
        } finally {
            setSaving(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="space-y-8 animate-fade-in">
                <PageHeader title="Now Listening" subtitle="See what the community is playing" icon={Headphones} iconColor="text-primary" />
                <div className="alert max-w-xl">
                    <EyeOff size={18} />
                    <span>Sign in to see who's listening right now.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="Now Listening"
                subtitle="What the community is playing right now"
                icon={Headphones}
                iconColor="text-primary"
            />

            {/* Opt-in control */}
            <div className="card bg-base-200 border border-base-content/5 shadow-level-1 max-w-xl">
                <div className="card-body py-4 flex-row items-center justify-between gap-4">
                    <div>
                        <p className="font-bold text-sm">Share what I'm listening to</p>
                        <p className="text-xs opacity-60">
                            When on, your current track appears here for other members. Off by default.
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        className="toggle toggle-primary"
                        checked={enabled}
                        disabled={saving}
                        onChange={toggle}
                    />
                </div>
            </div>

            {/* Listeners */}
            {isLoading ? (
                <div className="flex items-center gap-2 opacity-50 p-8">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm font-bold">Loading…</span>
                </div>
            ) : listeners.length === 0 ? (
                <div className="p-10 text-center opacity-40 border border-dashed border-base-content/10 rounded-2xl max-w-xl">
                    <Headphones size={32} className="mx-auto mb-3" />
                    <p className="font-bold text-sm">Nobody is sharing right now</p>
                    <p className="text-xs mt-1">Turn on sharing above to be the first.</p>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {listeners.map(l => {
                        const name = l.alias || l.username;
                        return (
                            <div key={l.username} className="card bg-base-200 border border-base-content/5 shadow-level-1">
                                <div className="card-body p-4 flex-row items-center gap-3">
                                    <div className="avatar placeholder shrink-0">
                                        <div className="w-11 h-11 rounded-full bg-neutral text-neutral-content overflow-hidden">
                                            {l.avatar ? (
                                                <img
                                                    src={l.avatar}
                                                    alt={name}
                                                    className="object-cover w-full h-full"
                                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                />
                                            ) : (
                                                <span className="text-base font-bold">{name[0]?.toUpperCase()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-sm truncate">{name}</p>
                                        <p className="text-xs opacity-70 truncate flex items-center gap-1">
                                            <Music size={11} className="text-primary shrink-0" />
                                            {l.title}{l.artist ? ` — ${l.artist}` : ""}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default NowListening;
