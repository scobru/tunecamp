import fetch from "node-fetch";
import { drainResponse } from "../../common/network.js";
import { ProviderRegistry, TuneCampProvider, MetadataMatch, MetadataProvider, ArtistMetadata, syncRegistryWithDatabase } from "../../core/provider.js";
import { BandcampMetadataProvider } from "../../providers/metadata/bandcamp.metadata.js";
import { SoundCloudMetadataProvider } from "../../providers/metadata/soundcloud.metadata.js";
import { YouTubeStreamingProvider } from "../../providers/streaming/youtube.provider.js";
import { KhInsiderProvider } from "../../providers/streaming/khinsider.provider.js";
import { ITunesProvider } from "../../providers/metadata/itunes.provider.js";
import { MusicBrainzProvider } from "../../providers/metadata/musicbrainz.provider.js";
import { DiscogsProvider } from "../../providers/metadata/discogs.provider.js";
import { TheAudioDBProvider } from "../../providers/metadata/theaudiodb.provider.js";
import { SpotifyProvider } from "../../providers/metadata/spotify.provider.js";
import { HiFiProvider } from "../../providers/streaming/hifi.provider.js";
import { DeezerProvider } from "../../providers/playlists/deezer.playlist.js";
import type { DatabaseService } from "../../core/database.types.js";

export const USER_AGENT = "TuneCamp/1.0.0 ( contact@tunecamp.app )";

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
        // Register default providers
        this.registry.register(new BandcampMetadataProvider());
        this.registry.register(new SoundCloudMetadataProvider());
        this.registry.register(new YouTubeStreamingProvider() as any);
        this.registry.register(new KhInsiderProvider() as any);
        this.registry.register(new ITunesProvider() as any);
        this.registry.register(new MusicBrainzProvider() as any);
        this.registry.register(new DiscogsProvider() as any);
        this.registry.register(new TheAudioDBProvider() as any);
        this.registry.register(new SpotifyProvider() as any);
        this.registry.register(new HiFiProvider() as any);
        this.registry.register(new DeezerProvider() as any);
    }

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        const cached = this.searchCache.get(`release:${query}`);
        if (cached) return cached;

        const results = await Promise.all(this.registry.getEnabled().map(p => p.searchRelease(query)));
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
        const prioritizedIds = ["itunes", "musicbrainz", "discogs", "spotify", "youtube"];
        const providers = [...enabled].sort((a, b) => {
            const idxA = prioritizedIds.indexOf(a.id);
            const idxB = prioritizedIds.indexOf(b.id);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        for (const provider of providers) {
            try {
                const matches = await provider.searchRecording(query);
                if (matches.length > 0) {
                    results.push(...matches);
                    // If we have strong matches from a top-tier provider, we can stop early
                    if (prioritizedIds.slice(0, 3).includes(provider.id) && matches.length > 2) {
                        break;
                    }
                }
            } catch (e) {
                console.warn(`[MetadataService] Provider ${provider.id} failed for query "${query}":`, e);
            }
        }

        this.searchCache.set(`recording:${query}`, results);
        return results;
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        const results = await Promise.all(this.registry.getEnabled().map(p => {
            if (p.searchArtist) return p.searchArtist(query);
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
     * Expose registry for dynamic registration of new providers
     */
    getRegistry() {
        return this.registry;
    }
}

export const metadataService = new MetadataService();

export async function initMetadataService(db: DatabaseService): Promise<MetadataService> {
    await syncRegistryWithDatabase(metadataService.getRegistry(), db);
    return metadataService;
}

// Export types for consumers
export type { MetadataMatch, MetadataProvider, ArtistMetadata };
