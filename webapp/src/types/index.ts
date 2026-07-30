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
    type?: 'album' | 'single' | 'liveset' | 'podcast';
    year?: number;
    download?: 'free' | 'paid' | 'codes' | 'external';
    price?: number;
    priceUsdc?: number;
    price_usdc?: number;
    currency?: 'ETH' | 'USD';
    external_links?: string;
    visibility: 'public' | 'private' | 'unlisted';
    published_at?: string;
    published_to_ap?: boolean;
    use_nft?: boolean;
    useNft?: boolean;
    license?: string;
    track_ids?: (string | number)[];
    tracks?: Track[]; // Compat with existing code
    additional_artworks?: string;
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
    bannerImage?: string | null;
    postParams?: unknown; // ActivityPub actor
    albums?: Album[];
    releases?: Release[];
    tracks?: Track[];
    links?: ArtistLink[];
    donationLinks?: ArtistLink[];
    walletAddress?: string;
    isLibraryArtist?: boolean;
    hasLinkedUser?: boolean;
    isReleasing?: boolean;
    starred?: boolean;
    rating?: number;
    /** 0 = sales disabled (unverified artist). Admin-only on update (sent as canSell). */
    can_sell?: number;
    canSell?: boolean;
    /** 1 = manual follower approval required (AP Follow requests left pending) */
    manually_approves_followers?: number;
    manuallyApprovesFollowers?: boolean;
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
    type: 'album' | 'single' | 'liveset' | 'podcast';
    slug?: string;
    description?: string;
    license?: string;
    is_release?: boolean;
    is_formal_release?: boolean;
    download?: 'free' | 'paid' | 'codes' | 'external';
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
    additional_artworks?: string;
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
    trackCovers?: string[];
}

export interface ArtistEvent {
    id: number;
    artist_id: number;
    title: string;
    event_date: string;
    venue: string | null;
    city: string | null;
    country: string | null;
    ticket_url: string | null;
    description: string | null;
    created_at: string;
}

export interface ArtistEventInput {
    title: string;
    event_date: string;
    venue?: string | null;
    city?: string | null;
    country?: string | null;
    ticket_url?: string | null;
    description?: string | null;
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
    email?: string | null;
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
    isActive?: boolean;
}

export interface SiteSettings {
    siteName: string;
    /** Public federation handle of the instance actor (defaults to "site"). */
    siteHandle?: string;
    siteDescription?: string;
    instanceProfile?: string;
    siteLogo?: string;
    coverImage?: string;
    publicUrl?: string;
    allowPublicRegistration?: boolean;
    listenerSelfPublish?: boolean | string;
    /** Default storage quota (in MB) granted to listeners auto-approved via self-publish. Default 1024 (1GB). */
    listenerSelfPublishQuota?: number | string;
    /** Max tracks a listener can upload before hitting their quota (0 = unlimited). */
    listenerTrackCap?: number | string;
    /** Price (USD) of one Track-Slot Topup purchase via Stripe Checkout. */
    trackcapTopupPriceUsd?: number | string;
    /** Number of extra track slots granted per Track-Slot Topup purchase. */
    trackcapTopupTracksGranted?: number | string;
    /** 'label' (curated storefront, default) or 'community' (registrations get an artist profile, selling opt-in per artist) */
    mode?: string;
    backgroundImage?: string;
    themeFont?: string;
    communityLink?: string;
    themeBlur?: string;
    themeOverlayOpacity?: string | number;
    donationLinks?: ArtistLink[];
    web3Enabled?: boolean | string;
    web3_checkout_address?: string;
    web3_nft_address?: string;
    telegram_allowed_channels?: string;
    chatEnabled?: boolean | string;
    boardEnabled?: boolean | string;
    scheduledScanHour?: string;
    adminFeePercentage?: string | number;
    adminTreasuryAddress?: string;
    soulseek_username?: string;
    soulseek_password?: string;
    openrouter_api_key?: string;
    openrouter_model?: string;
    stripe_secret_key?: string;
    stripe_webhook_secret?: string;
    discogs_token?: string;
    lastfm_api_key?: string;
    lastfm_session_key?: string;
    listenbrainz_token?: string;
    google_drive_client_id?: string;
    google_drive_client_secret?: string;
    hideLive?: boolean | string;
    hideStore?: boolean | string;
    hideSocial?: boolean | string;
    hideNetwork?: boolean | string;
    hideDig?: boolean | string;
    hideSamples?: boolean | string;
    hideCollab?: boolean | string;
    hideLab?: boolean | string;
    membershipMonthlyPrice?: number | string;
    peerEnabled?: boolean | string;
    peerAllowDownloads?: boolean | string;
    peerFederation?: boolean | string;
    peerChatEnabled?: boolean | string;
    peerChatGuestEnabled?: boolean | string;
    brandPrimary?: string;
    brandAccent?: string;
    /** Custom Terms of Service (Markdown). Empty = built-in template. */
    legalTerms?: string;
    /** Custom Privacy Policy (Markdown). Empty = built-in template. */
    legalPrivacy?: string;
    /** Contact shown in the legal pages (and their default templates). */
    legalContactEmail?: string;
}

/** Public payload of GET /api/catalog/legal. */
export interface LegalPages {
    terms: string;
    privacy: string;
    contactEmail: string;
    termsIsDefault: boolean;
    privacyIsDefault: boolean;
}

export interface LiveSession {
    roomId: string;
    title: string;
    username: string;
    artistId?: string | number;
    startedAt: string;
    listenerCount?: number;
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

export interface Sample {
    id: number;
    title: string;
    slug: string;
    artistId: number | null;
    artistName: string | null;
    ownerId: number | null;
    packId: number | null;
    description: string | null;
    filePath: string;
    format: string | null;
    duration: number | null;
    fileSize: number;
    bpm: number | null;
    musicalKey: string | null;
    tags: string[];
    license: string;
    attributionName: string | null;
    coverPath: string | null;
    status: 'pending' | 'approved' | 'rejected';
    curationNotes: string | null;
    downloadCount: number;
    createdAt: string;
}

export interface SamplePack {
    id: number;
    title: string;
    slug: string;
    artistId: number | null;
    artistName: string | null;
    ownerId: number | null;
    description: string | null;
    coverPath: string | null;
    license: string;
    status: 'pending' | 'approved' | 'rejected';
    curationNotes: string | null;
    createdAt: string;
    sampleCount: number;
    samples?: Sample[];
}

export interface CollabProject {
    id: number;
    title: string;
    description: string | null;
    ownerId: number;
    ownerUsername: string | null;
    visibility: 'shared' | 'private';
    createdAt: string;
    updatedAt: string;
    versionCount: number;
    versions?: CollabVersion[];
    stems?: CollabStem[];
}

export interface CollabVersion {
    id: number;
    projectId: number;
    version: number;
    authorId: number;
    authorUsername: string | null;
    state: string;
    note: string | null;
    createdAt: string;
}

export interface CollabStem {
    id: number;
    projectId: number;
    authorId: number;
    authorUsername: string | null;
    name: string;
    filePath: string;
    mimeType: string | null;
    duration: number | null;
    createdAt: string;
}

export interface NetworkSite {
    url: string;
    name: string;
    description: string;
    version: string;
    lastSeen: string;
    coverImage?: string;
    federation?: 'federated' | 'activitypub' | 'local' | 'http' | 'rss';
}

export interface NetworkTrack {
    track: Track;
    siteName: string;
    siteUrl: string;
    federation?: 'federated' | 'activitypub' | 'local' | 'http' | 'rss';
    // For ActivityPub/Local tracks/posts (flattened structure)
    type?: 'release' | 'post' | 'peer';
    audioUrl?: string;
    downloadUrl?: string;
    magnetUri?: string;
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
    storageQuota?: number; // requesting user's quota in bytes (0 = unlimited)
    networkSites: number;
    genresCount?: number;
    genres?: string[];
}

interface UserStorageRow {
    id: number;
    username: string;
    role: string;
    used: number;
    quota: number;
    trackCount: number;
}

export interface InstanceStorage {
    diskUsed: number;
    dbTotal: number;
    quotaAllocated: number;
    trackCount: number;
    byUser: UserStorageRow[];
}

export interface RecomputeStorageResult {
    scanned: number;
    updated: number;
    missing: number;
    overview: InstanceStorage;
}

export interface SystemResources {
    timestamp: number;
    process: {
        pid: number;
        uptime: number;
        nodeVersion: string;
        memory: { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number };
        cpuUsage: { user: number; system: number };
    };
    system: {
        platform: string;
        arch: string;
        cpus: number;
        loadavg: [number, number, number];
        totalmem: number;
        freemem: number;
        uptime: number;
    };
    db: { path: string | null; size: number };
    tasks: Array<{ taskId: string; status: string; startedAt: string; progress?: { current: number; total: number; message?: string } }>;
}

export interface UpdateCheck {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    checkedAt: number | null;
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

export interface LabAppRecord {
    id: number;
    name: string;
    description: string | null;
    src: string;
    category: 'recording' | 'synthesis' | 'composition' | 'effects' | 'other';
    author: string | null;
    sourceUrl: string | null;
    permissions: string[];
    sandbox: string[];
    allow: string[];
    enabled: boolean;
    created_at: string;
}

export interface Report {
    id: number;
    reporter_id: number | null;
    reporter_name: string | null;
    reporter_email: string | null;
    release_id: number;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    release_title?: string;
    release_slug?: string;
    artist_name?: string;
}


export interface PublicProfile {
    username: string;
    alias: string | null;
    avatar: string | null;
    role: string;
    createdAt: string;
    artist: { slug: string; name: string; url: string | null } | null;
    stats: { likes: number; playlists: number };
    likes: { title: string; artist: string | null; url: string | null; cover: string | null }[];
    playlists: { id: number; name: string; description: string | null; trackCount: number }[];
    instance: { name: string; url: string | null };
}

export interface NowListeningEntry {
    username: string;
    alias: string | null;
    avatar: string | null;
    trackId: number | string | null;
    title: string;
    artist: string;
    updatedAt: number;
}
