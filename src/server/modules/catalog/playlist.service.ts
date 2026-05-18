import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { PlaylistProvider, PlaylistTrack } from "../../core/provider.js";
import { YouTubePlaylistProvider } from "../../providers/playlists/youtube.playlist.js";
import { SpotifyProvider } from "../../providers/metadata/spotify.provider.js";
import { DeezerProvider } from "../../providers/playlists/deezer.playlist.js";
import type { DatabaseService } from "../../core/database.types.js";

/**
 * PlaylistService manages PlaylistProviders and handles external playlist imports.
 */
export class PlaylistService {
    private registry = new ProviderRegistry<PlaylistProvider>();

    constructor() {
        this.registry.register(new YouTubePlaylistProvider());
        this.registry.register(new SpotifyProvider());
        this.registry.register(new DeezerProvider());
    }

    /**
     * Finds a provider that can handle the given URL.
     */
    getProviderForUrl(url: string): PlaylistProvider | null {
        for (const provider of this.registry.getEnabled()) {
            if (provider.canHandlePlaylist(url)) {
                return provider;
            }
        }
        return null;
    }

    /**
     * Fetches playlist data from an external URL.
     */
    async fetchExternalPlaylist(url: string) {
        const provider = this.getProviderForUrl(url);
        if (!provider) {
            throw new Error(`No enabled provider found for URL: ${url}`);
        }
        return await provider.fetchPlaylistByUrl(url);
    }

    getRegistry(): ProviderRegistry<PlaylistProvider> {
        return this.registry;
    }
}

const playlistService = new PlaylistService();

let _playlistService: PlaylistService;

export async function initPlaylistService(db: DatabaseService): Promise<PlaylistService> {
    _playlistService = new PlaylistService();
    await syncRegistryWithDatabase(_playlistService.getRegistry(), db);
    return _playlistService;
}

export function getPlaylistService(): PlaylistService {
    return _playlistService || playlistService;
}
