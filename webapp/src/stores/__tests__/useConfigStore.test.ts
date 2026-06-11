import { vi, describe, test, expect, beforeEach } from 'vitest';
import { useConfigStore } from '../useConfigStore';
import API from '../../services/api';

vi.mock('../../services/api', () => ({
    default: {
        getAPIHealth: vi.fn(),
    }
}));

describe('useConfigStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the store state before each test
        useConfigStore.setState({
            status: null,
            isLoading: false,
            cacheBuster: 0,
        });
    });

    test('has correct default values', () => {
        const state = useConfigStore.getState();
        expect(state.status).toBeNull();
        expect(state.isLoading).toBe(false);
        expect(state.cacheBuster).toBe(0);
    });

    test('fetchStatus sets status on success', async () => {
        const mockHealth = {
            soulseek: { connected: true, username: 'testuser' },
            itunes: { online: true },
            musicbrainz: { online: false },
            discogs: { configured: true },
            telegram: { active: false },
            openrouter: { configured: true, model: 'gpt-4' },
            stripe: { configured: true, webhookConfigured: true },
            moonpay: { configured: false },
            gdrive: { configured: true, active: true },
            youtube: { online: true },
            spotify: { online: true },
            soundcloud: { online: true },
            bandcamp: { online: true },
            deezer: { online: true },
            lastfm: { configured: true, online: true },
            listenbrainz: { configured: true, online: true },
        };

        vi.mocked(API.getAPIHealth).mockResolvedValue(mockHealth);

        const store = useConfigStore.getState();
        const promise = store.fetchStatus();

        expect(useConfigStore.getState().isLoading).toBe(true);

        await promise;

        expect(useConfigStore.getState().isLoading).toBe(false);
        expect(useConfigStore.getState().status).toEqual(mockHealth);
        expect(API.getAPIHealth).toHaveBeenCalledTimes(1);
    });

    test('fetchStatus handles error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(API.getAPIHealth).mockRejectedValue(new Error('API failure'));

        const store = useConfigStore.getState();
        await store.fetchStatus();

        expect(useConfigStore.getState().isLoading).toBe(false);
        expect(useConfigStore.getState().status).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch health status', expect.any(Error));
        consoleSpy.mockRestore();
    });

    test('isConfigured works correctly based on service status properties', () => {
        const mockHealth: any = {
            stripe: { configured: true },
            gdrive: { active: true },
            soulseek: { connected: true },
            youtube: { online: true },
            telegram: { active: false },
        };

        useConfigStore.setState({ status: mockHealth });
        const store = useConfigStore.getState();

        expect(store.isConfigured('stripe')).toBe(true);
        expect(store.isConfigured('gdrive')).toBe(true);
        expect(store.isConfigured('soulseek')).toBe(true);
        expect(store.isConfigured('youtube')).toBe(true);
        expect(store.isConfigured('telegram')).toBe(false);
        expect(store.isConfigured('discogs')).toBe(false); // not in mockHealth
    });

    test('isConfigured returns false when status is null', () => {
        const store = useConfigStore.getState();
        expect(store.isConfigured('stripe')).toBe(false);
    });

    test('bumpCacheBuster updates cacheBuster value', () => {
        const store = useConfigStore.getState();
        expect(store.cacheBuster).toBe(0);

        store.bumpCacheBuster();
        expect(useConfigStore.getState().cacheBuster).toBeGreaterThan(0);
    });
});
