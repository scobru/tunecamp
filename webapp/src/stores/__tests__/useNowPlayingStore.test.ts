import { vi, describe, test, expect, beforeEach } from 'vitest';
import { useNowPlayingStore } from '../useNowPlayingStore';
import API from '../../services/api';

vi.mock('../../services/api', () => ({
    default: {
        getNowPlayingPref: vi.fn(),
        setNowPlayingPref: vi.fn(),
    }
}));

describe('useNowPlayingStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useNowPlayingStore.setState({
            enabled: false,
            loaded: false,
            currentTrack: null,
            isPlaying: false,
        });
    });

    test('initial state', () => {
        const state = useNowPlayingStore.getState();
        expect(state.enabled).toBe(false);
        expect(state.loaded).toBe(false);
        expect(state.currentTrack).toBeNull();
        expect(state.isPlaying).toBe(false);
    });

    test('reset clears the state', () => {
        useNowPlayingStore.setState({
            enabled: true,
            loaded: true,
            currentTrack: { id: 1, title: 'Test Track' } as any,
            isPlaying: true
        });

        let state = useNowPlayingStore.getState();
        expect(state.enabled).toBe(true);
        expect(state.loaded).toBe(true);
        expect(state.currentTrack).not.toBeNull();
        expect(state.isPlaying).toBe(true);

        state.reset();

        state = useNowPlayingStore.getState();
        expect(state.enabled).toBe(false);
        expect(state.loaded).toBe(false);
        expect(state.currentTrack).toBeNull();
        expect(state.isPlaying).toBe(false);
    });

    test('setCurrentTrack updates currentTrack and sets isPlaying to true', () => {
        const mockTrack = { id: 123, title: 'Mock Track' } as any;
        const store = useNowPlayingStore.getState();

        store.setCurrentTrack(mockTrack);

        const state = useNowPlayingStore.getState();
        expect(state.currentTrack).toEqual(mockTrack);
        expect(state.isPlaying).toBe(true);
    });

    test('fetchPref updates state on success', async () => {
        vi.mocked(API.getNowPlayingPref).mockResolvedValue({ enabled: true });

        const store = useNowPlayingStore.getState();
        await store.fetchPref();

        const state = useNowPlayingStore.getState();
        expect(API.getNowPlayingPref).toHaveBeenCalledTimes(1);
        expect(state.enabled).toBe(true);
        expect(state.loaded).toBe(true);
    });

    test('fetchPref handles failure gracefully', async () => {
        vi.mocked(API.getNowPlayingPref).mockRejectedValue(new Error('Network error'));

        const store = useNowPlayingStore.getState();
        await store.fetchPref();

        const state = useNowPlayingStore.getState();
        expect(API.getNowPlayingPref).toHaveBeenCalledTimes(1);
        expect(state.enabled).toBe(false); // Should remain false from initial state
        expect(state.loaded).toBe(true);
    });

    test('setEnabled updates preference via API and sets new state', async () => {
        vi.mocked(API.setNowPlayingPref).mockResolvedValue({ enabled: true });

        const store = useNowPlayingStore.getState();
        await store.setEnabled(true);

        const state = useNowPlayingStore.getState();
        expect(API.setNowPlayingPref).toHaveBeenCalledWith(true);
        expect(state.enabled).toBe(true);
    });
});
