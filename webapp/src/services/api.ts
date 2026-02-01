import axios from 'axios';
import type { AuthStatus, Track, Album, Artist, Playlist, SiteSettings, User } from '../types';

const API_URL = '/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('tunecamp_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Helper to handle response
const handleResponse = async <T>(request: Promise<{ data: T }>): Promise<T> => {
    try {
        const response = await request;
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || error.response?.data || error.message);
    }
};

export const API = {
    getToken: () => localStorage.getItem('tunecamp_token'),
    setToken: (token: string | null) => {
        if (token) localStorage.setItem('tunecamp_token', token);
        else localStorage.removeItem('tunecamp_token');
    },

    // Auth
    getAuthStatus: () => handleResponse(api.get<AuthStatus>('/auth/status')),
    login: (username: string, password?: string) =>
        handleResponse(api.post<{ token: string, user: User }>('/auth/login', { username, password })),
    register: (username: string, password: string) => // Registration might not be in older api? check API.js
        handleResponse(api.post<{ token: string, user: User }>('/auth/register', { username, password })), // Assuming register endpoint exists
    logout: () => {
        API.setToken(null);
    },

    // Catalog
    getCatalog: () => handleResponse(api.get<any>('/catalog')),
    getSiteSettings: () => handleResponse(api.get<SiteSettings>('/catalog/settings')),

    // Library
    getAlbums: () => handleResponse(api.get<Album[]>('/albums')),
    getAlbum: (id: string | number) => handleResponse(api.get<Album>(`/albums/${id}`)),

    getArtists: () => handleResponse(api.get<Artist[]>('/artists')),
    getArtist: (id: string | number) => handleResponse(api.get<Artist>(`/artists/${id}`)),

    getTracks: () => handleResponse(api.get<Track[]>('/tracks')),
    getTrack: (id: string | number) => handleResponse(api.get<Track>(`/tracks/${id}`)),

    getPlaylists: () => handleResponse(api.get<Playlist[]>('/playlists')),
    getPlaylist: (id: string) => handleResponse(api.get<Playlist>(`/playlists/${id}`)),
    createPlaylist: (name: string, description?: string) =>
        handleResponse(api.post<Playlist>('/playlists', { name, description })),
    addTrackToPlaylist: (playlistId: string, trackId: string) =>
        handleResponse(api.post(`/playlists/${playlistId}/tracks`, { trackId })),

    // Stream
    getStreamUrl: (id: string) => `${API_URL}/tracks/${id}/stream`,
    getCoverUrl: (id: string | number, type: 'album' | 'artist' = 'album') =>
        `${API_URL}/${type}s/${id}/cover`,

    // Stats
    getRecentPlays: (limit = 50) => handleResponse(api.get<any[]>(`/stats/library/recent?limit=${limit}`)),
    recordPlay: (trackId: string) => handleResponse(api.post(`/stats/library/play/${trackId}`)),

    // Admin
    rescan: () => handleResponse(api.post('/admin/scan')),
    consolidate: () => handleResponse(api.post('/admin/consolidate')),
};

export default API;
