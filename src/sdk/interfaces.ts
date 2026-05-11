/**
 * TuneCamp Plugin SDK - Core Interfaces
 * These interfaces define the contract between external plugins and the TuneCamp server.
 */

export interface TuneCampManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    author: string;
}

export interface TuneCampPlugin {
    manifest: TuneCampManifest;
    onLoad?(): Promise<void>;
    onUnload?(): Promise<void>;
}

/** 
 * Metadata Provider Interface
 */
export interface MetadataResult {
    id: string;
    title: string;
    artist: string;
    date: string;
    year?: number;
    genre?: string;
    coverUrl?: string;
    albumTitle?: string;
    description?: string;
    source: string;
}

export interface MetadataProvider extends TuneCampPlugin {
    searchRelease(query: string): Promise<MetadataResult[]>;
    searchRecording(query: string): Promise<MetadataResult[]>;
    getCoverUrl(id: string): Promise<string | null>;
}

/**
 * Streaming Provider Interface
 */
export interface StreamingProvider extends TuneCampPlugin {
    getStreamUrl(trackTitle: string, artistName: string, albumTitle?: string): Promise<string | null>;
    canHandle(sourceId: string): boolean;
    getStreamById(id: string): Promise<string | null>;
}

/**
 * Download Provider Interface
 */
export interface DownloadResult {
    id: string;
    title: string;
    artist?: string;
    filename: string;
    sizeBytes: number;
    bitrate?: number;
    source: string;
    meta?: any;
}

export interface DownloadProvider extends TuneCampPlugin {
    isAvailable(): Promise<boolean>;
    search(query: string): Promise<DownloadResult[]>;
    download(result: DownloadResult): Promise<string>;
}

/**
 * Federation Provider Interface
 */
export interface FederationProvider extends TuneCampPlugin {
    publish(content: { type: 'track' | 'album' | 'artist'; id: number; data: any }): Promise<void>;
    discover(query: string): Promise<any[]>;
    getStatus(): Promise<{ connected: boolean; peers: number; info?: string }>;
}
