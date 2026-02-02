import { create } from 'zustand';
import API from '../services/api';
import { GunAuth, type GunProfile } from '../services/gun';
import type { User } from '../types';

interface AuthState {
    // Community User (GunDB)
    user: GunProfile | null;
    isAuthenticated: boolean;
    isInitializing: boolean;

    // Admin User (API/SQL)
    adminUser: User | null;
    isAdminAuthenticated: boolean;
    isAdminLoading: boolean;

    error: string | null;

    // Actions
    init: () => Promise<void>;

    // Community Actions
    login: (username: string, password?: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;

    // Admin Actions
    loginAdmin: (username: string, password?: string) => Promise<void>;
    logoutAdmin: () => void;
    checkAdminAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    // Community State
    user: null,
    isAuthenticated: false,
    isInitializing: true,

    // Admin State
    adminUser: null,
    isAdminAuthenticated: false,
    isAdminLoading: true,

    error: null,

    init: async () => {
        set({ isInitializing: true, isAdminLoading: true });

        // 1. Initialize GunDB
        try {
            const gunProfile = await GunAuth.init();
            set({
                user: gunProfile,
                isAuthenticated: !!gunProfile,
                isInitializing: false
            });
        } catch (e) {
            console.error('GunAuth Init Error', e);
            set({ user: null, isAuthenticated: false, isInitializing: false });
        }

        // 2. Check Admin Auth
        get().checkAdminAuth();
    },

    // --- Community Actions ---
    login: async (username, password) => {
        if (!password) throw new Error("Password required for community login");
        set({ error: null });
        try {
            const profile = await GunAuth.login(username, password);
            set({ user: profile, isAuthenticated: true });
        } catch (e: any) {
            set({ error: e.message });
            throw e;
        }
    },

    register: async (username, password) => {
        set({ error: null });
        try {
            await GunAuth.register(username, password);
            const profile = GunAuth.getProfile();
            set({ user: profile, isAuthenticated: true });
        } catch (e: any) {
            set({ error: e.message });
            throw e;
        }
    },

    logout: () => {
        GunAuth.logout();
        set({ user: null, isAuthenticated: false });
    },

    // --- Admin Actions ---
    checkAdminAuth: async () => {
        set({ isAdminLoading: true });
        try {
            if (!API.getToken()) {
                set({ adminUser: null, isAdminAuthenticated: false, isAdminLoading: false });
                return;
            }
            const status = await API.getAuthStatus();
            set({
                isAdminAuthenticated: status.authenticated,
                adminUser: status.user || (status.username ? { username: status.username, isAdmin: true, id: '0' } as User : null),
                isAdminLoading: false
            });
        } catch (e) {
            set({ isAdminAuthenticated: false, adminUser: null, isAdminLoading: false });
        }
    },

    loginAdmin: async (username, password) => {
        set({ error: null, isAdminLoading: true });
        try {
            const result = await API.login(username, password);
            API.setToken(result.token);
            set({
                isAdminAuthenticated: true,
                adminUser: result.user || { username, isAdmin: true, id: '0' } as User,
                isAdminLoading: false
            });
        } catch (e: any) {
            set({ error: e.message, isAdminLoading: false });
            throw e;
        }
    },

    logoutAdmin: () => {
        API.logout();
        set({ adminUser: null, isAdminAuthenticated: false });
    }
}));
