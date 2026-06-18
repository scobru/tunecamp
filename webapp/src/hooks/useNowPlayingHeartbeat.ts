import { useEffect } from 'react';
import API from '../services/api';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useNowPlayingStore } from '../stores/useNowPlayingStore';

/**
 * Reports the current track to the "now listening" presence endpoint while the
 * user is playing — but only if they've opted in. Mount once (in the player).
 */
export function useNowPlayingHeartbeat() {
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const { isAuthenticated } = useAuthStore();
    const { enabled, loaded, fetchPref } = useNowPlayingStore();

    // Load the opt-in preference once after login.
    useEffect(() => {
        if (isAuthenticated && !loaded) fetchPref();
    }, [isAuthenticated, loaded, fetchPref]);

    useEffect(() => {
        if (!isAuthenticated || !enabled) return;

        // Paused or nothing loaded → drop presence.
        if (!isPlaying || !currentTrack) {
            API.clearNowPlaying().catch(() => {});
            return;
        }

        const ping = () => API.pingNowPlaying({
            trackId: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artistName ?? '',
        }).catch(() => {});

        ping();
        const interval = setInterval(ping, 20_000); // refresh within the server TTL
        return () => clearInterval(interval);
    }, [isAuthenticated, enabled, isPlaying, currentTrack?.id, currentTrack?.title, currentTrack?.artistName]);
}
