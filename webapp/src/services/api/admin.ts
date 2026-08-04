import { api, handleResponse } from './client';
import type {
    Track, Album, Artist, SiteSettings, User, Release,
    AdminStats, StorageAccount, GoogleDriveFile, InstanceStorage,
    RecomputeStorageResult, SystemResources, UpdateCheck
} from '../../types';



export const adminApi = {
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

    // --- Admin: Artists ---
    createArtist: (data: Partial<Artist>) => handleResponse(api.post<Artist>('artists', data)),
    updateArtist: (id: string, data: Partial<Artist>) => handleResponse(api.put<Artist>(`artists/${id}`, data)),
    deleteArtist: (id: string) => handleResponse(api.delete(`artists/${id}`)),
    repairArtistLinks: (id: string | number) => handleResponse(api.post<{ success: boolean, tracks: number, albums: number }>(`artists/${id}/repair-links`)),

    deleteArtistsBatch: (ids: (string | number)[]) =>
        handleResponse(api.delete('admin/artists/batch', { data: { ids } })),

    updateArtistsVisibilityBatch: (ids: (string | number)[], visibility: string) =>
        handleResponse(api.put('admin/artists/batch/visibility', { ids, visibility })),

    // --- Admin: Artist Stripe Connect (fiat direct charges) ---
    getArtistStripeStatus: (id: string | number) =>
        handleResponse(api.get<{ connected: boolean; accountId?: string; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; country?: string | null }>(`admin/artists/${id}/stripe-connect/status`)),
    startArtistStripeOnboarding: (id: string | number, returnTo?: string) =>
        handleResponse(api.post<{ url: string; accountId: string }>(`admin/artists/${id}/stripe-connect/onboard`, returnTo ? { returnTo } : {})),
    unlinkArtistStripe: (id: string | number) =>
        handleResponse(api.delete(`admin/artists/${id}/stripe-connect`)),

    // --- Admin: Tracks ---
    getBatchPricing: () => handleResponse(api.get<any[]>('tracks/pricing/batch')),
    createTrack: (data: { title: string, albumId?: number, artistId?: number, trackNum?: number, url?: string, service?: string, externalArtwork?: string, duration?: number, localize?: boolean }) =>
        handleResponse(api.post<Track>('tracks', data)),
    createYouTubeTrack: (url: string, albumId?: number) =>
        handleResponse(api.post<Track>('tracks', { url, service: 'youtube', albumId })),
    createExternalTrack: (url: string, albumId?: number) =>
        handleResponse(api.post<Track>('tracks/external', { url, albumId })),
    importBandcamp: (url: string) =>
        handleResponse(api.post<any>('import/bandcamp', { url })),
    /** Downloads a remote image through the same-origin proxy (avoids CORS) and returns it as a Blob. */
    proxyImageBlob: (url: string): Promise<Blob> =>
        api.get('proxy/stream', { params: { url }, responseType: 'blob' }).then(r => r.data),
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
    uploadAdditionalArtworks: (releaseSlug: string, files: File[]) => {
        const formData = new FormData();
        formData.append('releaseSlug', releaseSlug);
        files.forEach(file => formData.append('files', file));
        return handleResponse(api.post<{ additional_artworks: string[] }>('admin/upload/additional-artworks', formData));
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
    uploadArtistBanner: (artistId: string | number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('artistId', String(artistId));
        return handleResponse(api.post('admin/upload/artist-banner', formData));
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
    uploadPostMedia: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return handleResponse(api.post<{ url: string }>('admin/upload/post-media', formData));
    },
    removeBackgroundImage: () => handleResponse(api.delete('admin/upload/background')),
    removeSiteCover: () => handleResponse(api.delete('admin/upload/site-cover')),
    removeSiteLogo: () => handleResponse(api.delete('admin/upload/site-logo')),

    // --- Admin: System ---
    getListeningStats: () => handleResponse(api.get<any>('stats/library/overview')),
    triggerRescan: () => handleResponse(api.post<{ message: string }>('admin/system/rescan')),
    pruneOrphans: () => handleResponse(api.post<{ message: string }>('admin/system/prune-orphans')),
    prewarmCache: () => handleResponse(api.post<{ message: string; taskId: string }>('admin/system/prewarm-cache')),
    syncTagsToFiles: () => handleResponse(api.post<{ message: string }>('admin/system/sync-tags')),
    getTasks: () => handleResponse(api.get<any[]>('admin/tasks')),
    getRunningTasks: () => handleResponse(api.get<any[]>('admin/tasks/running')),
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
    purgeLocalFederationCache: () => handleResponse(api.delete('admin/network/local-cache')),
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

    autofillArtistMetadata: (artistIds: (string | number)[], force?: boolean) =>
        handleResponse<{ success: number, failed: number, skipped: number, errors: string[] }>(api.post('metadata/maintenance/artists/autofill', { artistIds, force })),

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
            let lastError: Error | null = null;
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    await handleResponse(api.post('admin/backup/chunk', formData, {
                        timeout: 300000 // 5m per chunk
                    }));
                    lastError = null;
                    break;
                } catch (error: unknown) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`Chunk ${i} upload failed (attempt ${attempt + 1} of ${MAX_RETRIES}):`, lastError.message);
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
    getSiteApIdentity: () => handleResponse(api.get<{ publicKey: string, privateKey: string, handle?: string }>('admin/system/ap-identity')),

    // --- Admin: Users ---
    getUsers: () => handleResponse(api.get<User[]>('admin/system/users')),
    getCurrentUser: () => handleResponse(api.get<User>('admin/system/me')),
    createUser: (data: Partial<User> & { password: string }) => handleResponse(api.post<User>('admin/system/users', data)),
    updateUser: (id: string, data: Partial<User>) => handleResponse(api.put<User>(`admin/system/users/${id}`, data)),
    updateUserStatus: (id: string, active: boolean) => handleResponse(api.put(`admin/system/users/${id}/status`, { active })),

    // --- Artist profile requests (listener -> admin approval) ---
    getMyArtistRequest: () => handleResponse(api.get<{ requestedAt: string | null, hasArtist: boolean }>('users/me/artist-request')),
    requestArtistProfile: () => handleResponse(api.post<{ success: boolean; autoApproved?: boolean; token?: string; artistId?: number; message?: string }>('users/me/artist-request')),
    approveArtistRequest: (userId: string | number) => handleResponse(api.post<{ artistId: number }>(`admin/system/users/${userId}/approve-artist`)),
    dismissArtistRequest: (userId: string | number) => handleResponse(api.delete(`admin/system/users/${userId}/artist-request`)),
    deleteUser: (id: string) => handleResponse(api.delete(`admin/system/users/${id}`)),
    deleteUsersBatch: (ids: (string | number)[]) =>
        handleResponse(api.delete('admin/system/users/batch', { data: { ids } })),
    resetUserPassword: (id: string, password: string) => handleResponse(api.put(`admin/system/users/${id}/password`, { password })),
    
    // --- Admin: Settings ---
    getAdminSettings: () => handleResponse(api.get<SiteSettings>('admin/settings')),
    updateSettings: (data: Partial<SiteSettings>) => handleResponse(api.put<SiteSettings>('admin/settings', data)),

    // --- Admin: Artist identity (ActivityPub keys per artist) ---
    getArtistIdentity: (artistId: string) =>
        handleResponse(api.get<{ publicKey: string, privateKey: string }>(`admin/artists/${artistId}/identity`)),
    refreshArtistIdentity: (artistId: string) =>
        handleResponse(api.post<{ success: boolean, inboxes: number, message: string }>(`admin/artists/${artistId}/refresh-identity`)),

    // --- Storage ---
    getGDriveAuthUrl: () => handleResponse(api.get<{ url: string }>('storage/gdrive/auth')),
    getGDriveAccounts: () => handleResponse(api.get<StorageAccount[]>('storage/gdrive/accounts')),
    getGDriveFiles: (folderId?: string) => handleResponse(api.get<GoogleDriveFile[]>(`storage/gdrive/files${folderId ? `?folderId=${folderId}` : ''}`)),
    importGDriveFile: (fileId: string, artistId?: number, albumId?: number) => handleResponse(api.post<{ success: boolean, trackId: number }>('storage/gdrive/import', { fileId, artistId, albumId })),
    importGDriveFolderRecursive: (folderId: string, artistId?: number, albumId?: number) => handleResponse(api.post<{ success: boolean, count: number, message: string }>('storage/gdrive/import-folder', { folderId, artistId, albumId })),
    localizeGDriveTrack: (trackId: string | number) => handleResponse(api.post<{ success: boolean, track: Track }>(`storage/gdrive/localize/${trackId}`)),
    deleteGDriveAccount: (id: number) => handleResponse(api.delete(`storage/gdrive/accounts/${id}`)),
    getStorageOverview: () => handleResponse(api.get<InstanceStorage>('admin/storage/overview')),
    recomputeStorage: () => handleResponse(api.post<RecomputeStorageResult>('admin/storage/recompute')),
    getSystemResources: () => handleResponse(api.get<SystemResources>('admin/system/resources')),
    checkForUpdate: () => handleResponse(api.get<UpdateCheck>('admin/system/update-check')),
    
    // --- Admin: Plugins ---
    getPlugins: () => handleResponse(api.get<any[]>('admin/system/plugins')),
    togglePlugin: (pluginId: string, enabled: boolean) => handleResponse(api.put(`admin/system/plugins/${pluginId}/toggle`, { enabled })),
    getPluginSettings: (pluginId: string) => handleResponse(api.get<Record<string, string>>(`admin/system/plugins/${pluginId}/settings`)),
    updatePluginSettings: (pluginId: string, settings: Record<string, string>) => handleResponse(api.put(`admin/system/plugins/${pluginId}/settings`, settings)),

};
