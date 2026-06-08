import "reflect-metadata";
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import http from "http";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { isNonFatalError } from "./common/errors.js";
import type { ServiceContainer } from "./core/container.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

// Global crash protection for async modules
process.on('uncaughtException', (err: any) => {
    console.error('🌊 SEVERE: Uncaught Exception:', err);
    if (isNonFatalError(err)) {
        console.warn('⚠️ Non-fatal exception caught, staying alive...');
        return;
    }

    console.warn('⚠️ Attempting to continue despite uncaught exception...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🌊 SEVERE: Unhandled Rejection at:', promise, 'reason:', reason);
});

import type { ServerConfig } from "./core/config.js";
import { createDatabase } from "./core/database.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createAuthRoutes } from "./routes/auth/auth.js";
import { createAdminRoutes } from "./routes/admin/admin.js";
import { createCatalogRoutes } from "./routes/library/catalog.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { DiscoveryService } from "./modules/catalog/discovery.service.js";
import { LocalDiskStorage } from "./modules/storage/storage.engine.js";
import { createAlbumsRoutes } from "./routes/library/albums.js";
import { createTracksRoutes } from "./routes/library/tracks.js";
import { createArtistsRoutes } from "./routes/library/artists.js";
import { createPlaylistsRoutes } from "./routes/library/playlists.js";
import { createUploadRoutes } from "./routes/library/upload.js";
import { createReleaseRouter } from "./routes/library/releases.js";
import { createImportRoutes } from "./routes/library/import.js";
import { createStatsRoutes } from "./routes/admin/stats.js";
import { createUsersRoutes } from "./routes/auth/users.js";
import { createCommentsRoutes } from "./routes/network/comments.js";
import { Scanner } from "./modules/catalog/scanner.js";
import { initScannerService } from "./modules/catalog/scanner.service.js";
import { initStreamingService } from "./modules/streaming/streaming.service.js";
import { getScrobbleService } from "./modules/scrobble/scrobble.service.js";
import { LastFmProvider } from "./providers/scrobble/lastfm.provider.js";
import { ListenBrainzProvider } from "./providers/scrobble/listenbrainz.provider.js";
import { metadataService } from "./modules/catalog/metadata.service.js";
import { initDownloadService } from "./modules/catalog/download.service.js";
import { loadPlugins } from "./core/plugin-loader.js";
import { storageService, initStorageService } from "./modules/storage/storage.service.js";
import { aiService, initAIService } from "./modules/ai/ai.service.js";
import { createZenDBService } from "./modules/network/zendb.service.js";
import { createLibraryStatsRoutes } from "./routes/admin/library-stats.js";
import { createBrowserRoutes } from "./routes/admin/browser.js";
import { createMetadataRoutes } from "./routes/admin/metadata.js";
import { createUnlockRoutes } from "./routes/api/unlock.js";
import { createPaymentsRoutes } from "./routes/api/payments.js";
import { ActivityPubService, createActivityPubService } from "./modules/activitypub/activitypub.service.js";
import { createActivityPubRoutes } from "./routes/network/activitypub.js";
import { createPublishingService } from "./modules/publishing/publishing.service.js";
import { LifecycleService } from "./modules/catalog/lifecycle.service.js";
import { createLifecycleRoutes } from "./routes/api/lifecycle.js";
import { integrateFederation } from "@fedify/express";
import { createFedify } from "./modules/fedify/fedify.js";
import { createBackupRoutes } from "./routes/admin/backup.js";
import { createSubsonicRouter } from "./routes/api/subsonic.js";
import { createProxyRoutes } from "./routes/network/proxy.js";
import { createMiscRoutes } from "./routes/api/misc.js";
import { WaveformService } from "./modules/waveform/waveform.service.js";
import { securityHeaders } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { SoulseekService } from "./modules/integrations/soulseek.js";
import { TelegramBotService } from "./modules/integrations/telegram-bot.js";
import { MaintenanceService } from "./modules/catalog/maintenance.service.js";
import { OpenRouterService } from "./modules/ai/openrouter.service.js";
import { AutoTaggerService } from "./modules/catalog/autotagger.service.js";
import { createSearchRoutes } from "./routes/network/search.js";
import { GoogleDriveService } from "./modules/storage/google-drive.service.js";
import { createStorageRouter } from "./routes/library/storage.js";
import { TorrentService } from "./modules/integrations/torrent.service.js";
import { createTorrentRoutes } from "./routes/network/torrent.js";
import { createTorrentSearchRouter } from "./routes/admin/torrent-search.js";
import { torrentSearchService } from "./modules/integrations/torrent-search.service.js";
import { PublicScraperTorrentProvider } from "./providers/torrent/public-scraper.provider.js";
import { errorHandler } from "./middleware/error-handling.js";
import { kprs } from "./modules/network/zen-network.js";
import { getZen } from "./modules/network/zen.js";
import { LocalizationService } from "./modules/catalog/localization.service.js";
import { MediaEngine } from "./modules/media/media-engine.js";
import { SubsonicService } from "./modules/subsonic/subsonic.service.js";
import { taskManager } from "./modules/workers/task-manager.js";
import { createTaskRoutes } from "./routes/admin/tasks.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();
    app.set('trust proxy', true); // Required for CapRover/Nginx
    const server = http.createServer(app);

    // Middleware
    app.use(compression());
    app.use(securityHeaders);
    
    // API Rate limit
    app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 })); 
    app.use('/rest', rateLimit({ windowMs: 15 * 60 * 1000, max: 5000 }));

    const corsOrigin = config.corsOrigins && config.corsOrigins.length > 0 ? config.corsOrigins : true;
    app.use(cors({ origin: corsOrigin, credentials: true }));

    console.log(`📦 Initializing database: ${config.dbPath}`);
    const database = createDatabase(config.dbPath);

    const storage = new LocalDiskStorage();

    const openRouterService = new OpenRouterService(database, config);
    initAIService(openRouterService, database);
    console.log(`🔌 [Plugins] AIService initialized with OpenRouter provider`);

    // Startup maintenance and scanner are now triggered manually via frontend
    console.log(`📦 [Maintenance] Automatic startup maintenance disabled (trigger via UI)`);

    const authService = createAuthService(database.db, config.jwtSecret, config.adminUser, config.adminPass);
    await authService.init();
    const authMiddleware = createAuthMiddleware(authService);
    
    const { initMetadataService } = await import("./modules/catalog/metadata.service.js");
    const metadataService = await initMetadataService(database);

    const streamingService = await initStreamingService(database);

    const { initPlaylistService } = await import("./modules/catalog/playlist.service.js");
    const playlistService = await initPlaylistService(database);

    const scrobbleService = getScrobbleService();
    scrobbleService.register(new LastFmProvider(database));
    scrobbleService.register(new ListenBrainzProvider(database));
    const { syncRegistryWithDatabase } = await import("./core/provider.js");
    await syncRegistryWithDatabase(scrobbleService.getRegistry(), database);

    const waveformService = new WaveformService(path.dirname(config.dbPath));

    const zendbService = createZenDBService(database, undefined, config.zenPeers, config.publicUrl);
    await zendbService.init();

    let gdriveService: GoogleDriveService | undefined;

    setTimeout(() => {
        taskManager.run('zendb-cleanup', () => zendbService.cleanupRegistry());
    }, 60000);

    setInterval(() => {
        taskManager.run('zendb-cleanup', () => zendbService.cleanupRegistry());
    }, 12 * 60 * 60 * 1000);

    app.get("/api/peers", (req, res) => {
        res.status(200).json(Array.from(kprs));
    });

    const federation = createFedify(database, config);

    const apService = createActivityPubService(database as any, config, federation);
    await apService.generateKeysForAllArtists();
    apService.startDeliveryQueue();

    const publishingService = createPublishingService(database, zendbService, apService, config, storage);

    const lifecycleService = new LifecycleService(database, publishingService, apService);

    const catalogService = new CatalogService(database, publishingService, zendbService, storage, config.musicDir, openRouterService, metadataService);
    const discoveryService = new DiscoveryService(database, openRouterService, metadataService);

    const localizationService = new LocalizationService(database, catalogService, config.musicDir, process.env.YOUTUBE_COOKIES_PATH);

    if (config.gdriveClientId && config.gdriveClientSecret) {
        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = (dbPublicUrl || config.publicUrl || `http://localhost:${config.port}`).trim().replace(/\/$/, "");
        const redirectUri = `${publicUrl}/api/storage/gdrive/callback`;
        gdriveService = new GoogleDriveService(database, {
            clientId: config.gdriveClientId,
            clientSecret: config.gdriveClientSecret,
            redirectUri
        });
        const adminRow = database.db.prepare("SELECT id FROM admin ORDER BY id ASC LIMIT 1").get() as any;
        initStorageService(gdriveService, adminRow?.id ?? 1);
        localizationService.setGDriveService(gdriveService);
    }

    const autotaggerService = new AutoTaggerService(database, catalogService, openRouterService);
    const maintenanceService = new MaintenanceService(database, catalogService, openRouterService, autotaggerService);
    
    const mediaEngine = new MediaEngine(database, config.musicDir, gdriveService, streamingService, {
        transcodeCacheDir: config.transcodeCacheDir,
        transcodeCacheMaxBytes: config.transcodeCacheMaxBytes,
        xaccelRedirect: config.xaccelRedirect,
        xaccelMediaPrefix: config.xaccelMediaPrefix,
        xaccelCachePrefix: config.xaccelCachePrefix,
    });
    const subsonicService = new SubsonicService(database);

    const scanner = new Scanner(database, storage, autotaggerService, catalogService);
    const scannerService = await initScannerService(database, scanner);

    const soulseekService = new SoulseekService(config.musicDir, config.downloadDir || path.join(config.musicDir, "downloads"));
    
    const torrentService = new TorrentService(database, scanner, config.musicDir);

    const downloadService = initDownloadService(soulseekService, torrentService, 1, database);

    torrentSearchService.registerProvider(new PublicScraperTorrentProvider());
    console.log(`🔌 [Integrations] TorrentSearch initialized with PublicScraper provider`);

    const telegramBotService = new TelegramBotService(database, scanner, config, openRouterService);

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
        metadataService,
        maintenanceService,
        localizationService,
        mediaEngine,
        waveformService,
        streamingService,
        subsonicService,
        scrobbleService,
        playlistService,
        publishingService,
        apService,
        zendbService,
        lifecycleService,
        telegramBotService,
        soulseekService,
        torrentService: torrentService as any,
        gdriveService,
        openRouterService,
        storage
    };

    app.use("/api/admin/upload", authMiddleware.requireUser, createUploadRoutes(container));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(container, () => {
        process.exit(0);
    }));
    app.use("/api/admin/torrents", authMiddleware.requireManager, express.json(), createTorrentRoutes(container));
    app.use("/api/admin/torrent-search", authMiddleware.requireManager, express.json(), createTorrentSearchRouter(container));

    // Health endpoint MUST be before fedify middleware to avoid blocking
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Scope fedify to federation paths only — global use() was blocking ALL requests
    const fedifyMiddleware = integrateFederation(federation, () => undefined);
    app.use((req, res, next) => {
        const p = req.path;
        if (
            p === "/.well-known" || p.startsWith("/.well-known/") ||
            p === "/users" || p.startsWith("/users/") ||
            p === "/ap" || p.startsWith("/ap/") ||
            p === "/audio" || p.startsWith("/audio/") ||
            p === "/nodeinfo" || p.startsWith("/nodeinfo/") ||
            p === "/inbox"
        ) {
            return fedifyMiddleware(req, res, next);
        }
        next();
    });
    app.use("/api/payments", createPaymentsRoutes(container));

    const webappPath = path.join(__dirname, "..", "..", "webapp");
    const webappDistPath = path.join(webappPath, "dist");
    const webappPublicPath = path.join(webappPath, "public");

    const findStaticFile = (filename: string) => {
        const candidates = [
            path.join(webappDistPath, filename),
            path.join(webappPath, filename),
            path.join(webappPublicPath, filename),
            path.join(process.cwd(), "webapp", "dist", filename),
            path.join(process.cwd(), "webapp", "public", filename),
            path.join(process.cwd(), "webapp", filename),
            "/app/webapp/dist/" + filename,
            "/app/webapp/public/" + filename,
        ];
        return candidates.find(p => fs.existsSync(p));
    };

    app.get("/sw.js", (req, res) => {
        const foundPath = findStaticFile("sw.js");
        if (foundPath) return res.sendFile(path.resolve(foundPath));
        res.status(404).send("sw.js not found");
    });

    app.get("/manifest.json", (req, res) => {
        const foundPath = findStaticFile("manifest.json");
        if (foundPath) return res.sendFile(path.resolve(foundPath));
        res.status(404).json({ error: "manifest.json not found" });
    });

    app.use("/", createMiscRoutes(container));

    app.use("/rest", createSubsonicRouter(container));

    // Health endpoint moved before fedify middleware (see above)

    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(container));
    app.use("/api/admin", authMiddleware.requireUser, createAdminRoutes(container));
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(container));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(container));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(container));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(container));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(container));


    if (gdriveService) {
        app.use("/api/storage", createStorageRouter(container));
    }

    app.use("/api/import", authMiddleware.requireUser, createImportRoutes(container));

    const releaseRouter = createReleaseRouter(container);
    app.use("/api/releases", authMiddleware.optionalAuth, releaseRouter);
    app.use("/api/admin/releases", authMiddleware.requireUser, releaseRouter);
    app.use("/api/stats", createStatsRoutes(container));
    app.use("/api/stats/library", createLibraryStatsRoutes(container));
    app.use("/api/browser", authMiddleware.requireRootAdmin, createBrowserRoutes(container));
    app.use("/api/metadata", authMiddleware.requireRootAdmin, createMetadataRoutes(container));
    app.use("/api/users", createUsersRoutes(container));
    app.use("/api/comments", createCommentsRoutes(container));
    app.use("/api/unlock", createUnlockRoutes(container));

    // Public assets store

    app.use("/api/lifecycle", authMiddleware.requireUser, createLifecycleRoutes(container));
    app.use("/api/admin/lifecycle", authMiddleware.requireAdmin, createLifecycleRoutes(container));
    app.use("/api/ap", createActivityPubRoutes(container));
    app.use("/api/proxy", createProxyRoutes(container));
    app.use("/api/admin/tasks", authMiddleware.requireAdmin, createTaskRoutes(container));
    app.use("/api/search", authMiddleware.optionalAuth, createSearchRoutes(container));





    if (fs.existsSync(webappDistPath)) app.use(express.static(webappDistPath, { index: false }));
    if (fs.existsSync(webappPublicPath)) app.use(express.static(webappPublicPath, { index: false }));
    app.use(express.static(webappPath, { index: false }));

    const indexHtmlPath = fs.existsSync(path.join(webappDistPath, "index.html")) 
        ? path.join(webappDistPath, "index.html") 
        : path.join(webappPath, "index.html");

    let cachedIndexHtml: string | null = null;
    const getCachedHtml = () => {
        if (cachedIndexHtml && process.env.NODE_ENV === 'production') return cachedIndexHtml;
        try {
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            if (process.env.NODE_ENV === 'production') cachedIndexHtml = html;
            return html;
        } catch (e) { return "Error loading app"; }
    };

    app.get("/share/:id", async (req, res) => {
        const { id } = req.params;
        let title = "Shared from TuneCamp", description = "Music shared via TuneCamp", image = "";
        if (id.startsWith('tr_')) {
            const track = database.getTrack(parseInt(id.substring(3)));
            if (track) { title = track.title || "Track"; description = `Track by ${track.artist_name || 'Unknown Artist'}`; image = `/api/tracks/${track.id}/cover`; }
        } else if (id.startsWith('al_')) {
            const album = database.getAlbum(parseInt(id.substring(3)));
            if (album) { title = album.title || "Album"; description = `Album by ${album.artist_name || 'Unknown Artist'}`; image = `/api/albums/${album.id}/cover`; }
        }
        try {
            let html = getCachedHtml();
            const publicUrl = (database.getSetting("publicUrl") || config.publicUrl || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, "");
            const ogTags = `<meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:image" content="${publicUrl}${image}" />`;
            html = html.replace('<head>', '<head>' + ogTags);
            res.send(html);
        } catch (e) { res.redirect(`/#/share/${id}`); }
    });

    app.get("*", (req, res) => {
        if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
        res.send(getCachedHtml());
    });

    app.use(errorHandler);

    server.listen(config.port, async () => {
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        server.keepAliveTimeout = 300000;
        server.headersTimeout = 301000;

        // Async Background integrations start after the HTTP server is bound!
        const slskUser = database.getSetting("soulseek_username");
        const slskPass = database.getSetting("soulseek_password");
        soulseekService.connect(slskUser, slskPass).catch(err => console.error("Soulseek initial connection failed:", err));
        
        telegramBotService.start().catch((err: any) => console.error("Telegram Bot failed to start:", err));

        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = (dbPublicUrl || config.publicUrl || "").trim().replace(/\/$/, "");

        if (publicUrl) {
            const siteInfo = {
                url: publicUrl,
                title: database.getSetting("siteName") || config.siteName || "TuneCamp Server",
                description: database.getSetting("siteDescription") || "TuneCamp music server",
                artistName: database.getSetting("artistName") || "",
                coverImage: database.getSetting("coverImage") || ""
            };
            await zendbService.registerSite(siteInfo);
            setTimeout(async () => { await publishingService.syncCommunityFollows().catch(() => {}); }, 20000);
        }

        loadPlugins().catch(() => {});
    });

    const gracefulShutdown = async (signal: string) => {
        console.log(`\n🛑 [${signal}] Graceful shutdown initiated...`);
        const timeout = setTimeout(() => {
            console.error('⏰ Shutdown timed out after 15s, forcing exit.');
            process.exit(1);
        }, 15000);

        try {
            // 1. Stop accepting new connections
            await new Promise<void>((resolve) => server.close(() => resolve()));
            console.log('  ✓ HTTP server closed');
        } catch (e) { console.warn('  ⚠ HTTP server close error:', e); }

        try { telegramBotService.stop(); console.log('  ✓ Telegram bot stopped'); }
        catch (e) { console.warn('  ⚠ Telegram stop error:', e); }

        try { soulseekService.disconnect(); console.log('  ✓ Soulseek disconnected'); }
        catch (e) { console.warn('  ⚠ Soulseek disconnect error:', e); }

        try { torrentService.shutdown(); console.log('  ✓ TorrentService shut down'); }
        catch (e) { console.warn('  ⚠ Torrent shutdown error:', e); }

        try { database.db.close(); console.log('  ✓ Database closed'); }
        catch (e) { console.warn('  ⚠ Database close error:', e); }

        clearTimeout(timeout);
        console.log('👋 Shutdown complete.');
        process.exit(0);
    };

    process.on("SIGINT", () => gracefulShutdown('SIGINT'));
    process.on("SIGTERM", () => gracefulShutdown('SIGTERM'));
}

export async function stopServer(): Promise<void> {
    // Graceful shutdown is handled by SIGINT/SIGTERM handlers inside startServer.
    // This export remains for API compatibility.
}
