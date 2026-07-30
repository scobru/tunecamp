import express from "express";
import http from "http";
import { integrateFederation } from "@fedify/express";
import type { ServiceContainer } from "./core/container.js";
import { createAuthRoutes } from "./routes/auth/auth.js";
import { createAdminRoutes } from "./routes/admin/admin.js";
import { createCatalogRoutes } from "./routes/library/catalog.js";
import { createAlbumsRoutes } from "./routes/library/albums.js";
import { createTracksRoutes } from "./routes/library/tracks.js";
import { createSamplesRoutes } from "./routes/library/samples.js";
import { createSamplePacksRoutes } from "./routes/library/sample-packs.js";
import { createCollabRoutes } from "./routes/library/collab.js";
import { createDigRoutes } from "./routes/library/dig.js";
import { createArtistsRoutes } from "./routes/library/artists.js";
import { createPlaylistsRoutes } from "./routes/library/playlists.js";
import { createUploadRoutes } from "./routes/library/upload.js";
import { createReleaseRouter } from "./routes/library/releases.js";
import { createImportRoutes } from "./routes/library/import.js";
import { createFidRegistryRoutes } from "./routes/library/fid-registry.js";
import { createStatsRoutes } from "./routes/admin/stats.js";
import { createUsersRoutes } from "./routes/auth/users.js";
import { createZenRoutes } from "./routes/auth/zen.js";
import { createMcpRoutes } from "./routes/api/mcp.js";
import { createCommentsRoutes } from "./routes/network/comments.js";
import { createCommunityRoutes } from "./routes/network/community.js";
import { createLibraryStatsRoutes } from "./routes/admin/library-stats.js";
import { createBrowserRoutes } from "./routes/admin/browser.js";
import { createMetadataRoutes } from "./routes/admin/metadata.js";
import { createUnlockRoutes } from "./routes/api/unlock.js";
import { createPaymentsRoutes } from "./routes/api/payments.js";
import { createActivityPubRoutes } from "./routes/network/activitypub.js";
import { createAccountMigrationRoutes } from "./routes/network/account-migration.js";
import { createBackupRoutes } from "./routes/admin/backup.js";
import { createSubsonicRouter } from "./routes/api/subsonic.js";
import { createProxyRoutes } from "./routes/network/proxy.js";
import { createMiscRoutes } from "./routes/api/misc.js";
import { createBoardRoutes } from "./routes/api/board.js";
import { createLiveRoutes } from "./routes/api/live.js";
import { createNowPlayingRoutes } from "./routes/api/now-playing.js";
import { createSearchRoutes } from "./routes/network/search.js";
import { createStorageRouter } from "./routes/library/storage.js";
import { createTaskRoutes } from "./routes/admin/tasks.js";
import { createRadioRoutes } from "./routes/api/radio.js";
import { createPeerWsHandler } from "./modules/peer/peer.ws.js";
import { createChatWsHandler } from "./modules/chat/chat.ws.js";
import { createChatRoutes } from "./routes/api/chat.js";
import { createPeersRoutes } from "./routes/api/peers.js";
import { createLabAppsRoutes } from "./routes/admin/lab-apps.js";
import { createLifecycleRoutes } from "./routes/api/lifecycle.js";
import { requireModuleEnabled } from "./middleware/moduleGuard.js";

export function registerRoutes(app: express.Express, server: http.Server, container: ServiceContainer, federation: any, hasGDrive: boolean): void {
    const { authMiddleware } = container;

    createPeerWsHandler(server, container);
    createChatWsHandler(server, container);

    app.use("/api/admin/upload", authMiddleware.requireUser, createUploadRoutes(container));
    app.use("/api/admin/backup", authMiddleware.requireAdmin, createBackupRoutes(container, () => {
        process.exit(0);
    }));

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
    app.use("/api/payments", authMiddleware.optionalAuth, createPaymentsRoutes(container));

    app.use("/", createMiscRoutes(container));
    app.use("/rest", createSubsonicRouter(container));

    app.use("/api/auth", authMiddleware.optionalAuth, createAuthRoutes(container));
    app.use("/api/auth/zen", createZenRoutes(container));
    app.use("/api/admin", authMiddleware.requireUser, createAdminRoutes(container));
    app.use("/api/catalog", authMiddleware.optionalAuth, createCatalogRoutes(container));
    app.use("/api/artists", authMiddleware.optionalAuth, createArtistsRoutes(container));
    app.use("/api/albums", authMiddleware.optionalAuth, createAlbumsRoutes(container));
    app.use("/api/tracks", authMiddleware.optionalAuth, createTracksRoutes(container));
    app.use("/api/samples", authMiddleware.optionalAuth, requireModuleEnabled(container, "hideSamples", { allowAdmin: true }), createSamplesRoutes(container));
    app.use("/api/sample-packs", authMiddleware.optionalAuth, requireModuleEnabled(container, "hideSamples", { allowAdmin: true }), createSamplePacksRoutes(container));
    app.use("/api/dig", authMiddleware.requireUser, requireModuleEnabled(container, "hideDig"), createDigRoutes(container));
    app.use("/api/playlists", authMiddleware.optionalAuth, createPlaylistsRoutes(container));
    app.use("/api/collab", authMiddleware.requireUser, requireModuleEnabled(container, "hideCollab", { allowAdmin: true }), createCollabRoutes(container));
    app.use("/api/fid-registry", authMiddleware.requireUser, createFidRegistryRoutes(container));

    if (hasGDrive) {
        app.use("/api/storage", createStorageRouter(container));
    }

    app.use("/api/import", authMiddleware.requireUser, createImportRoutes(container));

    const releaseRouter = createReleaseRouter(container);
    app.use("/api/releases", authMiddleware.optionalAuth, releaseRouter);
    app.use("/api/admin/releases", authMiddleware.requireUser, releaseRouter);
    app.use("/api/stats", createStatsRoutes(container));
    app.use("/api/stats/library", createLibraryStatsRoutes(container));
    app.use("/api/community", createCommunityRoutes(container));
    app.use("/api/browser", authMiddleware.requireRootAdmin, createBrowserRoutes(container));
    app.use("/api/metadata", authMiddleware.requireRootAdmin, createMetadataRoutes(container));
    app.use("/api/users", createUsersRoutes(container));
    app.use("/api/mcp", authMiddleware.requireUser, createMcpRoutes(container));
    app.use("/api/comments", createCommentsRoutes(container));
    app.use("/api/board", authMiddleware.optionalAuth, requireModuleEnabled(container, "boardEnabled", { invert: true, allowAdmin: true }), createBoardRoutes(container));
    app.use("/api/chat", authMiddleware.requireUser, requireModuleEnabled(container, "peerChatEnabled", { invert: true, allowAdmin: true }), createChatRoutes(container));
    app.use("/api/live", requireModuleEnabled(container, "hideLive", { allowAdmin: true }), createLiveRoutes(container));
    app.use("/api/radio", createRadioRoutes(container));
    app.use("/api/now-playing", createNowPlayingRoutes(container));
    app.use("/api/unlock", createUnlockRoutes(container));

    app.use("/api/lifecycle", authMiddleware.requireUser, createLifecycleRoutes(container));
    app.use("/api/ap", createActivityPubRoutes(container));
    app.use("/api/account", authMiddleware.requireUser, createAccountMigrationRoutes(container));
    app.use("/api/proxy", createProxyRoutes(container));
    app.use("/api/admin/tasks", authMiddleware.requireAdmin, createTaskRoutes(container));
    app.use("/api/search", authMiddleware.optionalAuth, createSearchRoutes(container));
    app.use("/api/peers", createPeersRoutes(container));
    app.use("/api/lab-apps", requireModuleEnabled(container, "hideLab", { allowAdmin: true }), createLabAppsRoutes(container));
    app.use("/api/admin/lab-apps", authMiddleware.requireUser, createLabAppsRoutes(container));
}
