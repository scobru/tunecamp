import { create } from 'zustand';
import API from '../services/api';
import type { User } from '../types';
import { useWalletStore } from './useWalletStore';
import { useNowPlayingStore } from './useNowPlayingStore';
import { queryClient } from '../lib/queryClient';

type UserRole = 'admin' | 'user' | 'super_user' | 'root_admin' | null;

interface AuthState {
    user: User | null;
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

            const transformedUser = status.user || (status.username ? {
                username: status.username,
                isAdmin: status.role === 'admin' || status.role === 'super_user' || status.role === 'root_admin',
                isRootAdmin: !!status.isRootAdmin,
                id: String(status.artistId ?? '0'),
                artistId: status.artistId != null ? String(status.artistId) : undefined,
                userId: status.userId != null ? Number(status.userId) : undefined,
                isActive: status.isActive,
                alias: (status as any).alias ?? null,
                avatar: (status as any).avatar ?? null,
                email: (status as any).email ?? null,
                securityQuestionsConfigured: !!(status as any).securityQuestionsConfigured,
            } as User : null);

            set({
                isAuthenticated: status.authenticated,
                isAdminAuthenticated: isAdmin,
                user: transformedUser,
                adminUser: transformedUser,
                isFirstRun: !!status.firstRun,
                mustChangePassword: !!status.mustChangePassword,
                role: (status.role as any) || null,
                isLoading: false,
                isAdminLoading: false,
                isInitializing: false
            });
        } catch (e: any) {
            console.error("Auth check failed:", e);

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
            const result = await API.login(username, password);
            API.setToken(result.token);
            await get().checkAuth();
            // Cached lists were fetched as the previous identity (often anon) and
            // are filtered by permissions — drop them so they refetch as this user.
            queryClient.invalidateQueries();
        } catch (e: any) {
            set({ error: e.message, isLoading: false, isAuthenticating: false });
            throw e;
        } finally {
            set({ isAuthenticating: false });
        }
    },

    loginAdmin: async (username, password) => {
        return get().login(username, password);
    },

    loginWithPair: async (_pair: any) => {
        throw new Error("Pair login is no longer supported. Please log in with username and password.");
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
            const result = await API.registerUser(username, password);
            API.setToken(result.token);
            await get().checkAuth();
            queryClient.invalidateQueries();
            set({ isLoading: false, isAuthenticating: false });
        } catch (e: any) {
            set({ error: e.message, isLoading: false, isAuthenticating: false });
            throw e;
        } finally {
            set({ isAuthenticating: false });
        }
    },

    logout: () => {
        useWalletStore.getState().clearWallet();
        useNowPlayingStore.getState().reset();
        API.setToken(null);
        // Wipe cached per-user lists so a logged-out browser doesn't keep them.
        queryClient.clear();
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
