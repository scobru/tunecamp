import { api, handleResponse } from "./client";
import type { AuthStatus, User } from "../../types";
import API from "./index";

export const authApi = {
	getToken: () => localStorage.getItem("tunecamp_token"),
	setToken: (token: string | null) => {
		if (token) localStorage.setItem("tunecamp_token", token);
		else localStorage.removeItem("tunecamp_token");
	},

	// --- Auth ---
	getAuthStatus: () => handleResponse(api.get<AuthStatus>("auth/status")),
	login: (
		username: string,
		password?: string,
		pubKey?: string,
		proof?: string,
	) =>
		handleResponse(
			api.post<{
				token: string;
				user?: User;
				username?: string;
				isRootAdmin?: boolean;
				artistId?: string;
				userId?: number;
				role?: string;
				mustChangePassword?: boolean;
				pair?: any;
				isActive?: boolean;
				/** Zen identity public key, null for accounts that have none yet. */
				zenPub?: string | null;
				/** The pair sealed under the user's password. Opaque to the server. */
				zenPriv?: string | null;
				zenAuthMode?: string;
			}>("auth/login", { username, password, pubKey, proof }),
		),

	/**
	 * Publish the account's Zen identity: `encryptedZenPriv` must already be
	 * sealed with the user's password client-side — the server stores it as an
	 * opaque blob and can never open it. Rejected with 409 if it would change an
	 * existing `zen_pub` (that needs proof of key possession via `auth/zen/set`).
	 */
	uploadZenKeys: (zenPubKey: string, encryptedZenPriv: string) =>
		handleResponse(
			api.post<{ success: boolean; zenPub: string }>("auth/zen/keys", {
				zenPubKey,
				encryptedZenPriv,
			}),
		),
	registerUser: (
		username: string,
		password: string,
		pubKey?: string,
		signature?: string,
	) =>
		handleResponse(
			api.post<{
				success: boolean;
				token: string;
				username: string;
				artistId: number;
				role: string;
				storageQuota: number;
				isActive?: boolean;
			}>("users/register", { username, password, pubKey, signature }),
		),
	/** First-time admin setup when no admin exists yet */
	setup: (username: string, password: string) =>
		handleResponse(
			api.post<{ token: string; user: User }>("auth/setup", {
				username,
				password,
			}),
		),
	changePassword: (currentPassword: string, newPassword: string) =>
		handleResponse(api.post("auth/password", { currentPassword, newPassword })),
	forgotPassword: (email: string) =>
		handleResponse(
			api.post<{ message: string }>("auth/forgot-password", { email }),
		),
	resetPassword: (token: string, newPassword: string) =>
		handleResponse(
			api.post<{ message: string }>("auth/reset-password", {
				token,
				newPassword,
			}),
		),
	getSecurityQuestions: (username: string) =>
		handleResponse(
			api.get<{ q1: string; q2: string }>(
				`auth/security-questions?username=${encodeURIComponent(username)}`,
			),
		),
	setSecurityQuestions: (q1: string, a1: string, q2: string, a2: string) =>
		handleResponse(api.post("auth/security-questions", { q1, a1, q2, a2 })),
	resetPasswordSecurity: (
		username: string,
		a1: string,
		a2: string,
		newPassword: string,
	) =>
		handleResponse(
			api.post<{ message: string }>("auth/reset-password-security", {
				username,
				a1,
				a2,
				newPassword,
			}),
		),
	logout: () => {
		API.setToken(null);
	},

	// --- Zen Identity Linking ---
	loginWithSso: (ssoToken: any, apSeed: string) =>
		handleResponse(
			api.post<{
				success: boolean;
				token: string;
				isNewUser: boolean;
				username: string;
			}>("auth/zen/sso", { ssoToken, apSeed }),
		),

	/** Trades the one-time code left by the portal in the callback URL for the session JWT. */
	exchangeSsoCode: (code: string) =>
		handleResponse(
			api.post<{
				success: boolean;
				token: string;
				isNewUser: boolean;
				username: string;
			}>("auth/zen/sso/exchange", { code }),
		),

	// --- API Tokens ---
	getApiTokens: () => handleResponse(api.get<any[]>("users/me/api-tokens")),
	createApiToken: (name: string) =>
		handleResponse(
			api.post<{ token: string }>("users/me/api-tokens", { name }),
		),
	deleteApiToken: (id: number) =>
		handleResponse(api.delete(`users/me/api-tokens/${id}`)),
};
