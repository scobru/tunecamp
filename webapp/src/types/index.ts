export interface Track {
    id: string;
    title: string;
    artistId: string;
    artistName?: string;
    albumId: string;
    albumName?: string;
    duration: number;
    path: string;
    filename: string;
    format?: string;
    codec?: string;
    bitrate?: number;
    size?: number;
    playCount: number;
    liked?: boolean;
    coverImage?: string; // helpers
    waveform?: number[]; // or string
    lyrics?: string;
}

export interface Artist {
    id: string;
    name: string;
    slug?: string;
    description?: string;
    coverImage?: string;
    postParams?: any; // ActivityPub actor
    links?: ArtistLink[];
    donationLinks?: ArtistLink[];
}

export interface ArtistLink {
    platform: string;
    url: string;
    type: 'social' | 'support' | 'music';
}

export interface Album {
    id: string;
    title: string;
    artistId: string;
    artistName?: string;
    coverImage?: string;
    year?: number;
    tracks?: Track[];
    type: 'album' | 'single' | 'ep';
    slug?: string;
    description?: string;
    is_release?: boolean;
    download?: 'free' | 'paid' | 'codes';
    external_links?: string; // JSON string
}

export interface Playlist {
    id: string;
    name: string;
    description?: string;
    userId: string;
    isPublic: boolean;
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
}

export interface AuthStatus {
    authenticated: boolean;
    username?: string;
    user?: User;
}

export interface SiteSettings {
    siteName: string;
    siteDescription?: string;
    coverImage?: string;
    publicUrl?: string;
    allowPublicRegistration?: boolean;
    backgroundImage?: string;
    donationLinks?: ArtistLink[];
}

export interface Release extends Album {
    downloadCount: number;
    unlockCodeCount: number;
    visibility: 'public' | 'private' | 'unlisted';
}

export interface Post {
    id: string;
    slug: string;
    content: string; // HTML/Markdown
    artistId: string;
    artistName?: string;
    artistAvatar?: string;
    createdAt: string;
    publishedAt?: string;
    updatedAt: string;
    isPublic: boolean;
}

export interface UnlockCode {
    code: string;
    releaseId: string;
    isRedeemed: boolean;
    redeemedAt?: string;
    createdAt: string;
}

export interface NetworkSite {
    url: string;
    name: string;
    description: string;
    version: string;
    lastSeen: string;
}

export interface NetworkTrack {
    track: Track;
    siteName: string;
    siteUrl: string;
}

export interface AdminStats {
    totalUsers: number;
    totalArtists: number;
    totalAlbums: number;
    totalTracks: number;
    storageUsed: number;
    networkSites: number;
}
