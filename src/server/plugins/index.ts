import type { DatabaseService } from '../core/database.types.js';
import type { Scanner } from '../modules/catalog/scanner.js';
import type { DownloadService } from '../modules/catalog/download.service.js';

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
            downloadService.getRegistry().register(new SoulseekDownloadProvider(soulseekService), false);
            
            if (downloadService.getRegistry().isEnabled("soulseek")) {
                const slskUser = context.database.getSetting("soulseek_username");
                const slskPass = context.database.getSetting("soulseek_password");
                soulseekService.connect(slskUser, slskPass).catch((err: any) => console.error("Soulseek initial connection failed:", err));
            }
            
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
    
    return { cleanups, soulseekService, torrentService, ytdlpService };
}
