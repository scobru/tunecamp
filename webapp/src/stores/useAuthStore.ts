import { create } from 'zustand';
import API, { ApiError } from '../services/api';
import { ZenAuth, type ZenProfile } from '../services/zen';
import type { User } from '../types';
import { useWalletStore } from './useWalletStore';

type UserRole = 'admin' | 'user' | 'super_user' | 'root_admin' | null;

interface AuthState {
    user: (User & { zenProfile?: ZenProfile | null }) | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isFirstRun: boolean;
    mustChangePassword?: boolean;
    role: UserRole;
    error: string | null;
    isAuthenticating: boolean;

    // Actions
    init: () => Promise<void>;
    login: (username: string, password?: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
    clearError: () => void;

    // Compatibility (for existing components)
    adminUser: User | null;
    isAdminAuthenticated: boolean;
    isAdminLoading: boolean;
    isInitializing: boolean;
    loginAdmin: (username: string, password?: string) => Promise<void>;
    loginWithPair: (pair: any) => Promise<void>;
    checkAdminAuth: () => Promise<void>;
    logoutAdmin: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    isFirstRun: false,
    mustChangePassword: false,
    role: null,
    error: null,
    isAuthenticating: false,

    // Compat helpers
    adminUser: null,
    isAdminAuthenticated: false,
    isAdminLoading: true,
    isInitializing: true,

    clearError: () => set({ error: null }),

    init: async () => {
        set({ isLoading: true });
        await get().checkAuth();
    },

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const status = await API.getAuthStatus();
            const isAdmin = status.authenticated && (status.role === 'admin' || status.role === 'super_user' || status.role === 'root_admin');

            let zenProfile: ZenProfile | null = null;
            if (status.pair) {
                try {
                    zenProfile = await ZenAuth.loginWithPair(status.pair);
                } catch (e) {
                    console.error("Zen re-auth failed:", e);
                }
            } else if (status.authenticated) {
                // Try session storage or init
                try {
                    await ZenAuth.init();
                    zenProfile = ZenAuth.getProfile();
                } catch (e) { }
            }

            if (zenProfile) {
                try {
                    // Subscribe to profile changes
                    ZenAuth.subscribeProfile((profileData) => {
                        set((state) => ({
                            user: state.user ? { ...state.user, zenProfile: { ...state.user.zenProfile!, profile: profileData } } : null
                        }));
                    });

                    // Subscribe to mutable alias changes
                    ZenAuth.subscribeAlias((aliasData) => {
                        if (aliasData) {
                            set((state) => ({
                                user: state.user ? { ...state.user, zenProfile: { ...state.user.zenProfile!, alias: aliasData } } : null
                            }));
                        }
                    });
                } catch (subErr) {
                    console.error("Failed to subscribe to Zen info:", subErr);
                }
            }

            const transformedUser = status.user || (status.username ? {
                username: status.username,
                isAdmin: status.role === 'admin' || status.role === 'super_user' || status.role === 'root_admin',
                isRootAdmin: !!status.isRootAdmin,
                id: String(status.artistId ?? '0'),
                artistId: status.artistId != null ? String(status.artistId) : undefined,
                isActive: status.isActive
            } as User : null);

            set({
                isAuthenticated: status.authenticated,
                isAdminAuthenticated: isAdmin, // compat
                user: transformedUser ? { ...transformedUser, zenProfile } : null,
                adminUser: transformedUser, // compat
                isFirstRun: !!status.firstRun,
                mustChangePassword: !!status.mustChangePassword,
                role: (status.role as any) || null,
                isLoading: false,
                isAdminLoading: false, // compat
                isInitializing: false // compat
            });
        } catch (e: any) {
            console.error("Auth check failed:", e);

            // If it's a network error (status 0), don't clear the authenticated state 
            // if we already have a token in localStorage. This avoids "logging out" 
            // the user just because they are momentarily offline on mobile startup.
            const isNetworkError = e.status === 0 || e.message?.includes('Network Error');
            const hasToken = !!localStorage.getItem('tunecamp_token');

            if (isNetworkError && hasToken) {
                console.warn("Network error during auth check, preserving existing (potential) session");
                set({
                    isLoading: false,
                    isAdminLoading: false,
                    isInitializing: false
                });
            } else {
                set({
                    isAuthenticated: false,
                    isAdminAuthenticated: false,
                    user: null,
                    adminUser: null,
                    isLoading: false,
                    isAdminLoading: false,
                    isInitializing: false,
                    isFirstRun: false,
                    role: null
                });
            }
        }
    },

    login: async (username, password) => {
        if (get().isAuthenticating) return;
        set({ error: null, isLoading: true, isAuthenticating: true });
        try {
            let pubKey: string | undefined;
            let proof: string | undefined;

            if (password) {
                try {
                    console.log(`🔐 Zen-First Login: Verifying identity for ${username}...`);
                    const zenProfile = await ZenAuth.login(username, password);
                    pubKey = zenProfile.pub;

                    // Generate proof-of-possession for the backend
                    // We sign the username to prove we own the pubKey
                    console.log("Generating proof of identity...");
                    proof = await ZenAuth.sign(username);
                    console.log("✨ Proof of identity generated:", typeof proof === 'object' ? 'object' : 'string');
                } catch (zenErr) {
                    console.warn("⚠️ Zen authentication failed (maybe offline or wrong pass), falling back to local-only proof:", zenErr);
                }
            }

            let result;
            try {
                console.log(`📡 Sending login request to backend for ${username}... (pubKey: ${pubKey ? 'YES' : 'NO'}, proof: ${proof ? 'YES' : 'NO'})`);
                result = await API.login(username, password, pubKey, proof);
                console.log("✅ Backend login successful.");
            } catch (apiErr: any) {
                const status = apiErr.status || 0;
                console.error(`❌ Backend login failed (Status: ${status}):`, apiErr.message);

                if (status === 401) {
                    throw new Error("Invalid username or password.");
                } else if (status === 0) {
                    throw new Error("Cannot connect to server. Check your internet connection.");
                }

                if (!proof && !password) {
                    throw new Error("Login failed: Zen identity not found and no password provided.");
                }
                throw apiErr;
            }

            API.setToken(result.token);

            let zenProfile: ZenProfile | null = null;
            if (result.pair) {
                try {
                    zenProfile = await ZenAuth.loginWithPair(result.pair, username);
                } catch (zenErr) {
                    console.error("Failed to auto-login to Zen with pair:", zenErr);
                }
            }

            if (zenProfile) {
                try {
                    // Subscribe to profile changes
                    ZenAuth.subscribeProfile((profileData) => {
                        set((state) => ({
                            user: state.user ? { ...state.user, zenProfile: { ...state.user.zenProfile!, profile: profileData } } : null
                        }));
                    });

                    // Subscribe to mutable alias changes
                    ZenAuth.subscribeAlias((aliasData) => {
                        if (aliasData) {
                            set((state) => ({
                                user: state.user ? { ...state.user, zenProfile: { ...state.user.zenProfile!, alias: aliasData } } : null
                            }));
                        }
                    });
                } catch (subErr) {
                    console.error("Failed to subscribe to Zen info:", subErr);
                }
            }

            const transformedUser = result.user || {
                username,
                isAdmin: result.role === 'admin' || result.role === 'super_user' || result.role === 'root_admin',
                isRootAdmin: !!result.isRootAdmin,
                id: String(result.artistId ?? '0'),
                userId: result.userId,
                artistId: result.artistId != null ? String(result.artistId) : undefined,
                isActive: result.isActive
            } as User;

            const userRole = (result as any).role || 'user';
            set({
                isAuthenticated: true,
                isAdminAuthenticated: userRole === 'admin' || userRole === 'super_user' || userRole === 'root_admin', // compat
                user: { ...transformedUser, zenProfile },
                adminUser: transformedUser, // compat
                mustChangePassword: !!result.mustChangePassword,
                role: userRole,
                isLoading: false,
                isAdminLoading: false, // compat
                isInitializing: false // compat
            });
        } catch (e: any) {
            set({ error: e.message, isLoading: false, isAuthenticating: false });
            throw e;
        } finally {
            set({ isAuthenticating: false });
        }
    },

    // Compat alias
    loginAdmin: async (username, password) => {
        return get().login(username, password);
    },

    loginWithPair: async (pair: any) => {
        if (get().isAuthenticating) return;
        set({ error: null, isLoading: true, isAdminLoading: true, isInitializing: true, isAuthenticating: true });
        try {
            console.log("🔐 Zen-First Login: Verifying identity on peer network using Zen Pair...");
            const zenProfile = await ZenAuth.loginWithPair(pair);

            let proof: string | undefined;
            try {
                // Generate proof-of-possession for the backend
                // The username (alias) acts as the payload to sign
                const username = zenProfile.alias;
                proof = await ZenAuth.sign(username);
                console.log("✨ Proof of identity generated from Pair.");

                // Now authenticate with backend API using the proof
                // The backend API login expects a username + password OR a valid pubKey + proof.
                // Depending on the backend implementation, sending the alias + pubKey + proof might be enough
                // to authenticate without the actual password. Let's try sending alias and empty password, plus PubKey/Proof.
                const result = await API.login(username, '', zenProfile.pub, proof);
                API.setToken(result.token);

                // Update the user structure with the result from the backend
                const transformedUser = result.user || {
                    username,
                    isAdmin: result.role === 'admin' || result.role === 'super_user' || result.role === 'root_admin',
                    id: String(result.artistId ?? '0'),
                    artistId: result.artistId != null ? String(result.artistId) : undefined,
                    isActive: result.isActive
                } as User;

                const userRole = (result as any).role || 'user';

                // Subscribe to profile changes
                try {
                    ZenAuth.subscribeProfile((profileData) => {
                        set((state) => ({
                            user: state.user ? { ...state.user, zenProfile: { ...state.user.zenProfile!, profile: profileData } } : null
                        }));
                    });

                    // Subscribe to mutable alias changes
                    ZenAuth.subscribeAlias((aliasData) => {
                        if (aliasData) {
                            set((state) => ({
                                user: state.user ? { ...state.user, zenProfile: { ...state.user.zenProfile!, alias: aliasData } } : null
                            }));
                        }
                    });
                } catch (subErr) {
                    console.error("Failed to subscribe to Zen profile:", subErr);
                }

                set({
                    isAuthenticated: true,
                    isAdminAuthenticated: userRole === 'admin' || userRole === 'super_user' || userRole === 'root_admin',
                    user: { ...transformedUser, zenProfile },
                    adminUser: transformedUser,
                    mustChangePassword: !!result.mustChangePassword,
                    role: userRole,
                    isLoading: false,
                    isAdminLoading: false,
                    isInitializing: false
                });

            } catch (backendError) {
                console.warn("Backend authentication failed after Pair login. Proceeding with local Zen session only.", backendError);
                // Fallback to local session if backend integration fails
                set((state) => ({
                    user: state.user ? { ...state.user, zenProfile } : { zenProfile } as any,
                    isAuthenticated: true,
                    isLoading: false,
                    isAdminLoading: false,
                    isInitializing: false,
                    isAuthenticating: false
                }));
            }
        } catch (e: any) {
            set({ error: e.message, isLoading: false, isAdminLoading: false, isInitializing: false, isAuthenticating: false });
            throw e;
        } finally {
            set({ isAuthenticating: false });
        }
    },

    checkAdminAuth: async () => {
        return get().checkAuth();
    },

    logoutAdmin: () => {
        get().logout();
    },

    register: async (username, password) => {
        if (get().isAuthenticating) return;
        set({ error: null, isLoading: true, isAuthenticating: true });
        try {
            // 1. Register on Zen first (Decentralized Identity)
            // ZenAuth.register falls back to login if the user already exists in the peer network
            console.log("🆕 Zen-First Registration: Creating identity on peer network...");
            await ZenAuth.register(username, password);
            const zenProfile = ZenAuth.getProfile();

            if (!zenProfile) throw new Error("Failed to create Zen identity");

            // 2. Generate proof for backend
            const proof = await ZenAuth.sign(username);
            console.log("✨ Proof of identity generated for registration:", typeof proof === 'object' ? 'object' : 'string');

            let token: string;
            try {
                // 3. Register on backend with proof
                console.log(`🔐 Registering ${username} on backend...`);
                const result = await API.registerUser(username, password, zenProfile.pub, proof);
                token = result.token;
            } catch (regErr: any) {
                // 409 = username already in DB (prior partial registration succeeded on server)
                // Fall through to login flow using the Zen proof
                if ((regErr instanceof ApiError && regErr.status === 409) || regErr?.message?.includes('already taken')) {
                    console.warn("⚠️ Username already registered on server, falling back to login...");
                    const loginResult = await API.login(username, password, zenProfile.pub, proof);
                    token = loginResult.token;
                } else {
                    throw regErr;
                }
            }

            // 4. Auto-login with the JWT token
            API.setToken(token);

            // 5. Success - updates the store state
            await get().checkAuth();

            set({ isLoading: false, isAuthenticating: false });
        } catch (e: any) {
            set({ error: e.message, isLoading: false, isAuthenticating: false });
            throw e;
        } finally {
            set({ isAuthenticating: false });
        }
    },

    logout: () => {
        ZenAuth.logout();
        useWalletStore.getState().clearWallet();
        API.setToken(null);
        set({
            user: null,
            isAuthenticated: false,
            adminUser: null,
            isAdminAuthenticated: false,
            isAdminLoading: false,
            isInitializing: false,
            role: null
        });
    }
}));
