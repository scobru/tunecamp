import { create } from "zustand";
import API from "../services/api";
import type { User } from "../types";
import { useWalletStore } from "./useWalletStore";
import { useNowPlayingStore } from "./useNowPlayingStore";
import { usePlayerStore } from "./usePlayerStore";
import { queryClient } from "../lib/queryClient";
import {
	generateKeyPair,
	encryptPairVault,
	decryptPairVault,
	isLegacyPairVault,
} from "@tunecamp/chat";

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

/**
 * Resolve the keypair chat encrypts with. It is the account's Zen identity —
 * the same key FID uses — not a chat-only pair, so the recipient of a DM can
 * check the key really belongs to the account instead of trusting whatever the
 * server hands them.
 *
 * The pair is random and sealed under the password ("vault"), never derived
 * from it: a derived pair would silently become a different identity the moment
 * the user changed their password.
 *
 * Returns null when this client cannot hold the key — the caller degrades to no
 * E2EE rather than minting a second identity for the same account.
 */
async function resolveChatIdentity(
	password: string,
	zenPub?: string | null,
	zenPriv?: string | null,
): Promise<ChatKeyPair | null> {
	// Existing identity, vault present: open it.
	if (zenPriv) {
		const pair = await decryptPairVault(zenPriv, password);
		if (!pair?.pub) return null; // sealed under a different password
		if (zenPub && pair.pub !== zenPub) return null; // vault/identity mismatch

		// Vaults sealed before the PBKDF2 envelope stretch the password with a
		// single SHA-256, so the copy the server holds is cheap to crack offline.
		// Login is the only moment we have the password — re-seal here or the weak
		// blob stays on the server forever. Same pub, so the upload is an update.
		if (isLegacyPairVault(zenPriv)) {
			try {
				await API.uploadZenKeys(
					pair.pub,
					await encryptPairVault(pair as ChatKeyPair, password),
				);
			} catch {
				/* keep the session; the next login retries the upgrade */
			}
		}
		return pair as ChatKeyPair;
	}

	// Identity exists but its private half lives elsewhere (bound from the FID
	// portal, vault never uploaded). Minting a pair here would fork the account
	// into two identities, and the upload would be refused anyway.
	if (zenPub) return null;

	// No identity yet: mint one and publish the sealed pair.
	const pair = (await generateKeyPair()) as ChatKeyPair;
	const vault = await encryptPairVault(pair, password);
	await API.uploadZenKeys(pair.pub, vault);
	return pair;
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
	/**
	 * Re-seal the Zen identity under a new password. Must be called after every
	 * successful password change: the vault is the only copy of the private key
	 * the server holds, and it is encrypted with the *old* password until this
	 * runs — leaving it stale locks the user out of their own identity, and with
	 * it out of every DM addressed to that key.
	 */
	resealChatIdentity: (newPassword: string) => Promise<void>;

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
					const chatKeyPair = await resolveChatIdentity(
						password,
						result.zenPub,
						result.zenPriv,
					);
					set({ chatKeyPair });
					if (chatKeyPair) saveChatKeyPair(username, chatKeyPair);
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

	resealChatIdentity: async (newPassword) => {
		const pair = get().chatKeyPair;
		if (!pair?.pub) return;
		const vault = await encryptPairVault(pair, newPassword);
		// Same zen_pub, new wrapping: /keys accepts this and rejects any attempt
		// to change the public key itself.
		await API.uploadZenKeys(pair.pub, vault);
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
				// Fresh account: no Zen identity yet, so this mints one and
				// publishes the sealed pair.
				const chatKeyPair = await resolveChatIdentity(password);
				set({ chatKeyPair });
				if (chatKeyPair) saveChatKeyPair(username, chatKeyPair);
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
