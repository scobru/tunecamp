import { create } from 'zustand';
import type { Track } from '../types';
import API from '../services/api';

interface PlayerState {
    currentTrack: Track | null;
    isPlaying: boolean;
    queue: Track[];
    queueIndex: number;
    volume: number;
    progress: number; // 0-100
    duration: number;
    currentTime: number;

    // Actions
    playTrack: (track: Track, context?: Track[]) => void;
    playQueue: (tracks: Track[], startIndex?: number) => void;
    togglePlay: () => void;
    setIsPlaying: (isPlaying: boolean) => void;
    next: () => void;
    prev: () => void;
    setVolume: (vol: number) => void;
    setProgress: (time: number, duration: number) => void;
    addToQueue: (track: Track) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    currentTrack: null,
    isPlaying: false,
    queue: [],
    queueIndex: -1,
    volume: 1, // 0-1
    progress: 0,
    duration: 0,
    currentTime: 0,

    playTrack: (track, context) => {
        // If context provided (e.g. album), replace queue. If not, just play track (and maybe add to queue?)
        if (context) {
            const index = context.findIndex(t => t.id === track.id);
            set({
                queue: context,
                queueIndex: index !== -1 ? index : 0,
                currentTrack: track,
                isPlaying: true
            });
        } else {
            // Simple play, replace queue or just play? 
            // For now behave like single play
            set({
                queue: [track],
                queueIndex: 0,
                currentTrack: track,
                isPlaying: true
            });
        }
        API.recordPlay(track.id).catch(console.error);
    },

    playQueue: (tracks, startIndex = 0) => {
        if (tracks.length === 0) return;
        set({
            queue: tracks,
            queueIndex: startIndex,
            currentTrack: tracks[startIndex],
            isPlaying: true
        });
        API.recordPlay(tracks[startIndex].id).catch(console.error);
    },

    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setIsPlaying: (isPlaying) => set({ isPlaying }),

    next: () => {
        const { queue, queueIndex } = get();
        if (queueIndex < queue.length - 1) {
            const nextIndex = queueIndex + 1;
            set({
                queueIndex: nextIndex,
                currentTrack: queue[nextIndex],
                isPlaying: true
            });
            API.recordPlay(queue[nextIndex].id).catch(console.error);
        } else {
            set({ isPlaying: false, progress: 0, currentTime: 0 }); // End of queue
        }
    },

    prev: () => {
        const { queue, queueIndex, currentTime } = get();
        // If played more than 3s, restart track
        if (currentTime > 3) {
            set({ currentTime: 0 }); // Logic handled by component listener usually
            return;
        }

        if (queueIndex > 0) {
            const prevIndex = queueIndex - 1;
            set({
                queueIndex: prevIndex,
                currentTrack: queue[prevIndex],
                isPlaying: true
            });
            API.recordPlay(queue[prevIndex].id).catch(console.error);
        }
    },

    setVolume: (volume) => set({ volume }),

    setProgress: (currentTime, duration) => set({
        currentTime,
        duration,
        progress: duration > 0 ? (currentTime / duration) * 100 : 0
    }),

    addToQueue: (track) => set((state) => ({ queue: [...state.queue, track] })),
}));
