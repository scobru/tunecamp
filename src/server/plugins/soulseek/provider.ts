import type { DownloadProvider, DownloadResult } from "../../core/provider.js";
import type { SoulseekService, SoulseekResult } from "./service.js";

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

    constructor(
        private readonly soulseekService: SoulseekService,
        private readonly getCredentials?: () => { username?: string; password?: string }
    ) {}

    /**
     * Connect when the admin flips the toggle on (and at startup when the
     * persisted state is enabled). Fire-and-forget: enable() awaits this hook,
     * and a slow P2P handshake must not block server boot or the toggle request.
     */
    async onEnable(): Promise<void> {
        const creds = this.getCredentials?.() ?? {};
        this.soulseekService.connect(creds.username, creds.password)
            .then(ok => { if (!ok) console.warn("[Soulseek] Enabled but connection failed (missing credentials?)"); })
            .catch(err => console.error("[Soulseek] Connection on enable failed:", err));
    }

    /** Disabling the plugin must actually leave the Soulseek network, not just hide the routes. */
    async onDisable(): Promise<void> {
        this.soulseekService.disconnect();
    }

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
