import axios from 'axios';
import type {
    AuthStatus, Track, Album, Artist, Playlist, SiteSettings, User,
    Release, Post, UnlockCode, NetworkSite, NetworkTrack, AdminStats
} from '../types';

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

    // --- Auth ---
    getAuthStatus: () => handleResponse(api.get<AuthStatus>('/auth/status')),
    login: (username: string, password?: string) =>
        handleResponse(api.post<{ token: string, user: User }>('/auth/login', { username, password })),
    register: (username: string, password: string) =>
        handleResponse(api.post<{ token: string, user: User }>('/auth/register', { username, password })),
    logout: () => {
        API.setToken(null);
    },

    // --- Catalog & Search ---
    getCatalog: () => handleResponse(api.get<any>('/catalog')),
    getSiteSettings: () => handleResponse(api.get<SiteSettings>('/catalog/settings')),
    search: (query: string) => handleResponse(api.get<any>(`/catalog/search?q=${encodeURIComponent(query)}`)),
    searchMetadata: (query: string) => handleResponse(api.get<any>(`/metadata/search?q=${encodeURIComponent(query)}`)),

    // --- Library (Browsing) ---
    getAlbums: () => handleResponse(api.get<Album[]>('/albums')),
    getAlbum: (id: string | number) => handleResponse(api.get<Album>(`/albums/${id}`)),
    getAlbumCoverUrl: (id: string | number) => `${API_URL}/albums/${id}/cover`,

    getArtists: () => handleResponse(api.get<Artist[]>('/artists')),
    getArtist: (idOrSlug: string | number) => handleResponse(api.get<Artist>(`/artists/${idOrSlug}`)),
    getArtistCoverUrl: (idOrSlug: string | number) => `${API_URL}/artists/${idOrSlug}/cover`,

    getTracks: () => handleResponse(api.get<Track[]>('/tracks')),
    getTrack: (id: string | number) => handleResponse(api.get<Track>(`/tracks/${id}`)),

    getPlaylists: () => handleResponse(api.get<Playlist[]>('/playlists')),
    getPlaylist: (id: string) => handleResponse(api.get<Playlist>(`/playlists/${id}`)),
    createPlaylist: (name: string, description?: string) =>
        handleResponse(api.post<Playlist>('/playlists', { name, description })),
    updatePlaylist: (id: string, data: Partial<Playlist>) => handleResponse(api.put<Playlist>(`/playlists/${id}`, data)),
    deletePlaylist: (id: string) => handleResponse(api.delete(`/playlists/${id}`)),
    addTrackToPlaylist: (playlistId: string, trackId: string) =>
        handleResponse(api.post(`/playlists/${playlistId}/tracks`, { trackId })),
    removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
        handleResponse(api.delete(`/playlists/${playlistId}/tracks/${trackId}`)),

    // --- Streaming & Interactions ---
    getStreamUrl: (id: string, format?: string) => {
        let url = `${API_URL}/tracks/${id}/stream`;
        if (format) url += `?format=${format}`;
        return url;
    },
    getLyrics: (trackId: string) => handleResponse(api.get<{ lyrics: string | { text: string }[] }>(`/tracks/${trackId}/lyrics`)),
    recordPlay: (trackId: string) => handleResponse(api.post(`/stats/library/play/${trackId}`)),

    // --- Stats ---
    getRecentPlays: (limit = 50) => handleResponse(api.get<any[]>(`/stats/library/recent?limit=${limit}`)),
    getTopTracks: (limit = 20, days = 30) => handleResponse(api.get<any[]>(`/stats/library/top-tracks?limit=${limit}&days=${days}`)),
    getTopArtists: (limit = 10, days = 30) => handleResponse(api.get<any[]>(`/stats/library/top-artists?limit=${limit}&days=${days}`)),
    getListeningStats: () => handleResponse(api.get<any>('/stats/library/overview')),

    // --- Community / ActivityPub ---
    getArtistPosts: (idOrSlug: string) => handleResponse(api.get<Post[]>(`/artists/${idOrSlug}/posts`)),
    getPostBySlug: (slug: string) => handleResponse(api.get<Post>(`/posts/${slug}`)),
    createPost: (artistId: string, content: string) => handleResponse(api.post<Post>('/admin/posts', { artistId, content })),
    deletePost: (id: string) => handleResponse(api.delete(`/admin/posts/${id}`)),

    // --- Network ---
    getNetworkSites: () => handleResponse(api.get<NetworkSite[]>('/stats/network/sites')),
    getNetworkTracks: () => handleResponse(api.get<NetworkTrack[]>('/stats/network/tracks')),

    // --- Admin: Releases & Content ---
    getAdminReleases: () => handleResponse(api.get<Release[]>('/admin/releases')),
    createRelease: (data: Partial<Release>) => handleResponse(api.post<Release>('/admin/releases', data)),
    updateRelease: (id: string, data: Partial<Release>) => handleResponse(api.put<Release>(`/admin/releases/${id}`, data)),
    deleteRelease: (id: string, keepFiles = false) =>
        handleResponse(api.delete(`/admin/releases/${id}${keepFiles ? '?keepFiles=true' : ''}`)),

    toggleReleaseVisibility: (id: string, isPublic: boolean) =>
        handleResponse(api.put(`/admin/releases/${id}/visibility`, { isPublic })),

    addTrackToRelease: (releaseId: string, trackId: string) =>
        handleResponse(api.post(`/admin/releases/${releaseId}/tracks/add`, { trackId })),

    // --- Admin: Artists ---
    createArtist: (data: Partial<Artist>) => handleResponse(api.post<Artist>('/artists', data)),
    updateArtist: (id: string, data: Partial<Artist>) => handleResponse(api.put<Artist>(`/artists/${id}`, data)),
    deleteArtist: (id: string) => handleResponse(api.delete(`/artists/${id}`)),

    // --- Admin: Tracks ---
    updateTrack: (id: string, data: Partial<Track>) => handleResponse(api.put<Track>(`/tracks/${id}`, data)),
    deleteTrack: (id: string, deleteFile = false) =>
        handleResponse(api.delete(`/tracks/${id}${deleteFile ? '?deleteFile=true' : ''}`)),

    // --- Admin: Uploads ---
    uploadTracks: (files: File[], options: { releaseSlug?: string } = {}) => {
        const formData = new FormData();
        if (options.releaseSlug) {
            formData.append('releaseSlug', options.releaseSlug);
            formData.append('type', 'release');
        }
        files.forEach(file => formData.append('files', file));
        return handleResponse(api.post('/admin/upload/tracks', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }));
    },
    uploadCover: (file: File, releaseSlug?: string) => {
        const formData = new FormData();
        if (releaseSlug) {
            formData.append('releaseSlug', releaseSlug);
            formData.append('type', 'release');
        }
        formData.append('file', file);
        return handleResponse(api.post('/admin/upload/cover', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }));
    },
    uploadArtistAvatar: (artistId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('artistId', artistId);
        return handleResponse(api.post('/admin/upload/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }));
    },
    uploadBackgroundImage: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post('/admin/upload/background', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }));
    },

    // --- Admin: System ---
    rescan: () => handleResponse(api.post('/admin/scan')),
    consolidate: () => handleResponse(api.post('/admin/consolidate')),
    getAdminStats: () => handleResponse(api.get<AdminStats>('/admin/stats')),
    getBrowser: (path = '') => handleResponse(api.get<any>(`/browser?path=${encodeURIComponent(path)}`)),

    // --- Admin: Users ---
    getUsers: () => handleResponse(api.get<User[]>('/admin/system/users')),
    getCurrentUser: () => handleResponse(api.get<User>('/admin/system/me')),
    createUser: (data: Partial<User> & { password: string }) => handleResponse(api.post<User>('/admin/system/users', data)),
    updateUser: (id: string, data: Partial<User>) => handleResponse(api.put<User>(`/admin/system/users/${id}`, data)),
    deleteUser: (id: string) => handleResponse(api.delete(`/admin/system/users/${id}`)),
    resetUserPassword: (id: string, password: string) => handleResponse(api.put(`/admin/system/users/${id}/password`, { password })),

    // --- Unlock Codes ---
    validateUnlockCode: (code: string) => handleResponse(api.post('/unlock/validate', { code })),
    redeemUnlockCode: (code: string) => handleResponse(api.post('/unlock/redeem', { code })),
    createUnlockCodes: (releaseId: string, count: number) => handleResponse(api.post<UnlockCode[]>('/unlock/admin/create', { releaseId, count })),
    getUnlockCodes: (releaseId?: string) => {
        const query = releaseId ? `?releaseId=${releaseId}` : '';
        return handleResponse(api.get<UnlockCode[]>(`/unlock/admin/list${query}`));
    },

    // --- Admin: Settings ---
    updateSettings: (data: Partial<SiteSettings>) => handleResponse(api.put<SiteSettings>('/admin/settings', data)),
};

export default API;
