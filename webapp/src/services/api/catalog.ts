import { api, handleResponse, API_URL } from './client';
import type {
    SiteSettings, LegalPages, Album, Release, Artist, Track, Playlist
} from '../../types';
import API from './index';



export const catalogApi = {
    // --- Catalog & Search ---
    getCatalog: () => handleResponse(api.get<any>('catalog')),
    getSiteSettings: () => handleResponse(api.get<SiteSettings>('catalog/settings')),
    getLegalPages: () => handleResponse(api.get<LegalPages>('catalog/legal')),
    getChangelog: () => handleResponse(api.get<{ changelog: string }>('changelog')),
    getGenres: () => handleResponse(api.get<string[]>('catalog/genres')),
    search: (query: string) => handleResponse(api.get<any>(`catalog/search?q=${encodeURIComponent(query)}`)),
    globalSearch: (query: string) => handleResponse(api.get<any>(`search/global?q=${encodeURIComponent(query)}`)),
    searchMetadata: (query: string) => handleResponse(api.get<any>(`metadata/search?q=${encodeURIComponent(query)}`)),
    searchArtistMetadata: (query: string) => handleResponse(api.get<any[]>(`metadata/artist-search?q=${encodeURIComponent(query)}`)),
    getRandomTracks: (limit = 1) => handleResponse(api.get<any[]>(`catalog/random?limit=${limit}`)),

    // --- Library (Browsing) ---
    getAlbums: () => handleResponse(api.get<Album[]>('albums')),
    getAlbum: (idOrSlug: string | number) => handleResponse(api.get<Album>(`albums/${idOrSlug}`)),
    getAlbumCoverUrl: (id: string | number, timestamp?: number) => id ? `${API_URL}/albums/${id}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',

    getReleases: () => handleResponse(api.get<Release[]>('releases')),
    getRelease: (idOrSlug: string | number) => handleResponse(api.get<Release>(`releases/${idOrSlug}`)),
    getReleaseCoverUrl: (id: string | number, timestamp?: number) => id ? `${API_URL}/releases/${id}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',
    getTrackCoverUrl: (id: string | number, timestamp?: number) => id ? `${API_URL}/tracks/${id}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',
    getAdditionalArtworkUrl: (idOrSlug: string | number, filename: string) => {
        if (!idOrSlug || !filename) return '';
        const cleanFilename = filename.replace(/^artwork\//, '');
        return `${API_URL}/releases/${idOrSlug}/artwork/${cleanFilename}`;
    },

    getArtists: () => handleResponse(api.get<Artist[]>('artists')),
    getArtist: (idOrSlug: string | number) => handleResponse(api.get<Artist>(`artists/${idOrSlug}`)),
    getArtistCoverUrl: (idOrSlug: string | number, timestamp?: number) => idOrSlug ? `${API_URL}/artists/${idOrSlug}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',
    getArtistBannerUrl: (idOrSlug: string | number, timestamp?: number) => idOrSlug ? `${API_URL}/artists/${idOrSlug}/banner${timestamp ? `?v=${timestamp}` : ''}` : '',

    // --- Lifecycle ---
    requestPromotion: (id: number) => handleResponse(api.post(`lifecycle/promote/${id}`)),
    approvePromotion: (id: number) => handleResponse(api.post(`lifecycle/approve/${id}`)),
    finalizeRelease: (id: number) => handleResponse(api.post(`lifecycle/finalize/${id}`)),
    rejectPromotion: (id: number, reason: string) => handleResponse(api.post(`lifecycle/reject/${id}`, { reason })),

    getTracks: (options: { mine?: boolean } = {}) => handleResponse(api.get<Track[]>(`tracks${options.mine ? '?mine=true' : ''}`)),
    getTrack: (id: string | number) => handleResponse(api.get<Track>(`tracks/${encodeURIComponent(String(id))}`)),

    getPlaylists: () => handleResponse(api.get<Playlist[]>('playlists')),
    getPlaylist: (id: string) => handleResponse(api.get<Playlist>(`playlists/${encodeURIComponent(id)}`)),
    createPlaylist: (name: string, description?: string, isPublic = false) =>
        handleResponse(api.post<Playlist>('playlists', { name, description, isPublic })),
    updatePlaylist: (id: string, data: Partial<Playlist>) => handleResponse(api.put<Playlist>(`playlists/${id}`, data)),
    uploadPlaylistCover: (id: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post<{ coverPath: string }>(`playlists/${id}/cover`, formData));
    },
    deletePlaylist: (id: string) => handleResponse(api.delete(`playlists/${id}`)),
    addTrackToPlaylist: (playlistId: string, trackId: string, metadata?: any) =>
        handleResponse(api.post(`playlists/${playlistId}/tracks`, { trackId, metadata })),
    removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
        handleResponse(api.delete(`playlists/${playlistId}/tracks/${encodeURIComponent(trackId)}`)),

    // --- Streaming & Interactions ---
    getStreamUrl: (idOrUrl: string | number, format?: string) => {
        const idStr = String(idOrUrl);
        let url: string;
        
        if (typeof idOrUrl === 'number' || /^\d+$/.test(idStr) || idStr.startsWith('ext:')) {
            url = `${API_URL}/tracks/${idStr}/stream`;
        } else {
            url = idStr;
        }

        // If it's an absolute URL, check if it's our own origin
        let isLocal = true;
        let urlObj: URL;
        try {
            if (String(url).includes('://')) {
                urlObj = new URL(String(url));
                isLocal = urlObj.origin === window.location.origin;
            } else {
                urlObj = new URL(String(url), window.location.origin);
            }
        } catch {
            isLocal = false;
            return String(url);
        }

        const params = new URLSearchParams(urlObj.search);
        if (format) params.set('format', format);

        // Add token for private library streaming if it's a local request
        const token = API.getToken();
        if (token && isLocal) {
            params.set('token', token);
        }

        const queryString = params.toString();
        const base = String(url).split('?')[0];
        return queryString ? `${base}?${queryString}` : base;
    },
    getTrackDownloadUrl: (id: string | number) => {
        const url = `${API_URL}/tracks/${id}/download`;
        const token = API.getToken();
        return token ? `${url}?token=${token}` : url;
    },
    getLyrics: (trackId: string) => handleResponse(api.get<{ lyrics: string | { text: string }[] }>(`tracks/${trackId}/lyrics`)),
    recordPlay: (trackId: string | number) => {
        // Only record play for database tracks (numeric IDs)
        // prevents 404 for raw files in browser section or external Zen tracks (UUIDs)
        if (typeof trackId === 'string' && !/^\d+$/.test(trackId)) {
            return Promise.resolve({ success: false, ignored: true });
        }
        return handleResponse(api.post(`stats/library/play/${trackId}`));
    },

    // --- Star/Rating ---
    starTrack: (id: string | number, metadata?: any) => handleResponse(api.post<{ success: boolean, starred: boolean, trackId?: number }>(`tracks/${encodeURIComponent(String(id))}/star`, metadata)),
    unstarTrack: (id: string | number) => handleResponse(api.delete<{ success: boolean, starred: boolean }>(`tracks/${encodeURIComponent(String(id))}/star`)),
    rateTrack: (id: string | number, rating: number) => handleResponse(api.post<{ success: boolean, rating: number }>(`tracks/${encodeURIComponent(String(id))}/rating`, { rating })),
    localizeTrack: (id: string | number) => handleResponse(api.post<{ success: boolean, track: Track }>(`tracks/${encodeURIComponent(String(id))}/localize`)),
    getStarredTracks: () => handleResponse(api.get<string[]>('tracks/starred')),
    getStarredAlbums: () => handleResponse(api.get<string[]>('albums/starred')),

    starAlbum: (id: string | number, metadata?: any) => handleResponse(api.post<{ success: boolean, starred: boolean }>(`albums/${id}/star`, metadata)),
    unstarAlbum: (id: string | number) => handleResponse(api.delete<{ success: boolean, starred: boolean }>(`albums/${id}/star`)),
    rateAlbum: (id: string | number, rating: number) => handleResponse(api.post<{ success: boolean, rating: number }>(`albums/${id}/rating`, { rating })),
    getStarredArtists: () => handleResponse(api.get<string[]>('artists/starred')),

    starArtist: (id: string | number, metadata?: any) => handleResponse(api.post<{ success: boolean, starred: boolean }>(`artists/${id}/star`, metadata)),
    unstarArtist: (id: string | number) => handleResponse(api.delete<{ success: boolean, starred: boolean }>(`artists/${id}/star`)),
    rateArtist: (id: string | number, rating: number) => handleResponse(api.post<{ success: boolean, rating: number }>(`artists/${id}/rating`, { rating })),

    // --- Stats ---
    getRecentPlays: (limit = 50) => handleResponse(api.get<any[]>(`stats/library/recent?limit=${limit}`)),
    getTopTracks: (limit = 20, days = 30, filter: 'all' | 'library' | 'releases' = 'all') => handleResponse(api.get<any[]>(`stats/library/top-tracks?limit=${limit}&days=${days}&filter=${filter}`)),
    getTopArtists: (limit = 10, days = 30, filter: 'all' | 'library' | 'releases' = 'all') => handleResponse(api.get<any[]>(`stats/library/top-artists?limit=${limit}&days=${days}&filter=${filter}`)),

    // --- Comments ---
    getComments: (trackId: string) => handleResponse(api.get<any[]>(`comments/track/${trackId}`)),
    postComment: (trackId: string, data: { text: string }) => handleResponse(api.post('comments/track/' + trackId, data)),
    deleteComment: (commentId: string | number) => handleResponse(api.delete(`comments/${commentId}`)),
    patchProfile: (data: { alias?: string; avatar?: string; email?: string | null }) => handleResponse(api.patch('auth/profile', data)),
    startLibraryAudit: (options: { forceRepair?: boolean, useAI?: boolean }) => handleResponse(api.post('metadata/maintenance/audit-all', options)),
    getAuditStatus: () => handleResponse(api.get('metadata/maintenance/audit-status')),
    stopLibraryAudit: () => handleResponse(api.post('metadata/maintenance/audit-stop')),
};
