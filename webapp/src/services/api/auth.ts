import { api, handleResponse } from './client';
import type { AuthStatus, User } from '../../types';
import API from './index';



export const authApi = {
    getToken: () => localStorage.getItem('tunecamp_token'),
    setToken: (token: string | null) => {
        if (token) localStorage.setItem('tunecamp_token', token);
        else localStorage.removeItem('tunecamp_token');
    },

    // --- Auth ---
    getAuthStatus: () => handleResponse(api.get<AuthStatus>('auth/status')),
    login: (username: string, password?: string, pubKey?: string, proof?: string) =>
        handleResponse(api.post<{ token: string, user?: User, username?: string, isRootAdmin?: boolean, artistId?: string, userId?: number, role?: string, mustChangePassword?: boolean, pair?: any, isActive?: boolean }>('auth/login', { username, password, pubKey, proof })),
    registerUser: (username: string, password: string, pubKey?: string, signature?: string) =>
        handleResponse(api.post<{ success: boolean, token: string, username: string, artistId: number, role: string, storageQuota: number, isActive?: boolean }>('users/register', { username, password, pubKey, signature })),
    /** First-time admin setup when no admin exists yet */
    setup: (username: string, password: string) =>
        handleResponse(api.post<{ token: string, user: User }>('auth/setup', { username, password })),
    changePassword: (currentPassword: string, newPassword: string) =>
        handleResponse(api.post('auth/password', { currentPassword, newPassword })),
    forgotPassword: (email: string) =>
        handleResponse(api.post<{ message: string }>('auth/forgot-password', { email })),
    resetPassword: (token: string, newPassword: string) =>
        handleResponse(api.post<{ message: string }>('auth/reset-password', { token, newPassword })),
    getSecurityQuestions: (username: string) =>
        handleResponse(api.get<{ q1: string, q2: string }>(`auth/security-questions?username=${encodeURIComponent(username)}`)),
    setSecurityQuestions: (q1: string, a1: string, q2: string, a2: string) =>
        handleResponse(api.post('auth/security-questions', { q1, a1, q2, a2 })),
    resetPasswordSecurity: (username: string, a1: string, a2: string, newPassword: string) =>
        handleResponse(api.post<{ message: string }>('auth/reset-password-security', { username, a1, a2, newPassword })),
    logout: () => {
        API.setToken(null);
    },

    // --- Zen Identity Linking ---
    getZenChallenge: () => handleResponse(api.get<{ success: boolean; challenge: any }>('auth/zen/challenge')),
    linkZenAccount: (zenPubKey: string, challenge: any, seaSignature: string) =>
        handleResponse(api.post<{ success: boolean; passport: any }>('auth/zen/link', { zenPubKey, challenge, seaSignature })),
    /** First-time bind of a Zen SEA identity to the logged-in (JWT) account. */
    setZenAccount: (zenPubKey: string, challenge: any, seaSignature: string) =>
        handleResponse(api.post<{ success: boolean; zenPub: string }>('auth/zen/set', { zenPubKey, challenge, seaSignature })),

    // --- FID Registry (cross-instance artist links) ---
    getFidRegistry: () => handleResponse(api.get<{ success: boolean; entries: any[] }>('fid-registry')),
    addFidRegistryEntry: (entry: { instanceDomain: string; artistId?: string | number; artistName?: string; artistSlug?: string; publicKey?: string; passportSignature?: string }) =>
        handleResponse(api.post<{ success: boolean; entry: any }>('fid-registry', entry)),
    deleteFidRegistryEntry: (id: number) => handleResponse(api.delete(`fid-registry/${id}`)),

    loginWithSso: (ssoToken: any, apSeed: string) =>
        handleResponse(api.post<{ success: boolean; token: string; isNewUser: boolean; username: string }>('auth/zen/sso', { ssoToken, apSeed })),

    /** Trades the one-time code left by the portal in the callback URL for the session JWT. */
    exchangeSsoCode: (code: string) =>
        handleResponse(api.post<{ success: boolean; token: string; isNewUser: boolean; username: string }>('auth/zen/sso/exchange', { code })),

    // --- API Tokens ---
    getApiTokens: () => handleResponse(api.get<any[]>('users/me/api-tokens')),
    createApiToken: (name: string) => handleResponse(api.post<{ token: string }>('users/me/api-tokens', { name })),
    deleteApiToken: (id: number) => handleResponse(api.delete(`users/me/api-tokens/${id}`)),
};
