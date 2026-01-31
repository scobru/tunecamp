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
import { createActivityPubRoutes, createWebFingerRoute } from "./routes/activitypub.js";
import { createBackupRoutes } from "./routes/backup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(config: ServerConfig): Promise<void> {
    const app = express();
    const server = http.createServer(app);

    // Middleware
    app.use(cors({ origin: config.corsOrigins }));
    app.use(cors({ origin: config.corsOrigins }));
    app.use(express.json({ type: ['application/json', 'application/activity+json', 'application/ld+json'] }));

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
    await scanner.scanDirectory(config.musicDir);
    scanner.startWatching(config.musicDir);

    // Initialize GunDB service (with HTTP server for WebSockets)
    const gundbService = createGunDBService(database, server);
    await gundbService.init();

    // Initialize ActivityPub
    const apService = createActivityPubService(database, config);
    await apService.generateKeysForAllArtists();

    // API Routes
    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(authService));
    app.use("/api/admin", authMiddleware.requireAdmin, createAdminRoutes(database, scanner, config.musicDir, gundbService, config, authService, apService));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(database, config, () => {
        console.log("🔄 Restarting server...");
        process.exit(0); // Docker/PM2 should handle restart
    }));
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(database));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(database));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(database));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(database));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(database));
    app.use("/api/admin/upload", authMiddleware.requireAdmin, createUploadRoutes(database, scanner, config.musicDir));
    app.use("/api/admin/releases", authMiddleware.requireAdmin, createReleaseRoutes(database, scanner, config.musicDir));
    app.use("/api/stats", createStatsRoutes(gundbService));
    app.use("/api/stats/library", createLibraryStatsRoutes(database));
    app.use("/api/browser", authMiddleware.requireAdmin, createBrowserRoutes(config.musicDir));
    app.use("/api/metadata", authMiddleware.requireAdmin, createMetadataRoutes(database, config.musicDir));
    app.use("/api/users", createUsersRoutes(gundbService));
    app.use("/api/comments", createCommentsRoutes(gundbService));
    app.use("/api/unlock", createUnlockRoutes(database));
    app.use("/api/ap", createActivityPubRoutes(apService, database));
    app.use("/.well-known", createWebFingerRoute(apService));

    // Human-readable profile redirect (for ActivityPub/WebFinger links)
    app.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        const artist = database.getArtistBySlug(slug);
        if (artist) {
            res.redirect(`/#/artists/${artist.id}`);
        } else {
            res.redirect("/");
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

    // Serve static webapp
    const webappPath = path.join(__dirname, "..", "..", "webapp");
    app.use(express.static(webappPath));

    // SPA fallback - serve index.html for all non-API routes
    app.use((req, res, next) => {
        if (req.path.startsWith("/api/")) {
            return res.status(404).json({ error: "Not found" });
        }
        res.sendFile(path.join(webappPath, "index.html"));
    });

    // Start server
    server.listen(config.port, async () => {
        console.log("");
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        console.log("");
        if (authService.isFirstRun()) {
            console.log("⚠️  First run detected! Visit the server to set up admin password.");
        }
        console.log(`📊 Stats: ${database.getStats().tracks} tracks in library`);

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
                description: dbSiteDescription || `Music server with ${database.getStats().tracks} tracks`,
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
