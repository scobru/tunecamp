import { vi, describe, test, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../useAuthStore';
import API from '../../services/api';


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

const mockClearWallet = vi.fn();
vi.mock('../useWalletStore', () => ({
    useWalletStore: {
        getState: vi.fn(() => ({
            clearWallet: mockClearWallet,
        })),
    }
}));

// Real SEA derivation needs a browser-conditioned resolution of the `zen`
// package that vitest's Node module resolution doesn't provide; the crypto
// itself is covered by tunecamp-chat's own tests, so mock it deterministically here.
vi.mock('@tunecamp/chat', () => ({
    deriveKeyPairFromPassword: vi.fn(async (username: string) => ({
        pub: `pub-${username}`,
        priv: `priv-${username}`,
        epub: `epub-${username}`,
        epriv: `epriv-${username}`,
    })),
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
            chatKeyPair: null,
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
            isAdmin: true,
        });
    });

    test('login authenticates user and sets token', async () => {
        const mockLoginResponse = {
            token: 'test-jwt-token',
            role: 'user',
            user: { username: 'testuser', id: '2', isAdmin: false },
        };
        const mockAuthStatus = {
            authenticated: true,
            role: 'user',
            user: { username: 'testuser', id: '2', isAdmin: false },
            firstRun: false,
            mustChangePassword: false,
        };

        vi.mocked(API.login).mockResolvedValue(mockLoginResponse);
        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus);

        const store = useAuthStore.getState();
        await store.login('testuser', 'password123');

        const state = useAuthStore.getState();
        expect(API.login).toHaveBeenCalledWith('testuser', 'password123');
        expect(API.setToken).toHaveBeenCalledWith('test-jwt-token');
        expect(state.isAuthenticated).toBe(true);
        expect(state.user?.username).toBe('testuser');
    });

    test('login handles failure', async () => {
        const error = new Error('Invalid username or password.') as any;
        error.status = 401;
        vi.mocked(API.login).mockRejectedValue(error);

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
        expect(mockClearWallet).toHaveBeenCalled();
        expect(API.setToken).toHaveBeenCalledWith(null);
    });

    test('login derives a chatKeyPair and persists it to localStorage under the username', async () => {
        const mockLoginResponse = {
            token: 'test-jwt-token',
            role: 'user',
            user: { username: 'testuser', id: '2', isAdmin: false },
        };
        const mockAuthStatus = {
            authenticated: true,
            role: 'user',
            user: { username: 'testuser', id: '2', isAdmin: false },
            firstRun: false,
            mustChangePassword: false,
        };

        vi.mocked(API.login).mockResolvedValue(mockLoginResponse);
        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus);

        const store = useAuthStore.getState();
        await store.login('testuser', 'password123');

        const state = useAuthStore.getState();
        expect(state.chatKeyPair).toEqual({
            pub: 'pub-testuser',
            priv: 'priv-testuser',
            epub: 'epub-testuser',
            epriv: 'epriv-testuser',
        });

        const stored = localStorage.getItem('tunecamp_chatkey_testuser');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored!)).toEqual(state.chatKeyPair);
    });

    test('register derives a chatKeyPair and persists it to localStorage under the username', async () => {
        const mockRegisterResponse = {
            success: true,
            token: 'test-jwt-token',
            username: 'newuser',
            artistId: 0,
            role: 'user',
            storageQuota: 0,
        };
        const mockAuthStatus = {
            authenticated: true,
            role: 'user',
            user: { username: 'newuser', id: '3', isAdmin: false },
            firstRun: false,
            mustChangePassword: false,
        };

        vi.mocked(API.registerUser).mockResolvedValue(mockRegisterResponse);
        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus);

        const store = useAuthStore.getState();
        await store.register('newuser', 'password123');

        const state = useAuthStore.getState();
        expect(state.chatKeyPair).toEqual({
            pub: 'pub-newuser',
            priv: 'priv-newuser',
            epub: 'epub-newuser',
            epriv: 'epriv-newuser',
        });

        const stored = localStorage.getItem('tunecamp_chatkey_newuser');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored!)).toEqual(state.chatKeyPair);
    });

    test('checkAuth rehydrates chatKeyPair from localStorage when the in-memory one is missing (e.g. after a page reload)', async () => {
        const cachedPair = { pub: 'p', priv: 's', epub: 'ep', epriv: 'es' };
        localStorage.setItem('tunecamp_chatkey_testadmin', JSON.stringify(cachedPair));

        const mockAuthStatus = {
            authenticated: true,
            role: 'admin',
            user: { username: 'testadmin', id: '1', isAdmin: true },
            username: 'testadmin',
            firstRun: false,
            mustChangePassword: false,
        };
        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus as any);

        const store = useAuthStore.getState();
        await store.checkAuth();

        expect(useAuthStore.getState().chatKeyPair).toEqual(cachedPair);
    });

    test('checkAuth does not overwrite an already-loaded chatKeyPair', async () => {
        const inMemoryPair = { pub: 'in-memory', priv: 's', epub: 'ep', epriv: 'es' };
        const staleCached = { pub: 'stale', priv: 's', epub: 'ep', epriv: 'es' };
        localStorage.setItem('tunecamp_chatkey_testadmin', JSON.stringify(staleCached));
        useAuthStore.setState({ chatKeyPair: inMemoryPair });

        const mockAuthStatus = {
            authenticated: true,
            role: 'admin',
            user: { username: 'testadmin', id: '1', isAdmin: true },
            username: 'testadmin',
            firstRun: false,
            mustChangePassword: false,
        };
        vi.mocked(API.getAuthStatus).mockResolvedValue(mockAuthStatus as any);

        const store = useAuthStore.getState();
        await store.checkAuth();

        expect(useAuthStore.getState().chatKeyPair).toEqual(inMemoryPair);
    });

    test('logout removes the current user\'s chatKeyPair from localStorage and state', () => {
        const pair = { pub: 'p', priv: 's', epub: 'ep', epriv: 'es' };
        localStorage.setItem('tunecamp_chatkey_testuser', JSON.stringify(pair));
        useAuthStore.setState({
            user: { username: 'testuser' } as any,
            isAuthenticated: true,
            role: 'user',
            chatKeyPair: pair,
        });

        const store = useAuthStore.getState();
        store.logout();

        const state = useAuthStore.getState();
        expect(state.chatKeyPair).toBeNull();
        expect(localStorage.getItem('tunecamp_chatkey_testuser')).toBeNull();
    });
});
