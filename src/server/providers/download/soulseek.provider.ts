import type { DownloadProvider, DownloadResult } from "../../core/provider.js";
import type { SoulseekService, SoulseekResult } from "../../modules/integrations/soulseek.js";

/**
 * SoulseekDownloadProvider wraps the existing SoulseekService
 * to conform to the DownloadProvider interface.
 *
 * This makes Soulseek a first-class plugin in TuneCamp's architecture,
 * allowing it to be managed by the DownloadService registry alongside
 * future providers (e.g. Torrent, Bandcamp).
 */
export class SoulseekDownloadProvider implements DownloadProvider {
    readonly id = "soulseek";
    readonly name = "Soulseek";
    readonly version = "1.0.0";
    readonly description = "Search and download music via the Soulseek P2P network. Disabled by default: enable only for content you own the rights to.";

    constructor(private readonly soulseekService: SoulseekService) {}

    async isAvailable(): Promise<boolean> {
        const status = await this.soulseekService.checkStatus();
        return status.connected;
    }

    async search(query: string): Promise<DownloadResult[]> {
        const rawResults: SoulseekResult[] = await this.soulseekService.search(query);

        return rawResults.map((r): DownloadResult => ({
            id: r.id,
            title: r.file.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || r.file,
            artist: r.file.split(/[/\\]/).slice(-2, -1)[0] || undefined,
            filename: r.file,
            sizeBytes: r.size,
            bitrate: r.bitrate,
            source: "soulseek",
            meta: r // keep the original for download()
        }));
    }

    async download(result: DownloadResult): Promise<string> {
        // Re-hydrate the original SoulseekResult from meta
        const soulseekResult: SoulseekResult = result.meta ?? {
            id: result.id,
            user: "",
            file: result.filename,
            size: result.sizeBytes,
            slots: true,
            bitrate: result.bitrate,
        };

        return this.soulseekService.download(soulseekResult);
    }
}
