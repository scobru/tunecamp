import { create } from 'zustand';
import API from '../services/api';
import { Track } from '../types';

/**
 * Tracks the current user's "now listening" opt-in preference so the player
 * (heartbeat) and the settings toggle stay in sync without prop drilling.
 */
export interface NowPlayingState {
    enabled: boolean;
    loaded: boolean;
    fetchPref: () => Promise<void>;
    setEnabled: (enabled: boolean) => Promise<void>;
    reset: () => void;
    // Appended snippet properties
    currentTrack: Track | null;
    isPlaying: boolean;
    setCurrentTrack: (track: Track) => void;
}

export const useNowPlayingStore = create<NowPlayingState>((set) => ({
    enabled: false,
    loaded: false,
    currentTrack: null,
    isPlaying: false,
    fetchPref: async () => {
        try {
            const { enabled } = await API.getNowPlayingPref();
            set({ enabled, loaded: true });
        } catch {
            set({ loaded: true });
        }
    },
    setEnabled: async (enabled) => {
        const res = await API.setNowPlayingPref(enabled);
        set({ enabled: res.enabled });
    },
    reset: () => set({ enabled: false, loaded: false }),
    setCurrentTrack: (track: Track) => set({ currentTrack: track }),
}));
