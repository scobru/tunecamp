export interface Track {
    id: string | number;
    title: string;
    artistId: string | number;
    artistName?: string;
    artist_name?: string;
    albumId: string | number;
    albumName?: string;
    album_title?: string;
    albumDownload?: string;
    albumVisibility?: string;
    albumPrice?: number;
    duration: number;
    path: string;
    file_path?: string;
    filename: string;
    format?: string;
    codec?: string;
    bitrate?: number;
    size?: number;
    losslessPath?: string;
    lossless_path?: string;
    playCount: number;
    liked?: boolean;
    starred?: boolean;
    rating?: number;
    coverImage?: string; // helpers
    waveform?: number[] | string;
    lyrics?: string;
    streamUrl?: string; // For remote/network tracks
    coverUrl?: string; // For remote/network tracks
    walletAddress?: string;
    price?: number;
    priceUsdc?: number;
    price_usdc?: number;
    currency?: 'ETH' | 'USD';
    track_num?: number;
    external_id?: string;
    hash?: string;
    owner_id?: number | string;
    owner_name?: string;
    ownerName?: string;
    created_at?: string;
    genre?: string;
    external_artwork?: string;
    year?: number;
    description?: string;
    podcast_episode_num?: number;
    podcast_season_num?: number;
    podcast_episode_type?: string;
}

interface ReleaseTrack {
    id: number;
    release_id: number;
    track_id: number | null;
    title: string;
    artist_name: string | null;
    track_num: number | null;
    duration: number | null;
    file_path: string | null;
    price: number | null;
    priceUsdc?: number | null;
    price_usdc?: number | null;
    currency: 'ETH' | 'USD';
    created_at: string;
}

export interface Release {
    id: string | number;
    title: string;
    slug: string;
    artistId?: string | number;
    artist_id?: string | number;
    artistName?: string;
    artist_name?: string;
    artistSlug?: string;
    artist_slug?: string;
    coverPath?: string;
    cover_path?: string;
    date?: string;
    description?: string;
    genre?: string;
    type?: 'album' | 'single' | 'ep';
    year?: number;
    download?: 'free' | 'paid' | 'codes';
    price?: number;
    priceUsdc?: number;
    price_usdc?: number;
    currency?: 'ETH' | 'USD';
    external_links?: string;
    visibility: 'public' | 'private' | 'unlisted';
    published_at?: string;
    published_to_zen?: boolean;
    published_to_ap?: boolean;
    use_nft?: boolean;
    useNft?: boolean;
    license?: string;
    track_ids?: (string | number)[];
    tracks?: Track[]; // Compat with existing code
    product_type?: 'music' | 'podcast';
    podcast_author?: string;
    podcast_email?: string;
    podcast_category?: string;
    podcast_explicit?: boolean | number;
    release_tracks?: ReleaseTrack[];
    downloadCount?: number;
    unlockCodeCount?: number;
    starred?: boolean;
    rating?: number;
}

export interface Artist {
    id: string | number;
    name: string;
    slug?: string;
    description?: string;
    bio?: string;
    coverImage?: string;
    postParams?: any; // ActivityPub actor
    albums?: Album[];
    releases?: Release[];
    tracks?: Track[];
    links?: ArtistLink[];
    donationLinks?: ArtistLink[];
    walletAddress?: string;
    isLibraryArtist?: boolean;
    isReleasing?: boolean;
    starred?: boolean;
    rating?: number;
}

export interface ArtistLink {
    platform: string;
    url: string;
    type: 'social' | 'support' | 'music';
}

export interface Album {
    id: string | number;
    title: string;
    artistId: string | number;
    artistName?: string;
    artistSlug?: string; // camelCase (if mapped)
    artist_slug?: string; // snake_case (from DB)
    artist_name?: string; // snake_case (from DB)
    coverImage?: string;
    year?: number;
    tracks?: Track[];
    track_ids?: (string | number)[];
    type: 'album' | 'single' | 'ep';
    slug?: string;
    description?: string;
    license?: string;
    is_release?: boolean;
    is_formal_release?: boolean;
    download?: 'free' | 'paid' | 'codes';
    external_links?: string; // JSON string
    price?: number;
    priceUsdc?: number;
    price_usdc?: number;
    walletAddress?: string;
    starred?: boolean;
    rating?: number;
    owner_id?: number | string;
    artist_id?: string | number;
    visibility?: 'public' | 'private' | 'unlisted';
    status?: string;
}

export interface Playlist {
    id: string | number;
    name: string;
    description?: string;
    username: string;
    isPublic: boolean;
    coverPath?: string;
    tracks?: Track[];
    trackCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface User {
    id: string;
    username: string;
    isAdmin: boolean;
    isRootAdmin?: boolean;
    artistId?: string;
    userId?: number;
    mustChangePassword?: boolean;
    isActive?: boolean;
    alias?: string | null;
    avatar?: string | null;
}

export interface AuthStatus {
    authenticated: boolean;
    username?: string;
    user?: User;
    role?: string;
    artistId?: string | number;
    userId?: number;
    isRootAdmin?: boolean;
    firstRun?: boolean;
    mustChangePassword?: boolean;
    pair?: any; // Added Zen identity pair
    isActive?: boolean;
}

export interface SiteSettings {
    siteName: string;
    siteDescription?: string;
    siteLogo?: string;
    coverImage?: string;
    publicUrl?: string;
    allowPublicRegistration?: boolean;
    backgroundImage?: string;
    themeFont?: string;
    communityLink?: string;
    themeBlur?: string;
    themeOverlayOpacity?: string | number;
    donationLinks?: ArtistLink[];
    zenPeers?: string;
    gunPeers?: string;
    web3Enabled?: boolean | string;
    web3_checkout_address?: string;
    web3_nft_address?: string;
    telegram_bot_token?: string;
    telegram_allowed_channels?: string;
    adminFeePercentage?: string | number;
    adminTreasuryAddress?: string;
    soulseek_username?: string;
    soulseek_password?: string;
    openrouter_api_key?: string;
    openrouter_model?: string;
    stripe_secret_key?: string;
    stripe_webhook_secret?: string;
    discogs_token?: string;
    jwtSecret?: string;
    lastfm_api_key?: string;
    lastfm_session_key?: string;
    listenbrainz_token?: string;
    google_drive_client_id?: string;
    google_drive_client_secret?: string;
}

export interface Post {
    id: string;
    slug: string;
    title?: string;
    summary?: string;
    content: string; // HTML/Markdown
    artistId: string;
    artistName?: string;
    artistAvatar?: string;
    createdAt: string;
    publishedAt?: string;
    updatedAt: string;
    isPublic: boolean;
    visibility?: 'public' | 'private' | 'unlisted';
}

export interface UnlockCode {
    code: string;
    releaseId: string;
    isRedeemed: boolean;
    isUsed?: boolean;      // Alias for isRedeemed
    is_used?: number;      // DB field alias
    redeemedAt?: string;
    createdAt: string;
}

export interface Asset {
    id: number;
    title: string;
    slug: string;
    description?: string;
    artistId?: number;
    artist_id?: number;
    artistName?: string;
    artist_name?: string;
    ownerId?: number;
    owner_id?: number;
    type: 'digital' | 'video' | 'membership';
    filePath?: string;
    file_path?: string;
    mimeType?: string;
    mime_type?: string;
    fileSize?: number;
    file_size?: number;
    coverPath?: string;
    cover_path?: string;
    price?: number;
    priceUsdc?: number;
    price_usdc?: number;
    currency?: string;
    visibility: 'public' | 'private' | 'unlisted';
    requiresSubscription?: boolean;
    requires_subscription?: number | boolean;
    createdAt?: string;
    created_at?: string;
}

export interface NetworkSite {
    url: string;
    name: string;
    description: string;
    version: string;
    lastSeen: string;
    coverImage?: string;
    federation?: 'zen' | 'activitypub' | 'local' | 'http';
}

export interface NetworkTrack {
    track: Track;
    siteName: string;
    siteUrl: string;
    federation?: 'zen' | 'activitypub' | 'local' | 'http';
    // For ActivityPub/Local tracks/posts (flattened structure)
    type?: 'release' | 'post';
    audioUrl?: string;
    title?: string;
    artistName?: string;
    slug?: string;
    content?: string;
    duration?: number;
    coverUrl?: string;
    releaseTitle?: string;
    published_at?: string;
}

export interface AdminStats {
    totalUsers: number;
    totalArtists?: number; // Optional as backend uses 'artists'
    artists?: number;
    totalAlbums?: number; // Optional as backend uses 'albums'
    albums?: number;
    totalTracks: number;
    tracks?: number;
    publicAlbums?: number;
    storageUsed: number;
    networkSites: number;
    genresCount?: number;
    genres?: string[];
}


export interface UserPlaylistTrack {
    id: string;
    title: string;
    artistName: string;
    source: 'tunecamp' | 'network';
    siteUrl?: string;      // For network tracks
    siteName?: string;     // For network tracks
    streamUrl?: string;    // Direct stream URL
    coverUrl?: string;
    albumName?: string;
    albumId?: string;
    duration?: number;
    addedAt: number;
    // Original TuneCamp track ID (for reference, if from tunecamp)
    tunecampTrackId?: string;
}

export interface UserPlaylist {
    id: string;
    name: string;
    description?: string;
    coverUrl?: string;
    ownerPub: string;
    ownerAlias: string;
    isPublic?: boolean;
    createdAt: number;
    updatedAt: number;
    tracks: UserPlaylistTrack[];
    trackCount: number;
}

export interface NetworkStatus {
    sites: number;
    tracks: number;
    lastUpdate: string;
    zen?: {
        connected: boolean;
        peers: number;
    };
    activitypub?: {
        enabled: boolean;
    };
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

export interface TorrentSearchResult {
    title: string;
    time?: string;
    size: string;
    seeds: number;
    peers: number;
    magnet?: string;
    desc?: string;
    provider: string;
    searchProviderId?: string;
}

export interface GoogleDriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    parents?: string[];
    isImported?: boolean;
}


// --- Dig (crate-digging) ---
export type DigStrategy = 'fast' | 'balanced' | 'deep';

export interface DigSearchResult {
    id: string;
    title: string;
    artist: string;
    url: string;
    coverUrl: string;
    source: string;
}

export interface RankedRelease {
    tralbumId: number;
    title: string;
    artist: string;
    url: string;
    coverUrl: string;
    previewUrl: string | null;
    score: number;
    alsoCollectedCount: number;
}

export interface DigResult {
    seed: { title: string; artist: string; url: string; coverUrl: string };
    strategy: DigStrategy;
    collectorsSampled: number;
    results: RankedRelease[];
}

export interface DigSession {
    id: number;
    user_id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface DigCrateItem {
    id: number;
    session_id: number;
    source: string;
    source_url: string;
    title: string | null;
    artist: string | null;
    cover_url: string | null;
    preview_url: string | null;
    bpm: number | null;
    added_at: string;
}

export interface DigCrateInput {
    source?: string;
    sourceUrl: string;
    title?: string;
    artist?: string;
    coverUrl?: string;
    previewUrl?: string;
    bpm?: number;
}

export interface DigHistoryItem {
    id: number;
    query: string;
    source: string;
    created_at: string;
}
