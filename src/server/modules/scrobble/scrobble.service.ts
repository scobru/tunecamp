import { ProviderRegistry, type ScrobbleProvider } from "../../core/provider.js";

export class ScrobbleService {
    private registry = new ProviderRegistry<ScrobbleProvider>();

    register(provider: ScrobbleProvider) {
        this.registry.register(provider);
    }

    getProviders() {
        return this.registry.getAll();
    }

    async scrobble(track: { artist: string; title: string; album?: string; duration?: number }) {
        const enabledProviders = this.registry.getEnabled();
        const promises = enabledProviders.map(async (provider) => {
            try {
                if (await provider.isConfigured()) {
                    await provider.scrobble(track);
                    console.log(`[Scrobble] Submitted to ${provider.name}: ${track.artist} - ${track.title}`);
                }
            } catch (e) {
                console.error(`[Scrobble] Failed to scrobble to ${provider.name}:`, e);
            }
        });
        await Promise.all(promises);
    }

    async updateNowPlaying(track: { artist: string; title: string; album?: string }) {
        const enabledProviders = this.registry.getEnabled();
        const promises = enabledProviders.map(async (provider) => {
            try {
                if (await provider.isConfigured() && provider.nowPlaying) {
                    await provider.nowPlaying(track);
                }
            } catch (e) {
                console.error(`[Scrobble] Failed to update now playing for ${provider.name}:`, e);
            }
        });
        await Promise.all(promises);
    }
}

let scrobbleService: ScrobbleService | null = null;

export function getScrobbleService(): ScrobbleService {
    if (!scrobbleService) {
        scrobbleService = new ScrobbleService();
    }
    return scrobbleService;
}
