import type { Stats } from "fs";

/**
 * Base interface for all TuneCamp providers (Metadata, Scanner, Storage, etc.)
 */
export interface TuneCampProvider {
    /** Unique identifier for the provider (e.g. 'musicbrainz', 'local-fs') */
    id: string;
    /** Human readable name */
    name: string;
    /** Version of the provider */
    version: string;
    /** Description of what this provider does */
    description?: string;

    /** Lifecycle hooks (optional) */
    onEnable?(): Promise<void>;
    onDisable?(): Promise<void>;
}

/**
 * Registry to manage a collection of providers of a specific type
 */
export class ProviderRegistry<T extends TuneCampProvider> {
    private providers: Map<string, { instance: T, enabled: boolean }> = new Map();

    register(provider: T, defaultEnabled = true) {
        if (this.providers.has(provider.id)) {
            console.warn(`[Registry] Provider ${provider.id} is already registered. Overwriting.`);
        }
        this.providers.set(provider.id, { instance: provider, enabled: defaultEnabled });
        console.log(`[Registry] Registered provider: ${provider.name} (${provider.id}) v${provider.version} [Enabled: ${defaultEnabled}]`);
    }

    unregister(id: string) {
        this.providers.delete(id);
    }

    async enable(id: string) {
        const entry = this.providers.get(id);
        if (entry && !entry.enabled) {
            entry.enabled = true;
            if (entry.instance.onEnable) {
                await entry.instance.onEnable();
            }
            console.log(`[Registry] Enabled provider: ${id}`);
        }
    }

    async disable(id: string) {
        const entry = this.providers.get(id);
        if (entry && entry.enabled) {
            entry.enabled = false;
            if (entry.instance.onDisable) {
                await entry.instance.onDisable();
            }
            console.log(`[Registry] Disabled provider: ${id}`);
        }
    }

    get(id: string): T | undefined {
        return this.providers.get(id)?.instance;
    }

    isEnabled(id: string): boolean {
        return this.providers.get(id)?.enabled ?? false;
    }

    getAll(): T[] {
        return Array.from(this.providers.values()).map(p => p.instance);
    }

    getEnabled(): T[] {
        return Array.from(this.providers.values())
            .filter(p => p.enabled)
            .map(p => p.instance);
    }

    getRegistryInfo() {
        return Array.from(this.providers.entries()).map(([id, entry]) => ({
            id,
            name: entry.instance.name,
            version: entry.instance.version,
            enabled: entry.enabled,
            description: entry.instance.description
        }));
    }
}

/**
 * Utility to sync a provider registry with states persisted in the database.
 * Call this after all default providers have been registered.
 */
export async function syncRegistryWithDatabase<T extends TuneCampProvider>(registry: ProviderRegistry<T>, db: any) {
    // We use 'any' for db to avoid circular dependency with DatabaseService
    // as it is often imported in services.
    const states = db.getAllPluginsState() as any[];
    for (const state of states) {
        const isRegistered = registry.get(state.id);
        if (isRegistered) {
            if (state.enabled === 0) {
                await registry.disable(state.id);
            } else {
                await registry.enable(state.id);
            }
        }
    }
}

/**
 * Metadata search result
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

export type MetadataMatch = MetadataResult;

export interface ArtistMetadata {
    id: string;
    name: string;
    bio?: string;
    avatarUrl?: string;
    links?: any;
    source: string;
}

/**
 * Provider for external metadata (MusicBrainz, Discogs, etc.)
 */
export interface MetadataProvider extends TuneCampProvider {
    searchRelease(query: string): Promise<MetadataResult[]>;
    searchRecording(query: string): Promise<MetadataResult[]>;
    getCoverUrl(id: string): Promise<string | null>;
    searchArtist?(query: string): Promise<ArtistMetadata[]>;
}

/**
 * Provider for external audio streams (Bandcamp, YouTube, etc.)
 */
export interface StreamingProvider extends TuneCampProvider {
    /** 
     * Resolves a track to a streamable URL.
     * Can return a direct URL or a URL that needs to be proxied.
     */
    getStreamUrl(trackTitle: string, artistName: string, albumTitle?: string): Promise<string | null>;
    
    /** Checks if this provider can handle a specific external ID */
    canHandle(sourceId: string): boolean;
    
    /** Gets a stream by a specific provider ID */
    getStreamById(id: string): Promise<string | null>;
}

/**
 * A single search result from a download provider
 */
export interface DownloadResult {
    id: string;
    title: string;
    artist?: string;
    filename: string;
    sizeBytes: number;
    bitrate?: number;
    source: string;
    /** Provider-specific raw metadata for later use in download() */
    meta?: any;
}

/**
 * Provider for searching and downloading music from external sources
 * (Soulseek, BitTorrent, Bandcamp, etc.)
 */
export interface DownloadProvider extends TuneCampProvider {
    /** Returns true if the provider is currently connected/available */
    isAvailable(): Promise<boolean>;

    /** Searches for a track by query string (e.g. "Artist - Title") */
    search(query: string): Promise<DownloadResult[]>;

    /** Downloads a specific result and returns the local file path */
    download(result: DownloadResult): Promise<string>;
}

/**
 * Provider for scanning music sources (Local FS, IPFS, S3, etc.)
 */
export interface ScannerProvider extends TuneCampProvider {
    /** Scans the source and returns a list of file paths or identifiers */
    scan(): Promise<string[]>;

    /** Reads metadata from a specific "path" in this source */
    getMetadata(path: string): Promise<any>;

    /** Returns a stream for a specific file */
    getFileStream(path: string): Promise<NodeJS.ReadableStream>;
}

/**
 * Provider for cloud/remote storage backends (Google Drive, S3, IPFS, etc.)
 * Handles storing and retrieving user-uploaded music files.
 */
export interface StorageProvider extends TuneCampProvider {
    /** Uploads a file from a local path to the remote storage */
    upload(localPath: string, remotePath: string): Promise<string>;

    /** Downloads a file from remote storage to a local path */
    download(remotePath: string, localPath: string): Promise<void>;

    /** Returns a public/signed URL for a remote file */
    getUrl(remotePath: string): Promise<string | null>;

    /** Checks if a remote file exists */
    exists(remotePath: string): Promise<boolean>;

    /** Deletes a file from remote storage */
    delete(remotePath: string): Promise<void>;
}

/**
 * Provider for federated network discovery (Zen P2P, ActivityPub, Nostr, etc.)
 * Handles announcing and discovering music from other instances.
 */
export interface FederationProvider extends TuneCampProvider {
    /** Announces a release/track to the network */
    publish(content: { type: 'track' | 'album' | 'artist'; id: number; data: any }): Promise<void>;

    /** Discovers content from the network for a given query */
    discover(query: string): Promise<any[]>;

    /** Returns the connection status of the federation network */
    getStatus(): Promise<{ connected: boolean; peers: number; info?: string }>;
}

/**
 * Provider for AI/LLM services (OpenRouter, Ollama, local models, etc.)
 * Used for generating metadata, descriptions, tags, and recommendations.
 */
export interface AIProvider extends TuneCampProvider {
    /** Generates or enriches metadata for a track/album */
    enrichMetadata(context: { title: string; artist?: string; album?: string; genre?: string }): Promise<Partial<{
        description: string;
        genre: string;
        tags: string[];
        mood: string;
    }>>;

    /** Generates a text response for a free-form prompt */
    complete(prompt: string): Promise<string | null>;

    /** Whether the provider is currently available (API key configured, etc.) */
    isAvailable(): Promise<boolean>;
}
