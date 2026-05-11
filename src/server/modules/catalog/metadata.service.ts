import fetch from "node-fetch";
import { drainResponse } from "../../utils.js";
import { ProviderRegistry, TuneCampProvider, MetadataMatch, MetadataProvider, ArtistMetadata, syncRegistryWithDatabase } from "../../core/provider.js";
import { BandcampMetadataProvider } from "../../providers/metadata/bandcamp.metadata.js";
import { ITunesProvider } from "../../providers/metadata/itunes.provider.js";
import { MusicBrainzProvider } from "../../providers/metadata/musicbrainz.provider.js";
import { DiscogsProvider } from "../../providers/metadata/discogs.provider.js";
import { TheAudioDBProvider } from "../../providers/metadata/theaudiodb.provider.js";
import type { DatabaseService } from "../../database.types.js";

export const USER_AGENT = "TuneCamp/1.0.0 ( contact@tunecamp.app )";

export interface LyricsResult {
    lyrics: string;
    source: string;
}

export class MetadataService {
    private registry = new ProviderRegistry<MetadataProvider>();

    constructor() {
        // Register default providers
        this.registry.register(new BandcampMetadataProvider());
        this.registry.register(new ITunesProvider() as any);
        this.registry.register(new MusicBrainzProvider() as any);
        this.registry.register(new DiscogsProvider() as any);
        this.registry.register(new TheAudioDBProvider() as any);
    }

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        const results = await Promise.all(this.registry.getEnabled().map(p => p.searchRelease(query)));
        return results.flat();
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        const results = await Promise.all(this.registry.getEnabled().map(p => p.searchRecording(query)));
        return results.flat();
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
