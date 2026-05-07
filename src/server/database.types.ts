/**
 * Database Types — Extracted from database.ts for better modularity.
 * All domain model interfaces used across the server codebase.
 */
import type { Database as DatabaseType } from "better-sqlite3";

export interface OAuthClient {
    instance_url: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    created_at: string;
}

export interface OAuthLink {
    provider: string; // 'mastodon'
    subject: string;  // @user@instance.social
    gun_pub: string;
    gun_priv: string; // Encrypted SEA pair
    created_at: string;
}

export interface Artist {
    id: number;
    name: string;
    slug: string;
    bio: string | null;
    photo_path: string | null;
    links: string | null;  // JSON string of links
    post_params: string | null; // JSON string of ActivityPub/Mastodon config
    public_key: string | null;
    private_key: string | null;
    wallet_address: string | null;
    walletAddress?: string | null; // Added for frontend compatibility
    isLibraryArtist?: number; // 1 if metadata-only, 0 if user/release artist
    visibility?: 'public' | 'private' | 'unlisted';
    created_at: string;
}

export interface Follower {
    id: number;
    artist_id: number;
    actor_uri: string;
    inbox_uri: string;
    shared_inbox_uri: string | null;
    created_at: string;
}

export interface LikeEntry {
    id: number;
    remote_actor_fid: string;
    object_type: 'album' | 'track' | 'post';
    object_id: number;
    created_at: string;
}

export interface Album {
    id: number;
    title: string;
    slug: string;
    artist_id: number | null;
    owner_id: number | null;
    artist_name?: string;
    artist_slug?: string;
    date: string | null;
    cover_path: string | null;
    genre: string | null;
    description: string | null;
    type: 'album' | 'single' | 'ep' | null;
    year: number | null;
    download: string | null;
    price: number | null;
    price_usdc: number | null;
    price_usdt?: number | null;
    currency: 'ETH' | 'USD';
    external_links: string | null; // JSON string of ExternalLink[]
    is_public: boolean;
    visibility: 'public' | 'private' | 'unlisted';
    license?: string | null; // e.g. 'cc-by'
    is_release: boolean; // true = published release, false = library album
    status: 'draft' | 'pending' | 'approved' | 'awaiting_finalization' | 'released';
    published_to_gundb: boolean;
    published_to_ap: boolean;
    published_at: string | null;
    use_nft?: boolean | number;
    walletAddress?: string;
    created_at: string;
}

export interface Track {
    id: number;
    title: string;
    album_id: number | null;
    album_title?: string;
    album_download?: string;
    album_visibility?: string;
    artist_id: number | null;
    owner_id: number | null;
    owner_name?: string;
    artist_name?: string;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    format: string | null;
    bitrate: number | null;
    sample_rate: number | null;
    price: number | null;
    price_usdc: number | null;
    price_usdt?: number | null;
    currency: 'ETH' | 'USD';
    album_price?: number | null;
    album_price_usdc?: number | null;
    lossless_path: string | null;
    waveform: string | null; // JSON string of number[]
    url: string | null;
    service: string | null;
    external_artwork: string | null;
    lyrics?: string | null;
    hash?: string | null;
    external_id?: string | null;
    created_at: string;
    year?: number;
    genre?: string;
}

export interface Release {
    id: number;
    title: string;
    slug: string;
    artist_id: number | null;
    owner_id: number | null;
    artist_name?: string;
    artist_slug?: string;
    date: string | null;
    cover_path: string | null;
    genre: string | null;
    description: string | null;
    type: 'album' | 'single' | 'ep' | null;
    year: number | null;
    download: string | null;
    price: number | null;
    price_usdc: number | null;
    price_usdt?: number | null;
    currency: 'ETH' | 'USD';
    external_links: string | null;
    visibility: 'public' | 'private' | 'unlisted';
    status: 'draft' | 'pending' | 'approved' | 'awaiting_finalization' | 'released';
    published_at: string | null;
    published_to_gundb: boolean;
    published_to_ap: boolean;
    license?: string | null;
    use_nft?: number;
    created_at: string;
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
    price: number | null;
    price_usdc: number | null;
    price_usdt?: number | null;
    currency: 'ETH' | 'USD';
    created_at: string;
}

export interface Playlist {
    id: number;
    name: string;
    username: string;
    description: string | null;
    isPublic: boolean;
    coverPath: string | null;
    created_at: string;
}

export interface PlayHistoryEntry {
    id: number;
    track_id: number;
    track_title: string;
    artist_name: string | null;
    album_title: string | null;
    played_at: string;
}

export interface Post {
    id: number;
    artist_id: number;
    artist_name?: string;
    artist_slug?: string;
    artist_photo?: string;
    content: string;
    slug: string;
    visibility: 'public' | 'private' | 'unlisted';
    published_at?: string;
    created_at: string;
}

export interface ApNote {
    id: number;
    artist_id: number;
    note_id: string;
    note_type: 'post' | 'release';
    content_id: number;
    content_slug: string;
    content_title: string;
    published_at: string;
    deleted_at: string | null;
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

export interface TrackWithPlayCount extends Track {
    play_count: number;
}

export interface ArtistWithPlayCount extends Artist {
    play_count: number;
}

export interface ListeningStats {
    totalPlays: number;
    totalListeningTime: number;
    uniqueTracks: number;
    playsToday: number;
    playsThisWeek: number;
    playsThisMonth: number;
}

export interface GunCacheEntry {
    key: string;
    value: string;
    type: string;
    expires_at: number;
}

export interface Torrent {
    info_hash: string;
    name: string;
    magnet_uri: string;
    owner_id: number | null;
    added_at: string;
}

export interface TorrentStatus {
    infoHash: string;
    name: string;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    numPeers: number;
    received: number;
    uploaded: number;
    size: number;
    path: string;
    timeRemaining: number;
    done: boolean;
    files: Array<{
        name: string;
        path: string;
        progress: number;
        length: number;
        downloaded: number;
    }>;
}

export interface SoulseekDownload {
    id: number;
    user_id: number;
    file_path: string;
    filename: string;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
    progress: number;
    added_at: string;
}

export interface TrackDTO extends Track {
    albumId: number | null;
    artistId: number | null;
    losslessPath: string | null;
    externalArtwork: string | null;
    albumName?: string;
    albumDownload?: string;
    albumVisibility?: string;
    albumPrice?: number | null;
    artistName?: string;
    path: string | null;
    filename?: string;
    coverUrl: string | null;
    starred: boolean;
    rating: number;
}

export interface AlbumDTO extends Album {
    coverImage: string | null;
    tracks?: TrackDTO[];
    starred: boolean;
    rating: number;
}

export interface DatabaseService {
    db: DatabaseType;
    // Torrents
    getTorrents(): Torrent[];
    getTorrent(infoHash: string): Torrent | undefined;
    createTorrent(torrent: Omit<Torrent, "added_at">): void;
    deleteTorrent(infoHash: string): void;

    // Artists
    getArtists(): Artist[];
    getArtist(id: number): Artist | undefined;
    getArtistsByIds(ids: number[]): Artist[];
    getArtistByName(name: string): Artist | undefined;
    getArtistBySlug(slug: string): Artist | undefined;
    createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted'): number;
    updateArtist(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted'): void;
    updateArtistKeys(id: number, publicKey: string, privateKey: string): void;
    deleteArtist(id: number): void;
    // Followers
    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void;
    removeFollower(artistId: number, actorUri: string): void;
    getFollowers(artistId: number): Follower[];
    getFollower(artistId: number, actorUri: string): Follower | undefined;
    // Releases (New watertight compartment)
    getReleases(publicOnly?: boolean): Release[];
    getRelease(id: number): Release | undefined;
    getReleaseBySlug(slug: string): Release | undefined;
    getReleasesByArtist(artistId: number, publicOnly?: boolean): Release[];
    getReleasesByOwner(ownerId: number, publicOnly?: boolean): Release[];
    createRelease(release: Omit<Release, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    updateRelease(id: number, release: Partial<Release>): void;
    getRecentReleaseByMetadata(title: string, artistId: number | null, seconds: number): Release | undefined;
    deleteRelease(id: number): void;
    
    // Release Tracks
    getReleaseTracks(releaseId: number): ReleaseTrack[];
    getReleaseTrackIds(releaseId: number): number[];
    getReleaseTrack(id: number): ReleaseTrack | undefined;
    addTrackToRelease(releaseId: number, trackId: number, metadata?: Partial<ReleaseTrack>): number;
    updateReleaseTrack(id: number, metadata: Partial<ReleaseTrack>): void;
    updateReleaseTrackMetadata(releaseId: number, trackId: number, metadata: Partial<ReleaseTrack>): void;
    removeTrackFromRelease(releaseId: number, trackId: number): void; // Old version by IDs
    removeTracksFromRelease(releaseId: number, trackIds: number[]): void;
    deleteReleaseTrack(id: number): void; // New version by record ID
    updateReleaseTracksOrder(releaseId: number, trackIds: number[]): void;
    syncReleaseTracks(releaseId: number, trackIds: number[]): void;
    cleanUpGhostTracks(releaseId: number): void;
    transaction<T>(fn: () => T): () => T;


    // Legacy/Library Albums
    getAlbums(publicOnly?: boolean): Album[];
    getAlbumsWithStats(publicOnly?: boolean): (Album & { songCount: number; duration: number })[];
    getLibraryAlbums(): Album[]; // is_release=0
    getAlbum(id: number): Album | undefined;
    getAlbumsByIds(ids: number[]): Album[];
    getAlbumBySlug(slug: string): Album | undefined;
    getAlbumByTitle(title: string, artistId?: number): Album | undefined;
    getArtistAlbumCounts(): { artist_id: number, count: number }[];
    getAlbumsByArtist(artistId: number, publicOnly?: boolean, artistName?: string): Album[];
    getArtistCovers(artistId: number): string[];
    getAlbumsByOwner(ownerId: number, publicOnly?: boolean): Album[];
    createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    updateAlbumVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void;
    updateAlbumStatus(id: number, status: Album['status']): void;
    updateReleaseStatus(id: number, status: Release['status']): void;
    updateAlbum(id: number, album: Partial<Album>): void;
    updateAlbumFederationSettings(id: number, publishedToGunDB: boolean, publishedToAP: boolean): void;
    updateAlbumArtist(id: number, artistId: number): void;
    updateAlbumOwner(id: number, ownerId: number): void;
    updateAlbumTitle(id: number, title: string): void;
    updateAlbumCover(id: number, coverPath: string): void;
    updateAlbumGenre(id: number, genre: string | null): void;
    updateAlbumYear(id: number, year: number | string | null): void;
    updateAlbumDownload(id: number, download: string | null): void;
    updateAlbumPrice(id: number, price: number | null, price_usdc: number | null, currency?: 'ETH' | 'USD'): void;
    updateAlbumLinks(id: number, links: string | null): void;
    promoteToRelease(id: number): void; // Mark library album as release
    deleteAlbum(id: number, keepTracks?: boolean): void;
    searchAlbums(query: string, limit: number, publicOnly?: boolean): Album[];
    // Tracks
    getTracks(albumId?: number, publicOnly?: boolean): Track[];
    getTracksByAlbum(albumId: number, publicOnly?: boolean): Track[];
    getTracksByArtist(artistId: number, publicOnly?: boolean, artistName?: string): Track[];
    repairArtistLinks(artistId: number, artistName: string): { tracks: number, albums: number };
    getTracksByOwner(ownerId: number, publicOnly?: boolean): Track[];
    getTracksByAlbumIds(albumIds: number[]): Track[];
    getRandomTracks(limit: number): Track[];
    getTracksByReleaseId(releaseId: number): Track[];
    getTrack(id: number): Track | undefined;
    getTracksByIds(ids: number[]): Track[];
    getTrackByPath(filePath: string): Track | undefined;
    createTrack(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number;
    updateTrackAlbum(id: number, albumId: number | null): void;
    updateTracksAlbum(trackIds: number[], albumId: number | null): void;
    updateTrackOrder(id: number, trackNum: number): void;
    updateTrackNumber(id: number, trackNum: number): void;
    updateTracksOrder(trackOrders: { id: number, trackNum: number }[]): void;
    updateTrackArtist(id: number, artistId: number | null): void;
    updateTrackArtistName(id: number, artistName: string | null): void;
    updateTrackOwner(id: number, ownerId: number | null): void;
    getTrackByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined;
    updateTrackTitle(id: number, title: string): void;
    updateTrackPath(id: number, filePath: string, albumId: number | null): void;
    updateTrackPrice(id: number, price: number | null, price_usdc: number | null, currency?: 'ETH' | 'USD'): void;
    updateTrackDuration(id: number, duration: number): void;
    updateTrackBitrate(id: number, bitrate: number): void;
    updateTrackWaveform(id: number, waveform: string): void;
    updateTrackLosslessPath(id: number, losslessPath: string | null): void;
    updateTrackExternalArtwork(id: number, artworkPath: string | null): void;
    updateTrackLyrics(id: number, lyrics: string | null): void;
    updateTrackGenre(id: number, genre: string | null): void;
    updateTrackYear(id: number, year: number | null): void;
    updateTrackPathsPrefix(oldPrefix: string, newPrefix: string): void;
    deleteTrack(id: number, owner_id?: number): void;
    mergeTracks(fromId: number, toId: number): void;
    iterateTracks(whereClause?: string, params?: any[]): IterableIterator<Track>;
    getAllTracks(whereClause?: string, params?: any[]): Track[];
    getTracksSummaryByReleaseId(releaseId: number): Track[];

    // Ownership & Deduplication
    addTrackOwner(trackId: number, ownerId: number): void;
    removeTrackOwner(trackId: number, ownerId: number): void;
    addAlbumOwner(albumId: number, ownerId: number): void;
    removeAlbumOwner(albumId: number, ownerId: number): void;
    getTrackByHash(hash: string): Track | undefined;
    getTrackOwners(trackId: number): number[];
    getAlbumOwners(albumId: number): number[];

    // Playlists
    getPlaylists(username?: string, publicOnly?: boolean): Playlist[];
    getPlaylist(id: number): Playlist | undefined;
    createPlaylist(name: string, username: string, description?: string, isPublic?: boolean): number;
    updatePlaylistVisibility(id: number, isPublic: boolean): void;
    updatePlaylistCover(id: number, coverPath: string | null): void;
    deletePlaylist(id: number): void;
    getPlaylistTracks(playlistId: number): Track[];
    isTrackInPublicPlaylist(trackId: number): boolean;
    addTrackToPlaylist(playlistId: number, trackId: number): void;
    removeTrackFromPlaylist(playlistId: number, trackId: number): void;
    // Posts
    getPostsByArtist(artistId: number, publicOnly?: boolean): Post[];
    getPublicPosts(): Post[];
    getPost(id: number): Post | undefined;
    getPostBySlug(slug: string): Post | undefined;
    createPost(artistId: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): number;
    updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void;
    updatePostVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void;
    deletePost(id: number): void;
    // Stats
    getStats(artistId?: number, ownerId?: number): Promise<{ artists: number; albums: number; tracks: number; publicAlbums: number; totalUsers: number; storageUsed: number; networkSites: number; totalTracks: number; genresCount: number; genres: string[] }>;
    getPublicTracksCount(): number;
    getGenres(publicOnly?: boolean): string[];
    getTracksByGenre(genre: string, publicOnly?: boolean): Track[];
    getGenreTrackCounts(publicOnly?: boolean): Map<string, number>;
    // Play History
    recordPlay(trackId: number, playedAt?: string): void;
    getRecentPlays(limit?: number): PlayHistoryEntry[];
    getTopTracks(limit?: number, days?: number, filter?: 'all' | 'library' | 'releases'): TrackWithPlayCount[];
    getTopArtists(limit?: number, days?: number, filter?: 'all' | 'library' | 'releases'): ArtistWithPlayCount[];
    getPrimaryAdminId(): number | null;
    getTracksMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album'): Track[];
    getArtistsMissingMetadata(filter: 'photo'): Artist[];
    getListeningStats(): ListeningStats;
    // Search
    search(query: string, publicOnly?: boolean): { artists: Artist[]; albums: Album[]; tracks: Track[] };
    // Settings
    getSetting(key: string): string | undefined;
    setSetting(key: string, value: string): void;
    getAllSettings(): { [key: string]: string };

    // Unlock Codes
    createUnlockCode(code: string, releaseId?: number): void;
    validateUnlockCode(code: string): { valid: boolean; releaseId?: number; isUsed: boolean };
    redeemUnlockCode(code: string): void;
    listUnlockCodes(releaseId?: number): any[];

    // ActivityPub Notes
    createApNote(artistId: number, noteId: string, noteType: 'post' | 'release', contentId: number, contentSlug: string, contentTitle: string): number;
    getApNotes(artistId: number, includeDeleted?: boolean): ApNote[];
    getApNote(noteId: string): ApNote | undefined;
    markApNoteDeleted(noteId: string): void;
    deleteApNote(noteId: string): void;
    // Zen Users
    syncZenUser(pub: string, epub: string, alias: string, avatar?: string): void;
    getZenUser(pub: string): { pub: string; epub: string; alias: string } | undefined;

    // Remote Federation (ActivityPub)
    upsertRemoteActor(actor: Omit<RemoteActor, "id" | "last_seen" | "is_followed" | "public_key"> & { is_followed?: boolean, public_key?: string | null }): void;
    saveRemoteActor(actor: any): void; // More flexible version
    getRemoteActor(uri: string): RemoteActor | undefined;
    getRemoteActors(): RemoteActor[];
    getFollowedActors(): RemoteActor[];
    unfollowActor(uri: string): void;
    
    upsertRemoteContent(content: Omit<RemoteContent, "id" | "received_at">): void;
    getRemoteContent(apId: string): RemoteContent | undefined;
    getRemoteTracks(): RemoteContent[];
    getRemotePosts(): RemoteContent[];
    getRemoteTrack(apIdOrSlug: string): RemoteContent | undefined;
    saveRemotePost(post: any): void;
    deleteRemotePost(apId: string): void;
    deleteRemoteContent(apId: string): void;

    // Likes
    addLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void;
    removeLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void;
    getLikesCount(objectType: 'album' | 'track' | 'post', objectId: number): number;
    hasLiked(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): boolean;

    // OAuth
    getOAuthClient(instanceUrl: string): OAuthClient | undefined;
    saveOAuthClient(client: Omit<OAuthClient, "created_at">): void;

    getOAuthLink(provider: string, subject: string): OAuthLink | undefined;
    createOAuthLink(provider: string, subject: string, gunPub: string, gunPriv: string): void;

    // Starred Items (Subsonic)
    starItem(username: string, itemType: string, itemId: string): void;
    starItems(username: string, items: { type: string; id: string }[]): void;
    unstarItem(username: string, itemType: string, itemId: string): void;
    unstarItems(username: string, items: { type: string; id: string }[]): void;
    getStarredItems(username: string, itemType?: string): { item_type: string; item_id: string; created_at: string }[];
    isStarred(username: string, itemType: string, itemId: string): boolean;

    // Play Queue (Subsonic)
    savePlayQueue(username: string, trackIds: string[], current: string | null, positionMs: number): void;
    getPlayQueue(username: string): { trackIds: string[], current: string | null, positionMs: number };

    // Ratings & Bookmarks
    setItemRating(username: string, itemType: string, itemId: string, rating: number): void;
    getItemRating(username: string, itemType: string, itemId: string): number;
    getItemRatings(username: string, itemType: string): Map<string, number>;
    createBookmark(username: string, trackId: string, positionMs: number, comment?: string): void;
    getBookmarks(username: string): any[];
    deleteBookmark(username: string, trackId: string): void;
    getBookmark(username: string, trackId: string): any | undefined;

    // Zen Cache
    getGunCache(key: string): GunCacheEntry | undefined;
    setGunCache(key: string, value: string, type: string, ttlSeconds: number): void;
    clearExpiredGunCache(): void;

    // Soulseek
    updateUserSoulseekCredentials(userId: number, username: string, password_encrypted: string): void;
    getUserSoulseekCredentials(userId: number): { username: string, password_encrypted: string } | undefined;
    createSoulseekDownload(download: Omit<SoulseekDownload, "id" | "added_at" | "progress">): number;
    updateSoulseekDownloadProgress(id: number, progress: number, status?: SoulseekDownload['status'], filePath?: string): void;
    getSoulseekDownloads(userId?: number): SoulseekDownload[];
    getSoulseekDownload(id: number): SoulseekDownload | undefined;
    deleteSoulseekDownload(id: number): void;
    clearFailedSoulseekDownloads(userId: number): void;

    // ActivityPub Authorization
    isArtistLinkedToUser(artistId: number): boolean;
    isArtistLinkedToUserBySlug(slug: string): boolean;
    consolidateDatabase(): void;
}
