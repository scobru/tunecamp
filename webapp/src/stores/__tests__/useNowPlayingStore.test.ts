import { vi, describe, test, expect, beforeEach } from 'vitest';
import { useNowPlayingStore } from '../useNowPlayingStore';
import API from '../../services/api';
import { Track } from '../../types';

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
        useNowPlayingStore.setState({ enabled: true, loaded: true });

        let state = useNowPlayingStore.getState();
        expect(state.enabled).toBe(true);
        expect(state.loaded).toBe(true);

        state.reset();

        state = useNowPlayingStore.getState();
        expect(state.enabled).toBe(false);
        expect(state.loaded).toBe(false);
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

    test('fetchPref updates state on success when enabled is false', async () => {
        vi.mocked(API.getNowPlayingPref).mockResolvedValue({ enabled: false });
        useNowPlayingStore.setState({ enabled: true, loaded: false });

        const store = useNowPlayingStore.getState();
        await store.fetchPref();

        const state = useNowPlayingStore.getState();
        expect(API.getNowPlayingPref).toHaveBeenCalledTimes(1);
        expect(state.enabled).toBe(false);
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

    test('setEnabled updates preference via API to false and sets new state', async () => {
        vi.mocked(API.setNowPlayingPref).mockResolvedValue({ enabled: false });

        useNowPlayingStore.setState({ enabled: true, loaded: true });
        const store = useNowPlayingStore.getState();
        await store.setEnabled(false);

        const state = useNowPlayingStore.getState();
        expect(API.setNowPlayingPref).toHaveBeenCalledWith(false);
        expect(state.enabled).toBe(false);
    });

    test('setEnabled propagates errors when API fails', async () => {
        vi.mocked(API.setNowPlayingPref).mockRejectedValue(new Error('Network error'));

        const store = useNowPlayingStore.getState();
        await expect(store.setEnabled(true)).rejects.toThrow('Network error');
    });

    test('fetchPref preserves enabled state when API fails', async () => {
        vi.mocked(API.getNowPlayingPref).mockRejectedValue(new Error('Network error'));
        useNowPlayingStore.setState({ enabled: true, loaded: false });

        const store = useNowPlayingStore.getState();
        await store.fetchPref();

        const state = useNowPlayingStore.getState();
        expect(state.enabled).toBe(true);
        expect(state.loaded).toBe(true);
    });

    test('setEnabled syncs state with API response even if different from requested', async () => {
        vi.mocked(API.setNowPlayingPref).mockResolvedValue({ enabled: false });

        const store = useNowPlayingStore.getState();
        await store.setEnabled(true);

        const state = useNowPlayingStore.getState();
        expect(API.setNowPlayingPref).toHaveBeenCalledWith(true);
        expect(state.enabled).toBe(false);
    });

    test('setCurrentTrack updates the current track', () => {
        const mockTrack: Track = {
            id: '1',
            title: 'Test Track',
            duration: 180,
            artist: { id: 'a1', name: 'Test Artist' },
            album: { id: 'al1', title: 'Test Album' },
        } as any;

        const store = useNowPlayingStore.getState();
        store.setCurrentTrack(mockTrack);

        const state = useNowPlayingStore.getState();
        expect(state.currentTrack).toEqual(mockTrack);
    });

    test('setCurrentTrack handles subsequent updates', () => {
        const mockTrack1: Track = { id: '1', title: 'Track 1' } as any;
        const mockTrack2: Track = { id: '2', title: 'Track 2' } as any;

        const store = useNowPlayingStore.getState();
        store.setCurrentTrack(mockTrack1);

        let state = useNowPlayingStore.getState();
        expect(state.currentTrack).toEqual(mockTrack1);

        store.setCurrentTrack(mockTrack2);

        state = useNowPlayingStore.getState();
        expect(state.currentTrack).toEqual(mockTrack2);
    });
});
