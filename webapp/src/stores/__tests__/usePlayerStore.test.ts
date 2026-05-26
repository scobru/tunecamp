import { vi, describe, test, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../usePlayerStore';
import API from '../../services/api';

vi.mock('../../services/api', () => ({
    default: {
        recordPlay: vi.fn(() => Promise.resolve({ success: true })),
        getRandomTracks: vi.fn(),
    }
}));

describe('usePlayerStore', () => {
    const track1 = { id: 1, title: 'Track 1', artist: 'Artist A' } as any;
    const track2 = { id: 2, title: 'Track 2', artist: 'Artist B' } as any;
    const track3 = { id: 3, title: 'Track 3', artist: 'Artist C' } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        usePlayerStore.setState({
            currentTrack: null,
            isPlaying: false,
            queue: [],
            originalQueue: [],
            queueIndex: -1,
            volume: 1,
            progress: 0,
            duration: 0,
            currentTime: 0,
            isShuffled: false,
            repeatMode: 'none',
            isRadioMode: false,
            isQueueOpen: false,
            isLyricsOpen: false,
            isCanvasOpen: false,
            dominantColor: null,
        });
    });

    test('has correct initial default state', () => {
        const state = usePlayerStore.getState();
        expect(state.currentTrack).toBeNull();
        expect(state.isPlaying).toBe(false);
        expect(state.queue).toEqual([]);
        expect(state.queueIndex).toBe(-1);
    });

    test('playTrack sets queue, index, currentTrack, and starts playing', () => {
        const store = usePlayerStore.getState();
        store.playTrack(track2, [track1, track2, track3]);

        const state = usePlayerStore.getState();
        expect(state.queue).toEqual([track1, track2, track3]);
        expect(state.originalQueue).toEqual([track1, track2, track3]);
        expect(state.queueIndex).toBe(1);
        expect(state.currentTrack).toEqual(track2);
        expect(state.isPlaying).toBe(true);
        expect(API.recordPlay).toHaveBeenCalledWith(2);
    });

    test('playQueue starts playing first item by default', () => {
        const store = usePlayerStore.getState();
        store.playQueue([track1, track2]);

        const state = usePlayerStore.getState();
        expect(state.queue).toEqual([track1, track2]);
        expect(state.queueIndex).toBe(0);
        expect(state.currentTrack).toEqual(track1);
        expect(state.isPlaying).toBe(true);
        expect(API.recordPlay).toHaveBeenCalledWith(1);
    });

    test('togglePlay switches isPlaying state', () => {
        const store = usePlayerStore.getState();
        expect(store.isPlaying).toBe(false);

        store.togglePlay();
        expect(usePlayerStore.getState().isPlaying).toBe(true);

        store.togglePlay();
        expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    test('setIsPlaying sets isPlaying strictly', () => {
        const store = usePlayerStore.getState();
        store.setIsPlaying(true);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    test('next advances queue index', () => {
        usePlayerStore.setState({
            queue: [track1, track2, track3],
            queueIndex: 0,
            currentTrack: track1,
            isPlaying: true,
        });

        const store = usePlayerStore.getState();
        store.next();

        const state = usePlayerStore.getState();
        expect(state.queueIndex).toBe(1);
        expect(state.currentTrack).toEqual(track2);
        expect(state.isPlaying).toBe(true);
        expect(API.recordPlay).toHaveBeenCalledWith(2);
    });

    test('next loops back to beginning if repeatMode is all', () => {
        usePlayerStore.setState({
            queue: [track1, track2, track3],
            queueIndex: 2,
            currentTrack: track3,
            isPlaying: true,
            repeatMode: 'all',
        });

        const store = usePlayerStore.getState();
        store.next();

        const state = usePlayerStore.getState();
        expect(state.queueIndex).toBe(0);
        expect(state.currentTrack).toEqual(track1);
        expect(state.isPlaying).toBe(true);
        expect(API.recordPlay).toHaveBeenCalledWith(1);
    });

    test('next stops playing at end of queue when repeatMode is none', () => {
        usePlayerStore.setState({
            queue: [track1, track2],
            queueIndex: 1,
            currentTrack: track2,
            isPlaying: true,
            repeatMode: 'none',
        });

        const store = usePlayerStore.getState();
        store.next();

        const state = usePlayerStore.getState();
        expect(state.isPlaying).toBe(false);
        expect(state.progress).toBe(0);
        expect(state.currentTime).toBe(0);
    });

    test('next fetches and plays random track in radio mode at end of queue', async () => {
        usePlayerStore.setState({
            queue: [track1],
            queueIndex: 0,
            currentTrack: track1,
            isPlaying: true,
            isRadioMode: true,
        });

        vi.mocked(API.getRandomTracks).mockResolvedValue([track2]);

        const store = usePlayerStore.getState();
        store.next();

        // Wait for radio API call to resolve
        await new Promise((resolve) => setTimeout(resolve, 0));

        const state = usePlayerStore.getState();
        expect(state.queue).toEqual([track1, track2]);
        expect(state.queueIndex).toBe(1);
        expect(state.currentTrack).toEqual(track2);
        expect(state.isPlaying).toBe(true);
        expect(API.recordPlay).toHaveBeenCalledWith(2);
    });

    test('prev resets currentTime if track has been playing for >3s', () => {
        usePlayerStore.setState({
            queue: [track1, track2],
            queueIndex: 1,
            currentTrack: track2,
            currentTime: 5,
        });

        const store = usePlayerStore.getState();
        store.prev();

        const state = usePlayerStore.getState();
        expect(state.queueIndex).toBe(1); // remains on track2
        expect(state.currentTime).toBe(0); // resets progress
    });

    test('prev goes to previous track in queue if playing <3s', () => {
        usePlayerStore.setState({
            queue: [track1, track2],
            queueIndex: 1,
            currentTrack: track2,
            currentTime: 2,
        });

        const store = usePlayerStore.getState();
        store.prev();

        const state = usePlayerStore.getState();
        expect(state.queueIndex).toBe(0);
        expect(state.currentTrack).toEqual(track1);
        expect(state.isPlaying).toBe(true);
        expect(API.recordPlay).toHaveBeenCalledWith(1);
    });

    test('setVolume updates volume and writes to localStorage', () => {
        const store = usePlayerStore.getState();
        store.setVolume(0.75);

        expect(usePlayerStore.getState().volume).toBe(0.75);
        expect(localStorage.getItem('tunecamp_volume')).toBe('0.75');
    });

    test('setProgress sets currentTime, duration, and computes progress percentage', () => {
        const store = usePlayerStore.getState();
        store.setProgress(40, 100);

        const state = usePlayerStore.getState();
        expect(state.currentTime).toBe(40);
        expect(state.duration).toBe(100);
        expect(state.progress).toBe(40);
    });

    test('addToQueue adds track to queue', () => {
        usePlayerStore.setState({
            queue: [track1],
            originalQueue: [track1],
        });

        const store = usePlayerStore.getState();
        store.addToQueue(track2);

        const state = usePlayerStore.getState();
        expect(state.queue).toEqual([track1, track2]);
    });

    test('removeFromQueue correctly updates queue and index', () => {
        usePlayerStore.setState({
            queue: [track1, track2, track3],
            originalQueue: [track1, track2, track3],
            queueIndex: 2,
            currentTrack: track3,
        });

        const store = usePlayerStore.getState();
        store.removeFromQueue(0); // remove track1

        const state = usePlayerStore.getState();
        expect(state.queue).toEqual([track2, track3]);
        expect(state.queueIndex).toBe(1); // shifted left
    });

    test('toggleShuffle shuffles queue while keeping current track as first', () => {
        usePlayerStore.setState({
            queue: [track1, track2, track3],
            originalQueue: [track1, track2, track3],
            queueIndex: 1,
            currentTrack: track2,
        });

        const store = usePlayerStore.getState();
        store.toggleShuffle();

        const state = usePlayerStore.getState();
        expect(state.isShuffled).toBe(true);
        expect(state.queueIndex).toBe(0);
        expect(state.queue[0]).toEqual(track2); // current track remains first
        expect(state.queue).toHaveLength(3);
    });

    test('toggleShuffle restores original queue on second toggle', () => {
        usePlayerStore.setState({
            queue: [track2, track3, track1],
            originalQueue: [track1, track2, track3],
            queueIndex: 0,
            currentTrack: track2,
            isShuffled: true,
        });

        const store = usePlayerStore.getState();
        store.toggleShuffle();

        const state = usePlayerStore.getState();
        expect(state.isShuffled).toBe(false);
        expect(state.queue).toEqual([track1, track2, track3]);
        expect(state.queueIndex).toBe(1); // restored to original index
    });

    test('toggleRepeat cycles through repeat modes', () => {
        const store = usePlayerStore.getState();
        expect(store.repeatMode).toBe('none');

        store.toggleRepeat();
        expect(usePlayerStore.getState().repeatMode).toBe('all');

        store.toggleRepeat();
        expect(usePlayerStore.getState().repeatMode).toBe('one');

        store.toggleRepeat();
        expect(usePlayerStore.getState().repeatMode).toBe('none');
    });

    test('toggleRadio fetches random track if radio enabled and queue is empty', async () => {
        vi.mocked(API.getRandomTracks).mockResolvedValue([track1]);

        const store = usePlayerStore.getState();
        await store.toggleRadio();

        expect(usePlayerStore.getState().isRadioMode).toBe(true);
        // Wait for radio API call to resolve
        await new Promise((resolve) => setTimeout(resolve, 0));

        const state = usePlayerStore.getState();
        expect(state.queue).toEqual([track1]);
        expect(state.queueIndex).toBe(0);
        expect(state.currentTrack).toEqual(track1);
        expect(state.isPlaying).toBe(true);
    });

    test('toggles other UI states properly', () => {
        const store = usePlayerStore.getState();
        expect(store.isQueueOpen).toBe(false);

        store.toggleQueue();
        expect(usePlayerStore.getState().isQueueOpen).toBe(true);
        expect(usePlayerStore.getState().isLyricsOpen).toBe(false);

        store.toggleLyrics();
        expect(usePlayerStore.getState().isQueueOpen).toBe(false);
        expect(usePlayerStore.getState().isLyricsOpen).toBe(true);

        store.setDominantColor('#aabbcc');
        expect(usePlayerStore.getState().dominantColor).toBe('#aabbcc');
    });
});
