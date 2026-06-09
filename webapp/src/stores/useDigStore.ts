import { create } from 'zustand';
import API from '../services/api';
import type {
    DigStrategy, DigSearchResult, DigResult, RankedRelease,
    DigSession, DigCrateItem
} from '../types';

interface DigState {
    // Search
    query: string;
    searchResults: DigSearchResult[];
    isSearching: boolean;

    // Dig
    strategy: DigStrategy;
    digResult: DigResult | null;
    isDigging: boolean;
    digError: string | null;

    // Sessions & crate
    sessions: DigSession[];
    currentSessionId: number | null;
    crate: DigCrateItem[];

    // History
    history: { id: number; query: string; source: string; created_at: string }[];

    // Actions
    setQuery: (q: string) => void;
    setStrategy: (s: DigStrategy) => void;
    search: (q: string) => Promise<void>;
    runDig: (releaseUrl: string) => Promise<void>;
    loadSessions: () => Promise<void>;
    createSession: (name: string) => Promise<DigSession | null>;
    deleteSession: (id: number) => Promise<void>;
    selectSession: (id: number) => Promise<void>;
    addToCrate: (item: RankedRelease) => Promise<void>;
    removeFromCrate: (itemId: number) => Promise<void>;
    loadHistory: () => Promise<void>;
}

export const useDigStore = create<DigState>((set, get) => ({
    query: '',
    searchResults: [],
    isSearching: false,
    strategy: 'balanced',
    digResult: null,
    isDigging: false,
    digError: null,
    sessions: [],
    currentSessionId: null,
    crate: [],
    history: [],

    setQuery: (q) => set({ query: q }),
    setStrategy: (s) => set({ strategy: s }),

    search: async (q) => {
        const query = q.trim();
        if (!query) return;
        set({ isSearching: true });
        try {
            const results = await API.digSearch(query);
            set({ searchResults: results });
            get().loadHistory();
        } catch (e) {
            console.error('[Dig] search failed', e);
            set({ searchResults: [] });
        } finally {
            set({ isSearching: false });
        }
    },

    runDig: async (releaseUrl) => {
        set({ isDigging: true, digError: null, digResult: null });
        try {
            const result = await API.digRun(releaseUrl, get().strategy);
            set({ digResult: result });
        } catch (e: any) {
            set({ digError: e?.message || 'Dig failed' });
        } finally {
            set({ isDigging: false });
        }
    },

    loadSessions: async () => {
        try {
            const sessions = await API.digGetSessions();
            set({ sessions });
            const { currentSessionId } = get();
            if (!currentSessionId && sessions.length > 0) {
                await get().selectSession(sessions[0].id);
            }
        } catch (e) {
            console.error('[Dig] loadSessions failed', e);
        }
    },

    createSession: async (name) => {
        try {
            const session = await API.digCreateSession(name);
            set((s) => ({ sessions: [session, ...s.sessions], currentSessionId: session.id, crate: [] }));
            return session;
        } catch (e) {
            console.error('[Dig] createSession failed', e);
            return null;
        }
    },

    deleteSession: async (id) => {
        try {
            await API.digDeleteSession(id);
            set((s) => {
                const sessions = s.sessions.filter((x) => x.id !== id);
                const isCurrent = s.currentSessionId === id;
                return {
                    sessions,
                    currentSessionId: isCurrent ? (sessions[0]?.id ?? null) : s.currentSessionId,
                    crate: isCurrent ? [] : s.crate,
                };
            });
            const next = get().currentSessionId;
            if (next) await get().selectSession(next);
        } catch (e) {
            console.error('[Dig] deleteSession failed', e);
        }
    },

    selectSession: async (id) => {
        set({ currentSessionId: id });
        try {
            const crate = await API.digGetCrate(id);
            set({ crate });
        } catch (e) {
            console.error('[Dig] selectSession failed', e);
            set({ crate: [] });
        }
    },

    addToCrate: async (item) => {
        let sessionId = get().currentSessionId;
        if (!sessionId) {
            const session = await get().createSession('My crate');
            if (!session) return;
            sessionId = session.id;
        }
        try {
            const saved = await API.digAddToCrate(sessionId, {
                source: 'bandcamp',
                sourceUrl: item.url,
                title: item.title,
                artist: item.artist,
                coverUrl: item.coverUrl,
                previewUrl: item.previewUrl ?? undefined,
            });
            set((s) => ({ crate: [saved, ...s.crate] }));
        } catch (e) {
            console.error('[Dig] addToCrate failed', e);
        }
    },

    removeFromCrate: async (itemId) => {
        const sessionId = get().currentSessionId;
        if (!sessionId) return;
        try {
            await API.digRemoveFromCrate(sessionId, itemId);
            set((s) => ({ crate: s.crate.filter((x) => x.id !== itemId) }));
        } catch (e) {
            console.error('[Dig] removeFromCrate failed', e);
        }
    },

    loadHistory: async () => {
        try {
            const history = await API.digGetHistory();
            set({ history });
        } catch (e) {
            console.error('[Dig] loadHistory failed', e);
        }
    },
}));
