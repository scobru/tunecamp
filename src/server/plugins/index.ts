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
    
    // Re-apply the enabled/disabled state persisted by admins
    try {
        await syncRegistryWithDatabase(downloadService.getRegistry(), context.database);
    } catch (e) {
        console.error("Failed to sync download registry:", e);
    }

    return { cleanups, soulseekService: undefined, torrentService: undefined, ytdlpService: undefined };
}
