import { api, handleResponse } from './client';
import type {
    ArtistEvent, ArtistEventInput, Post, PublicProfile, NowListeningEntry
} from '../../types';



export const socialApi = {
    // --- Community / ActivityPub ---
    getPendingFollowers: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/followers/pending/${artistId}`)),
    acceptFollower: (artistId: string | number, actorUri: string) => handleResponse(api.post(`ap/followers/accept`, { artistId, actorUri })),
    rejectFollower: (artistId: string | number, actorUri: string) => handleResponse(api.post(`ap/followers/reject`, { artistId, actorUri })),
    getArtistPosts: (idOrSlug: string) => handleResponse(api.get<Post[]>(`artists/${idOrSlug}/posts`)),
    getArtistEvents: (idOrSlug: string) => handleResponse(api.get<ArtistEvent[]>(`artists/${idOrSlug}/events`)),
    createArtistEvent: (idOrSlug: string, data: ArtistEventInput & { announce?: boolean }) =>
        handleResponse(api.post<ArtistEvent>(`artists/${idOrSlug}/events`, data)),
    updateArtistEvent: (idOrSlug: string, eventId: number, data: ArtistEventInput) =>
        handleResponse(api.put<ArtistEvent>(`artists/${idOrSlug}/events/${eventId}`, data)),
    deleteArtistEvent: (idOrSlug: string, eventId: number) =>
        handleResponse(api.delete(`artists/${idOrSlug}/events/${eventId}`)),
    getPostBySlug: (slug: string) => handleResponse(api.get<Post>(`posts/${slug}`)),
    createPost: (artistId: number, content: string, visibility: string, title?: string, summary?: string) => handleResponse(api.post('admin/posts', { artistId, content, visibility, title, summary })),
    updatePost: (id: number, content: string, visibility: string, title?: string, summary?: string) => handleResponse(api.put(`admin/posts/${id}`, { content, visibility, title, summary })),
    deletePost: (id: number) => handleResponse(api.delete(`admin/posts/${id}`)),

    getOnrampConfig: () => handleResponse(api.get<any>('payments/onramp-config')),

    // --- Subscription ---
    createSubscriptionSession: (successUrl: string, cancelUrl: string, email?: string) => handleResponse(api.post('payments/stripe/create-subscription-session', { successUrl, cancelUrl, email })),
    verifySubscription: (txHash: string) => handleResponse(api.post('payments/subscription/verify', { txHash })),
    // --- ActivityPub Notes ---
    getPublishedContent: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/published/${artistId}`)),
    getArtistFollowers: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/followers/${artistId}`)),
    deletePublishedContent: (noteId: string) => handleResponse(api.delete(`ap/note?id=${encodeURIComponent(noteId)}`)),
    getNoteInteractions: (noteId: string) => handleResponse(api.get<any[]>(`ap/note/interactions?id=${encodeURIComponent(noteId)}`)),
    getNoteReplies: (noteId: string) => handleResponse(api.get<any[]>(`ap/note/replies?id=${encodeURIComponent(noteId)}`)),
    postNoteReply: (noteId: string, content: string) => handleResponse(api.post(`ap/note/reply`, { id: noteId, content })),
    deleteNoteReply: (replyUri: string) => handleResponse(api.delete(`ap/note/reply?uri=${encodeURIComponent(replyUri)}`)),
    syncArtistActivityPub: (artistId: string | number) => handleResponse(api.post(`ap/sync/artist/${artistId}`)),
    getArtistTimeline: (artistId: string | number) => handleResponse(api.get<any[]>(`ap/timeline/${artistId}`)),
    getLinkPreview: (url: string) => handleResponse(api.get<{url: string; title: string | null; description: string | null; image: string | null; siteName: string | null}>(`ap/link-preview?url=${encodeURIComponent(url)}`)),
    shareReleaseToMastodon: (releaseId: string | number) => handleResponse(api.post<{success: boolean; message: string}>(`ap/mastodon/share-release/${releaseId}`)),
    updateArtistAlias: (artistId: string | number, alsoKnownAs: string[] | null) => handleResponse(api.post('ap/identity/alias', { artistId, alsoKnownAs })),
    initiateArtistMove: (artistId: string | number, targetActorUri: string) => handleResponse(api.post('ap/identity/move', { artistId, targetActorUri })),
    importArtistIdentity: (artistId: string | number, remoteActorUri: string) => handleResponse(api.post('ap/identity/import', { artistId, remoteActorUri })),

    // --- Account migration (portable archive: profile link + playlists) ---
    exportAccount: () => handleResponse(api.get<any>('account/export')),
    importAccount: (archive: any) => handleResponse(api.post<{ imported_playlists: number; imported_tracks: number; skipped_tracks: number; skipped: { playlist: string; title: string; artist: string }[]; identity_linked: boolean; identity_note?: string }>('account/import', archive)),
    // --- Board (Guestbook) ---
    getBoardHistory: (limit?: number) => handleResponse(api.get<any[]>(`board/history${limit ? `?limit=${limit}` : ''}`)),
    sendBoardMessage: (message: string, trackMetadata?: { artist?: string; title?: string; album?: string; url?: string }) => 
        handleResponse(api.post<any>('board/messages', { message, trackMetadata })),
    deleteBoardMessage: (id: number) => handleResponse<{ success: boolean }>(api.delete(`board/messages/${id}`)),
    getBoardStreamUrl: () => {
        const token = localStorage.getItem('tunecamp_token');
        return `/api/board/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },
    // --- Public listener profile (opt-in) ---
    getPublicProfile: (username: string) => handleResponse(api.get<PublicProfile>(`users/${encodeURIComponent(username)}/public`)),
    getPublicProfilePref: () => handleResponse(api.get<{ enabled: boolean }>('users/me/public-profile')),
    setPublicProfilePref: (enabled: boolean) => handleResponse(api.put<{ enabled: boolean }>('users/me/public-profile', { enabled })),
    // --- Fediverse identity (server-resolved; hasActor false means /users/<handle> 404s) ---
    getMyFediverseIdentity: () => handleResponse(api.get<{ hasActor: boolean; handle: string; actorUri: string }>('users/me/fediverse')),
    // --- Now listening (opt-in presence) ---
    getNowListening: () => handleResponse(api.get<{ listeners: NowListeningEntry[] }>('now-playing')),
    getNowPlayingPref: () => handleResponse(api.get<{ enabled: boolean }>('now-playing/preference')),
    setNowPlayingPref: (enabled: boolean) => handleResponse(api.put<{ enabled: boolean }>('now-playing/preference', { enabled })),
    pingNowPlaying: (data: { trackId?: number | string | null; title: string; artist?: string }) =>
        handleResponse(api.post<{ recorded: boolean }>('now-playing', data)),
    clearNowPlaying: () => handleResponse(api.post<{ recorded: boolean }>('now-playing', { title: '' })),
    // --- Peer Sharing ---
    getPeerSessions: () => handleResponse(api.get<any[]>('peers')),
    searchPeerTracks: (query: string) => handleResponse(api.get<any[]>(`peers/search?q=${encodeURIComponent(query)}`)),
    getPeerTracks: (sessionId: string) => handleResponse(api.get<any[]>(`peers/${sessionId}/tracks`)),
    updateUserCanPeer: (userId: number, canPeer: boolean) => handleResponse(api.put(`peers/users/${userId}/can-peer`, { canPeer })),
    kickPeerSession: (sessionId: string) => handleResponse(api.delete(`peers/${sessionId}`)),
    getPeerStatus: () => handleResponse<{ enabled: boolean, allowDownloads: boolean }>(api.get('peers/status')),
    importPeerTrack: (sessionId: string, trackId: string) => handleResponse(api.post(`peers/${sessionId}/tracks/${trackId}/import`, {})),
    importFederatedTrack: (payload: { downloadUrl: string; title?: string; artist?: string; album?: string }) => handleResponse(api.post(`peers/federated-import`, payload)),
};
