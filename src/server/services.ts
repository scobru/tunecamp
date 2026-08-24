import path from "path";
import type { ServerConfig } from "./core/config.js";
import type { ServiceContainer } from "./core/container.js";
import {
	createDatabase,
	type DatabaseService as Database,
} from "./core/database.js";
import { LocalDiskStorage } from "./modules/storage/storage.engine.js";
import { OpenRouterService } from "./modules/ai/openrouter.service.js";
import { initAIService } from "./modules/ai/ai.service.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { getScrobbleService } from "./modules/scrobble/scrobble.service.js";
import { LastFmProvider } from "./providers/scrobble/lastfm.provider.js";
import { ListenBrainzProvider } from "./providers/scrobble/listenbrainz.provider.js";
import { WaveformService } from "./modules/waveform/waveform.service.js";
import { createFederatedDiscoveryService } from "./modules/network/federated-discovery.service.js";
import { createCatalogCacheService } from "./modules/network/catalog-cache.service.js";
import { getSiteHandle } from "./core/site-actor.js";
import { createRssService } from "./modules/network/rss.service.js";
import { createFedify } from "./modules/fedify/fedify.js";
import { createActivityPubService } from "./modules/activitypub/activitypub.service.js";
import { createPublishingService } from "./modules/publishing/publishing.service.js";
import { LifecycleService } from "./modules/catalog/lifecycle.service.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { DiscoveryService } from "./modules/catalog/discovery.service.js";
import { DigService } from "./modules/catalog/dig.service.js";
import { GoogleDriveService } from "./modules/storage/google-drive.service.js";
import { initStorageService } from "./modules/storage/storage.service.js";
import { AutoTaggerService } from "./modules/catalog/autotagger.service.js";
import { MaintenanceRepository } from "./repositories/maintenance.repository.js";
import { MaintenanceService } from "./modules/catalog/maintenance.service.js";
import { MediaEngine } from "./modules/media/media-engine.js";
import { SubsonicService } from "./modules/subsonic/subsonic.service.js";
import { Scanner } from "./modules/catalog/scanner.js";
import { initScannerService } from "./modules/catalog/scanner.service.js";
import { initDownloadService } from "./modules/catalog/download.service.js";
import { registerBuiltInDownloadProviders } from "./plugins/index.js";
import { BoardService } from "./modules/board/board.service.js";
import { LiveService } from "./modules/live/live.service.js";
import { RadioService } from "./modules/radio/radio.service.js";
import { TelegramBotService } from "./modules/integrations/telegram-bot.js";
import { createPeerService } from "./modules/peer/peer.service.js";
import { SampleRepository } from "./repositories/sample.repository.js";
import { SamplePackRepository } from "./repositories/sample-pack.repository.js";
import { CollabRepository } from "./repositories/collab.repository.js";
import { taskManager } from "./modules/workers/task-manager.js";
import { scheduleRecurring, type JobHandle } from "./core/scheduler.js";

export interface BootstrappedServices {
	container: ServiceContainer;
	database: Database;
	federation: any;
	publishingService: ReturnType<typeof createPublishingService>;
	peerService: ReturnType<typeof createPeerService>;
	telegramBotService: TelegramBotService;
	radioService: RadioService;
	pluginCleanups: (() => void)[];
	jobHandles: JobHandle[];
	gdriveService?: GoogleDriveService;
}

export async function bootstrapServices(
	config: ServerConfig,
): Promise<BootstrappedServices> {
	console.log(`📦 Initializing database: ${config.dbPath}`);
	const database = createDatabase(config.dbPath);

	const storage = new LocalDiskStorage();

	const openRouterService = new OpenRouterService(database, config);
	initAIService(openRouterService, database);
	console.log(`🔌 [Plugins] AIService initialized with OpenRouter provider`);

	// Startup maintenance and scanner are now triggered manually via frontend
	console.log(
		`📦 [Maintenance] Automatic startup maintenance disabled (trigger via UI)`,
	);

	const authService = createAuthService(
		database.db,
		config.jwtSecret,
		config.adminUser,
		config.adminPass,
	);
	await authService.init();
	const authMiddleware = createAuthMiddleware(authService);

	// Production safety: surface insecure defaults loudly at startup so they
	// aren't silently shipped when the instance is exposed publicly.
	try {
		const warnings: string[] = [];
		const adminUser = config.adminUser || "admin";
		if (await authService.isDefaultPassword(adminUser)) {
			warnings.push(
				`Admin account '${adminUser}' is still using a default/weak password. Change it now (or set TUNECAMP_ADMIN_PASS).`,
			);
		}
		if (!config.corsOrigins || config.corsOrigins.length === 0) {
			warnings.push(
				`CORS is open to all origins. Set TUNECAMP_CORS_ORIGINS to your domain(s) before exposing this instance publicly.`,
			);
		}
		if (!process.env.TUNECAMP_JWT_SECRET) {
			warnings.push(
				`No TUNECAMP_JWT_SECRET set — using an auto-generated secret file. Set an explicit secret for stable sessions across deployments.`,
			);
		}
		if (warnings.length > 0) {
			console.warn(
				"\n⚠️  SECURITY: insecure configuration detected — review before going public:",
			);
			for (const w of warnings) console.warn(`   • ${w}`);
			console.warn("");
		}
	} catch (e) {
		console.warn("⚠️  Could not run startup security checks:", e);
	}

	const { initMetadataService } = await import(
		"./modules/catalog/metadata.service.js"
	);
	const metadataService = await initMetadataService(database);

	const { initStreamingService } = await import(
		"./modules/streaming/streaming.service.js"
	);
	const streamingService = await initStreamingService(database);

	const { initPlaylistService } = await import(
		"./modules/catalog/playlist.service.js"
	);
	const playlistService = await initPlaylistService(database);

	const scrobbleService = getScrobbleService();
	scrobbleService.register(new LastFmProvider(database));
	scrobbleService.register(new ListenBrainzProvider(database));
	const { syncRegistryWithDatabase } = await import("./core/provider.js");
	await syncRegistryWithDatabase(scrobbleService.getRegistry(), database);

	const waveformService = new WaveformService(path.dirname(config.dbPath));

	// Federated (HTTP/NodeInfo gossip) instance discovery. Bootstraps from
	// ActivityPub-followed TuneCamp site actors plus TUNECAMP_FEDERATION_SEEDS —
	// no central relay.
	const federatedDiscoveryService = createFederatedDiscoveryService(
		database.db,
		{
			seeds: config.federationSeeds,
			getOwnOrigin: () => {
				const u = database.getSetting("publicUrl") || config.publicUrl;
				try {
					return u ? new URL(u).origin : undefined;
				} catch {
					return undefined;
				}
			},
			getApSeedOrigins: () =>
				database
					.getFollowedActors()
					.filter(
						(a: any) =>
							a.type === "Service" ||
							a.username === "site" ||
							a.username === getSiteHandle(database),
					)
					.map((a: any) => {
						try {
							return new URL(a.uri).origin;
						} catch {
							return null;
						}
					})
					.filter((o: any): o is string => !!o),
		},
	);

	// Shared stale-while-revalidate cache for remote peer catalogs (HTTP federation).
	const catalogCache = createCatalogCacheService(database.db);

	let gdriveService: GoogleDriveService | undefined;

	const jobHandles: JobHandle[] = [];

	const isSolo = database.getSetting("mode") === "single_artist";

	// Federated discovery crawl: shortly after boot, then periodically.
	if (!isSolo) {
		jobHandles.push(
			scheduleRecurring(
				() =>
					taskManager.run("federated-discovery", () =>
						federatedDiscoveryService.crawl(),
					),
				{ initialDelayMs: 45000, intervalMs: 6 * 60 * 60 * 1000 },
			),
		);
	}

	// Scheduled off-peak library scan
	jobHandles.push(
		scheduleRecurring(
			() => {
				try {
					const hourSetting = (
						database.getSetting("scheduledScanHour") || ""
					).trim();
					if (hourSetting === "") return;
					if (new Date().getHours() !== Number(hourSetting)) return;

					const lastRun = database.getSetting("scheduledScanLastRun");
					if (
						lastRun &&
						Date.now() - new Date(lastRun).getTime() < 20 * 60 * 60 * 1000
					)
						return;

					const started = taskManager.run("library-rescan", async () => {
						console.log(
							`🌙 [Scheduler] Starting scheduled library scan (hour ${hourSetting})`,
						);
						const result = await scanner.scanDirectory(
							config.musicDir,
							(processed, total) => {
								taskManager.updateProgress(
									"library-rescan",
									processed,
									total,
									`Scheduled scan: ${processed}/${total} files`,
								);
							},
						);
						console.log(
							`🌙 [Scheduler] Scheduled scan complete. Processed ${result.successful.length} files.`,
						);
						return {
							processed: result.successful.length,
							failed: result.failed.length,
						};
					});
					if (started)
						database.setSetting(
							"scheduledScanLastRun",
							new Date().toISOString(),
						);
				} catch (e) {
					console.error("❌ [Scheduler] Scheduled scan check failed:", e);
				}
			},
			{ intervalMs: 15 * 60 * 1000 },
		),
	);

	// Periodically refresh followed RSS/Atom sources
	const rssService = createRssService(database);
	if (!isSolo) {
		jobHandles.push(
			scheduleRecurring(
				() => taskManager.run("rss-refresh", () => rssService.refreshAll()),
				{ initialDelayMs: 90 * 1000, intervalMs: 30 * 60 * 1000 },
			),
		);
	}

	const federation = createFedify(database, config);

	const apService = createActivityPubService(
		database as any,
		config,
		federation,
	);
	await apService.generateKeysForAllArtists();
	apService.startDeliveryQueue();

	const publishingService = createPublishingService(
		database,
		federatedDiscoveryService,
		apService,
		config,
		storage,
	);

	const lifecycleService = new LifecycleService(
		database,
		publishingService,
		apService,
	);

	const catalogService = new CatalogService(
		database,
		publishingService,
		storage,
		config.musicDir,
		openRouterService,
		metadataService,
		apService,
	);
	const discoveryService = new DiscoveryService(
		database,
		openRouterService,
		metadataService,
	);
	const digService = new DigService(database);

	if (config.gdriveClientId && config.gdriveClientSecret) {
		const dbPublicUrl = database.getSetting("publicUrl");
		const publicUrl = (
			dbPublicUrl ||
			config.publicUrl ||
			`http://localhost:${config.port}`
		)
			.trim()
			.replace(/\/$/, "");
		const redirectUri = `${publicUrl}/api/storage/gdrive/callback`;
		gdriveService = new GoogleDriveService(database, {
			clientId: config.gdriveClientId,
			clientSecret: config.gdriveClientSecret,
			redirectUri,
		});
		const adminRow = database.db
			.prepare("SELECT id FROM admin ORDER BY id ASC LIMIT 1")
			.get() as any;
		initStorageService(gdriveService, adminRow?.id ?? 1);
	}

	const autotaggerService = new AutoTaggerService(
		database,
		catalogService,
		openRouterService,
	);
	const maintenanceRepo = new MaintenanceRepository(database.db);
	const maintenanceService = new MaintenanceService(
		maintenanceRepo,
		database,
		catalogService,
		openRouterService,
		autotaggerService,
		config.musicDir,
	);

	const mediaEngine = new MediaEngine(
		database,
		config.musicDir,
		gdriveService,
		streamingService,
		{
			transcodeCacheDir: config.transcodeCacheDir,
			transcodeCacheMaxBytes: config.transcodeCacheMaxBytes,
			xaccelRedirect: config.xaccelRedirect,
			xaccelMediaPrefix: config.xaccelMediaPrefix,
			xaccelCachePrefix: config.xaccelCachePrefix,
		},
	);
	const subsonicService = new SubsonicService(database);

	const scanner = new Scanner(
		database,
		storage,
		autotaggerService,
		catalogService,
	);
	const scannerService = await initScannerService(database, scanner);

	const downloadService = initDownloadService(database);

	// Dynamically register optional P2P providers
	const {
		cleanups: pluginCleanups,
		torrentService,
		ytdlpService,
	} = await registerBuiltInDownloadProviders(downloadService, {
		database,
		scanner,
		config,
		defaultOwnerId: 1,
		publishingService,
		catalogService,
		streamingService,
	});

	const boardService = new BoardService(database);
	const liveService = new LiveService();
	const radioService = new RadioService(database, config.musicDir);
	const telegramBotService = new TelegramBotService(
		database,
		scanner,
		config,
		openRouterService,
	);
	const peerService = createPeerService(database, apService);
	const samplesRepository = new SampleRepository(database.db);
	const samplePacksRepository = new SamplePackRepository(database.db);
	const collabRepository = new CollabRepository(database.db);

	const container: ServiceContainer = {
		database,
		identity: database.identity,
		library: database.library,
		social: database.social,
		integration: database.integration,
		config,
		musicDir: config.musicDir,
		authService,
		authMiddleware,
		scanner,
		scannerService,
		catalogService,
		discoveryService,
		digService,
		metadataService,
		maintenanceService,
		ytdlpService,
		mediaEngine,
		waveformService,
		streamingService,
		subsonicService,
		scrobbleService,
		playlistService,
		publishingService,
		apService,
		federatedDiscoveryService,
		catalogCache,
		lifecycleService,
		telegramBotService,
		boardService,
		liveService,
		radioService,
		peerService,
		samplesRepository,
		samplePacksRepository,
		collabRepository,
		torrentService,
		gdriveService,
		openRouterService,
		storage,
	};

	return {
		container,
		database,
		federation,
		publishingService,
		peerService,
		telegramBotService,
		radioService,
		pluginCleanups,
		jobHandles,
		gdriveService,
	};
}
