/**
 * Database Types — Extracted from database.ts for better modularity.
 * All domain model interfaces used across the server codebase.
 */
import type { Database as DatabaseType } from "better-sqlite3";
import { VisibilityProfile, ViewerContext } from "../common/visibility.js";

interface OAuthClient {
    id?: number;
    instance_url: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    created_at?: string;
}

interface OAuthLink {
    provider: string;
    subject: string;
    gun_pub: string;
    gun_priv: string;
    created_at: string;
}

export interface User {
    id: number;
    username: string;
    password_hash: string;
    artist_id: number | null;
    is_active: boolean;
    role: string;
    storage_quota?: number;
    storage_used?: number;
    subscription_status?: string;
    subscription_expires_at?: string | null;
}

export interface Artist {
    id: number;
    name: string;
    slug: string;
    bio: string | null;
    photo_path: string | null;
    links: any | null; // Parsed JSON
    post_params: any | null; // Parsed JSON
    wallet_address: string | null;
    visibility: 'public' | 'private' | 'unlisted';
    external_id?: string | null;
    public_key?: string;
    private_key?: string;
    created_at?: string;
    // Computed fields
    isLibraryArtist?: boolean;
    coverImage?: string;
    starred?: boolean;
    rating?: number;
}

export interface Album {
    id: number;
    title: string;
    slug: string;
    artist_id: number | null;
    owner_id: number | null;
    date: string | null;
    cover_path: string | null;
    genre: string | null;
    description: string | null;
    type: 'album' | 'single' | 'ep';
    year: number | string | null;
    download: string | null;
    price: number;
    price_usdc: number;
    price_usdt?: number;
    currency: 'ETH' | 'USD' | 'USDC' | 'USDT';
    external_links: any | null; // Parsed JSON
    is_public: boolean;
    visibility: 'public' | 'private' | 'unlisted';
    is_release: boolean;
    published_at: string | null;
    published_to_gundb: boolean;
    published_to_ap: boolean;
    license?: string | null;
    status: 'released' | 'draft' | 'curated' | 'archived' | 'pending' | 'awaiting_finalization';
    created_at: string;
    external_id?: string | null;
    use_nft?: boolean | number;
    product_type?: string;
    // View fields
    artist_name?: string;
    artist_slug?: string;
    artist_wallet_address?: string;
    album_artist?: string | null;
}

export interface Release extends Album {
    // Release is a specific view of Album where is_release = 1
}

export interface Track {
    id: number;
    title: string;
    album_id: number | null;
    album_title?: string;
    album_artist?: string | null;
    albumArtist?: string | null;
    album_download?: string;
    album_visibility?: string;
    album_price?: number;
    artist_id: number | null;
    artist_name?: string | null;
    owner_id: number | null;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    format: string | null;
    bitrate: number | null;
    sample_rate: number | null;
    lossless_path: string | null;
    url: string | null;
    service: string | null;
    external_artwork: string | null;
    price: number;
    price_usdc: number;
    price_usdt?: number;
    currency: 'ETH' | 'USD' | 'USDC' | 'USDT';
    waveform: string | null;
    lyrics?: string | null;
    hash?: string | null;
    genre?: string | null;
    year?: number | null;
    external_id?: string | null;
    fingerprint?: string | null;
    visibility?: 'public' | 'private' | 'unlisted';
    created_at?: string;
    mime_type?: string;
    file_size?: number;
    file_hash?: string | null;
    version?: string | null;
    // View fields
    artist_slug?: string;
    artist_wallet_address?: string;
    effective_owner_id?: number;
    album_status?: string;
}

export interface ReleaseTrack {
    id: number;
    release_id: number;
    track_id: number | null;
    title: string;
    artist_name: string | null;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    price: number;
    price_usdc: number;
    price_usdt?: number;
    currency: 'ETH' | 'USD' | 'USDC' | 'USDT';
    created_at: string;
}

export interface TrackDTO extends Track {
    albumId: number | null;
    artistId: number | null;
    losslessPath: string | null;
    externalArtwork: string | null;
    albumName?: string;
    artistName: string | null;
    path: string | null;
    filename?: string;
    coverUrl: string | null;
    waveform: string | null;
    starred?: boolean;
    rating?: number;
    album_download?: string;
}

export interface AlbumDTO extends Album {
    coverImage: string | null;
    tracks?: TrackDTO[];
    isExternal?: boolean;
    starred?: boolean;
    rating?: number;
}

export interface Playlist {
    id: number;
    name: string;
    username: string;
    description: string | null;
    is_public: boolean;
    isPublic?: boolean;
    cover_path: string | null;
    coverPath?: string | null;
    created_at: string;
    createdAt?: string;
    trackCount?: number;
}

export interface Post {
    id: number;
    artist_id: number;
    title?: string | null;
    summary?: string | null;
    content: string;
    slug: string;
    visibility: 'public' | 'private' | 'unlisted';
    published_at: string | null;
    created_at: string;
    artist_name?: string;
    artist_slug?: string;
    artist_photo?: string | null;
}

export interface ApNote {
    id: number;
    artist_id: number;
    note_id: string;
    note_type: string;
    content_id: number;
    content_slug: string;
    content_title: string;
    published_at: string;
    deleted_at: string | null;
}

export interface Follower {
    id: number;
    artist_id: number;
    actor_uri: string;
    inbox_uri: string;
    shared_inbox_uri: string | null;
    created_at: string;
    status: 'pending' | 'accepted' | 'rejected';
    follow_id?: string | null;
}

interface LikeEntry {
    id: number;
    remote_actor_fid: string;
    object_type: 'album' | 'track' | 'post';
    object_id: number;
    created_at: string;
}

export interface RemoteActor {
    id: number;
    uri: string;
    type: string;
    username: string | null;
    name: string | null;
    summary: string | null;
    icon_url: string | null;
    inbox_url: string | null;
    outbox_url: string | null;
    public_key: string | null;
    is_followed: boolean;
    last_seen: string;
}

export interface RemoteContent {
    id: number;
    ap_id: string;
    actor_uri: string;
    type: string;
    title: string | null;
    content: string | null;
    url: string | null;
    cover_url: string | null;
    stream_url: string | null;
    artist_name: string | null;
    album_name: string | null;
    duration: number | null;
    published_at: string | null;
    received_at: string;
}

export interface PlayHistoryEntry {
    id: number;
    track_id: number;
    played_at: string;
    track_title?: string;
    artist_name?: string;
    album_title?: string;
}

export interface TrackWithPlayCount extends Track {
    playCount: number;
}

export interface ArtistWithPlayCount extends Artist {
    playCount: number;
}

interface ListeningStats {
    totalPlays: number;
    uniqueTracks: number;
    totalListeningTime: number;
    playsToday: number;
    playsThisWeek: number;
    playsThisMonth: number;
    topGenres?: { genre: string, count: number }[];
}

export interface Torrent {
    info_hash: string;
    infoHash?: string;
    name: string | null;
    magnet_uri: string;
    owner_id: number | null;
    status: 'metadata' | 'downloading' | 'seeding' | 'paused' | 'error' | 'completed' | 'failed';
    progress: number;
    download_speed: number;
    downloadSpeed?: number;
    upload_speed: number;
    uploadSpeed?: number;
    num_peers: number;
    numPeers?: number;
    size: number;
    path: string | null;
    added_at: string;
    done?: boolean;
    files?: any[];
}

export type TorrentStatus = Torrent['status'];

interface SoulseekDownload {
    id: number;
    user_id: number;
    file_path: string;
    filename: string;
    status: string;
    progress: number;
    added_at: string;
}

export interface StorageAccount {
    id: number;
    user_id: number;
    provider: string;
    account_email: string | null;
    access_token: string;
    refresh_token: string | null;
    expiry_date: number | null;
    created_at: string;
}

interface GunCacheEntry {
    key: string;
    value: string;
    type: string;
    expires_at: number;
}

export interface IdentityManager {
    getUser(id: number): User | undefined;
    getUserByUsername(username: string): User | undefined;
    getUserByArtistId(artistId: number): User | undefined;
    createUser(username: string, passwordHash: string, artistId?: number | null, role?: string): number;
    updateUser(id: number, data: Partial<User>): void;
    getAllUsers(): User[];
    deleteUser(id: number): void;
    getAdmins(): User[];
    getSetting(key: string): string | undefined;
    setSetting(key: string, value: string): void;
    getAllSettings(): { [key: string]: string };
    updateSubscription(userId: number, status: string, expiresAt: string): void;
    getUserSubscription(userId: number): { status: string, expiresAt: string | null };
}

export interface LibraryManager {
    getArtist(id: number): Artist | undefined;
    getArtistSimple(id: number): Artist | undefined;
    getArtistBySlug(slug: string): Artist | undefined;
    getArtistBySlugSimple(slug: string): Artist | undefined;
    getArtistByName(name: string): Artist | undefined;
    createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: any, externalId?: string): number;
    updateArtist(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: any): void;
    
    getTrack(id: number): Track | undefined;
    createTrack(track: Omit<Track, "id" | "album_title" | "created_at">): number;
    updateTrack(id: number, data: Partial<Track>): void;
    
    updateTrackDeep(
        trackId: number,
        data: any,
        primaryAdminId: number | null
    ): {
        track: Track;
        fileChanges?: {
            oldPath: string;
            newPath: string;
            oldLossless?: string;
            newLossless?: string;
        };
        requiresTagSync: boolean;
        requiresPublishingSync: boolean;
    };
    
    getAlbum(id: number): Album | undefined;
    getAlbumBySlug(slug: string): Album | undefined;
    createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    
    consolidateLibrary(): void;
}

export interface SocialManager {
    getFollowers(artistId: number): Follower[];
    getPendingFollowers(artistId: number): Follower[];
    getFollower(artistId: number, actorUri: string): Follower | undefined;
    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string, followId?: string): void;
    acceptFollower(artistId: number, actorUri: string): void;
    rejectFollower(artistId: number, actorUri: string): void;
    removeFollower(artistId: number, actorUri: string): void;
    unfollowActor(uri: string): void;
}

export interface DatabaseService {
    db: DatabaseType;
    consolidateDatabase(): void;
    transaction<T>(fn: () => T): T;
    
    identity: IdentityManager;
    library: LibraryManager;
    social: SocialManager;

    // Users
    getUser(id: number): User | undefined;
    getUserByUsername(username: string): User | undefined;
    getUserByArtistId(artistId: number): User | undefined;
    createUser(username: string, passwordHash: string, artistId?: number | null, role?: string): number;
    updateUser(id: number, data: Partial<User>): void;
    getAllUsers(): User[];
    deleteUser(id: number): void;
    getAdmins(): User[];
    syncZenUser(pub: string, epub: string, alias: string, avatar?: string): void;
    getZenUser(pub: string): { pub: string, epub: string, alias: string, avatar: string | null } | undefined;
    updateSubscription(userId: number, status: string, expiresAt: string): void;
    getUserSubscription(userId: number): { status: string, expiresAt: string | null };

    // Auth
    createOAuthClient(client: Omit<OAuthClient, "created_at">): void;
    getOAuthClient(instanceUrl: string): OAuthClient | undefined;
    saveOAuthLink(provider: string, subject: string, gunPub: string, gunPriv: string): void;
    getOAuthLink(provider: string, subject: string): OAuthLink | undefined;

    // Artists
    getArtists(profile?: VisibilityProfile | ViewerContext): Artist[];
    getArtist(id: number): Artist | undefined;
    getArtistSimple(id: number): Artist | undefined;
    getArtistBySlug(slug: string): Artist | undefined;
    getArtistBySlugSimple(slug: string): Artist | undefined;
    getArtistByName(name: string): Artist | undefined;
    getArtistsByIds(ids: number[]): Artist[];
    getFollowers(artistId: number): Follower[];
    getPendingFollowers(artistId: number): Follower[];
    getFollower(artistId: number, actorUri: string): Follower | undefined;
    addFollower(artistId: number, actorUri: string, inboxUrl: string, sharedInboxUrl?: string, followId?: string): void;
    acceptFollower(artistId: number, actorUri: string): void;
    rejectFollower(artistId: number, actorUri: string): void;
    removeFollower(artistId: number, actorUri: string): void;
    unfollowActor(actorUri: string): void;
    createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted', externalId?: string): number;
    updateArtist(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted'): void;
    updateArtistKeys(id: number, publicKey: string, privateKey: string): void;
    deleteArtist(id: number): void;
    deleteArtistsBatch(ids: number[]): void;
    updateArtistsVisibilityBatch(ids: number[], visibility: Artist['visibility']): void;
    isArtistLinkedToUser(id: number): boolean;
    isArtistLinkedToUserBySlug(slug: string): boolean;

    // Releases (New watertight compartment)
    getReleases(profile?: VisibilityProfile | ViewerContext): Release[];
    getRelease(id: number): Release | undefined;
    getReleaseBySlug(slug: string): Release | undefined;
    getRecentReleaseByMetadata(title: string, artistId: number | null, seconds: number): Release | undefined;
    getReleasesByArtist(artistId: number, profile?: VisibilityProfile | ViewerContext, artistName?: string): Release[];
    getReleasesByOwner(ownerId: number, profile?: VisibilityProfile | ViewerContext): Release[];
    createRelease(release: Omit<Release, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    updateRelease(id: number, data: Partial<Release>): void;
    getReleaseTracks(releaseId: number): ReleaseTrack[];
    getReleaseTrackIds(releaseId: number): number[];
    addTrackToRelease(releaseId: number, trackId: number, metadata?: Partial<ReleaseTrack>): number;
    syncReleaseTracks(releaseId: number, trackIds: number[]): void;
    deleteRelease(id: number): void;
    deleteReleasesBatch(ids: number[]): void;

    // Legacy/Library Albums
    getAlbums(profile?: VisibilityProfile | ViewerContext): Album[];
    getAlbumsWithStats(profile?: VisibilityProfile | ViewerContext): (Album & { songCount: number; duration: number })[];
    getLibraryAlbums(profile?: VisibilityProfile | ViewerContext): Album[]; // is_release=0
    getAlbum(id: number): Album | undefined;
    getAlbumsByIds(ids: number[]): Album[];
    getAlbumBySlug(slug: string): Album | undefined;
    getAlbumByTitle(title: string, artistId?: number): Album | undefined;
    getAlbumByExternalId(externalId: string): Album | undefined;
    getArtistAlbumCounts(): { artist_id: number, count: number }[];
    getArtistCovers(artistId: number): string[];
    getAlbumsByArtist(artistId: number, profile?: VisibilityProfile | ViewerContext, artistName?: string): Album[];
    getAlbumsByOwner(ownerId: number, profile?: VisibilityProfile | ViewerContext): Album[];
    createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    updateAlbumVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void;
    updateAlbumStatus(id: number, status: string): void;
    updateReleaseStatus(id: number, status: string): void;
    updateAlbum(id: number, album: Partial<Album>): void;
    updateAlbumFederationSettings(id: number, publishedToGunDB: boolean, publishedToAP: boolean): void;
    updateAlbumArtist(id: number, artistId: number): void;
    updateAlbumOwner(id: number, ownerId: number): void;
    updateAlbumTitle(id: number, title: string): void;
    updateAlbumCover(id: number, coverPath: string): void;
    updateAlbumGenre(id: number, genre: string | null): void;
    updateAlbumYear(id: number, year: number | string | null): void;
    updateAlbumDownload(id: number, download: string | null): void;
    updateAlbumPrice(id: number, price: number | null, price_usdc: number | null, currency?: 'ETH' | 'USD' | 'USDC' | 'USDT'): void;
    updateAlbumLinks(id: number, links: string | null): void;
    promoteToRelease(id: number): void; // Mark library album as release
    deleteAlbum(id: number, keepTracks?: boolean): void;
    deleteAlbumsBatch(ids: number[], keepTracks?: boolean): void;
    updateAlbumsVisibilityBatch(ids: number[], visibility: Album['visibility']): void;
    searchAlbums(query: string, limit: number, profile?: VisibilityProfile | ViewerContext): Album[];
    addAlbumOwner(aid: number, oid: number): void;

    // Tracks
    getTracks(albumId?: number, profile?: VisibilityProfile | ViewerContext): Track[];
    getTracksByAlbum(albumId: number, profile?: VisibilityProfile | ViewerContext): Track[];
    getTracksByArtist(artistId: number, profile?: VisibilityProfile | ViewerContext, artistName?: string): Track[];
    repairArtistLinks(artistId: number, artistName: string): { tracks: number, albums: number };
    getTracksByOwner(ownerId: number, profile?: VisibilityProfile | ViewerContext): Track[];
    getTrack(id: number): Track | undefined;
    getTracksByIds(ids: number[]): Track[];
    getTrackByPath(path: string): Track | undefined;
    getTracksByPaths(paths: string[]): Track[];
    getTracksByAlbumIds(albumIds: number[]): Track[];
    getRandomTracks(limit: number): Track[];
    createTrack(track: Omit<Track, "id" | "album_title" | "created_at">): number;
    updateTrack(id: number, data: Partial<Track>): void;
    updateTrackPath(id: number, path: string, albumId?: number | null): void;
    updateTrackLosslessPath(id: number, path: string | null): void;
    updateTrackTitle(id: number, title: string): void;
    updateTrackArtist(id: number, artistId: number | null): void;
    updateTrackArtistName(id: number, name: string | null): void;
    updateTrackArtistInfo(id: number, artistId: number | null, name: string | null): void;
    updateTrackAlbum(id: number, albumId: number | null): void;
    updateTracksAlbum(trackIds: number[], albumId: number | null): void;
    updateTrackOrder(id: number, trackNum: number): void;
    updateTrackNumber(id: number, num: number | null): void;
    updateTracksOrder(trackOrders: { id: number, trackNum: number }[]): void;
    updateTrackDuration(id: number, duration: number): void;
    updateTrackBitrate(id: number, bitrate: number): void;
    updateTrackWaveform(id: number, waveform: string): void;
    updateTrackPrice(id: number, price: number | null, price_usdc: number | null, currency?: 'ETH' | 'USD' | 'USDC' | 'USDT'): void;
    updateTrackLyrics(id: number, lyrics: string | null): void;
    updateTrackGenre(id: number, genre: string | null): void;
    updateTrackYear(id: number, year: number | null): void;
    updateTrackExternalArtwork(id: number, url: string | null): void;
    updateTrackService(id: number, service: string | null): void;
    updateTrackUrl(id: number, url: string | null): void;
    updateTrackExternalId(id: number, externalId: string | null): void;
    updateTrackFingerprint(id: number, fingerprint: string): void;
    updateTrackHash(id: number, hash: string): void;
    updateTrackPathsPrefix(oldPrefix: string, newPrefix: string): void;
    getTrackByExternalId(externalId: string): Track | undefined;
    getTrackByFingerprint(fingerprint: string): Track | undefined;
    getTrackByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined;
    getRemoteTracks(): RemoteContent[];
    getRemotePosts(): RemoteContent[];
    getRemoteTrack(idOrSlug: string): RemoteContent | undefined;
    deleteTrack(id: number, ownerId?: number): void;
    deleteTracksBatch(ids: number[]): void;
    getAlbumOwners(albumId: number): number[];
    addTrackOwner(tid: number, oid: number): void;
    updateTrackOwner(id: number, oid: number | null): void;
    getTracksByReleaseId(releaseId: number): Track[];
    getReleasesByTrackId(trackId: number): Release[];
    updateReleaseTrackMetadata(releaseId: number, trackId: number, metadata: Partial<ReleaseTrack>): void;
    getTrackPriceFromRelease(releaseId: number, trackId: number): { price: number, price_usdc: number, currency: string, title: string } | undefined;
    getTracksSummaryByReleaseId(releaseId: number): Track[];
    getTrackByHash(hash: string): Track | undefined;
    mergeTracks(fromId: number, toId: number): void;
    getAllTracks(whereClause?: string, params?: any[]): Track[];
    iterateTracks(whereClause?: string, params?: any[]): IterableIterator<Track>;

    // Playlists
    getPlaylists(username?: string, profile?: VisibilityProfile | ViewerContext): Playlist[];
    getPlaylist(id: number): Playlist | undefined;
    createPlaylist(name: string, username: string, description?: string, isPublic?: boolean): number;
    updatePlaylistVisibility(id: number, isPublic: boolean): void;
    updatePlaylistCover(id: number, coverPath: string | null): void;
    deletePlaylist(id: number): void;
    getPlaylistTracks(playlistId: number): Track[];
    isTrackInPublicPlaylist(trackId: number): boolean;
    addTrackToPlaylist(playlistId: number, trackId: number): void;
    removeTrackFromPlaylist(playlistId: number, trackId: number): void;

    // Starred / Social
    starItem(user: string, type: 'track' | 'album' | 'artist', id: string): void;
    unstarItem(user: string, type: 'track' | 'album' | 'artist', id: string): void;
    starItems(user: string, items: { type: 'track' | 'album' | 'artist', id: string }[]): void;
    unstarItems(user: string, items: { type: 'track' | 'album' | 'artist', id: string }[]): void;
    getStarredItems(user: string, type?: 'track' | 'album' | 'artist'): any[];
    isStarred(user: string, type: 'track' | 'album' | 'artist', id: string): boolean;
    setItemRating(user: string, type: 'track' | 'album' | 'artist', id: string, rating: number): void;
    getItemRating(user: string, type: 'track' | 'album' | 'artist', id: string): number;
    getItemRatings(user: string, type: 'track' | 'album' | 'artist'): Map<string, number>;
    addLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void;
    removeLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void;
    getLikesCount(objectType: 'album' | 'track' | 'post', objectId: number): number;
    hasLiked(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): boolean;
    recordPlay(trackId: number, playedAt?: string): void;
    getRecentPlays(limit?: number): PlayHistoryEntry[];
    getTopTracks(limit?: number, days?: number, filter?: 'all' | 'library' | 'releases'): TrackWithPlayCount[];
    getTopArtists(limit?: number, days?: number, filter?: 'all' | 'library' | 'releases'): ArtistWithPlayCount[];
    savePlayQueue(username: string, trackIds: string[], current: string | null, positionMs: number): void;
    getPlayQueue(username: string): { trackIds: string[], current: string | null, positionMs: number };

    // Bookmarks
    createBookmark(user: string, id: string, pos: number, comment?: string): void;
    getBookmarks(user: string): any[];
    getBookmark(user: string, id: string): any | undefined;
    deleteBookmark(user: string, id: string): void;

    // Posts
    getPostsByArtist(artistId: number, profile?: VisibilityProfile | ViewerContext): Post[];
    getPublicPosts(): Post[];
    getPost(id: number): Post | undefined;
    getPostBySlug(slug: string): Post | undefined;
    createPost(artistId: number, content: string, visibility?: 'public' | 'private' | 'unlisted', title?: string | null, summary?: string | null): number;
    updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted', title?: string | null, summary?: string | null): void;
    updatePostVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void;
    deletePost(id: number): void;

    // Assets
    getPublicAssets(): any[];
    getAssetsByArtist(artistId: number): any[];
    getAllAssets(): any[];
    getAsset(id: number): any | undefined;
    getAssetBySlug(slug: string): any | undefined;
    createAsset(data: any): number;
    updateAsset(id: number, data: any): void;
    deleteAsset(id: number): void;

    // Stats
    getStats(artistId?: number, ownerId?: number): Promise<{ artists: number; albums: number; tracks: number; publicAlbums: number; totalUsers: number; storageUsed: number; networkSites: number; totalTracks: number; genresCount: number; genres: string[] }>;
    getPublicTracksCount(): number;
    getGenres(profile?: VisibilityProfile | ViewerContext): string[];
    getTracksByGenre(genre: string, profile?: VisibilityProfile | ViewerContext): Track[];
    getGenreTrackCounts(profile?: VisibilityProfile | ViewerContext): Map<string, number>;
    getListeningStats(): ListeningStats;

    // ActivityPub Metadata
    createApNote(artistId: number, noteId: string, noteType: 'post' | 'release', contentId: number, contentSlug: string, contentTitle: string): number;
    getApNotes(artistId: number, includeDeleted?: boolean): ApNote[];
    getApNote(noteId: string): ApNote | undefined;
    markApNoteDeleted(noteId: string): void;
    deleteApNote(noteId: string): void;

    // Remote Content (Fedify/AP)
    getRemoteActor(uri: string): RemoteActor | undefined;
    getRemoteActors(): RemoteActor[];
    getFollowedActors(): RemoteActor[];
    upsertRemoteActor(actor: any): void;
    upsertRemoteContent(content: any): void;
    getRemoteContent(apId: string): RemoteContent | undefined;
    saveRemoteActor(actor: any): void;
    saveRemotePost(post: any): void;
    deleteRemotePost(apId: string): void;
    deleteRemoteContent(apId: string): void;

    // Unlock Codes
    createUnlockCode(code: string, releaseId?: number, trackId?: number, txHash?: string, assetId?: number): void;
    validateUnlockCode(code: string): { valid: boolean; releaseId?: number; trackId?: number; assetId?: number; isUsed: boolean };
    redeemUnlockCode(code: string): void;
    listUnlockCodes(releaseId?: number): any[];
    getUnlockCodeByTxHash(txHash: string): any | undefined;

    // Storage
    getStorageAccounts(userId?: number): StorageAccount[];
    getStorageAccount(id: number): StorageAccount | undefined;
    getStorageAccountByProvider(userId: number, provider: string): StorageAccount | undefined;
    createStorageAccount(account: Omit<StorageAccount, "id" | "created_at">): number;
    updateStorageAccount(id: number, account: Partial<StorageAccount>): void;
    deleteStorageAccount(id: number): void;
    getPrimaryAdminId(): number | null;

    // Soulseek
    createSoulseekDownload(download: Partial<SoulseekDownload>): number;
    updateSoulseekDownloadProgress(id: number, progress: number, status?: string, filePath?: string): void;
    getSoulseekDownloads(userId?: number): SoulseekDownload[];
    getSoulseekDownload(id: number): SoulseekDownload | undefined;
    getUserSoulseekCredentials(userId: number): { username?: string, password_encrypted?: string } | undefined;
    updateUserSoulseekCredentials(userId: number, username?: string, password?: string): void;
    clearFailedSoulseekDownloads(userId: number): void;
    deleteSoulseekDownload(id: number): void;

    // Torrent
    getTorrents(): Torrent[];
    getTorrent(hash: string): Torrent | undefined;
    getTorrentsStatus(): any[];
    createTorrent(torrent: Partial<Torrent>): void;
    updateTorrentProgress(infoHash: string, progress: number, status: Torrent['status'], downloadSpeed: number, uploadSpeed: number, numPeers: number, size: number, path: string | null): void;
    updateTorrentStatus(infoHash: string, status: Torrent['status']): void;
    deleteTorrent(hash: string): void;

    // Gun Cache
    getGunCache(key: string): GunCacheEntry | undefined;
    setGunCache(key: string, value: string, type: string, ttl: number): void;
    clearExpiredGunCache(): void;

    // Settings
    getSetting(key: string): string | undefined;
    setSetting(key: string, value: string): void;
    getAllSettings(): { [key: string]: string };

    // Plugins
    getPluginState(id: string): { enabled: boolean; config: string | null } | undefined;
    setPluginEnabled(id: string, enabled: boolean): void;
    setPluginConfig(id: string, config: string): void;
    getAllPluginsState(): any[];

    // Search
    search(query: string, profile?: VisibilityProfile | ViewerContext): { artists: Artist[]; albums: Album[]; tracks: Track[] };

    // Maintenance
    getTracksMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist' | 'external'): Track[];
    getAlbumsMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'description' | 'artist'): Album[];
    getArtistsMissingMetadata(filter: 'photo'): Artist[];
}
