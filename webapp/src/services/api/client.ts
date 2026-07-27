import axios from 'axios';

const API_URL = '/api';

export const api = axios.create({
    baseURL: API_URL,
});

// Interceptor to add token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('tunecamp_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

/** Error subclass that preserves the HTTP response status code. */
export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

// Helper to handle response
export const handleResponse = async <T>(request: Promise<{ data: T }>): Promise<T> => {
    try {
        const response = await request;
        return response.data;
    } catch (error: any) {
        const status: number = error.response?.status ?? 0;
        if (status === 401) {
            // Only invalidate the session if the 401 came from a request that used the
            // CURRENT token. A stale request started before login/logout (e.g. fired
            // anonymously at page load) can resolve after a fresh token is stored; it
            // must not wipe a session it has nothing to do with.
            const currentToken = localStorage.getItem('tunecamp_token');
            const requestAuthHeader: string | undefined = error.config?.headers?.Authorization;
            const requestToken = requestAuthHeader?.replace(/^Bearer\s+/i, '');
            const usedCurrentToken = !!currentToken && requestToken === currentToken;

            if (usedCurrentToken) {
                localStorage.removeItem('tunecamp_token');
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        }
        const errorData = error.response?.data;
        const errorMessage = errorData?.error || errorData?.message || (typeof errorData === 'string' ? errorData : null) || error.message;
        throw new ApiError(errorMessage, status);
    }
};

export let downloadTokenCache: { token: string, expiresAt: number } | null = null;
export function setDownloadTokenCache(val: { token: string, expiresAt: number } | null) {
    downloadTokenCache = val;
}
export { API_URL };
