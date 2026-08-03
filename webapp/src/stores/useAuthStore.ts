import { create } from "zustand";
import API from "../services/api";
import type { User } from "../types";
import { useWalletStore } from "./useWalletStore";
import { useNowPlayingStore } from "./useNowPlayingStore";
import { usePlayerStore } from "./usePlayerStore";
import { queryClient } from "../lib/queryClient";
import { deriveKeyPairFromPassword } from "@tunecamp/chat";

type UserRole = "admin" | "user" | "super_user" | "root_admin" | null;

type ChatKeyPair = { pub: string; priv: string };

const CHAT_KEY_STORAGE_PREFIX = "tunecamp_chatkey_";

// Chat E2E identity survives page reload via localStorage — same trust model
// as the JWT already stored there. Password isn't kept, so it can't be re-derived
// after a refresh; without this the chat client falls back to a fresh random
// keypair every reload and peers can't decrypt messages sent to the old one.
function loadChatKeyPair(username: string): ChatKeyPair | null {
	try {
		const raw = localStorage.getItem(CHAT_KEY_STORAGE_PREFIX + username);
		return raw ? (JSON.parse(raw) as ChatKeyPair) : null;
	} catch {
		return null;
	}
}

function saveChatKeyPair(username: string, pair: ChatKeyPair): void {
	try {
		localStorage.setItem(CHAT_KEY_STORAGE_PREFIX + username, JSON.stringify(pair));
	} catch {
		/* private browsing / quota exceeded — chat falls back to ephemeral keys */
	}
}

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	isFirstRun: boolean;
	mustChangePassword?: boolean;
	brevoConfigured?: boolean;
	role: UserRole;
	error: string | null;
	isAuthenticating: boolean;
	chatKeyPair: {
		pub: string;
		priv: string;
	} | null;

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
	brevoConfigured: false,
	role: null,
	error: null,
	isAuthenticating: false,
	chatKeyPair: null,

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
			const isAdmin =
				status.authenticated &&
				(status.role === "admin" ||
					status.role === "super_user" ||
					status.role === "root_admin");

			const transformedUser =
				status.user ||
				(status.username
					? ({
							username: status.username,
							isAdmin:
								status.role === "admin" ||
								status.role === "super_user" ||
								status.role === "root_admin",
							isRootAdmin: !!status.isRootAdmin,
							id: String(status.artistId ?? "0"),
							artistId:
								status.artistId != null ? String(status.artistId) : undefined,
							userId: status.userId != null ? Number(status.userId) : undefined,
							isActive: status.isActive,
							alias: (status as any).alias ?? null,
							avatar: (status as any).avatar ?? null,
							email: (status as any).email ?? null,
							zenAuthMode: (status as any).zenAuthMode ?? null,
						} as User)
					: null);

			set({
				isAuthenticated: status.authenticated,
				isAdminAuthenticated: isAdmin,
				user: transformedUser,
				adminUser: transformedUser,
				isFirstRun: !!status.firstRun,
				mustChangePassword: !!status.mustChangePassword,
				brevoConfigured: !!status.brevoConfigured,
				role: (status.role as any) || null,
				isLoading: false,
				isAdminLoading: false,
				isInitializing: false,
			});

			if (status.authenticated && status.username && !get().chatKeyPair) {
				const cached = loadChatKeyPair(status.username);
				if (cached) set({ chatKeyPair: cached });
			}
		} catch (e: any) {
			console.error("Auth check failed:", e);

			const isNetworkError =
				e.status === 0 || e.message?.includes("Network Error");
			const hasToken = !!localStorage.getItem("tunecamp_token");

			if (isNetworkError && hasToken) {
				console.warn(
					"Network error during auth check, preserving existing (potential) session",
				);
				set({
					isLoading: false,
					isAdminLoading: false,
					isInitializing: false,
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
					role: null,
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

			if (password) {
				try {
					const chatKeyPair = await deriveKeyPairFromPassword(
						username,
						password,
					);
					set({ chatKeyPair });
					saveChatKeyPair(username, chatKeyPair);
				} catch {
					set({ chatKeyPair: null });
				}
			} else {
				const cached = loadChatKeyPair(username);
				if (cached) set({ chatKeyPair: cached });
			}
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
		throw new Error(
			"Pair login is no longer supported. Please log in with username and password.",
		);
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

			try {
				const chatKeyPair = await deriveKeyPairFromPassword(username, password);
				set({ chatKeyPair });
				saveChatKeyPair(username, chatKeyPair);
			} catch {
				set({ chatKeyPair: null });
			}

			set({ isLoading: false, isAuthenticating: false });
		} catch (e: any) {
			set({ error: e.message, isLoading: false, isAuthenticating: false });
			throw e;
		} finally {
			set({ isAuthenticating: false });
		}
	},

	logout: () => {
		const username = get().user?.username;
		if (username) {
			try {
				localStorage.removeItem(CHAT_KEY_STORAGE_PREFIX + username);
			} catch {
				/* ignore */
			}
		}
		useWalletStore.getState().clearWallet();
		useNowPlayingStore.getState().reset();
		API.setToken(null);
		// Wipe cached per-user lists so a logged-out browser doesn't keep them.
		queryClient.clear();
		// recentlyPlayed is persisted to localStorage and can hold private-library
		// tracks; don't carry them into the next (possibly anonymous) session.
		usePlayerStore.setState({ recentlyPlayed: [] });
		set({
			user: null,
			isAuthenticated: false,
			adminUser: null,
			isAdminAuthenticated: false,
			isAdminLoading: false,
			isInitializing: false,
			role: null,
			chatKeyPair: null,
		});
	},
}));
