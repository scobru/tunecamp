import { create } from 'zustand';
import type { Track } from '../types';
import API from '../services/api';

export interface PlayerState {
    currentTrack: Track | null;
    isPlaying: boolean;
    queue: Track[];
    originalQueue: Track[]; // For un-shuffling
    queueIndex: number;
    volume: number;
    progress: number; // 0-100
    duration: number;
    currentTime: number;

    // Modes
    isShuffled: boolean;
    repeatMode: 'none' | 'all' | 'one';

    // UI State
    isQueueOpen: boolean;
    isLyricsOpen: boolean;

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
    removeFromQueue: (index: number) => void;
    toggleShuffle: () => void;
    toggleRepeat: () => void;
    toggleQueue: () => void;
    toggleLyrics: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    currentTrack: null,
    isPlaying: false,
    queue: [],
    originalQueue: [],
    queueIndex: -1,
    volume: parseFloat(localStorage.getItem('tunecamp_volume') || '1'),
    progress: 0,
    duration: 0,
    currentTime: 0,
    isShuffled: false,
    repeatMode: 'none',
    isQueueOpen: false,
    isLyricsOpen: false,

    playTrack: (track, context) => {
        const queue = context ? [...context] : [track];
        const index = context ? context.findIndex(t => t.id === track.id) : 0;

        set({
            queue,
            originalQueue: queue, // Reset shuffle on new context
            isShuffled: false,
            queueIndex: index !== -1 ? index : 0,
            currentTrack: track,
            isPlaying: true
        });
        API.recordPlay(track.id).catch(console.error);
    },

    playQueue: (tracks, startIndex = 0) => {
        if (tracks.length === 0) return;
        set({
            queue: tracks,
            originalQueue: tracks,
            isShuffled: false,
            queueIndex: startIndex,
            currentTrack: tracks[startIndex],
            isPlaying: true
        });
        API.recordPlay(tracks[startIndex].id).catch(console.error);
    },

    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setIsPlaying: (isPlaying) => set({ isPlaying }),

    next: () => {
        const { queue, queueIndex, repeatMode } = get();

        // Handle Repeat One
        if (repeatMode === 'one' && queueIndex !== -1) {
            const track = queue[queueIndex];
            // Just restart functionality is usually handled by audio element, 
            // but if called explicitly via button, we might want to skip anyway?
            // Standard behavior: Next button skips even in repeat one.
            // But 'ended' event triggering next() should respect repeat one?
            // For now, let's assume 'next()' is explicit or natural end.
            // If natural end (from ended event), component should check repeat mode?
            // Let's keep it simple: next() goes to next track.
        }

        if (queueIndex < queue.length - 1) {
            const nextIndex = queueIndex + 1;
            set({
                queueIndex: nextIndex,
                currentTrack: queue[nextIndex],
                isPlaying: true
            });
            API.recordPlay(queue[nextIndex].id).catch(console.error);
        } else if (repeatMode === 'all' && queue.length > 0) {
            // Loop back to start
            set({
                queueIndex: 0,
                currentTrack: queue[0],
                isPlaying: true
            });
            API.recordPlay(queue[0].id).catch(console.error);
        } else {
            set({ isPlaying: false, progress: 0, currentTime: 0 }); // End of queue
        }
    },

    prev: () => {
        const { queue, queueIndex, currentTime } = get();
        if (currentTime > 3) {
            set({ currentTime: 0 });
            // NOTE: Consumer component needs to react to this state change to reset audio.currentTime
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

    setVolume: (volume) => {
        localStorage.setItem('tunecamp_volume', volume.toString());
        set({ volume });
    },

    setProgress: (currentTime, duration) => set({
        currentTime,
        duration,
        progress: duration > 0 ? (currentTime / duration) * 100 : 0
    }),

    addToQueue: (track) => set((state) => {
        const newQueue = [...state.queue, track];
        return {
            queue: newQueue,
            originalQueue: state.isShuffled ? [...state.originalQueue, track] : newQueue
        };
    }),

    removeFromQueue: (index) => set((state) => {
        if (index === state.queueIndex) return state; // Can't remove current track easily
        const newQueue = [...state.queue];
        newQueue.splice(index, 1);

        let newIndex = state.queueIndex;
        if (index < state.queueIndex) {
            newIndex--;
        }

        return {
            queue: newQueue,
            queueIndex: newIndex,
            originalQueue: state.isShuffled ? state.originalQueue.filter(t => t.id !== state.queue[index].id) : newQueue
        };
    }),

    toggleShuffle: () => set((state) => {
        const isShuffled = !state.isShuffled;

        if (isShuffled) {
            // Shuffle
            const current = state.queue[state.queueIndex];
            const others = state.queue.filter((_, i) => i !== state.queueIndex);
            // Fisher-Yates shuffle
            for (let i = others.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [others[i], others[j]] = [others[j], others[i]];
            }
            const newQueue = [current, ...others];
            return {
                isShuffled: true,
                originalQueue: state.queue, // Save original order
                queue: newQueue,
                queueIndex: 0
            };
        } else {
            // Unshuffle - restore original queue and find current track index
            const current = state.currentTrack;
            const originalIndex = current ? state.originalQueue.findIndex(t => t.id === current.id) : 0;
            return {
                isShuffled: false,
                queue: state.originalQueue,
                queueIndex: originalIndex !== -1 ? originalIndex : 0
            };
        }
    }),

    toggleRepeat: () => set((state) => {
        const modes: PlayerState['repeatMode'][] = ['none', 'all', 'one'];
        const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
        return { repeatMode: modes[nextIndex] };
    }),

    toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen, isLyricsOpen: false })),
    toggleLyrics: () => set((state) => ({ isLyricsOpen: !state.isLyricsOpen, isQueueOpen: false })),
}));
