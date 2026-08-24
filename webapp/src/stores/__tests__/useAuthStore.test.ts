import { vi, describe, test, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../useAuthStore';
import API from '../../services/api';


vi.mock('../../services/api', () => ({
    default: {
        getAuthStatus: vi.fn(),
        login: vi.fn(),
        registerUser: vi.fn(),
        setToken: vi.fn(),
        uploadZenKeys: vi.fn(),
        getZenKeys: vi.fn(),
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

// Real SEA crypto needs a browser-conditioned resolution of the `zen` package
// that vitest's Node module resolution doesn't provide; the crypto itself is
// covered by tunecamp-chat's own tests, so mock it deterministically here.
// The fake vault keeps the sealing password in the ciphertext so that opening
// it with the wrong one fails, as the real one does.
const MINTED_PAIR = {
    pub: 'minted-pub',
    priv: 'minted-priv',
    epub: 'minted-epub',
    epriv: 'minted-epriv',
};

// `tcv1:` marks a vault sealed with the PBKDF2 envelope; without it the blob is
// one of the old ones whose password was stretched by a single SHA-256.
function fakeVault(pair: unknown, password: string): string {
    return `tcv1:vault(${password}):${JSON.stringify(pair)}`;
}

function legacyVault(pair: unknown, password: string): string {
    return `vault(${password}):${JSON.stringify(pair)}`;
}

vi.mock('@tunecamp/chat', () => ({
    generateKeyPair: vi.fn(async () => ({ ...MINTED_PAIR })),
    encryptPairVault: vi.fn(async (pair: unknown, password: string) =>
        `tcv1:vault(${password}):${JSON.stringify(pair)}`,
    ),
    decryptPairVault: vi.fn(async (vault: string, password: string) => {
        const body = vault.startsWith('tcv1:') ? vault.slice('tcv1:'.length) : vault;
        const prefix = `vault(${password}):`;
        return body.startsWith(prefix) ? JSON.parse(body.slice(prefix.length)) : null;
    }),
    isLegacyPairVault: vi.fn((vault: string) => !vault.startsWith('tcv1:')),
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
            chatIdentityLocked: false,
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

    // Zen identity resolution on login. The chat pair *is* the account's Zen
    // identity now, so these cases decide whether a user can read their DMs.
    function mockLoginFlow(username: string, loginExtras: Record<string, unknown> = {}) {
        vi.mocked(API.login).mockResolvedValue({
            token: 'test-jwt-token',
            role: 'user',
            user: { username, id: '2', isAdmin: false },
            ...loginExtras,
        } as any);
        vi.mocked(API.getAuthStatus).mockResolvedValue({
            authenticated: true,
            role: 'user',
            user: { username, id: '2', isAdmin: false },
            firstRun: false,
            mustChangePassword: false,
        } as any);
    }

    test('login opens the account vault and uses the pair it holds', async () => {
        const existing = { pub: 'zen-pub', priv: 'zen-priv', epub: 'ep', epriv: 'es' };
        mockLoginFlow('testuser', {
            zenPub: existing.pub,
            zenPriv: fakeVault(existing, 'password123'),
        });

        await useAuthStore.getState().login('testuser', 'password123');

        const state = useAuthStore.getState();
        expect(state.chatKeyPair).toEqual(existing);
        // Opening an existing vault must not re-upload anything.
        expect(API.uploadZenKeys).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem('tunecamp_chatkey_testuser')!)).toEqual(existing);
    });

    // Login is the only moment the client holds the password, so it is the only
    // chance to replace the weakly-sealed copy the server is storing.
    test('login re-seals a legacy vault under the current KDF', async () => {
        const existing = { pub: 'zen-pub', priv: 'zen-priv', epub: 'ep', epriv: 'es' };
        mockLoginFlow('testuser', {
            zenPub: existing.pub,
            zenPriv: legacyVault(existing, 'password123'),
        });

        await useAuthStore.getState().login('testuser', 'password123');

        expect(useAuthStore.getState().chatKeyPair).toEqual(existing);
        expect(API.uploadZenKeys).toHaveBeenCalledWith(
            existing.pub,
            fakeVault(existing, 'password123'),
        );
    });

    test('a failed re-seal does not cost the user their session', async () => {
        const existing = { pub: 'zen-pub', priv: 'zen-priv', epub: 'ep', epriv: 'es' };
        mockLoginFlow('testuser', {
            zenPub: existing.pub,
            zenPriv: legacyVault(existing, 'password123'),
        });
        // Once, not permanently: clearAllMocks resets calls but keeps implementations.
        vi.mocked(API.uploadZenKeys).mockRejectedValueOnce(new Error('offline'));

        await useAuthStore.getState().login('testuser', 'password123');

        expect(useAuthStore.getState().chatKeyPair).toEqual(existing);
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    test('login mints and uploads an identity for an account that has none', async () => {
        mockLoginFlow('testuser', { zenPub: null, zenPriv: null });

        await useAuthStore.getState().login('testuser', 'password123');

        expect(useAuthStore.getState().chatKeyPair).toEqual(MINTED_PAIR);
        expect(API.uploadZenKeys).toHaveBeenCalledWith(
            MINTED_PAIR.pub,
            fakeVault(MINTED_PAIR, 'password123'),
        );
    });

    // The private half lives in the FID portal and was never uploaded. Minting a
    // pair here would fork one account into two identities.
    test('login does not mint a second identity when the account has a zenPub but no vault', async () => {
        mockLoginFlow('testuser', { zenPub: 'portal-bound-pub', zenPriv: null });

        await useAuthStore.getState().login('testuser', 'password123');

        expect(useAuthStore.getState().chatKeyPair).toBeNull();
        expect(API.uploadZenKeys).not.toHaveBeenCalled();
        expect(localStorage.getItem('tunecamp_chatkey_testuser')).toBeNull();
    });

    test('login yields no chat identity when the vault does not match the account key', async () => {
        mockLoginFlow('testuser', {
            zenPub: 'zen-pub',
            zenPriv: fakeVault({ pub: 'some-other-pub', priv: 'x' }, 'password123'),
        });

        await useAuthStore.getState().login('testuser', 'password123');

        expect(useAuthStore.getState().chatKeyPair).toBeNull();
    });

    test('register mints an identity and persists it to localStorage under the username', async () => {
        vi.mocked(API.registerUser).mockResolvedValue({
            success: true,
            token: 'test-jwt-token',
            username: 'newuser',
            artistId: 0,
            role: 'user',
            storageQuota: 0,
        } as any);
        vi.mocked(API.getAuthStatus).mockResolvedValue({
            authenticated: true,
            role: 'user',
            user: { username: 'newuser', id: '3', isAdmin: false },
            firstRun: false,
            mustChangePassword: false,
        } as any);

        await useAuthStore.getState().register('newuser', 'password123');

        const state = useAuthStore.getState();
        expect(state.chatKeyPair).toEqual(MINTED_PAIR);
        expect(API.uploadZenKeys).toHaveBeenCalledWith(
            MINTED_PAIR.pub,
            fakeVault(MINTED_PAIR, 'password123'),
        );
        expect(JSON.parse(localStorage.getItem('tunecamp_chatkey_newuser')!)).toEqual(MINTED_PAIR);
    });

    // The vault is sealed with the *old* password until this runs; skipping it
    // locks the user out of their own identity on the next login.
    test('resealChatIdentity re-uploads the same pub key under the new password', async () => {
        const pair = { pub: 'zen-pub', priv: 'zen-priv', epub: 'ep', epriv: 'es' };
        useAuthStore.setState({ chatKeyPair: pair });

        await useAuthStore.getState().resealChatIdentity('new-password');

        expect(API.uploadZenKeys).toHaveBeenCalledWith(pair.pub, fakeVault(pair, 'new-password'));
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

    test('checkAuth marks the identity locked when this device holds no pair but the server holds a vault', async () => {
        vi.mocked(API.getAuthStatus).mockResolvedValue({
            authenticated: true,
            role: 'user',
            username: 'testuser',
            firstRun: false,
            mustChangePassword: false,
        } as any);
        vi.mocked(API.getZenKeys).mockResolvedValue({
            zenPub: MINTED_PAIR.pub,
            zenPriv: fakeVault(MINTED_PAIR, 'hunter2'),
        });

        await useAuthStore.getState().checkAuth();

        expect(useAuthStore.getState().chatIdentityLocked).toBe(true);
        expect(useAuthStore.getState().chatKeyPair).toBeNull();
    });

    test('checkAuth leaves it unlocked when the private half lives elsewhere', async () => {
        vi.mocked(API.getAuthStatus).mockResolvedValue({
            authenticated: true,
            role: 'user',
            username: 'testuser',
            firstRun: false,
            mustChangePassword: false,
        } as any);
        // Identity bound from the FID portal: a pub with no vault. No password
        // prompt can recover it, so offering one would only mislead.
        vi.mocked(API.getZenKeys).mockResolvedValue({
            zenPub: MINTED_PAIR.pub,
            zenPriv: null,
        });

        await useAuthStore.getState().checkAuth();

        expect(useAuthStore.getState().chatIdentityLocked).toBe(false);
    });

    test('unlockChatIdentity opens the vault and caches the pair on this device', async () => {
        useAuthStore.setState({
            user: { username: 'testuser' } as any,
            isAuthenticated: true,
            chatIdentityLocked: true,
        });
        vi.mocked(API.getZenKeys).mockResolvedValue({
            zenPub: MINTED_PAIR.pub,
            zenPriv: fakeVault(MINTED_PAIR, 'hunter2'),
        });

        const ok = await useAuthStore.getState().unlockChatIdentity('hunter2');

        expect(ok).toBe(true);
        expect(useAuthStore.getState().chatKeyPair).toEqual(MINTED_PAIR);
        expect(useAuthStore.getState().chatIdentityLocked).toBe(false);
        expect(localStorage.getItem('tunecamp_chatkey_testuser')).toBe(
            JSON.stringify(MINTED_PAIR),
        );
    });

    test('unlockChatIdentity refuses the wrong password and stays locked', async () => {
        useAuthStore.setState({
            user: { username: 'testuser' } as any,
            isAuthenticated: true,
            chatIdentityLocked: true,
        });
        vi.mocked(API.getZenKeys).mockResolvedValue({
            zenPub: MINTED_PAIR.pub,
            zenPriv: fakeVault(MINTED_PAIR, 'hunter2'),
        });

        const ok = await useAuthStore.getState().unlockChatIdentity('wrong');

        expect(ok).toBe(false);
        expect(useAuthStore.getState().chatKeyPair).toBeNull();
        expect(useAuthStore.getState().chatIdentityLocked).toBe(true);
    });

    test('unlockChatIdentity reports why it failed instead of always blaming the password', async () => {
        useAuthStore.setState({
            user: { username: 'testuser' } as any,
            isAuthenticated: true,
            chatIdentityLocked: true,
        });
        // Identity bound elsewhere: a pub with no vault. Retyping the password
        // cannot fix this, so the reason must not read as "wrong password".
        vi.mocked(API.getZenKeys).mockResolvedValue({
            zenPub: MINTED_PAIR.pub,
            zenPriv: null,
        });

        expect(await useAuthStore.getState().unlockChatIdentity('hunter2')).toBe(false);
        expect(useAuthStore.getState().chatUnlockError).toBe('identity-elsewhere');

        // A vault that exists but does not open under this password is the one
        // case where retyping is worth suggesting.
        vi.mocked(API.getZenKeys).mockResolvedValue({
            zenPub: MINTED_PAIR.pub,
            zenPriv: fakeVault(MINTED_PAIR, 'hunter2'),
        });

        expect(await useAuthStore.getState().unlockChatIdentity('wrong')).toBe(false);
        expect(useAuthStore.getState().chatUnlockError).toBe('vault-locked');
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
