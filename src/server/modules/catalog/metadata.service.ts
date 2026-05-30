import fetch from "node-fetch";
import path from "path";
import NodeID3 from "node-id3";
import { drainResponse } from "../../common/network.js";
import { ProviderRegistry, TuneCampProvider, MetadataMatch, MetadataProvider, ArtistMetadata, syncRegistryWithDatabase, USER_AGENT } from "../../core/provider.js";
import type { DatabaseService, Track } from "../../core/database.js";
import { writeMetadata } from "../media/ffmpeg.js";
import { getFastFileHash } from "../../../utils/fileUtils.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import { 
    soundcloudMetadataProvider, 
    itunesProvider, 
    musicbrainzProvider, 
    discogsProvider, 
    theaudiodbProvider, 
    spotifyProvider, 
    deezerProvider,
    bandcampMetadataProvider
} from "../../core/providers.js";

export interface LyricsResult {
    lyrics: string;
    source: string;
}

class MetadataCache {
    private cache = new Map<string, { data: any, timestamp: number }>();
    private readonly TTL = 60 * 60 * 1000; // 1 hour
    private readonly MAX_SIZE = 1000;

    get(key: string) {
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp < this.TTL) {
            return entry.data;
        }
        this.cache.delete(key);
        return null;
    }

    set(key: string, data: any) {
        if (this.cache.size >= this.MAX_SIZE) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(key, { data, timestamp: Date.now() });
    }
}

export class MetadataService {
    private registry = new ProviderRegistry<MetadataProvider>();
    private searchCache = new MetadataCache();

    constructor() {
        // Register shared instances
        this.registry.register(soundcloudMetadataProvider);
        this.registry.register(itunesProvider as any);
        this.registry.register(musicbrainzProvider as any);
        this.registry.register(discogsProvider as any);
        this.registry.register(theaudiodbProvider as any);
        this.registry.register(spotifyProvider as any);
        this.registry.register(deezerProvider as any);
        this.registry.register(bandcampMetadataProvider as any);
    }

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        const cached = this.searchCache.get(`release:${query}`);
        if (cached) return cached;

        const results = await Promise.all(this.registry.getEnabled().map(async p => {
            try {
                return await Promise.race([
                    p.searchRelease(query),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Provider ${p.id} timeout (15s)`)), 15000))
                ]) as MetadataMatch[];
            } catch (e: any) {
                console.warn(`[MetadataService] Provider ${p.id} searchRelease failed or timed out:`, e.message);
                return [];
            }
        }));
        const flatResults = results.flat();
        this.searchCache.set(`release:${query}`, flatResults);
        return flatResults;
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        const cached = this.searchCache.get(`recording:${query}`);
        if (cached) return cached;

        const enabled = this.registry.getEnabled();
        const results: MetadataMatch[] = [];

        // Prioritize providers and run sequentially to stop early on high confidence
        // and reduce concurrent load on external APIs
        const prioritizedIds = ["itunes", "musicbrainz", "discogs", "spotify"];
        const providers = [...enabled].sort((a, b) => {
            const idxA = prioritizedIds.indexOf(a.id);
            const idxB = prioritizedIds.indexOf(b.id);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        for (const provider of providers) {
            try {
                // Use a safety timeout per provider to ensure the service remains responsive
                const matches = await Promise.race([
                    provider.searchRecording(query),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Provider ${provider.id} timeout (15s)`)), 15000))
                ]) as MetadataMatch[];

                if (matches.length > 0) {
                    results.push(...matches);
                    // If we have strong matches from a top-tier provider, we can stop early
                    if (prioritizedIds.slice(0, 3).includes(provider.id) && matches.length > 2) {
                        break;
                    }
                }
            } catch (e: any) {
                console.warn(`[MetadataService] Provider ${provider.id} failed or timed out for query "${query}":`, e.message);
            }
        }

        this.searchCache.set(`recording:${query}`, results);
        return results;
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        const results = await Promise.all(this.registry.getEnabled().map(async p => {
            if (p.searchArtist) {
                try {
                    return await Promise.race([
                        p.searchArtist(query),
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Provider ${p.id} timeout (15s)`)), 15000))
                    ]) as ArtistMetadata[];
                } catch (e: any) {
                    console.warn(`[MetadataService] Provider ${p.id} searchArtist failed or timed out:`, e.message);
                    return [];
                }
            }
            return Promise.resolve([]);
        }));
        return results.flat();
    }

    async getCoverUrl(id: string, source: string = "musicbrainz"): Promise<string | null> {
        const provider = this.registry.get(source);
        if (provider && this.registry.isEnabled(source)) {
            return provider.getCoverUrl(id);
        }
        return null;
    }

    async getLyrics(artist: string, title: string): Promise<LyricsResult | null> {
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                await drainResponse(response);
                return null;
            }
            const data = await response.json() as any;
            if (data.lyrics) {
                return {
                    lyrics: data.lyrics,
                    source: "lyrics.ovh"
                };
            }
            return null;
        } catch (error) {
            console.error("Error fetching lyrics from lyrics.ovh:", error);
            return null;
        }
    }

    /**
     * Physical Sync — Deepening the module by encapsulating tag writing, 
     * hashing, and DB synchronization.
     */
    async syncPhysicalTags(track: Track, database: DatabaseService, storage: StorageEngine, musicDir: string): Promise<void> {
        const pathsToUpdate = [];
        if (track.file_path) pathsToUpdate.push(track.file_path);
        if (track.lossless_path && track.lossless_path !== track.file_path) pathsToUpdate.push(track.lossless_path);

        if (pathsToUpdate.length === 0) return;

        const tags = {
            title: track.title,
            artist: track.artist_name || "",
            album: track.album_title || "",
            trackNumber: track.track_num?.toString() || "",
            genre: track.genre || "",
            year: track.year?.toString() || ""
        };

        for (const relPath of pathsToUpdate) {
            const fullPath = path.join(musicDir, relPath);
            if (!(await storage.pathExists(fullPath))) continue;

            const ext = path.extname(fullPath).toLowerCase();
            try {
                if (ext === '.mp3') {
                    NodeID3.update(tags as any, fullPath);
                } else if (['.flac', '.ogg', '.m4a', '.wav'].includes(ext)) {
                    await writeMetadata(fullPath, {
                        title: tags.title, artist: tags.artist, album: tags.album,
                        track: tags.trackNumber, genre: tags.genre, year: tags.year
                    });
                }

                // Recalculate hash after tag write so scanner doesn't re-process it
                const newHash = await getFastFileHash(fullPath);
                if (relPath === track.file_path || relPath === track.lossless_path) {
                    database.updateTrackHash(track.id, newHash);
                }
            } catch (err) { 
                console.error(`[MetadataService] Physical sync failed for ${track.id} at ${relPath}:`, err); 
            }
        }
    }

    /**
     * Expose registry for dynamic registration of new providers
     */
    getRegistry() {
        return this.registry;
    }
}

export const metadataService = new MetadataService();

export async function initMetadataService(db: DatabaseService): Promise<MetadataService> {
    // Pass DB settings to providers that need it
    if ((discogsProvider as any).setSettings) {
        (discogsProvider as any).setSettings(db);
    }
    await syncRegistryWithDatabase(metadataService.getRegistry(), db);
    return metadataService;
}

// Export types for consumers
export type { MetadataMatch, MetadataProvider, ArtistMetadata };
