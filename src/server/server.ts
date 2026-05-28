import "reflect-metadata";
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import http from "http";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { isNonFatalError } from "./common/errors.js";

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
import { federationService, initFederationService } from "./modules/activitypub/federation.service.js";
import { aiService, initAIService } from "./modules/ai/ai.service.js";
import { createZenDBService } from "./modules/network/zendb.service.js";
import { createLibraryStatsRoutes } from "./routes/admin/library-stats.js";
import { createBrowserRoutes } from "./routes/admin/browser.js";
import { createMetadataRoutes } from "./routes/admin/metadata.js";
import { createUnlockRoutes } from "./routes/api/unlock.js";
import { createPaymentsRoutes } from "./routes/api/payments.js";
import { ActivityPubService, createActivityPubService } from "./modules/activitypub/activitypub.service.js";
import type { FederationProvider } from "./modules/activitypub/federation.provider.js";
import { createActivityPubRoutes } from "./routes/network/activitypub.js";
import { createPublishingService } from "./modules/publishing/publishing.service.js";
import { LifecycleService } from "./modules/catalog/lifecycle.service.js";
import { createLifecycleRoutes } from "./routes/api/lifecycle.js";
import { integrateFederation } from "@fedify/express";
import { createFedify } from "./modules/fedify/fedify.js";
import { createBackupRoutes } from "./routes/admin/backup.js";
import { createSubsonicRouter } from "./routes/api/subsonic.js";
import { createProxyRoutes } from "./routes/network/proxy.js";
import { WaveformService } from "./modules/waveform/waveform.service.js";
import { securityHeaders } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { SoulseekService } from "./modules/integrations/soulseek.js";
import { TelegramBotService } from "./modules/integrations/telegram-bot.js";
import { MaintenanceService } from "./modules/catalog/maintenance.service.js";
import { OpenRouterService } from "./modules/ai/openrouter.service.js";
import { AutoTaggerService } from "./modules/catalog/autotagger.service.js";
import { FingerprintService } from "./modules/media/fingerprint.service.js";
import { createSearchRoutes } from "./routes/network/search.js";
import { GoogleDriveService } from "./modules/storage/google-drive.service.js";
import { createStorageRouter } from "./routes/library/storage.js";
import { runStartupMaintenance } from "./modules/catalog/maintenance.startup.js";
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

    const federationProvider: FederationProvider = {
        getSetting: (key) => database.getSetting(key),
        setSetting: (key, val) => database.setSetting(key, val),
        getArtist: (id) => database.getArtist(id),
        getArtistBySlug: (slug) => database.getArtistBySlug(slug),
        getArtists: () => database.getArtists(),
        updateArtistKeys: (id, pub, priv) => database.updateArtistKeys(id, pub, priv),
        getReleases: () => database.getReleases(),
        getReleasesByArtist: (id) => database.getReleasesByArtist(id),
        getTracksByReleaseId: (id) => database.getTracksByReleaseId(id),
        getPostsByArtist: (id) => database.getPostsByArtist(id),
        getRemoteActor: (uri) => database.getRemoteActor(uri),
        upsertRemoteActor: (actor) => database.upsertRemoteActor(actor as any),
        upsertRemoteContent: (content) => database.upsertRemoteContent(content as any),
        unfollowActor: (uri) => database.unfollowActor(uri),
        getFollowers: (id) => database.getFollowers(id),
        addFollower: (id, actor, inbox) => database.addFollower(id, actor, inbox),
        createApNote: (aid, nid, type, cid, slug, title) => database.createApNote(aid, nid, type, cid, slug, title),
        getApNotes: (id, del) => database.getApNotes(id, del),
        getApNote: (id) => database.getApNote(id),
        markApNoteDeleted: (id) => database.markApNoteDeleted(id)
    };

    const apService = createActivityPubService(federationProvider, config, federation);
    await apService.generateKeysForAllArtists();

    await initFederationService(database, zendbService, apService);

    const publishingService = createPublishingService(database, zendbService, apService, config, storage);

    const lifecycleService = new LifecycleService(database, publishingService, apService);

    const fingerprintService = new FingerprintService();

    const catalogService = new CatalogService(database, publishingService, zendbService, storage, config.musicDir, fingerprintService, openRouterService, metadataService);
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
    const maintenanceService = new MaintenanceService(database, catalogService, openRouterService, fingerprintService, zendbService, autotaggerService);
    
    const mediaEngine = new MediaEngine(database, config.musicDir, gdriveService, streamingService);
    const subsonicService = new SubsonicService(database);

    const scanner = new Scanner(database, storage, autotaggerService, catalogService);
    const scannerService = await initScannerService(database, scanner);

    const soulseekService = new SoulseekService(config.musicDir, config.downloadDir || path.join(config.musicDir, "downloads"));
    
    const torrentService = new TorrentService(database, scanner, config.musicDir);

    const downloadService = initDownloadService(soulseekService, torrentService, 1, database);

    torrentSearchService.registerProvider(new PublicScraperTorrentProvider());
    console.log(`🔌 [Integrations] TorrentSearch initialized with PublicScraper provider`);

    const telegramBotService = new TelegramBotService(database, scanner, config, openRouterService);

    app.use("/api/admin/upload", authMiddleware.requireUser, createUploadRoutes(database, scanner, config.musicDir, publishingService, storage, authService));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(database, config, () => {
        process.exit(0);
    }, gdriveService));
    app.use("/api/admin/torrents", authMiddleware.requireManager, express.json(), createTorrentRoutes(database, torrentService, authService));
    app.use("/api/admin/torrent-search", authMiddleware.requireManager, express.json(), createTorrentSearchRouter(database, torrentService as any, authService));

    // Health endpoint MUST be before fedify middleware to avoid blocking
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Scope fedify to federation paths only — global use() was blocking ALL requests
    app.use("/.well-known", integrateFederation(federation, () => undefined));
    app.use("/users", integrateFederation(federation, () => undefined));
    app.use("/ap", integrateFederation(federation, () => undefined));
    app.use("/api/payments", createPaymentsRoutes(database, config.musicDir, config));

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

    app.get("/api/waveform/:id(*)", async (req, res) => {
        try {
            const idParam = req.params.id;
            const trackId = parseInt(idParam);
            if (!isNaN(trackId) && trackId.toString() === idParam) {
                const track = database.getTrack(trackId);
                if (track && track.file_path) {
                    const filePath = path.join(config.musicDir, track.file_path);
                    const svg = await waveformService.getWaveformSVG(trackId, filePath);
                    res.setHeader("Content-Type", "image/svg+xml");
                    res.setHeader("Cache-Control", "public, max-age=31536000");
                    return res.send(svg);
                }
            }
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=31536000");
            return res.send('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100" viewBox="0 0 800 100"><line x1="0" y1="50" x2="800" y2="50" stroke="#888" stroke-width="2"/></svg>');
        } catch (e) {
            res.status(500).send("Error generating waveform");
        }
    });

    app.use("/rest", createSubsonicRouter({ db: database, auth: authService, musicDir: config.musicDir, zendbService, scrobbleService, mediaEngine }));

    // Health endpoint moved before fedify middleware (see above)

    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService, authMiddleware));
    app.use("/api/admin", authMiddleware.requireUser, createAdminRoutes(
        database, scannerService, config.musicDir, zendbService, config, authService, publishingService, apService, telegramBotService, soulseekService, metadataService, streamingService, federationService, gdriveService, playlistService, scrobbleService, maintenanceService, localizationService
    ));
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(catalogService, discoveryService));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database, config.musicDir, metadataService, catalogService, discoveryService));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database, catalogService, discoveryService, config.musicDir));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database, publishingService, catalogService, discoveryService, config.musicDir, authService, gdriveService, streamingService, localizationService, mediaEngine));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(database, zendbService));


    if (gdriveService) {
        app.use("/api/storage", createStorageRouter(database, gdriveService, authMiddleware, catalogService, discoveryService));
    }

    app.use("/api/import", authMiddleware.requireUser, createImportRoutes());

    const releaseRouter = createReleaseRouter(database, scannerService, publishingService, authService, config.musicDir);
    app.use("/api/releases", authMiddleware.optionalAuth, releaseRouter);
    app.use("/api/admin/releases", authMiddleware.requireUser, releaseRouter);
    app.use("/api/stats", createStatsRoutes(zendbService, database, config));
    app.use("/api/stats/library", createLibraryStatsRoutes(database));
    app.use("/api/browser", authMiddleware.requireRootAdmin, createBrowserRoutes(config.musicDir, database));
    app.use("/api/metadata", authMiddleware.requireRootAdmin, createMetadataRoutes(database, config.musicDir, maintenanceService, catalogService));
    app.use("/api/users", createUsersRoutes(zendbService, database, authService, apService));
    app.use("/api/comments", createCommentsRoutes(zendbService));
    app.use("/api/unlock", createUnlockRoutes(database, authMiddleware));
    app.use("/api/lifecycle", authMiddleware.requireUser, createLifecycleRoutes(lifecycleService));
    app.use("/api/admin/lifecycle", authMiddleware.requireAdmin, createLifecycleRoutes(lifecycleService));
    app.use("/api/ap", createActivityPubRoutes(apService, database, authMiddleware));
    app.use("/api/proxy", createProxyRoutes());
    app.use("/api/admin/tasks", authMiddleware.requireAdmin, createTaskRoutes());
    app.use("/api/search", authMiddleware.optionalAuth, createSearchRoutes(database, soulseekService, scannerService, metadataService, streamingService));

    app.get("/api/plugins", authMiddleware.requireAdmin, (_req, res) => {
        res.json({
            metadata:    metadataService.getRegistry().getRegistryInfo(),
            scanner:     scannerService.getRegistry().getRegistryInfo(),
            streaming:   streamingService.getRegistry().getRegistryInfo(),
            federation:  federationService.getRegistry().getRegistryInfo(),
            playlist:    playlistService.getRegistry().getRegistryInfo(),
        });
    });

    app.get("/api/v1/federation/libraries", async (_req, res) => {
        const publicUrl = (database.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`).trim().replace(/\/$/, "");
        const stats = await database.getStats();
        res.json({
            count: 1,
            results: [{
                uuid: "tunecamp-library",
                fid: `${publicUrl}/federation/libraries/tunecamp-library`,
                name: database.getSetting("siteName") || config.siteName || "TuneCamp Library",
                description: database.getSetting("siteDescription") || "Tunecamp music library",
                privacy_level: "everyone",
                creation_date: new Date().toISOString(),
                uploads_count: stats.tracks,
                size: 0,
                actor: {
                    fid: `${publicUrl}/users/site`,
                    url: publicUrl,
                    name: database.getSetting("siteName") || "TuneCamp",
                    preferred_username: "site",
                    domain: new URL(publicUrl).hostname,
                }
            }]
        });
    });

    app.get("/api/v1/instance/nodeinfo/2.0", async (_req, res) => {
        const stats = await database.getStats();
        res.json({
            version: "2.0",
            software: { name: "tunecamp", version: "2.0.0" },
            protocols: ["activitypub"],
            openRegistrations: false,
            usage: {
                users: { total: stats.artists || 1, activeHalfyear: stats.artists || 1, activeMonth: stats.artists || 1 },
                localPosts: stats.tracks + (stats.albums || 0),
                localComments: 0,
            },
            metadata: {
                nodeName: database.getSetting("siteName") || config.siteName || "TuneCamp",
                library: { federationEnabled: true },
            }
        });
    });

    app.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        res.redirect(artist ? `/artists/${artist.slug}` : "/");
    });

    app.get("/artist/:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        res.redirect(artist ? `/#/artist/${artist.slug}` : "/");
    });

    app.get("/note/release/:slug", (req, res) => {
        const { slug } = req.params;
        const album = database.getAlbumBySlug(slug);
        if (album) res.redirect(`/#/album/${album.slug}`);
        else res.status(404).send("Release not found");
    });

    app.get("/note/post/:slug", (req, res) => {
        const { slug } = req.params;
        const post = database.getPostBySlug(slug);
        if (post) {
            const artist = database.getArtist(post.artist_id);
            res.redirect(artist ? `/artists/${artist.slug}?post=${post.slug}` : "/");
        } else res.status(404).send("Post not found");
    });

    app.get("/api/settings/background", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const bgFile = files.find((f) => f.startsWith("background."));
            if (!bgFile) return res.status(404).json({ error: "Not found" });
            res.sendFile(path.resolve(path.join(assetsDir, bgFile)));
        } catch { res.status(404).json({ error: "Not found" }); }
    });

    app.get("/api/settings/logo", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const logoFile = files.find((f) => f.startsWith("site-logo."));
            if (!logoFile) return res.status(404).json({ error: "Not found" });
            res.sendFile(path.resolve(path.join(assetsDir, logoFile)));
        } catch { res.status(404).json({ error: "Not found" }); }
    });

    app.get("/api/settings/cover", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const coverFile = files.find((f) => f.startsWith("site-cover."));
            if (!coverFile) return res.status(404).json({ error: "Not found" });
            res.sendFile(path.resolve(path.join(assetsDir, coverFile)));
        } catch { res.status(404).json({ error: "Not found" }); }
    });



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

    process.on("SIGINT", () => {
        database.db.close();
        process.exit(0);
    });
}

export async function stopServer(): Promise<void> {}
