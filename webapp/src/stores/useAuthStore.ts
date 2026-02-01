import { create } from 'zustand';
import API from '../services/api';
import type { User } from '../types';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    checkAuth: () => Promise<void>;
    login: (username: string, password?: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            if (!API.getToken()) throw new Error('No token');
            const status = await API.getAuthStatus();
            set({
                isAuthenticated: status.authenticated,
                user: status.user || (status.username ? { username: status.username, isAdmin: true, id: '0' } as User : null),
                isLoading: false
            });
        } catch (e) {
            set({ isAuthenticated: false, user: null, isLoading: false });
        }
    },

    login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
            const result = await API.login(username, password);
            API.setToken(result.token);
            set({
                isAuthenticated: true,
                user: result.user || { username, isAdmin: true, id: '0' } as User,
                isLoading: false
            });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
            throw e;
        }
    },

    register: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
            const result = await API.register(username, password);
            API.setToken(result.token);
            set({
                isAuthenticated: true,
                user: result.user || { username, isAdmin: false, id: '0' } as User,
                isLoading: false
            });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
            throw e;
        }
    },

    logout: () => {
        API.logout();
        set({ isAuthenticated: false, user: null });
    },
}));
