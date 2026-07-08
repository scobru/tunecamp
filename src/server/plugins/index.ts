import type { DatabaseService } from '../core/database.types.js';
import type { Scanner } from '../modules/catalog/scanner.js';
import type { DownloadService } from '../modules/catalog/download.service.js';
import { syncRegistryWithDatabase } from '../core/provider.js';

export interface PluginContext {
    database: DatabaseService;
    scanner: Scanner;
    config: any;
    defaultOwnerId: number;
    publishingService: any;
    catalogService: any;
    streamingService: any;
}

export async function registerBuiltInDownloadProviders(downloadService: DownloadService, context: PluginContext) {
    const cleanups: (() => void)[] = [];
    let soulseekService: any;
    let torrentService: any;
    let ytdlpService: any;
    try {
        // Try loading Soulseek
        try {
            const { SoulseekService } = await import('./soulseek/service.js');
            const { SoulseekDownloadProvider } = await import('./soulseek/provider.js');
            const path = await import('path');
            
            soulseekService = new SoulseekService(context.config.musicDir, context.config.downloadDir || path.default.join(context.config.musicDir, "downloads"));
            const getSoulseekCredentials = () => ({
                username: context.database.getSetting("soulseek_username"),
                password: context.database.getSetting("soulseek_password")
            });
            downloadService.getRegistry().register(new SoulseekDownloadProvider(soulseekService, getSoulseekCredentials), false);

            cleanups.push(() => soulseekService.disconnect());
            console.log("✅ Soulseek backend plugin registered");
        } catch (e: any) {
            console.log("ℹ️ Soulseek backend plugin not available (or optional deps missing)", e.message);
        }

        // Try loading Torrent
        try {
            const { TorrentService } = await import('./torrent/service.js');
            const { TorrentDownloadProvider } = await import('./torrent/provider.js');
            
            torrentService = new TorrentService(context.database, context.scanner, context.config.musicDir);
            context.publishingService.setTorrentService(torrentService);
            downloadService.getRegistry().register(new TorrentDownloadProvider(torrentService, context.defaultOwnerId), false);
            cleanups.push(() => torrentService.shutdown());
            console.log("✅ Torrent backend plugin registered");
        } catch (e: any) {
            console.log("ℹ️ Torrent backend plugin not available (or optional deps missing)", e.message);
        }

        // Try loading YtDlp
        try {
            const { YtdlpService } = await import('./ytdlp/service.js');
            ytdlpService = new YtdlpService(
                context.database, 
                context.catalogService, 
                context.config.musicDir, 
                process.env.YOUTUBE_COOKIES_PATH, 
                context.streamingService
            );
            console.log("✅ Yt-dlp backend plugin registered");
        } catch (e: any) {
            console.log("ℹ️ Yt-dlp backend plugin not available", e.message);
        }

    } catch (e) {
        console.error("Failed to load backend plugins", e);
    }

    // Re-apply the enabled/disabled state persisted by admins. This must run
    // AFTER the providers are registered above — initDownloadService() creates
    // an empty registry, so a sync at construction time would find nothing.
    try {
        await syncRegistryWithDatabase(downloadService.getRegistry(), context.database);
    } catch (e) {
        console.error("Failed to sync download registry:", e);
    }

    // Soulseek only auto-connects when the admin has opted in via the plugin
    // toggle: the sync above fires the provider's onEnable() hook, which
    // connects using the persisted credentials.

    return { cleanups, soulseekService, torrentService, ytdlpService };
}
