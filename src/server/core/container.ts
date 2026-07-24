/**
 * ServiceContainer — Central dependency bag for all server services.
 * 
 * Replaces positional argument lists (up to 17 args) in route factory functions.
 * Each route factory destructures only the services it needs.
 */
import type { DatabaseService, IdentityManager, LibraryManager, SocialManager, IntegrationManager } from "./database.types.js";
import type { ServerConfig } from "./config.js";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { createAuthMiddleware } from "../middleware/auth.js";
import type { ScannerService } from "../modules/catalog/scanner.service.js";
import type { CatalogService } from "../modules/catalog/catalog.service.js";
import type { DiscoveryService } from "../modules/catalog/discovery.service.js";
import type { DigService } from "../modules/catalog/dig.service.js";
import type { MetadataService } from "../modules/catalog/metadata.service.js";
import type { MaintenanceService } from "../modules/catalog/maintenance.service.js";
import type { YtdlpServiceContract } from "./plugin-contracts.js";
import type { MediaEngine } from "../modules/media/media-engine.js";
import type { WaveformService } from "../modules/waveform/waveform.service.js";
import type { StreamingService } from "../modules/streaming/streaming.service.js";
import type { PublishingService } from "../modules/publishing/publishing.service.js";
import type { ActivityPubService } from "../modules/activitypub/activitypub.service.js";
import type { FederatedDiscoveryService } from "../modules/network/federated-discovery.service.js";
import type { CatalogCacheService } from "../modules/network/catalog-cache.service.js";
import type { LifecycleService } from "../modules/catalog/lifecycle.service.js";
import type { TelegramBotService } from "../modules/integrations/telegram-bot.js";
import type { SoulseekServiceContract, TorrentServiceContract } from "./plugin-contracts.js";
import type { GoogleDriveService } from "../modules/storage/google-drive.service.js";
import type { SubsonicService } from "../modules/subsonic/subsonic.service.js";
import type { ScrobbleService } from "../modules/scrobble/scrobble.service.js";
import type { PlaylistService } from "../modules/catalog/playlist.service.js";
import type { OpenRouterService } from "../modules/ai/openrouter.service.js";
import type { LocalDiskStorage } from "../modules/storage/storage.engine.js";
import type { Scanner } from "../modules/catalog/scanner.js";
import type { BoardService } from "../modules/board/board.service.js";
import type { LiveService } from "../modules/live/live.service.js";
import type { RadioService } from "../modules/radio/radio.service.js";
import type { PeerService } from "../modules/peer/peer.service.js";
import type { SampleRepository } from "../repositories/sample.repository.js";

export interface ServiceContainer {
    // Core
    database: DatabaseService;
    identity: IdentityManager;
    library: LibraryManager;
    social: SocialManager;
    integration: IntegrationManager;
    config: ServerConfig;
    musicDir: string;

    // Auth
    authService: AuthService;
    authMiddleware: ReturnType<typeof createAuthMiddleware>;

    // Catalog & Library
    scanner: Scanner;
    scannerService: ScannerService;
    catalogService: CatalogService;
    discoveryService: DiscoveryService;
    digService: DigService;
    metadataService: MetadataService;
    maintenanceService: MaintenanceService;
    ytdlpService?: YtdlpServiceContract;

    // Media & Playback
    mediaEngine: MediaEngine;
    waveformService: WaveformService;
    streamingService: StreamingService;
    subsonicService: SubsonicService;
    scrobbleService: ScrobbleService;
    playlistService: PlaylistService;

    // Publishing & Federation
    publishingService: PublishingService;
    apService: ActivityPubService;
    federatedDiscoveryService: FederatedDiscoveryService;
    catalogCache: CatalogCacheService;
    lifecycleService: LifecycleService;

    // Integrations
    telegramBotService: TelegramBotService;
    soulseekService?: SoulseekServiceContract;
    torrentService?: TorrentServiceContract;
    gdriveService?: GoogleDriveService;
    boardService: BoardService;
    liveService: LiveService;
    radioService: RadioService;
    peerService: PeerService;
    samplesRepository: SampleRepository;

    // AI
    openRouterService: OpenRouterService;

    // Storage
    storage: LocalDiskStorage;
}

/**
 * Resolves a service from the container, falling back to the database object.
 * Tests pass partial containers where the database mock stands in for any
 * service not explicitly provided — keep that behavior centralized here.
 */
export function resolveService<K extends keyof ServiceContainer>(
    container: ServiceContainer,
    key: K
): ServiceContainer[K] {
    const val = (container as any)[key] ?? (container.database as any)?.[key];
    if (val !== undefined && val !== null) {
        return val as ServiceContainer[K];
    }
    
    // Optional services should not fall back to the database itself when not present
    const optionalKeys = ['ytdlpService', 'soulseekService', 'torrentService', 'gdriveService'];
    if (optionalKeys.includes(key as string)) {
        return undefined as any;
    }
    
    return (container.database || container) as any;
}
