import "reflect-metadata";
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import http from "http";
import fs from "fs-extra";
import { fileURLToPath } from "url";

// Global crash protection for Torrent engine and other async modules
// Global crash protection for async modules
process.on('uncaughtException', (err) => {
    console.error('🌊 SEVERE: Uncaught Exception:', err);
    // Certain errors like those from Zen or network timeouts are not fatal
    if (err.message && (
        err.message.includes('Zen') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('socket hang up') ||
        err.message.includes('non-101 status code') ||
        err.message.includes('network error') ||
        err.message.includes('fetch failed')
    )) {
        console.warn('⚠️ Non-fatal exception caught, staying alive...');
        return;
    }

    // For genuine DB busy errors, we take a bit more caution
    if (err.message && err.message.includes('database is busy')) {
        console.warn('⚠️ SQLite busy error caught. Check your concurrency settings.');
        return;
    }

    // Otherwise, we might be in an undefined state, but let's try to stay alive anyway
    // since this is a self-hosted app where availability is higher priority than strict state
    console.warn('⚠️ Attempting to continue despite uncaught exception...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🌊 SEVERE: Unhandled Rejection at:', promise, 'reason:', reason);
});
import type { ServerConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { createAuthService } from "./auth.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createCatalogRoutes } from "./routes/catalog.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { LocalDiskStorage } from "./modules/storage/storage.engine.js";
import { createAlbumsRoutes } from "./routes/albums.js";
import { createTracksRoutes } from "./routes/tracks.js";
import { createArtistsRoutes } from "./routes/artists.js";
import { createPlaylistsRoutes } from "./routes/playlists.js";
import { createUploadRoutes } from "./routes/upload.js";
import { createReleaseRouter } from "./routes/releases.js";
import { createImportRoutes } from "./routes/import.js";
import { createStatsRoutes } from "./routes/stats.js";
import { createUsersRoutes } from "./routes/users.js";
import { createCommentsRoutes } from "./routes/comments.js";
import { Scanner } from "./scanner.js";
import { createZenDBService } from "./zendb.js";
import { createLibraryStatsRoutes } from "./routes/library-stats.js";
import { createBrowserRoutes } from "./routes/browser.js";
import { createMetadataRoutes } from "./routes/metadata.js";
import { createUnlockRoutes } from "./routes/unlock.js";
import { createPaymentsRoutes } from "./routes/payments.js";
import { ActivityPubService, createActivityPubService } from "./activitypub.js";
import type { FederationProvider } from "./modules/activitypub/federation.provider.js";
import { createActivityPubRoutes } from "./routes/activitypub.js";
import { createPublishingService } from "./publishing.js";
import { LifecycleService } from "./services/lifecycle.service.js";
import { LibraryService } from "./services/library.service.js";
import { createLifecycleRoutes } from "./routes/lifecycle.js";
import { integrateFederation } from "@fedify/express";
import { createFedify } from "./fedify.js";
import { createBackupRoutes } from "./routes/backup.js";
import { createSubsonicRouter } from "./routes/subsonic.js";
import { createProxyRoutes } from "./routes/proxy.js";
import { WaveformService } from "./modules/waveform/waveform.service.js";
import { securityHeaders } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { SoulseekService } from "./soulseek.js";
import { TelegramBotService } from "./services/telegram-bot.js";
import { LindaBotService } from "./services/linda-bot.js";
import { MaintenanceService } from "./services/maintenance.service.js";
import { OpenRouterService } from "./services/openrouter.service.js";
import { createSearchRoutes } from "./routes/search.js";
import { GoogleDriveService } from "./services/google-drive.service.js";
import { createStorageRouter } from "./routes/storage.js";
import { runStartupMaintenance } from "./maintenance.js";
import { errorHandler } from "./middleware/error-handling.js";
import { latchDomain, kprs } from "./zen-network.js";
import { getZen } from "./zen.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();
    app.set('trust proxy', true); // Required for CapRover/Nginx
    const server = http.createServer(app);

    // Middleware
    app.use(compression());
    app.use(securityHeaders);
    
    // API Rate limit: 1000 requests per 15 minutes for standard API
    app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 })); 
    
    // Subsonic Rate limit: 5000 requests per 15 minutes to allow heavy initial syncs (fetching covers/tracks)
    app.use('/rest', rateLimit({ windowMs: 15 * 60 * 1000, max: 5000 }));

    // Improved CORS handling: if no origins defined, allow all to facilitate community discovery
    const corsOrigin = config.corsOrigins && config.corsOrigins.length > 0 ? config.corsOrigins : true;
    app.use(cors({ origin: corsOrigin, credentials: true }));

    // Initialize database
    console.log(`📦 Initializing database: ${config.dbPath}`);
    const database = createDatabase(config.dbPath);

    // Initialize Storage Engine
    const storage = new LocalDiskStorage();

    // Initialize OpenRouter AI Service
    const openRouterService = new OpenRouterService(database, config);

    // Initialize Catalog Service
    const catalogService = new CatalogService(database, openRouterService);

    // Run Startup Maintenance (Repair paths + Restore Orphans)
    if (process.env.SKIP_STARTUP_MAINTENANCE === 'true') {
        console.log(`📦 [Maintenance] Skipping startup maintenance as requested (SKIP_STARTUP_MAINTENANCE=true)`);
    } else {
        await runStartupMaintenance(database, config);
    }

    // Initialize auth
    const authService = createAuthService(database.db, config.jwtSecret, config.adminUser, config.adminPass);
    await authService.init();
    const authMiddleware = createAuthMiddleware(authService);

    // Initialize scanner
    const scanner = new Scanner(database, storage);

    // Initialize Waveform Service
    const waveformService = new WaveformService(path.dirname(config.dbPath));

    // Initialize Zen service (with HTTP server for WebSockets)
    const zendbService = createZenDBService(database, server, config.zenPeers, config.publicUrl);
    await zendbService.init();

    // Latch domain from first incoming request Host header if still unknown
    app.use((req, res, next) => {
        const zen = getZen();
        if (zen) {
            latchDomain(req, zen);
        }
        next();
    });

    // --- ZEN Peers Endpoint ---
    app.get("/api/peers", (req, res) => {
        res.status(200).json(Array.from(kprs));
    });

    // Initialize Fedify (Must be before AP Service)
    const federation = createFedify(database, config);

    // Initialize ActivityPub
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

    // Initialize Publishing Service
    const publishingService = createPublishingService(database, zendbService, apService, config, storage);

    // Initialize Lifecycle Service
    const lifecycleService = new LifecycleService(database, publishingService, apService);

    // Initialize Library Service
    const libraryService = new LibraryService(database, publishingService, zendbService, storage, config.musicDir);

    // Initialize Maintenance Service
    const maintenanceService = new MaintenanceService(database, libraryService, openRouterService);

    // Initialize Content Search Services
    const soulseekService = new SoulseekService(config.musicDir, config.downloadDir || path.join(config.musicDir, "downloads"));
    // Try to connect with system credentials if available
    const slskUser = database.getSetting("soulseek_username");
    const slskPass = database.getSetting("soulseek_password");
    soulseekService.connect(slskUser, slskPass).catch(err => console.error("Soulseek initial connection failed:", err));

    // Initialize Telegram Bot
    const telegramBotService = new TelegramBotService(database, scanner, config, openRouterService);
    telegramBotService.start().catch(err => console.error("Telegram Bot failed to start:", err));

    // Initialize Linda Bot
    const lindaBotService = new LindaBotService(database, scanner, config, openRouterService);
    lindaBotService.start().catch(err => console.error("Linda Bot failed to start:", err));

    // Initialize Google Drive Service
    let gdriveService: GoogleDriveService | undefined;
    if (config.gdriveClientId && config.gdriveClientSecret) {
        console.log("🔗 Google Drive integration enabled");
        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = (dbPublicUrl || config.publicUrl || `http://localhost:${config.port}`).trim().replace(/\/$/, "");
        const redirectUri = `${publicUrl}/api/storage/gdrive/callback`;
        gdriveService = new GoogleDriveService(database, {
            clientId: config.gdriveClientId,
            clientSecret: config.gdriveClientSecret,
            redirectUri
        });
    }

    // Upload routes - MOVED BEFORE FEDIFY/BODY PARSERS to avoid stream consumption issues
    app.use("/api/admin/upload", authMiddleware.requireUser, createUploadRoutes(database, scanner, config.musicDir, publishingService, storage, authService));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(database, config, () => {
        console.log("🔄 Restarting server...");
        process.exit(0); // Docker/PM2 should handle restart
    }, gdriveService));

    app.use(integrateFederation(federation, (req: express.Request) => undefined)); // Context data if needed
    app.use("/api/payments", createPaymentsRoutes(database, config.musicDir, config));

    // Parse JSON (must be AFTER Fedify to avoid conflicting with body stream reading)
    app.use(express.json({
        type: ['application/json', 'application/activity+json', 'application/ld+json'],
        limit: '10mb'
    }));

    // DIAGNOSTIC LOGGING: Verify frontend file paths
    const webappPath = path.join(__dirname, "..", "..", "webapp");
    const webappDistPath = path.join(webappPath, "dist");
    const webappPublicPath = path.join(webappPath, "public");

    // Robustly find a static file
    const findStaticFile = (filename: string) => {
        const candidates = [
            path.join(webappDistPath, filename),
            path.join(webappPath, filename),
            path.join(webappPublicPath, filename),
            path.join(process.cwd(), "webapp", "dist", filename),
            path.join(process.cwd(), "webapp", "public", filename),
            path.join(process.cwd(), "webapp", filename),
            path.join(process.cwd(), "dist", "webapp", "dist", filename), // Some Docker setups
            "/app/webapp/dist/" + filename,
            "/app/webapp/public/" + filename, // Explicit absolute path for Docker
            path.join(__dirname, "..", "..", "webapp", "public", filename),
            path.join(__dirname, "..", "..", "webapp", "dist", filename)
        ];
        const found = candidates.find(p => fs.existsSync(p));
        return found;
    };

    // Explicitly serve sw.js and manifest.json at the root VERY EARLY to avoid being caught by other routes
    app.get("/sw.js", (req, res) => {
        const foundPath = findStaticFile("sw.js");
        if (foundPath) {
            console.log(`✅ [Express] Serving sw.js from: ${foundPath}`);
            return res.sendFile(path.resolve(foundPath));
        }
        console.warn(`❌ [Express] sw.js requested but not found anywhere!`);
        res.status(404).send("sw.js not found - possible build issue");
    });

    app.get("/manifest.json", (req, res) => {
        const foundPath = findStaticFile("manifest.json");
        if (foundPath) {
            console.log(`✅ [Express] Serving manifest.json from: ${foundPath}`);
            return res.sendFile(path.resolve(foundPath));
        }
        console.warn(`❌ [Express] manifest.json requested but not found anywhere!`);
        res.status(404).json({ error: "manifest.json not found" });
    });

    // API Routes
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

            // For remote tracks (ActivityPub or Zen), return a generic flat line SVG 
            // so the Player doesn't throw 404
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=31536000");
            return res.send('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100" viewBox="0 0 800 100"><line x1="0" y1="50" x2="800" y2="50" stroke="#888" stroke-width="2"/></svg>');
        } catch (e) {
            console.error(e);
            res.status(500).send("Error generating waveform");
        }
    });

    app.use("/rest", createSubsonicRouter({ db: database, auth: authService, musicDir: config.musicDir, zendbService }));

    // Lightweight healthcheck endpoint for Docker/CapRover
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService, authMiddleware));
    app.use("/api/admin", authMiddleware.requireUser, createAdminRoutes(database, scanner, config.musicDir, zendbService, config, authService, publishingService, apService, telegramBotService, soulseekService, lindaBotService));
    // Backup routes moved earlier
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(catalogService));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database, config.musicDir));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database, libraryService, config.musicDir));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database, publishingService, libraryService, config.musicDir, authService, gdriveService));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(database, zendbService));

    if (gdriveService) {
        app.use("/api/storage", createStorageRouter(database, gdriveService, authMiddleware, libraryService));
    }

    app.use("/api/import", authMiddleware.requireUser, createImportRoutes());

    const releaseRouter = createReleaseRouter(database, scanner, publishingService, authService, config.musicDir);
    app.use("/api/releases", authMiddleware.optionalAuth, releaseRouter);
    app.use("/api/admin/releases", authMiddleware.requireUser, releaseRouter);
    app.use("/api/stats", createStatsRoutes(zendbService, database, config));
    app.use("/api/stats/library", createLibraryStatsRoutes(database));
    app.use("/api/browser", authMiddleware.requireRootAdmin, createBrowserRoutes(config.musicDir, database));
    app.use("/api/metadata", authMiddleware.requireRootAdmin, createMetadataRoutes(database, config.musicDir, maintenanceService));
    app.use("/api/users", createUsersRoutes(zendbService, database, authService, apService));
    app.use("/api/comments", createCommentsRoutes(zendbService));
    app.use("/api/unlock", createUnlockRoutes(database, authMiddleware));
    app.use("/api/lifecycle", authMiddleware.requireUser, createLifecycleRoutes(lifecycleService));
    app.use("/api/admin/lifecycle", authMiddleware.requireAdmin, createLifecycleRoutes(lifecycleService));
    app.use("/api/ap", createActivityPubRoutes(apService, database, authMiddleware));
    app.use("/api/proxy", createProxyRoutes());
    app.use("/api/search/content", authMiddleware.requireRootAdmin, createSearchRoutes(database, soulseekService, scanner));
    // app.use("/.well-known", createWebFingerRoute(apService)); // Legacy, handled by Fedify

    // Funkwhale-compatible federation libraries endpoint
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

    // Funkwhale nodeinfo compatibility - also expose at /api/v1/instance/nodeinfo/2.0
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

    // Human-readable profile redirect (for ActivityPub/WebFinger links)
    app.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        if (artist) {
            res.redirect(`/artists/${artist.slug}`);
        } else {
            res.redirect("/");
        }
    });

    // Serve artist page for generic fediverse queries or raw links
    app.get("/artist/:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        if (artist) {
            res.redirect(`/#/artist/${artist.slug}`);
        } else {
            res.redirect("/");
        }
    });

    // Workaround for legacy/short ActivityPub URLs linking to frontend
    app.get("/note/release/:slug", (req, res) => {
        const { slug } = req.params;
        const album = database.getAlbumBySlug(slug);
        if (album) {
            res.redirect(`/#/album/${album.slug}`);
        } else {
            res.status(404).send("Release not found");
        }
    });

    app.get("/note/post/:slug", (req, res) => {
        const { slug } = req.params;
        const post = database.getPostBySlug(slug);
        if (post) {
            // Need artist slug for the URL
            const artist = database.getArtist(post.artist_id);
            if (artist) {
                res.redirect(`/artists/${artist.slug}?post=${post.slug}`);
            } else {
                res.redirect("/");
            }
        } else {
            res.status(404).send("Post not found");
        }
    });

    // Serve uploaded site background image (public)
    app.get("/api/settings/background", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            if (!(await fs.pathExists(assetsDir))) {
                return res.status(404).json({ error: "No background image" });
            }
            const files = await fs.readdir(assetsDir);
            const bgFile = files.find((f) => f.startsWith("background."));
            if (!bgFile) {
                return res.status(404).json({ error: "No background image" });
            }
            const filePath = path.join(assetsDir, bgFile);
            res.sendFile(path.resolve(filePath));
        } catch {
            res.status(404).json({ error: "Not found" });
        }
    });

    // Serve uploaded site cover image (public for network list)
    app.get("/api/settings/cover", async (_req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            if (!(await fs.pathExists(assetsDir))) {
                return res.status(404).json({ error: "No cover image" });
            }
            const files = await fs.readdir(assetsDir);
            const coverFile = files.find((f) => f.startsWith("site-cover."));
            if (!coverFile) {
                return res.status(404).json({ error: "No cover image" });
            }
            const filePath = path.join(assetsDir, coverFile);
            res.sendFile(path.resolve(filePath));
        } catch {
            res.status(404).json({ error: "Not found" });
        }
    });

    // 1. Serve built files if they exist (prod)
    const staticOptions = { index: false };
    if (fs.existsSync(webappDistPath)) {
        app.use(express.static(webappDistPath, staticOptions));
    }

    // 2. Serve public assets (manifest, sw, etc) at root
    if (fs.existsSync(webappPublicPath)) {
        app.use(express.static(webappPublicPath, staticOptions));
    }

    // 3. Fallback to webapp root (dev/legacy)
    app.use(express.static(webappPath, staticOptions));

    // SPA fallback - serve index.html for all non-API routes
    const indexHtmlPath = fs.existsSync(path.join(webappPath, "index.html"))
        ? path.join(webappPath, "index.html")
        : fs.existsSync(path.join(webappDistPath, "index.html"))
            ? path.join(webappDistPath, "index.html")
            : path.join(webappPath, "index.html");

    // Memory cache for index.html to avoid disk I/O bottlenecks
    let cachedIndexHtml: string | null = null;
    const getCachedHtml = () => {
        if (cachedIndexHtml && process.env.NODE_ENV === 'production') return cachedIndexHtml;
        try {
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            if (process.env.NODE_ENV === 'production') cachedIndexHtml = html;
            return html;
        } catch (e) {
            console.error("Failed to read index.html:", e);
            return "Error loading app";
        }
    };

    // Public sharing route with OG tags support
    app.get("/share/:id", async (req, res) => {
        const { id } = req.params;
        let title = "Shared from TuneCamp";
        let description = "Music shared via TuneCamp";
        let image = "";

        if (id.startsWith('tr_')) {
            const trackId = parseInt(id.substring(3));
            if (!isNaN(trackId)) {
                const track = database.getTrack(trackId);
                if (track) {
                    title = track.title || "Track";
                    description = `Track by ${track.artist_name || 'Unknown Artist'}${track.album_title ? ` from ${track.album_title}` : ''}`;
                    image = `/api/tracks/${track.id}/cover`;
                }
            }
        } else if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            if (!isNaN(albumId)) {
                const album = database.getAlbum(albumId);
                if (album) {
                    title = album.title || "Album";
                    description = `Album by ${album.artist_name || 'Unknown Artist'} • ${album.year || ''}`;
                    image = `/api/albums/${album.id}/cover`;
                }
            }
        }

        try {
            let html = getCachedHtml();
            const dbPublicUrl = database.getSetting("publicUrl");
            const publicUrl = (dbPublicUrl || config.publicUrl || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, "");

            const ogTags = `
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${publicUrl}${image}" />
    <meta property="og:type" content="music.song" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${publicUrl}${image}" />
`;
            html = html.replace('<head>', '<head>' + ogTags);

            // Inject the same config as the main index route
            const dbZenPeers = database.getSetting("zenPeers");
            const rpcUrl = process.env.TUNECAMP_RPC_URL || process.env.VITE_TUNECAMP_RPC_URL || '';
            const zenPeersStr = dbZenPeers || process.env.TUNECAMP_ZEN_PEERS || process.env.VITE_ZEN_PEERS || '';
            const web3CheckoutAddr = database.getSetting("web3_checkout_address") || "";
            const web3NftAddr = database.getSetting("web3_nft_address") || "";
            const ownerAddress = process.env.TUNECAMP_OWNER_ADDRESS || "";

            const configInject = `<script>window.TUNECAMP_CONFIG = { 
                apiUrl: "/api", 
                rpcUrl: ${JSON.stringify(rpcUrl)},
                zenPeers: ${JSON.stringify(zenPeersStr)},
                web3_checkout_address: ${JSON.stringify(web3CheckoutAddr)},
                web3_nft_address: ${JSON.stringify(web3NftAddr)},
                ownerAddress: ${JSON.stringify(ownerAddress)},
                adminFeePercentage: ${JSON.stringify(database.getSetting("adminFeePercentage") || "0")},
                adminTreasuryAddress: ${JSON.stringify(database.getSetting("adminTreasuryAddress") || "")}
            };</script>`;

            html = html.replace('<head>', '<head>' + configInject);

            res.send(html);
        } catch (e) {
            console.error("Error serving share page:", e);
            res.redirect(`/#/share/${id}`);
        }
    });

    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) {
            return res.status(404).json({ error: "Not found" });
        }
        try {
            let html = getCachedHtml();
            const dbZenPeers = database.getSetting("zenPeers");
            const rpcUrl = process.env.TUNECAMP_RPC_URL || process.env.VITE_TUNECAMP_RPC_URL || '';
            const zenPeersStr = dbZenPeers || process.env.TUNECAMP_ZEN_PEERS || process.env.VITE_ZEN_PEERS || '';
            const web3CheckoutAddr = database.getSetting("web3_checkout_address") || "";
            const web3NftAddr = database.getSetting("web3_nft_address") || "";
            const ownerAddress = process.env.TUNECAMP_OWNER_ADDRESS || "";

            const configInject = `<script>window.TUNECAMP_CONFIG = { 
                apiUrl: "/api", 
                rpcUrl: ${JSON.stringify(rpcUrl)},
                zenPeers: ${JSON.stringify(zenPeersStr)},
                web3_checkout_address: ${JSON.stringify(web3CheckoutAddr)},
                web3_nft_address: ${JSON.stringify(web3NftAddr)},
                ownerAddress: ${JSON.stringify(ownerAddress)},
                adminFeePercentage: ${JSON.stringify(database.getSetting("adminFeePercentage") || "0")},
                adminTreasuryAddress: ${JSON.stringify(database.getSetting("adminTreasuryAddress") || "")}
            };</script>`;

            html = html.replace('<head>', '<head>' + configInject);
            res.send(html);
        } catch (e) {
            console.error("Error serving index.html:", e);
            res.status(500).send("Error loading app context");
        }
    });

    // Global error handler
    app.use(errorHandler);

    // Start server
    server.listen(config.port, async () => {
        console.log("");
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        console.log("");
        if (authService.isFirstRun()) {
            console.log("⚠️  First run detected! Visit the server to set up admin password.");
        }
        const currentStats = await database.getStats();
        console.log(`📊 Stats: ${currentStats.tracks} tracks in library`);

        // Increasing timeouts for slow uploads/connections (e.g. large files or slow clients)
        // Set to 5 minutes (300000ms) to allow for large WAV uploads + conversion
        server.keepAliveTimeout = 300000;
        server.headersTimeout = 301000;   // Must be slightly larger than keepAliveTimeout

        // Register server on Zen community if publicUrl is set (either in config or db)
        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = (dbPublicUrl || config.publicUrl || "").trim().replace(/\/$/, "");

        if (publicUrl) {
            const artists = database.getArtists();
            const dbArtistName = database.getSetting("artistName");
            // Use DB setting, or first artist, or empty
            const artistName = dbArtistName || (artists.length > 0 ? artists[0].name : "");

            const dbSiteName = database.getSetting("siteName");
            const dbSiteDescription = database.getSetting("siteDescription");
            const dbCoverImage = database.getSetting("coverImage");

            const siteInfo = {
                url: publicUrl,
                title: dbSiteName || config.siteName || "TuneCamp Server",
                description: dbSiteDescription || `Music server with ${currentStats.tracks} tracks`,
                artistName,
                coverImage: dbCoverImage || ""
            };

            const registered = await zendbService.registerSite(siteInfo);
            if (registered) {
                console.log(`🌐 Registered on Zen community: ${publicUrl}`);
            }

            // --- Decentralized Mesh: Auto-Follow other instances ---
            // We wait a bit for Zen protocol to connect to peers before scanning
            setTimeout(async () => {
                try {
                    await publishingService.syncCommunityFollows();
                } catch (e) {
                    console.error("❌ Failed to auto-sync community follows on startup:", e);
                }
            }, 20000); // Increased to 20 seconds to avoid overlap with early healthchecks

            // ActivityPub Relay Support
            const relayUrl = database.getSetting("relayUrl") || config.relayUrl;
            if (relayUrl) {
                console.log(`📡 Connecting to ActivityPub Relay: ${relayUrl}`);
                await apService.subscribeToRelay(relayUrl);
            }
        } else {
            console.log("💡 Set TUNECAMP_PUBLIC_URL or configure Network Settings in Admin Panel to register on community");
        }

        console.log("");

        // --- MEMORY MONITORING ---
        const MEM_LIMIT = process.env.MEMORY_LIMIT_MB ? parseInt(process.env.MEMORY_LIMIT_MB) : 6000;
        console.log(`[Monitor] Memory monitor active. Limit: ${MEM_LIMIT}MB (NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'default'})`);
        
        setInterval(() => {
            const mem = process.memoryUsage();
            const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
            const rssMB = Math.round(mem.rss / 1024 / 1024);

            // Fetch current peer status
            let peerCount = zendbService.getPeerCount();
            
            // Warning at 80% of limit
            if (heapUsedMB > MEM_LIMIT * 0.8) {
                console.warn(`[Monitor] ⚠️ CRITICAL Memory Usage: Heap ${heapUsedMB}MB / ${heapTotalMB}MB | RSS ${rssMB}MB. Limit: ${MEM_LIMIT}MB`);
                if ((global as any).gc) {
                    console.log("[Monitor] Triggering emergency GC...");
                    try {
                        (global as any).gc();
                    } catch (e) {
                        console.error("[Monitor] Emergency GC failed:", e);
                    }
                }
            } else if (heapUsedMB > 1500 || peerCount === 0) {
                // Regular status log
                console.log(`[Diag] Heap: ${heapUsedMB}MB | RSS: ${rssMB}MB | ZEN Peers: ${peerCount}`);
                if (peerCount === 0 && (config.zenPeers?.length || 0) > 0) {
                    console.warn(`[Diag] ⚠️  0 connected peers. Targets: ${config.zenPeers?.join(', ')}`);
                    console.log(`[Diag] TIP: Connection failure (non-101) usually means the /zen path isn't proxied yet.`);
                }
            }
        }, 60000);
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down...");
        database.db.close();
        process.exit(0);
    });
}

export async function stopServer(): Promise<void> {
}

