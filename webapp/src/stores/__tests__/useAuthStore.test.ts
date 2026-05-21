import { vi, describe, test, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../useAuthStore';
import API from '../../services/api';
import { ZenAuth } from '../../services/zen';
import { useWalletStore } from '../useWalletStore';

vi.mock('../../services/api', () => ({
    default: {
        getAuthStatus: vi.fn(),
        login: vi.fn(),
        registerUser: vi.fn(),
        setToken: vi.fn(),
    },
    ApiError: class ApiError extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.status = status;
        }
    }
}));

vi.mock('../../services/zen', () => ({
    ZenAuth: {
        init: vi.fn(),
        login: vi.fn(),
        loginWithPair: vi.fn(),
        logout: vi.fn(),
        getProfile: vi.fn(),
        subscribeProfile: vi.fn(),
        subscribeAlias: vi.fn(),
        sign: vi.fn(),
    }
}));

vi.mock('../useWalletStore', () => ({
    useWalletStore: {
        getState: vi.fn(() => ({
            clearWallet: vi.fn(),
        })),
    }
}));

describe('useAuthStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        useAuthStore.setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isFirstRun: false,
            mustChangePassword: false,
            role: null,
            error: null,
            isAuthenticating: false,
            adminUser: null,
            isAdminAuthenticated: false,
            isAdminLoading: false,
            isInitializing: false,
        });
    });

    test('initial state', () => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
    });

    test('clearError resets error state', () => {
        useAuthStore.setState({ error: 'Some error' });
        const store = useAuthStore.getState();
        store.clearError();
        expect(useAuthStore.getState().error).toBeNull();
    });

    test('checkAuth updates authentication status and user details on success', async () => {
        const mockAuthStatus = {
            authenticated: true,
            role: 'admin',
            user: { username: 'testadmin', id: '1', isAdmin: true },
            firstRun: false,
            mustChangePassword: false,
        };

        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus);

        const store = useAuthStore.getState();
        await store.checkAuth();

        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(true);
        expect(state.isAdminAuthenticated).toBe(true);
        expect(state.role).toBe('admin');
        expect(state.user).toEqual({
            username: 'testadmin',
            id: '1',
            zenProfile: null,
        });
    });

    test('checkAuth handles Zen integration if pair exists', async () => {
        const mockAuthStatus = {
            authenticated: true,
            role: 'user',
            username: 'testuser',
            artistId: 5,
            pair: { pub: 'key' },
        };

        const mockZenProfile = { pub: 'key', alias: 'testuser', epub: 'epub-key' };

        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus);
        vi.mocked(ZenAuth.loginWithPair).mockResolvedValue(mockZenProfile);

        const store = useAuthStore.getState();
        await store.checkAuth();

        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(true);
        expect(ZenAuth.loginWithPair).toHaveBeenCalledWith(mockAuthStatus.pair);
        expect(state.user?.zenProfile).toEqual(mockZenProfile);
    });

    test('login authenticates user and sets token', async () => {
        const mockLoginResponse = {
            token: 'test-jwt-token',
            role: 'user',
            user: { username: 'testuser', id: '2', isAdmin: false },
        };

        vi.mocked(API.login).mockResolvedValue(mockLoginResponse);

        const store = useAuthStore.getState();
        await store.login('testuser', 'password123');

        const state = useAuthStore.getState();
        expect(API.login).toHaveBeenCalledWith('testuser', 'password123', undefined, undefined);
        expect(API.setToken).toHaveBeenCalledWith('test-jwt-token');
        expect(state.isAuthenticated).toBe(true);
        expect(state.user?.username).toBe('testuser');
    });

    test('login handles failure', async () => {
        vi.mocked(API.login).mockRejectedValue(new Error('Invalid username or password.'));

        const store = useAuthStore.getState();

        await expect(store.login('testuser', 'wrongpass')).rejects.toThrow('Invalid username or password.');
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.error).toBe('Invalid username or password.');
    });

    test('logout clears store, token, and wallet state', () => {
        useAuthStore.setState({
            user: { username: 'testuser' } as any,
            isAuthenticated: true,
            role: 'user',
        });

        const store = useAuthStore.getState();
        store.logout();

        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(state.role).toBeNull();
        expect(ZenAuth.logout).toHaveBeenCalled();
        expect(useWalletStore.getState().clearWallet).toHaveBeenCalled();
        expect(API.setToken).toHaveBeenCalledWith(null);
    });
});
