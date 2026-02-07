import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import type { ServerConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { createAuthService } from "./auth.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createCatalogRoutes } from "./routes/catalog.js";
import { createAlbumsRoutes } from "./routes/albums.js";
import { createTracksRoutes } from "./routes/tracks.js";
import { createArtistsRoutes } from "./routes/artists.js";
import { createPlaylistsRoutes } from "./routes/playlists.js";
import { createUploadRoutes } from "./routes/upload.js";
import { createReleaseRoutes } from "./routes/releases.js";
import { createStatsRoutes } from "./routes/stats.js";
import { createUsersRoutes } from "./routes/users.js";
import { createCommentsRoutes } from "./routes/comments.js";
import { createScanner } from "./scanner.js";
import { createGunDBService } from "./gundb.js";
import { createLibraryStatsRoutes } from "./routes/library-stats.js";
import { createBrowserRoutes } from "./routes/browser.js";
import { createMetadataRoutes } from "./routes/metadata.js";
import { createUnlockRoutes } from "./routes/unlock.js";
import { createActivityPubService } from "./activitypub.js";
import { createActivityPubRoutes } from "./routes/activitypub.js";
import { integrateFederation } from "@fedify/express";
import { createFedify } from "./fedify.js";
import { createBackupRoutes } from "./routes/backup.js";
import { createPostsRoutes } from "./routes/posts.js";
import { createSubsonicRouter } from "./routes/subsonic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();
    app.set('trust proxy', true); // Required for CapRover/Nginx
    const server = http.createServer(app);

    // Middleware
    app.use(cors({ origin: config.corsOrigins }));

    // Initialize database
    console.log(`📦 Initializing database: ${config.dbPath}`);
    const database = createDatabase(config.dbPath);

    // Initialize auth
    const authService = createAuthService(database.db, config.jwtSecret);
    const authMiddleware = createAuthMiddleware(authService);

    // Initialize scanner
    const scanner = createScanner(database);

    // Scan music directory on startup
    console.log(`🎵 Music directory: ${config.musicDir}`);
    await fs.ensureDir(config.musicDir);
    await scanner.scanDirectory(config.musicDir);
    scanner.startWatching(config.musicDir);

    // Initialize GunDB service (with HTTP server for WebSockets)
    const gundbService = createGunDBService(database, server);
    await gundbService.init();

    // Initialize Fedify (Must be before AP Service)
    const federation = createFedify(database, config);
    app.use(integrateFederation(federation, (req: express.Request) => undefined)); // Context data if needed

    // Parse JSON (must be AFTER Fedify to avoid conflicting with body stream reading)
    app.use(express.json({ type: ['application/json', 'application/activity+json', 'application/ld+json'] }));

    // Initialize ActivityPub
    const apService = createActivityPubService(database, config, federation);
    await apService.generateKeysForAllArtists();

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
        if (!found) {
            console.warn(`❌ [Express] Static file NOT FOUND: ${filename}. Checked: ${candidates.slice(0, 3).join(", ")} ...`);
        }
        return found;
    };

    // Diagnostic listing function
    const listDirRecursive = (dir: string, depth = 0) => {
        if (depth > 2 || !fs.existsSync(dir)) return;
        try {
            const items = fs.readdirSync(dir);
            console.log(`📂 [Diagnostics] Contents of ${dir}: ${items.join(", ")}`);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    listDirRecursive(fullPath, depth + 1);
                }
            }
        } catch (e) { }
    };

    console.log(`🔍 [Diagnostics] Current WD: ${process.cwd()}`);
    console.log(`🔍 [Diagnostics] __dirname: ${__dirname}`);
    listDirRecursive(webappDistPath);
    listDirRecursive(path.join(process.cwd(), "webapp"));

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
    app.use("/rest", createSubsonicRouter({ db: database, auth: authService, musicDir: config.musicDir }));
    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService));
    app.use("/api/admin", authMiddleware.requireAdmin, createAdminRoutes(database, scanner, config.musicDir, gundbService, config, authService, apService));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(database, config, () => {
        console.log("🔄 Restarting server...");
        process.exit(0); // Docker/PM2 should handle restart
    }));
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(database));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database, config.musicDir));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database, config.musicDir));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database, apService, config.musicDir));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(database));
    app.use("/api/admin/upload", authMiddleware.requireAdmin, createUploadRoutes(database, scanner, config.musicDir));
    app.use("/api/admin/releases", authMiddleware.requireAdmin, createReleaseRoutes(database, scanner, config.musicDir, gundbService, config, apService));
    app.use("/api/stats", createStatsRoutes(gundbService));
    app.use("/api/stats/library", createLibraryStatsRoutes(database));
    app.use("/api/browser", authMiddleware.requireAdmin, createBrowserRoutes(config.musicDir));
    app.use("/api/metadata", authMiddleware.requireAdmin, createMetadataRoutes(database, config.musicDir));
    app.use("/api/users", createUsersRoutes(gundbService));
    app.use("/api/comments", createCommentsRoutes(gundbService));
    app.use("/api/unlock", createUnlockRoutes(database));
    app.use("/api/ap", createActivityPubRoutes(apService, database, authMiddleware));
    // app.use("/.well-known", createWebFingerRoute(apService)); // Legacy, handled by Fedify

    // Human-readable profile redirect (for ActivityPub/WebFinger links)
    app.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        if (artist) {
            res.redirect(`/#/artist/${artist.slug}`);
        } else {
            res.redirect("/");
        }
    });

    // Fix for legacy/short ActivityPub URLs linking to frontend
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
                res.redirect(`/#/artist/${artist.slug}?post=${post.slug}`);
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
    if (fs.existsSync(webappDistPath)) {
        console.log(`   ✅ Using webappDistPath for static files`);
        app.use(express.static(webappDistPath));
    }

    // 2. Serve public assets (manifest, sw, etc) at root
    if (fs.existsSync(webappPublicPath)) {
        console.log(`   ✅ Using webappPublicPath for static files`);
        app.use(express.static(webappPublicPath));
    }

    // 3. Fallback to webapp root (dev/legacy)
    console.log(`   ✅ Using webappPath for static files (fallback)`);
    app.use(express.static(webappPath));

    // SPA fallback - serve index.html for all non-API routes
    const indexHtmlPath = fs.existsSync(path.join(webappPath, "index.html"))
        ? path.join(webappPath, "index.html")
        : fs.existsSync(path.join(webappDistPath, "index.html"))
            ? path.join(webappDistPath, "index.html")
            : path.join(webappPath, "index.html");

    console.log(`📄 SPA fallback index.html: ${indexHtmlPath}`);

    app.use((req, res, next) => {
        if (req.path.startsWith("/api/")) {
            return res.status(404).json({ error: "Not found" });
        }
        res.sendFile(indexHtmlPath);
    });

    // Global error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error("🔥 Global error:", err);
        if (res.headersSent) {
            return next(err);
        }
        res.status(500).json({ error: err.message || "Internal Server Error" });
    });

    // Start server
    server.listen(config.port, async () => {
        console.log("");
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        console.log("");
        if (authService.isFirstRun()) {
            console.log("⚠️  First run detected! Visit the server to set up admin password.");
        }
        console.log(`📊 Stats: ${(await database.getStats()).tracks} tracks in library`);

        // Register server on GunDB community if publicUrl is set (either in config or db)
        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = dbPublicUrl || config.publicUrl;

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
                description: dbSiteDescription || `Music server with ${(await database.getStats()).tracks} tracks`,
                artistName,
                coverImage: dbCoverImage || ""
            };

            const registered = await gundbService.registerSite(siteInfo);
            if (registered) {
                console.log(`🌐 Registered on GunDB community: ${publicUrl}`);
            }
        } else {
            console.log("💡 Set TUNECAMP_PUBLIC_URL or configure Network Settings in Admin Panel to register on community");
        }

        console.log("");
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down...");
        scanner.stopWatching();
        database.db.close();
        process.exit(0);
    });
}
