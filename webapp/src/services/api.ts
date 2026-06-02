import axios from 'axios';
import type {
    AuthStatus, Track, Album, Artist, Playlist, SiteSettings, User,
    Release, Post, UnlockCode, NetworkSite, NetworkTrack, AdminStats, NetworkStatus,
    StorageAccount, GoogleDriveFile
} from '../types';

const API_URL = '/api';

const api = axios.create({
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
const handleResponse = async <T>(request: Promise<{ data: T }>): Promise<T> => {
    try {
        const response = await request;
        return response.data;
    } catch (error: any) {
        const status: number = error.response?.status ?? 0;
        if (status === 401) {
            // Only log out if it's a genuine "No token" or "Invalid token" error
            // to avoid disconnecting users when a specific resource returns 401 incorrectly
            const isAuthEndpoint = error.config?.url?.includes('/auth/');
            const hasToken = !!localStorage.getItem('tunecamp_token');
            
            if (isAuthEndpoint || hasToken) {
                localStorage.removeItem('tunecamp_token');
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        }
        const errorData = error.response?.data;
        const errorMessage = errorData?.error || errorData?.message || (typeof errorData === 'string' ? errorData : null) || error.message;
        throw new ApiError(errorMessage, status);
    }
};

const API = {
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
    logout: () => {
        API.setToken(null);
    },

    // --- Catalog & Search ---
    getCatalog: () => handleResponse(api.get<any>('catalog')),
    getSiteSettings: () => handleResponse(api.get<SiteSettings>('catalog/settings')),
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

    getArtists: () => handleResponse(api.get<Artist[]>('artists')),
    getArtist: (idOrSlug: string | number) => handleResponse(api.get<Artist>(`artists/${idOrSlug}`)),
    getArtistCoverUrl: (idOrSlug: string | number, timestamp?: number) => idOrSlug ? `${API_URL}/artists/${idOrSlug}/cover${timestamp ? `?v=${timestamp}` : ''}` : '',

    // --- Lifecycle ---
    requestPromotion: (id: number) => handleResponse(api.post(`lifecycle/promote/${id}`)),
    approvePromotion: (id: number) => handleResponse(api.post(`lifecycle/approve/${id}`)),
    finalizeRelease: (id: number) => handleResponse(api.post(`lifecycle/finalize/${id}`)),
    rejectPromotion: (id: number, reason: string) => handleResponse(api.post(`lifecycle/reject/${id}`, { reason })),

    getTracks: (options: { mine?: boolean } = {}) => handleResponse(api.get<Track[]>(`tracks${options.mine ? '?mine=true' : ''}`)),
    getTrack: (id: string | number) => handleResponse(api.get<Track>(`tracks/${encodeURIComponent(String(id))}`)),

    getPlaylists: () => handleResponse(api.get<Playlist[]>('playlists')),
    getPlaylist: (id: string) => handleResponse(api.get<Playlist>(`playlists/${id}`)),
    createPlaylist: (name: string, description?: string, isPublic = false) =>
        handleResponse(api.post<Playlist>('playlists', { name, description, isPublic })),
    updatePlaylist: (id: string, data: Partial<Playlist>) => handleResponse(api.put<Playlist>(`playlists/${id}`, data)),
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
        } catch (e) {
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

    // --- Community / ActivityPub ---
    getPendingFollowers: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/followers/pending/${artistId}`)),
    acceptFollower: (artistId: string | number, actorUri: string) => handleResponse(api.post(`ap/followers/accept`, { artistId, actorUri })),
    rejectFollower: (artistId: string | number, actorUri: string) => handleResponse(api.post(`ap/followers/reject`, { artistId, actorUri })),
    getArtistPosts: (idOrSlug: string) => handleResponse(api.get<Post[]>(`artists/${idOrSlug}/posts`)),
    getPostBySlug: (slug: string) => handleResponse(api.get<Post>(`posts/${slug}`)),
    createPost: (artistId: number, content: string, visibility: string, title?: string, summary?: string) => handleResponse(api.post('admin/posts', { artistId, content, visibility, title, summary })),
    updatePost: (id: number, content: string, visibility: string, title?: string, summary?: string) => handleResponse(api.put(`admin/posts/${id}`, { content, visibility, title, summary })),
    deletePost: (id: number) => handleResponse(api.delete(`admin/posts/${id}`)),

    getOnrampConfig: () => handleResponse(api.get<any>('payments/onramp-config')),

    // --- Assets ---
    getPublicAssets: () => handleResponse(api.get<any[]>('assets')),
    getAdminAssets: () => handleResponse(api.get<any[]>('admin/assets')),
    getAssetBySlug: (slug: string) => handleResponse(api.get<any>(`assets/${slug}`)),
    createAsset: (formData: FormData) => handleResponse(api.post('admin/assets', formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    updateAsset: (id: number, formData: FormData) => handleResponse(api.put(`admin/assets/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    uploadAssetCover: (id: number, formData: FormData) => handleResponse(api.post(`admin/assets/${id}/cover`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    deleteAsset: (id: number) => handleResponse(api.delete(`admin/assets/${id}`)),

    // --- Subscription ---
    createSubscriptionSession: (successUrl: string, cancelUrl: string, email?: string) => handleResponse(api.post('payments/stripe/create-subscription-session', { successUrl, cancelUrl, email })),
    verifySubscription: (txHash: string) => handleResponse(api.post('payments/subscription/verify', { txHash })),

    // --- ActivityPub Notes ---
    getPublishedContent: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/published/${artistId}`)),
    getArtistFollowers: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/followers/${artistId}`)),
    deletePublishedContent: (noteId: string) => handleResponse(api.delete(`ap/note?id=${encodeURIComponent(noteId)}`)),
    syncArtistActivityPub: (artistId: string | number) => handleResponse(api.post(`ap/sync/artist/${artistId}`)),

    // --- Network ---
    getNetworkSites: () => handleResponse(api.get<NetworkSite[]>('stats/network/sites')),
    getNetworkTracks: () => handleResponse(api.get<NetworkTrack[]>('stats/network/tracks')),
    getNetworkStatus: () => handleResponse(api.get<NetworkStatus>('stats/network/status')),
    getFollowedPeers: () => handleResponse(api.get<any[]>('admin/network/ap/peers')),
    followRemoteActor: (url: string) => handleResponse(api.post('admin/network/ap/follow', { url })),
    unfollowRemoteActor: (url: string) => handleResponse(api.post('admin/network/ap/unfollow', { url })),
    syncPeer: (url?: string) => handleResponse(api.post('admin/network/ap/sync', { url })),

    // --- Admin: Releases & Content ---
    getAdminReleases: (options: { mine?: boolean, includeLibrary?: boolean } = {}) => {
        const params = new URLSearchParams();
        if (options.mine) params.set('mine', 'true');
        if (options.includeLibrary) params.set('includeLibrary', 'true');
        const queryString = params.toString();
        return handleResponse(api.get<Release[]>(`admin/releases${queryString ? `?${queryString}` : ''}`));
    },
    getAdminRelease: (id: string | number) => handleResponse(api.get<Release>(`admin/releases/${id}`)),
    createRelease: (data: Partial<Release>) => handleResponse(api.post<Release>('admin/releases', data)),
    updateRelease: (id: string, data: Partial<Release>) => handleResponse(api.put<Release>(`admin/releases/${id}`, data)),
    deleteRelease: (id: string, keepFiles = false) =>
        handleResponse(api.delete(`admin/releases/${id}${keepFiles ? '?keepFiles=true' : ''}`)),
    deleteAlbum: (id: string, keepFiles = false) =>
        handleResponse(api.delete(`admin/releases/${id}${keepFiles ? '?keepFiles=true' : ''}`)),
    deleteReleasesBatch: (ids: number[], keepFiles = false) =>
        handleResponse(api.delete('admin/releases/batch', { data: { ids, keepFiles } })),

    toggleReleaseVisibility: (id: string, visibility: boolean | 'public' | 'private' | 'unlisted') =>
        handleResponse(api.put(`admin/releases/${id}/visibility`, typeof visibility === 'boolean' ? { isPublic: visibility } : { visibility })),

    updateReleasesVisibilityBatch: (ids: (string | number)[], visibility: string) =>
        handleResponse(api.put('admin/releases/batch/visibility', { ids, visibility })),

    promoteToRelease: (id: string) => handleResponse(api.post(`albums/${id}/promote`, {})),

    addTrackToRelease: (releaseId: string, trackId: string) =>
        handleResponse(api.post(`admin/releases/${releaseId}/tracks/add`, { trackId })),

    // --- Comments ---
    getComments: (trackId: string) => handleResponse(api.get<any[]>(`comments/track/${trackId}`)),
    postComment: (trackId: string, data: { text: string, pubKey: string, username: string, signature: string }) => handleResponse(api.post('comments/track/' + trackId, data)),
    deleteComment: (commentId: string, data?: { pubKey: string, signature: string }) => handleResponse(api.delete(`comments/${commentId}`, { data })),
    syncGunUser: (pub: string, epub: string, alias: string, avatar?: string) => handleResponse(api.post('users/sync', { pub, epub, alias, avatar })),
    syncGunPair: (pair: any) => handleResponse(api.post('users/sync-pair', { pair })),

    // --- Admin: Artists ---
    createArtist: (data: Partial<Artist>) => handleResponse(api.post<Artist>('artists', data)),
    updateArtist: (id: string, data: Partial<Artist>) => handleResponse(api.put<Artist>(`artists/${id}`, data)),
    deleteArtist: (id: string) => handleResponse(api.delete(`artists/${id}`)),
    repairArtistLinks: (id: string | number) => handleResponse(api.post<{ success: boolean, tracks: number, albums: number }>(`artists/${id}/repair-links`)),

    deleteArtistsBatch: (ids: (string | number)[]) =>
        handleResponse(api.delete('admin/artists/batch', { data: { ids } })),

    updateArtistsVisibilityBatch: (ids: (string | number)[], visibility: string) =>
        handleResponse(api.put('admin/artists/batch/visibility', { ids, visibility })),

    // --- Admin: Tracks ---
    getBatchPricing: () => handleResponse(api.get<any[]>('tracks/pricing/batch')),
    createTrack: (data: { title: string, albumId?: number, artistId?: number, trackNum?: number, url?: string, service?: string, externalArtwork?: string, duration?: number }) =>
        handleResponse(api.post<Track>('tracks', data)),
    createYouTubeTrack: (url: string, albumId?: number) =>
        handleResponse(api.post<Track>('tracks', { url, service: 'youtube', albumId })),
    createExternalTrack: (url: string, albumId?: number) =>
        handleResponse(api.post<Track>('tracks/external', { url, albumId })),
    importBandcamp: (url: string) =>
        handleResponse(api.post<any>('import/bandcamp', { url })),
    updateTrack: (id: string | number, data: Partial<Track>) => handleResponse(api.put<Track>(`tracks/${encodeURIComponent(String(id))}`, data)),
    updateTracksBatch: (trackIds: (string | number)[], data: any) => handleResponse(api.put('tracks/batch', { trackIds, data })),
    deleteTrack: (id: string | number, deleteFile = false) =>
        handleResponse(api.delete(`tracks/${encodeURIComponent(String(id))}${deleteFile ? '?deleteFile=true' : ''}`)),
    deleteTracksBatch: (trackIds: (string | number)[], deleteFiles = false) =>
        handleResponse(api.delete('tracks/batch', { data: { trackIds, deleteFiles } })),
    getTrackMetadata: (id: string | number) => handleResponse(api.get<any>(`tracks/${encodeURIComponent(String(id))}/metadata`)),

    searchTrackMetadata: (query: string) => handleResponse(api.get<any[]>(`tracks/search-metadata?q=${encodeURIComponent(query)}`)),
    matchTrackMetadata: (id: string | number, metadata: { title: string, artist: string, albumTitle?: string, coverUrl?: string }) =>
        handleResponse(api.post<{ message: string, track: Track }>(`tracks/${encodeURIComponent(String(id))}/match-metadata`, metadata)),

    searchAlbumMetadata: (query: string) => handleResponse(api.get<any[]>(`albums/search-metadata?q=${encodeURIComponent(query)}`)),
    matchAlbumMetadata: (id: string | number, metadata: { title: string, artist: string, coverUrl?: string, genre?: string, year?: number, description?: string }) =>
        handleResponse(api.post<{ message: string, album: Album }>(`albums/${id}/match-metadata`, metadata)),

    fetchLyricsMetadata: (artist: string, title: string) => handleResponse(api.get<{ lyrics: string, source: string }>(`metadata/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`)),

    // --- Admin: Uploads ---
    uploadTracks: (files: File[], options: { releaseSlug?: string, artistId?: string | number, artist?: string, album?: string, onProgress?: (percent: number) => void } = {}) => {
        const formData = new FormData();
        if (options.releaseSlug) {
            formData.append('releaseSlug', options.releaseSlug);
            formData.append('type', 'release');
        }
        if (options.artistId) {
            formData.append('artistId', options.artistId.toString());
        }
        if (options.artist) {
            formData.append('artist', options.artist);
        }
        if (options.album) {
            formData.append('album', options.album);
        }
        files.forEach(file => formData.append('files', file));
        return handleResponse(api.post('admin/upload/tracks', formData, {
            onUploadProgress: (progressEvent) => {
                if (options.onProgress && progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    options.onProgress(percentCompleted);
                }
            }
        }));
    },
    uploadCover: (file: File, releaseSlug?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (releaseSlug) {
            formData.append('releaseSlug', releaseSlug);
            formData.append('type', 'release');
        }
        return handleResponse(api.post('admin/upload/cover', formData));
    },

    uploadTrackArtwork: (trackId: string, file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("trackId", trackId);
        return handleResponse(api.post<{ url: string }>('admin/upload/track-artwork', formData));
    },

    uploadArtistAvatar: (artistId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('artistId', artistId);
        return handleResponse(api.post('admin/upload/avatar', formData));
    },
    uploadArtistAvatarUrl: (artistId: string | number, url: string) =>
        handleResponse(api.post('admin/upload/avatar-url', { artistId, url })),
    uploadBackgroundImage: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post('admin/upload/background', formData));
    },
    uploadSiteCover: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post('admin/upload/site-cover', formData));
    },
    uploadSiteLogo: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post('admin/upload/site-logo', formData));
    },

    // --- Admin: System ---
    getListeningStats: () => handleResponse(api.get<any>('stats/library/overview')),
    cleanupNetwork: () => handleResponse(api.post('admin/network/cleanup')),
    consolidateFiles: () => handleResponse(api.post<{ message: string, success: number, failed: number, skipped: number }>('admin/system/consolidate')),
    triggerRescan: () => handleResponse(api.post<{ message: string }>('admin/system/rescan')),
    consolidateDatabase: () => handleResponse(api.post<{ message: string }>('admin/system/consolidate-db')),
    syncTagsToFiles: () => handleResponse(api.post<{ message: string }>('admin/system/sync-tags')),
    uploadYouTubeCookies: (file: File) => {
        const formData = new FormData();
        formData.append('cookies', file);
        return handleResponse(api.post<{ message: string }>('admin/system/youtube-cookies', formData));
    },
    getAdminStats: (options: { mine?: boolean } = {}) => handleResponse(api.get<AdminStats>(`admin/stats${options.mine ? '?mine=true' : ''}`)),
    getBrowser: (path = '') => handleResponse(api.get<any>(`browser?path=${encodeURIComponent(path)}`)),
    deleteBrowserPath: (path: string) => handleResponse(api.delete(`browser?path=${encodeURIComponent(path)}`)),
    renameBrowserPath: (oldPath: string, newPath: string) => handleResponse(api.put("browser", { oldPath, newPath })),
    syncActivityPub: () => handleResponse(api.post('ap/sync')),
    getAPIHealth: () => handleResponse(api.get<any>('admin/system/health')),
    getMaintenanceMissing: (filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist' = 'genre') => handleResponse(api.get<any[]>(`metadata/maintenance/missing?filter=${filter}`)),
    getAlbumsMissingMetadata: (filter: 'genre' | 'year' | 'cover' | 'description' | 'artist' = 'genre') => handleResponse(api.get<any[]>(`metadata/maintenance/albums/missing?filter=${filter}`)),
    getMetadataCandidates: (trackId: number) => handleResponse(api.get<any[]>(`metadata/maintenance/candidates/${trackId}`)),
    getAlbumMetadataCandidates: (albumId: number) => handleResponse(api.get<any[]>(`metadata/maintenance/albums/candidates/${albumId}`)),
    applyTrackMetadata: (trackId: number, metadata: any) => handleResponse(api.post<{ success: boolean }>(`metadata/maintenance/apply-track`, { trackId, metadata })),
    applyAlbumMetadata: (albumId: number, metadata: any) => handleResponse(api.post<{ success: boolean }>(`metadata/maintenance/albums/apply`, { albumId, metadata })),
    getArtistsMissingPhotos: () => handleResponse(api.get<any[]>(`metadata/maintenance/artists/missing`)),
    getArtistMetadataCandidates: (artistId: number) => handleResponse(api.get<any[]>(`metadata/maintenance/artists/candidates/${artistId}`)),
    applyArtistMetadata: (artistId: number, metadata: any) => handleResponse(api.post<{ success: boolean, photoPath?: string }>(`metadata/maintenance/artists/apply`, { artistId, metadata })),
    autofillMetadata: (trackIds: (string | number)[], fields?: ('genre' | 'year' | 'cover' | 'album' | 'artist')[], force?: boolean) =>
        handleResponse<{ success: number, failed: number, skipped: number, errors: string[] }>(api.post('metadata/maintenance/autofill', { trackIds, fields, force })),

    aiAutofillMetadata: (trackIds: (string | number)[], force?: boolean) =>
        handleResponse(api.post<{ success: number, failed: number, skipped: number, errors: string[] }>('metadata/maintenance/ai-autofill', { trackIds, force })),

    autofillAlbumMetadata: (albumIds: (string | number)[], fields?: ('genre' | 'year' | 'cover' | 'description' | 'artist')[], force?: boolean) =>
        handleResponse<{ success: number, failed: number, skipped: number, errors: string[] }>(api.post('metadata/maintenance/albums/autofill', { albumIds, fields, force })),

    aiAutofillAlbumMetadata: (albumIds: (string | number)[], force?: boolean) =>
        handleResponse(api.post<{ success: number, failed: number, skipped: number, errors: string[] }>('metadata/maintenance/albums/ai-autofill', { albumIds, force })),

    getRelatedTracks: (trackId: string | number, limit = 5) =>
        handleResponse(api.get<Track[]>(`catalog/tracks/${trackId}/related?limit=${limit}`)),

    uploadBackup: async (file: File, onProgress?: (percent: number) => void) => {
        // Chunked upload to avoid timeouts on large files/slow connections
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        const MAX_RETRIES = 3;
        const uploadId = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        let uploadedBytes = 0;

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append("uploadId", uploadId);
            formData.append("chunkIndex", i.toString());
            formData.append("chunk", chunk);

            // Retry logic with exponential backoff
            let lastError: any = null;
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    await handleResponse(api.post('admin/backup/chunk', formData, {
                        timeout: 300000 // 5m per chunk
                    }));
                    lastError = null;
                    break;
                } catch (e: any) {
                    lastError = e;
                    console.warn(`Chunk ${i} upload failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, e.message);
                    if (attempt < MAX_RETRIES - 1) {
                        // Exponential backoff: 2s, 4s, 8s
                        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
                    }
                }
            }
            if (lastError) {
                throw new Error(`Chunk ${i + 1}/${totalChunks} failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
            }

            uploadedBytes += (end - start);
            if (onProgress) {
                const percent = Math.round((uploadedBytes / file.size) * 100);
                onProgress(percent);
            }
        }

        // Finalize — longer timeout since server may take a while to assemble chunks
        return handleResponse(api.post('admin/backup/restore-chunked', { uploadId }, {
            timeout: 300000 // 5m for assembly + response
        }));
    },

    backupToGDrive: () => handleResponse(api.post<{ success: boolean, fileId: string, fileName: string }>('admin/backup/gdrive')),

    // --- Identity ---
    getIdentity: () => handleResponse(api.get<{ pub: string, priv: string, epub: string, epriv: string, alias: string }>('admin/system/identity')),
    getSiteApIdentity: () => handleResponse(api.get<{ publicKey: string, privateKey: string }>('admin/system/ap-identity')),
    importIdentity: (pair: any) => handleResponse(api.post('admin/system/identity', pair)),

    // --- Admin: Users ---
    getUsers: () => handleResponse(api.get<User[]>('admin/system/users')),
    getCurrentUser: () => handleResponse(api.get<User>('admin/system/me')),
    createUser: (data: Partial<User> & { password: string }) => handleResponse(api.post<User>('admin/system/users', data)),
    updateUser: (id: string, data: Partial<User>) => handleResponse(api.put<User>(`admin/system/users/${id}`, data)),
    updateUserStatus: (id: string, active: boolean) => handleResponse(api.put(`admin/system/users/${id}/status`, { active })),
    deleteUser: (id: string) => handleResponse(api.delete(`admin/system/users/${id}`)),
    deleteUsersBatch: (ids: (string | number)[]) =>
        handleResponse(api.delete('admin/system/users/batch', { data: { ids } })),
    resetUserPassword: (id: string, password: string) => handleResponse(api.put(`admin/system/users/${id}/password`, { password })),

    // --- Unlock Codes ---
    validateUnlockCode: (code: string) => handleResponse(api.post('unlock/validate', { code })),
    redeemUnlockCode: (code: string) => handleResponse(api.post('unlock/redeem', { code })),
    createUnlockCodes: (releaseId: string, count: number) => handleResponse(api.post<UnlockCode[]>('unlock/admin/create', { releaseId, count })),
    getUnlockCodes: (releaseId?: string) => {
        const query = releaseId ? `?releaseId=${releaseId}` : '';
        return handleResponse(api.get<UnlockCode[]>(`unlock/admin/list${query}`));
    },

    // --- Admin: Settings ---
    getAdminSettings: () => handleResponse(api.get<SiteSettings>('admin/settings')),
    updateSettings: (data: Partial<SiteSettings>) => handleResponse(api.put<SiteSettings>('admin/settings', data)),

    // --- Admin: Artist identity (ActivityPub keys per artist) ---
    getArtistIdentity: (artistId: string) =>
        handleResponse(api.get<{ publicKey: string, privateKey: string }>(`admin/artists/${artistId}/identity`)),

    // --- Content Search ---
    searchSoulseek: (query: string) => handleResponse(api.get<any[]>(`search/content/soulseek?q=${encodeURIComponent(query)}`)),
    downloadSoulseek: (result: any) => handleResponse(api.post<{ success: boolean, downloadId: number }>('search/content/soulseek/download', { result })),
    getSoulseekStatus: () => handleResponse(api.get<any[]>('search/content/soulseek/status')),
    syncSoulseekDownload: (id: number) => handleResponse(api.post<{ success: boolean, result: any }>(`search/content/soulseek/sync/${id}`)),
    deleteSoulseekDownload: (id: number) => handleResponse(api.delete(`search/content/soulseek/status/${id}`)),
    clearFailedSoulseekDownloads: () => handleResponse(api.delete('search/content/soulseek/status/failed')),
    updateSoulseekCredentials: (creds: { username: string, password?: string }) => handleResponse(api.post('search/content/soulseek/credentials', creds)),

    searchTorrents: (query: string, category = 'Music') => handleResponse(api.get<any[]>(`admin/torrent-search/search?q=${encodeURIComponent(query)}&cat=${category}`)),
    downloadTorrentResult: (torrent: any, providerId: string) => handleResponse(api.post<{ success: boolean, message: string }>('admin/torrent-search/download', { torrent, providerId })),

    // --- Storage ---
    getGDriveAuthUrl: () => handleResponse(api.get<{ url: string }>('storage/gdrive/auth')),
    getGDriveAccounts: () => handleResponse(api.get<StorageAccount[]>('storage/gdrive/accounts')),
    getGDriveFiles: (folderId?: string) => handleResponse(api.get<GoogleDriveFile[]>(`storage/gdrive/files${folderId ? `?folderId=${folderId}` : ''}`)),
    importGDriveFile: (fileId: string, artistId?: number, albumId?: number) => handleResponse(api.post<{ success: boolean, trackId: number }>('storage/gdrive/import', { fileId, artistId, albumId })),
    importGDriveFolderRecursive: (folderId: string, artistId?: number, albumId?: number) => handleResponse(api.post<{ success: boolean, count: number, message: string }>('storage/gdrive/import-folder', { folderId, artistId, albumId })),
    localizeGDriveTrack: (trackId: string | number) => handleResponse(api.post<{ success: boolean, track: Track }>(`storage/gdrive/localize/${trackId}`)),
    deleteGDriveAccount: (id: number) => handleResponse(api.delete(`storage/gdrive/accounts/${id}`)),
    
    // --- Torrents ---
    getTorrents: () => handleResponse(api.get<any[]>('admin/torrents')),
    addTorrent: (magnetUri: string) => handleResponse(api.post('admin/torrents/add', { magnet: magnetUri })),
    seedTorrent: (filePaths: string[], name: string) => handleResponse(api.post<{ success: boolean, magnetUri: string }>('admin/torrents/seed', { filePaths, name })),
    deleteTorrent: (infoHash: string, deleteFiles = false) => handleResponse(api.delete(`admin/torrents/${infoHash}${deleteFiles ? '?deleteFiles=true' : ''}`)),
    purgeStuckTorrents: (timeoutMs?: number) => handleResponse(api.post<{ success: boolean, removed: string[], count: number }>('admin/torrents/purge', timeoutMs !== undefined ? { timeoutMs } : {})),
    
    // --- Fingerprinting ---
    fingerprintLookup: (trackId: number) => handleResponse(api.post<any>(`metadata/maintenance/fingerprint/lookup/${trackId}`)),
    shareFingerprint: (trackId: number) => handleResponse(api.post<{ success: boolean }>(`metadata/maintenance/fingerprint/share/${trackId}`)),
    scanAllFingerprints: () => handleResponse(api.post<{ message: string }>('metadata/maintenance/fingerprint/scan-all')),

    startLibraryAudit: (options: { forceRepair?: boolean, useAI?: boolean }) => handleResponse(api.post('metadata/maintenance/audit-all', options)),
    getAuditStatus: () => handleResponse(api.get('metadata/maintenance/audit-status')),
    stopLibraryAudit: () => handleResponse(api.post('metadata/maintenance/audit-stop')),
    
    // --- Admin: Plugins ---
    getPlugins: () => handleResponse(api.get<any[]>('admin/system/plugins')),
    togglePlugin: (pluginId: string, enabled: boolean) => handleResponse(api.put(`admin/system/plugins/${pluginId}/toggle`, { enabled })),
};

export default API;
