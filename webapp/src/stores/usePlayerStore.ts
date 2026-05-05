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
    isRadioMode: boolean;

    // UI State
    isQueueOpen: boolean;
    isLyricsOpen: boolean;
    dominantColor: string | null;

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
    toggleRadio: () => void;
    toggleQueue: () => void;
    toggleLyrics: () => void;
    setDominantColor: (color: string | null) => void;
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
    isRadioMode: false,
    isQueueOpen: false,
    isLyricsOpen: false,
    dominantColor: null,

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
        } else if (get().isRadioMode) {
            // Fetch next random track
            API.getRandomTracks(1).then(tracks => {
                if (tracks && tracks.length > 0) {
                    const nextTrack = tracks[0];
                    set((state) => ({
                        queue: [...state.queue, nextTrack],
                        queueIndex: state.queueIndex + 1,
                        currentTrack: nextTrack,
                        isPlaying: true
                    }));
                    API.recordPlay(nextTrack.id).catch(console.error);
                }
            }).catch(err => {
                console.error("Failed to fetch next radio track:", err);
                set({ isPlaying: false });
            });
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
            originalQueue: state.isShuffled
                ? state.originalQueue.filter(t => t && state.queue[index] && t.id !== state.queue[index].id)
                : newQueue
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
    
    toggleRadio: () => set((state) => {
        const isRadioMode = !state.isRadioMode;
        if (isRadioMode && state.queue.length === 0) {
            // If empty, start with a random track
            API.getRandomTracks(1).then(tracks => {
                if (tracks && tracks.length > 0) {
                    const nextTrack = tracks[0];
                    set({
                        queue: [nextTrack],
                        queueIndex: 0,
                        currentTrack: nextTrack,
                        isPlaying: true
                    });
                    API.recordPlay(nextTrack.id).catch(console.error);
                }
            });
        }
        return { isRadioMode };
    }),

    toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen, isLyricsOpen: false })),
    toggleLyrics: () => set((state) => ({ isLyricsOpen: !state.isLyricsOpen, isQueueOpen: false })),
    setDominantColor: (color) => set({ dominantColor: color }),
}));

