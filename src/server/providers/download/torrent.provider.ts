import type { DownloadProvider, DownloadResult } from "../../core/provider.js";
import type { TorrentService } from "../../modules/integrations/torrent.service.js";

/**
 * TorrentDownloadProvider wraps TorrentService to conform to the DownloadProvider interface.
 *
 * TorrentService doesn't have a built-in search mechanism (unlike Soulseek).
 * Instead, it downloads music via magnet URIs provided by the user (e.g., from the UI
 * or from an external torrent index).
 *
 * Usage pattern:
 *   - search() → always returns [] (no built-in index search)
 *   - download(result) → result.meta.magnetUri must be set with the magnet link
 *                        result.meta.ownerId optionally sets the track owner
 *
 * Future enhancement: implement search() by querying a torrent index API
 * (e.g. BTDigg, Jackett) to make this a full DownloadProvider.
 */
export class TorrentDownloadProvider implements DownloadProvider {
    readonly id = "torrent";
    readonly name = "BitTorrent";
    readonly version = "1.0.0";
    readonly description = "Download music via BitTorrent magnet links (WebTorrent)";

    constructor(
        private readonly torrentService: TorrentService,
        private readonly defaultOwnerId: number = 1
    ) {}

    /**
     * WebTorrent client is always available (no credentials required).
     */
    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * No built-in index search — returns empty.
     * A developer can extend this with an indexer (Jackett, BTDigg, etc.)
     */
    async search(_query: string): Promise<DownloadResult[]> {
        return [];
    }

    /**
     * Starts downloading a torrent from a magnet URI.
     *
     * Expects result.meta to contain:
     *   - magnetUri: string  — the magnet link
     *   - ownerId?: number   — optional user/owner ID for DB tracking
     *
     * Returns the magnet URI as confirmation (actual files are async via torrent events).
     */
    async download(result: DownloadResult): Promise<string> {
        const magnetUri = result.meta?.magnetUri || result.id;
        const ownerId = result.meta?.ownerId ?? this.defaultOwnerId;

        if (!magnetUri || !magnetUri.startsWith("magnet:")) {
            throw new Error(`[TorrentDownloadProvider] Invalid magnet URI: ${magnetUri}`);
        }

        this.torrentService.addTorrent(magnetUri, ownerId);
        console.log(`[TorrentDownloadProvider] ⬇️ Started download: ${magnetUri.substring(0, 60)}...`);

        // addTorrent is async-by-callback internally; we return the magnet URI as a reference
        return magnetUri;
    }
}
