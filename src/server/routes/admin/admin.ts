import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { Router, json } from "express";
import Stripe from "stripe";
import path from "path";
import os from "os";
import fs from "fs-extra";
import type { ServiceContainer } from "../../core/container.js";
import { createAuthMiddleware } from "../../middleware/auth.js";
import { validatePassword } from "../../common/validators.js";
import { VisibilityGuardian, Capability, UserRole, VisibilityProfile } from "../../common/visibility.js";

import multer from "multer";

import { getDownloadService } from "../../modules/catalog/download.service.js";
import { getExternalProviderIds } from "../../core/plugin-loader.js";
import { isDownloadProviderEnabled } from "../../middleware/provider-gate.js";
import { aiService } from "../../modules/ai/ai.service.js";
import { taskManager } from "../../modules/workers/task-manager.js";
import { createRssService } from "../../modules/network/rss.service.js";
import { getSiteHandle, slugifySiteName, SITE_ACTOR_ID } from "../../core/site-actor.js";
import { getInstanceStorage, recomputeFileSizes, recomputeUserStorage } from "../../modules/storage/storage-usage.service.js";

const upload = multer({ dest: "uploads/" });

export function createAdminRoutes(container: ServiceContainer): Router {
    const scanner: ServiceContainer['scannerService'] = (container as any).scannerService || (container as any);
    const musicDir: ServiceContainer['musicDir'] = (container as any).musicDir || (container as any);
    const config: ServiceContainer['config'] = (container as any).config || (container as any);
    const authService: ServiceContainer['authService'] = (container as any).authService || (container as any);
    const publishingService: ServiceContainer['publishingService'] = (container as any).publishingService || (container as any);
    const apService: ServiceContainer['apService'] = (container as any).apService || (container as any);
    const telegramBotService: ServiceContainer['telegramBotService'] = (container as any).telegramBotService || (container as any);
    const soulseekService: ServiceContainer['soulseekService'] = (container as any).soulseekService || (container as any);
    const metadataService: ServiceContainer['metadataService'] = (container as any).metadataService || (container as any);
    const streamingService: ServiceContainer['streamingService'] = (container as any).streamingService || (container as any);
    const gdriveService: ServiceContainer['gdriveService'] = (container as any).gdriveService || (container as any);
    const playlistService: ServiceContainer['playlistService'] = (container as any).playlistService || (container as any);
    const scrobbleService: ServiceContainer['scrobbleService'] = (container as any).scrobbleService || (container as any);
    const maintenance: ServiceContainer['maintenanceService'] = (container as any).maintenanceService || (container as any);
    const localizationService: ServiceContainer['localizationService'] = (container as any).localizationService || (container as any);
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (container as any);
    const social: ServiceContainer['social'] = (container as any).social || (container as any);
    const integration: ServiceContainer['integration'] = (container as any).integration || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const federatedDiscoveryService: ServiceContainer['federatedDiscoveryService'] = (container as any).federatedDiscoveryService || (container as any);
    const catalogCache: ServiceContainer['catalogCache'] = (container as any).catalogCache;
    const rssService = createRssService(database);
    const router = Router();
    router.use(json({ limit: "10mb" }));


    const authMiddleware = createAuthMiddleware(authService);

    /**
     * Restriction middleware: prevent restricted users from making changes via admin routes
     */
    router.use((req: AuthenticatedRequest, res, next) => {
        if (req.method !== 'GET') {
            const canManage = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY);

            // Allow uploads for users with manage capability
            if (req.path.startsWith('/upload') && canManage) {
                return next();
            }

            // Allow integrations config for admins
            if (req.path.startsWith('/integrations') && canManage) {
                return next();
            }

            // Allow artists to manage their own Stripe Connect account
            const stripeOwnMatch = req.path.match(/^\/artists\/(\d+)\/stripe-connect/);
            if (stripeOwnMatch && req.artistId) {
                const pathArtistId = parseInt(stripeOwnMatch[1], 10);
                if (req.artistId === pathArtistId) return next();
            }

            // Allow artists to refresh their own federated identity
            const identityRefreshMatch = req.path.match(/^\/artists\/(\d+)\/refresh-identity$/);
            if (identityRefreshMatch && req.artistId) {
                const pathArtistId = parseInt(identityRefreshMatch[1], 10);
                if (req.artistId === pathArtistId) return next();
            }

            // Allow content authors (artists with a linked profile) to create,
            // edit, delete, or manage sub-resources of a single release they own.
            // The per-item handlers enforce granular ownership, so this coarse
            // gate only needs to confirm the caller may write catalog content.
            // Batch routes (`/releases/batch/...`) stay gated to MANAGE_PRIVATE_LIBRARY.
            const canWrite = req.context && VisibilityGuardian.canWriteContent(req.context);
            // POST /releases — create a new release
            const isReleaseCreate = req.method === 'POST' && req.path === '/releases';
            // PUT/DELETE/POST on /releases/:id or any of its sub-paths (/visibility, /tracks/add, etc.)
            const singleReleaseMatch = req.path.match(/^\/releases\/(\d+)(\/.*)?$/);
            const isSingleReleaseMutate = !!singleReleaseMatch &&
                (req.method === 'PUT' || req.method === 'DELETE' || req.method === 'POST');
            if (canWrite && (isReleaseCreate || isSingleReleaseMutate)) {
                return next();
            }

            if (!canManage) {
                return res.status(403).json({ error: "Access denied: You do not have permission to modify administrative settings" });
            }
        }
        next();
    });

    /**
     * GET /api/admin/releases
     * List all albums with visibility status
     */
    router.get("/releases", (req: AuthenticatedRequest, res: any) => {
        try {
            const showMine = req.query.mine === 'true';
            let releases: any[] = [];

            const includeLibrary = req.query.includeLibrary === 'true';
            
            const canSeeAll = req.context && VisibilityGuardian.can(req.context, Capability.VIEW_PRIVATE_LIBRARY);
            
            if (showMine) {
                // "My Releases" view: always show ONLY formal releases owned by this user.
                // Library albums (scanned content) are never shown here, regardless of role.
                let owned = req.userId
                    ? library.getReleasesByOwner(req.userId, VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }))
                    : [];
                if (req.userId && req.artistId) {
                    const artistReleases = library.getReleasesByArtist(req.artistId, VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }));
                    const existingIds = new Set(owned.map(r => r.id));
                    for (const r of artistReleases) {
                        if (!existingIds.has(r.id)) {
                            owned.push(r);
                        }
                    }
                }
                releases = owned;
            } else if (canSeeAll) {
                // Admin/SuperUser global view: all formal releases
                const formalReleases = library.getReleases(VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }));
                releases = [...formalReleases];

                // Only include library albums in promotion pipeline if explicitly requested (Curation Queue)
                if (includeLibrary) {
                    const pendingAlbums = library.getAlbums(VisibilityProfile.ALL_ACCESS)
                        .filter(a => a.status !== 'draft')
                        .map(a => ({ ...a, is_formal_release: false }));
                    releases = [...releases, ...pendingAlbums];
                }
            } else if (req.userId) {
                // Non-admin artist: their formal releases + library albums they submitted for promotion
                let ownedFormalReleases = library.getReleasesByOwner(req.userId, VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }));
                if (req.artistId) {
                    const artistReleases = library.getReleasesByArtist(req.artistId, VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }));
                    const existingIds = new Set(ownedFormalReleases.map(r => r.id));
                    for (const r of artistReleases) {
                        if (!existingIds.has(r.id)) {
                            ownedFormalReleases.push(r);
                        }
                    }
                }
                const ownedPendingAlbums = library.getAlbumsByOwner(req.userId, VisibilityProfile.ALL_ACCESS)
                    .filter(a => a.status && a.status !== 'draft')
                    .map(a => ({ ...a, is_formal_release: false }));
                releases = [...ownedFormalReleases, ...ownedPendingAlbums];
            } else {
                res.json([]);
                return;
            }

            // Sort by date/id
            const sortedReleases = releases.sort((a, b) => {
                const dateA = new Date(a.date || a.created_at || 0).getTime();
                const dateB = new Date(b.date || b.created_at || 0).getTime();
                return dateB - dateA;
            });

            res.json(sortedReleases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * PUT /api/admin/releases/:id/visibility
     * Toggle album visibility
     */
    router.put("/releases/:id/visibility", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { isPublic, visibility } = req.body;

            // Check both releases and albums
            const release = library.getRelease(id);
            const album = library.getAlbum(id);
            const item = release || album;

            if (!item) {
                return res.status(404).json({ error: "Release or album not found" });
            }

            // Determine visibility
            let newVisibility: 'public' | 'private' | 'unlisted' = 'private';
            if (visibility) {
                newVisibility = visibility;
            } else if (typeof isPublic === 'boolean') {
                // Backward compatibility
                newVisibility = isPublic ? 'public' : 'private';
            }

            // Permission Check
            const ownerId = release ? release.owner_id : album?.owner_id;
            const isAssociatedArtist = req.artistId !== undefined && req.artistId !== null && item.artist_id !== undefined && item.artist_id !== null && Number(item.artist_id) === Number(req.artistId);
            const canManageAll = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT);

            if (req.userId !== undefined && !canManageAll && ownerId !== req.userId && !isAssociatedArtist) {
                return res.status(403).json({ error: "Access denied: You can only manage your own content" });
            }

            const isNowPublic = newVisibility === 'public' || newVisibility === 'unlisted';

            // Update visibility in DB
            if (release) {
                library.updateRelease(id, { 
                    visibility: newVisibility,
                    published_to_ap: isNowPublic,
                    published_to_gundb: isNowPublic
                });
            } else {
                library.updateAlbumVisibility(id, newVisibility);
                library.updateAlbumFederationSettings(id, isNowPublic, isNowPublic);
            }

            // Use PublishingService to sync
            publishingService.syncRelease(id).catch(e => console.error("Failed to sync visibility:", e));

            res.json({ message: "Visibility updated", visibility: newVisibility });
        } catch (error) {
            console.error("Error updating visibility:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });



    router.get("/stats", async (req: AuthenticatedRequest, res: any) => {
        try {
            const showMine = req.query.mine === 'true';
            const isPrivileged = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT);
            const artistId = (isPrivileged) && !showMine ? undefined : (req.artistId || undefined);
            const ownerId = (isPrivileged) && !showMine ? undefined : req.userId;
            
            const stats = await library.getStats(artistId, ownerId);
            // Surface the requesting user's quota so the client can render a
            // used/quota/remaining gauge (0 = unlimited).
            let storageQuota = 0;
            if (req.userId) {
                storageQuota = authService.getStorageInfo(req.userId)?.storage_quota || 0;
            }
            res.json({ ...stats, storageQuota });
        } catch (error) {
            console.error("Error getting stats:", error);
            res.status(500).json({ error: "Failed to get stats" });
        }
    });

    /**
     * GET /api/admin/storage/overview
     * Instance-wide storage view: real disk usage, logical DB total, allocated
     * quota and a per-user breakdown. Root/system admins only.
     */
    router.get("/storage/overview", async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
            return res.status(403).json({ error: "Super Root access required" });
        }
        try {
            const overview = await getInstanceStorage((database as any).db, musicDir);
            res.json(overview);
        } catch (error) {
            console.error("Error getting storage overview:", error);
            res.status(500).json({ error: "Failed to get storage overview" });
        }
    });

    /**
     * POST /api/admin/storage/recompute
     * Backfill tracks.file_size from disk and recompute per-user storage_used,
     * then return the refreshed overview. Root/system admins only.
     */
    router.post("/storage/recompute", async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
            return res.status(403).json({ error: "Super Root access required" });
        }
        try {
            const db = (database as any).db;
            const result = recomputeFileSizes(db, musicDir);
            recomputeUserStorage(db);
            const overview = await getInstanceStorage(db, musicDir);
            res.json({ ...result, overview });
        } catch (error) {
            console.error("Error recomputing storage:", error);
            res.status(500).json({ error: "Failed to recompute storage" });
        }
    });

    /**
     * GET /api/admin/system/resources
     * Live process/host resource snapshot for the admin dashboard: memory, CPU,
     * load, DB file size and currently-running background tasks. All metrics are
     * cheap (no disk walk) so the client can poll it every few seconds to spot
     * memory leaks via the heap/RSS trend. Root/system admins only.
     */
    router.get("/system/resources", (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
            return res.status(403).json({ error: "Super Root access required" });
        }
        // SQLite file size is a cheap stat; the music dir is intentionally NOT
        // walked here (see Storage tab for the full on-disk breakdown).
        let dbSize = 0;
        let dbPath: string | null = null;
        try {
            dbPath = (database as any).db?.name ?? null;
            if (dbPath) dbSize = fs.statSync(dbPath).size;
        } catch { /* DB file vanished or in-memory; report 0 */ }

        res.json({
            timestamp: Date.now(),
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                nodeVersion: process.version,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage(), // microseconds, cumulative — client derives % from deltas
            },
            system: {
                platform: process.platform,
                arch: process.arch,
                cpus: os.cpus().length,
                loadavg: os.loadavg(), // [1m, 5m, 15m]; 0s on Windows
                totalmem: os.totalmem(),
                freemem: os.freemem(),
                uptime: os.uptime(),
            },
            db: { path: dbPath, size: dbSize },
            tasks: taskManager.getRunningTasks(),
        });
    });

    /**
     * GET /api/admin/settings
     * Get all site settings
     */
    router.get("/settings", (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) return res.status(403).json({ error: "Super Root access required" });
        try {
            const settings = identity.getAllSettings();
            res.json({
                ...settings,
                jwtSecret: config.jwtSecret
            });
        } catch (error) {
            console.error("Error getting settings:", error);
            res.status(500).json({ error: "Failed to get settings" });
        }
    });

    /**
     * PUT /api/admin/settings
     * Update site settings
     */
    router.put("/settings", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can change global settings
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only root admin can change site settings" });
            }

            const { 
                siteName, siteDescription, publicUrl, artistName, coverImage, mode,
                web3_checkout_address, web3_nft_address,
                telegram_bot_token, telegram_allowed_channels,
                adminFeePercentage, adminTreasuryAddress,
                soulseek_username, soulseek_password,
                stripe_secret_key, stripe_webhook_secret,
                discogs_token,
                allowPublicRegistration,
                siteLogo,
                lastfm_api_key,
                lastfm_session_key,
                listenbrainz_token,
                google_drive_client_id,
                google_drive_client_secret,
                themeFont, themeBlur, themeOverlayOpacity,
                communityLink,
                web3Enabled,
                chatEnabled,
                boardEnabled,
                scheduledScanHour,
                listenerSelfPublish,
                listenerSelfPublishQuota,
                hideLive,
                hideStore,
                hideSocial,
                hideNetwork,
                hideDig,
                hideDj,
                membershipMonthlyPrice,
                peerEnabled,
                peerAllowDownloads,
                peerFederation,
                brandPrimary,
                brandAccent
            } = req.body;
            let settingsChanged = false;
            const isTrue = (val: any) => val === true || val === "true";

            if (peerEnabled !== undefined) {
                identity.setSetting("peerEnabled", isTrue(peerEnabled) ? "true" : "false");
            }

            if (peerAllowDownloads !== undefined) {
                identity.setSetting("peerAllowDownloads", isTrue(peerAllowDownloads) ? "true" : "false");
            }

            if (peerFederation !== undefined) {
                identity.setSetting("peerFederation", isTrue(peerFederation) ? "true" : "false");
            }

            if (hideLive !== undefined) {
                identity.setSetting("hideLive", isTrue(hideLive) ? "true" : "false");
            }

            if (hideStore !== undefined) {
                identity.setSetting("hideStore", isTrue(hideStore) ? "true" : "false");
            }

            if (hideSocial !== undefined) {
                identity.setSetting("hideSocial", isTrue(hideSocial) ? "true" : "false");
            }

            if (hideNetwork !== undefined) {
                identity.setSetting("hideNetwork", isTrue(hideNetwork) ? "true" : "false");
            }

            if (hideDig !== undefined) {
                identity.setSetting("hideDig", isTrue(hideDig) ? "true" : "false");
            }

            if (hideDj !== undefined) {
                identity.setSetting("hideDj", isTrue(hideDj) ? "true" : "false");
            }

            if (web3Enabled !== undefined) {
                identity.setSetting("web3Enabled", isTrue(web3Enabled) ? "true" : "false");
            }

            if (boardEnabled !== undefined) {
                identity.setSetting("boardEnabled", isTrue(boardEnabled) ? "true" : "false");
                identity.setSetting("chatEnabled", isTrue(boardEnabled) ? "true" : "false");
            } else if (chatEnabled !== undefined) {
                identity.setSetting("boardEnabled", isTrue(chatEnabled) ? "true" : "false");
                identity.setSetting("chatEnabled", isTrue(chatEnabled) ? "true" : "false");
            }

            if (scheduledScanHour !== undefined) {
                // "" disables; otherwise an hour of day 0-23 (local server time)
                const hour = String(scheduledScanHour).trim();
                if (hour !== "" && (!/^\d{1,2}$/.test(hour) || Number(hour) > 23)) {
                    return res.status(400).json({ error: "scheduledScanHour must be empty or an hour between 0 and 23" });
                }
                identity.setSetting("scheduledScanHour", hour);
            }

            if (siteName !== undefined) {
                identity.setSetting("siteName", siteName);
                settingsChanged = true;
            }
            if (siteLogo !== undefined) {
                identity.setSetting("siteLogo", siteLogo);
                settingsChanged = true;
            }
            if (mode !== undefined) {
                identity.setSetting("mode", mode);
                settingsChanged = true;
            }
            if (siteDescription !== undefined) {
                identity.setSetting("siteDescription", siteDescription);
                settingsChanged = true;
            }
            if (publicUrl !== undefined) {
                identity.setSetting("publicUrl", publicUrl);
                settingsChanged = true;
            }
            if (artistName !== undefined) {
                identity.setSetting("artistName", artistName);
                settingsChanged = true;
            }
            if (coverImage !== undefined) {
                identity.setSetting("coverImage", coverImage);
                settingsChanged = true;
            }
            if (req.body.backgroundImage !== undefined) {
                identity.setSetting("backgroundImage", req.body.backgroundImage);
            }
            if (themeFont !== undefined) {
                identity.setSetting("themeFont", themeFont);
                settingsChanged = true;
            }
            if (themeBlur !== undefined) {
                identity.setSetting("themeBlur", themeBlur);
                settingsChanged = true;
            }
            if (themeOverlayOpacity !== undefined) {
                identity.setSetting("themeOverlayOpacity", themeOverlayOpacity.toString());
                settingsChanged = true;
            }
            if (brandPrimary !== undefined) {
                identity.setSetting("brandPrimary", brandPrimary);
                settingsChanged = true;
            }
            if (brandAccent !== undefined) {
                identity.setSetting("brandAccent", brandAccent);
                settingsChanged = true;
            }
            if (communityLink !== undefined) {
                identity.setSetting("communityLink", communityLink);
                settingsChanged = true;
            }
            if (web3_checkout_address !== undefined) {
                identity.setSetting("web3_checkout_address", web3_checkout_address);
            }
            if (web3_nft_address !== undefined) {
                identity.setSetting("web3_nft_address", web3_nft_address);
            }

            if (telegram_bot_token !== undefined) {
                identity.setSetting("telegram_bot_token", telegram_bot_token);
                settingsChanged = true;
            }
            if (telegram_allowed_channels !== undefined) {
                identity.setSetting("telegram_allowed_channels", telegram_allowed_channels);
                settingsChanged = true;
            }
            if (adminFeePercentage !== undefined) {
                identity.setSetting("adminFeePercentage", adminFeePercentage.toString());
            }
            if (adminTreasuryAddress !== undefined) {
                identity.setSetting("adminTreasuryAddress", adminTreasuryAddress);
            }
            if (membershipMonthlyPrice !== undefined) {
                const price = parseFloat(membershipMonthlyPrice);
                if (!Number.isFinite(price) || price < 0) {
                    return res.status(400).json({ error: "membershipMonthlyPrice must be a non-negative number" });
                }
                identity.setSetting("membershipMonthlyPrice", price.toFixed(2));
            }
            if (soulseek_username !== undefined) {
                identity.setSetting("soulseek_username", soulseek_username);
            }
            if (soulseek_password !== undefined) {
                identity.setSetting("soulseek_password", soulseek_password);
            }
            if (stripe_secret_key !== undefined) {
                identity.setSetting("stripe_secret_key", stripe_secret_key);
            }
            if (stripe_webhook_secret !== undefined) {
                identity.setSetting("stripe_webhook_secret", stripe_webhook_secret);
            }

            if (discogs_token !== undefined) {
                identity.setSetting("discogs_token", discogs_token);
            }

            if (allowPublicRegistration !== undefined) {
                identity.setSetting("allowPublicRegistration", isTrue(allowPublicRegistration) ? "true" : "false");
                settingsChanged = true;
            }

            if (listenerSelfPublish !== undefined) {
                identity.setSetting("listenerSelfPublish", isTrue(listenerSelfPublish) ? "true" : "false");
            }

            if (listenerSelfPublishQuota !== undefined) {
                // Stored as MB. Reject negatives/non-numbers; "" or 0 means unlimited.
                const quotaMb = Number(listenerSelfPublishQuota);
                if (!Number.isFinite(quotaMb) || quotaMb < 0) {
                    return res.status(400).json({ error: "listenerSelfPublishQuota must be a non-negative number (MB)" });
                }
                identity.setSetting("listenerSelfPublishQuota", String(Math.floor(quotaMb)));
            }

            if (lastfm_api_key !== undefined) {
                identity.setSetting("lastfm_api_key", lastfm_api_key);
            }
            if (lastfm_session_key !== undefined) {
                identity.setSetting("lastfm_session_key", lastfm_session_key);
            }

            if (listenbrainz_token !== undefined) {
                identity.setSetting("listenbrainz_token", listenbrainz_token);
            }

            if (google_drive_client_id !== undefined) {
                identity.setSetting("google_drive_client_id", google_drive_client_id);
            }
            if (google_drive_client_secret !== undefined) {
                identity.setSetting("google_drive_client_secret", google_drive_client_secret);
            }

            // Restart telegram bot if settings changed
            if (telegram_bot_token !== undefined || telegram_allowed_channels !== undefined) {
                telegramBotService.restart().catch((err: any) => console.error("Failed to restart Telegram bot:", err));
            }

            // Reconnect Soulseek if credentials changed (only when the plugin is enabled)
            if ((soulseek_username !== undefined || soulseek_password !== undefined) && isDownloadProviderEnabled("soulseek")) {
                const sUsername = soulseek_username !== undefined ? soulseek_username : identity.getSetting("soulseek_username");
                const sPassword = soulseek_password !== undefined ? soulseek_password : identity.getSetting("soulseek_password");
                if (sUsername && sPassword) {
                    soulseekService.connect(sUsername, sPassword).catch((err: any) => console.error("Failed to reconnect Soulseek:", err));
                }
            }

            if (settingsChanged) {
                try {
                    const finalName = identity.getSetting("siteName") || config.siteName || "TuneCamp Instance";
                    const finalBio = identity.getSetting("siteDescription") || config.siteDescription || "Welcome to our TuneCamp community hub!";
                    const finalPhoto = identity.getSetting("siteLogo") || undefined;
                    library.updateArtist(SITE_ACTOR_ID, finalName, finalBio, finalPhoto);

                    // Keep the instance federation handle in sync with the instance name.
                    // The handle is a stable slug derived from siteName; it is (re)derived only
                    // when the admin explicitly edits the site name, and falls back to "site"
                    // until then. No remote Move is sent (instance has no remote followers).
                    if (siteName !== undefined) {
                        let desiredHandle = slugifySiteName(finalName);
                        const collision = database.getArtistBySlug(desiredHandle);
                        if (collision && collision.id !== SITE_ACTOR_ID) {
                            desiredHandle = `${desiredHandle}-instance`;
                        }
                        const currentHandle = getSiteHandle(database);
                        if (desiredHandle !== currentHandle) {
                            identity.setSetting("siteHandle", desiredHandle);
                            (database as any).db.prepare("UPDATE artists SET slug = ? WHERE id = ?").run(desiredHandle, SITE_ACTOR_ID);
                            console.log(`📡 [Settings] Site Actor handle updated: @${currentHandle} → @${desiredHandle}`);
                        }
                    }
                    console.log("📡 [Settings] Synchronized Site Actor in artists table");
                } catch (e) {
                    console.error("❌ [Settings] Failed to sync Site Actor in artists table:", e);
                }
            }

            res.json({ message: "Settings updated" });
        } catch (error) {
            console.error("Error updating settings:", error);
            res.status(500).json({ error: "Failed to update settings" });
        }
    });

    /**
     * POST /api/admin/network/ap/follow
     * Follow a remote ActivityPub instance/actor (Any Admin)
     */
    router.post("/network/ap/follow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can follow remote instances" });
            }
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ error: "URL is required" });
            }

            await apService.followRemoteActor(url, getSiteHandle(database));
            res.json({ message: `Successfully sent follow request to ${url}` });
        } catch (error: any) {
            console.error("Error following AP actor:", error);
            res.status(500).json({ error: error.message || "Failed to follow remote actor" });
        }
    });

    /**
     * POST /api/admin/network/tunecamp/follow
     * Follow another TuneCamp instance by its website URL alone (Any Admin).
     *
     * Does the resolution under the hood: validates the origin is a TuneCamp
     * instance via NodeInfo, follows its site actor over ActivityPub, and kicks
     * off an immediate federated-discovery crawl so it shows up right away
     * instead of waiting for the next scheduled crawl.
     */
    router.post("/network/tunecamp/follow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can follow instances" });
            }
            const { url } = req.body;
            if (!url || typeof url !== "string") {
                return res.status(400).json({ error: "Instance URL is required" });
            }

            // Accept a bare domain or any URL; we only care about the origin.
            let origin: string;
            try {
                const normalized = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
                origin = new URL(normalized).origin;
            } catch {
                return res.status(400).json({ error: "Invalid instance URL" });
            }

            // Validate it's actually a TuneCamp instance (and store it immediately).
            const isTuneCamp = await federatedDiscoveryService.probeOrigin(origin);
            if (!isTuneCamp) {
                return res.status(400).json({
                    error: `${origin} doesn't look like a reachable TuneCamp instance. Check the URL, or use "Instances & Peers" to follow a non-TuneCamp ActivityPub actor.`,
                });
            }

            // Follow the site actor over ActivityPub (now resolves via NodeInfo actorId).
            await apService.followRemoteActor(origin, getSiteHandle(database));

            // Expand discovery now rather than on the 6h schedule.
            taskManager.run("federated-discovery", () => federatedDiscoveryService.crawl());

            res.json({ message: `Following TuneCamp instance ${origin}. Its catalog will appear in the Network.` });
        } catch (error: any) {
            console.error("Error following TuneCamp instance:", error);
            res.status(500).json({ error: error.message || "Failed to follow TuneCamp instance" });
        }
    });

    /**
     * GET /api/admin/system/ap-identity
     * Get site actor ActivityPub identity keypair (ROOT ADMIN ONLY)
     */
    router.get("/system/ap-identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can access site identity
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can access site identity" });
            }
            const publicKey = identity.getSetting("site_public_key");
            const privateKey = identity.getSetting("site_private_key");
            res.json({ publicKey, privateKey, handle: getSiteHandle(database) });
        } catch (error) {
            console.error("Error getting site AP identity:", error);
            res.status(500).json({ error: "Failed to get site AP identity" });
        }
    });


    /**
     * POST /api/admin/system/rescan
     * Manually trigger library maintenance (Any Admin)
     */
    router.post("/system/rescan", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT)) {
                return res.status(403).json({ error: "Only admin can trigger rescan" });
            }

            if (!maintenance) {
                return res.status(500).json({ error: "Maintenance service not available" });
            }
            console.log(`🔍 [Admin] Manual library maintenance and scan triggered by ${req.username}`);

            // Run maintenance and full scan in background with dedup protection
            const started = taskManager.run('library-rescan', async () => {
                await maintenance.runStartupRepairs();
                console.log(`🔍 [Admin] Starting manual library scan: ${musicDir}`);
                const result = await scanner.scanDirectory(musicDir, (processed, total) => {
                    taskManager.updateProgress('library-rescan', processed, total, `Scanning library: ${processed}/${total} files`);
                });
                console.log(`✅ [Admin] Manual scan complete. Processed ${result.successful.length} files.`);
                return { processed: result.successful.length, failed: result.failed.length };
            });

            if (!started) {
                return res.status(409).json({ error: "Library scan is already in progress" });
            }

            res.json({ message: "Library maintenance and scan triggered in background" });
        } catch (error) {
            console.error("Error triggering rescan:", error);
            res.status(500).json({ error: "Failed to trigger rescan" });
        }
    });

    /**
     * POST /api/admin/system/sync-tags
     * Sync all file tags with database metadata (Root Admin only)
     */
    router.post("/system/sync-tags", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can sync tags" });
            }

            if (!maintenance) {
                return res.status(500).json({ error: "Maintenance service not available" });
            }

            console.log(`🏷️ [Admin] Full tag sync triggered by ${req.username}`);

            const started = taskManager.run('tag-sync', () => maintenance.syncAllTagsFromDb((processed, total) => {
                taskManager.updateProgress('tag-sync', processed, total, `Synchronizing tags: ${processed}/${total} tracks`);
            }));

            if (!started) {
                return res.status(409).json({ error: "Tag synchronization is already in progress" });
            }

            res.json({ message: "Tag synchronization started in background. This may take several minutes for large libraries." });
        } catch (error) {
            console.error("Error triggering tag sync:", error);
            res.status(500).json({ error: "Failed to trigger tag sync" });
        }
    });



    /**
     * POST /api/admin/system/prune-orphans
     * Remove empty/orphaned albums and artists from the database (Any Admin)
     */
    router.post("/system/prune-orphans", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT)) {
                return res.status(403).json({ error: "Only admin can prune orphan records" });
            }

            console.log(`🧹 [Admin] Orphan prune triggered by ${req.username}`);
            library.pruneOrphans();

            res.json({ message: "Orphan records pruned" });
        } catch (error) {
            console.error("Error pruning orphan records:", error);
            res.status(500).json({ error: "Failed to prune orphan records" });
        }
    });

    /**
     * POST /api/admin/system/prewarm-cache
     * Pre-transcode all non-streamable tracks to fill the transcode cache in the background.
     */
    router.post("/system/prewarm-cache", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT)) {
                return res.status(403).json({ error: "Only admin can trigger cache pre-warming" });
            }

            const mediaEngine: ServiceContainer['mediaEngine'] = (container as any).mediaEngine;
            if (!mediaEngine) return res.status(503).json({ error: "MediaEngine not available" });

            if (taskManager.isRunning('prewarm-cache')) {
                return res.status(409).json({ error: "Pre-warm already running" });
            }

            const tracks = database.getAllTracks().filter((t: any) => t.file_path);
            console.log(`🔥 [Admin] Cache pre-warm triggered by ${req.username} — ${tracks.length} tracks`);

            taskManager.run('prewarm-cache', async () => {
                let aborted = false;
                const warmed = await mediaEngine.prewarmCache(
                    tracks,
                    (done, total, current) => taskManager.updateProgress('prewarm-cache', done, total, current),
                    () => aborted
                );
                return { warmed, total: tracks.length };
            });

            res.json({ message: `Pre-warm started for ${tracks.length} tracks`, taskId: 'prewarm-cache' });
        } catch (error) {
            console.error("Error starting cache pre-warm:", error);
            res.status(500).json({ error: "Failed to start cache pre-warm" });
        }
    });

    /**
     * POST /api/admin/network/sync-community
     * Discover other Tunecamp instances via GunDB and follow them via ActivityPub (Any Admin)
     */
    router.post("/network/sync-community", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only super root admin can sync community" });
            }

            const result = await publishingService.syncCommunityFollows();
            res.json({ 
                message: `Community sync completed. Discovered ${result.discovered} sites, followed ${result.followed} new instances.`,
                ...result 
            });
        } catch (error: any) {
            console.error("Error syncing community follows:", error);
            res.status(500).json({ error: error.message || "Failed to sync community follows" });
        }
    });

    /**
     * PUT /api/admin/releases/:id
     * Update an album or formal release
     */
    router.put("/releases/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const body = req.body;

            if (!req.isRootAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to modify releases" });
            }

            console.log(`📝 [Debug] PUT /api/admin/releases/${id} received:`, {
                title: body.title,
                track_ids: body.track_ids,
                track_ids_count: body.track_ids?.length
            });


            // Check both releases and albums
            const release = library.getRelease(id);
            const album = library.getAlbum(id);
            const item = release || album;

            if (!item) {
                console.warn(`⚠️ [Debug] Release/Album ${id} not found during update`);
                return res.status(404).json({ error: "Release or album not found" });
            }

            // Permission Check: Root Admin/Admin can edit anything. 
            // Others (Super Users/Managers) can edit if they own the item OR if they are in album_ownership table.
            const owners = library.getAlbumOwners(id);
            const primaryOwnerId = release ? release.owner_id : album?.owner_id;
            const isOwner = req.userId !== undefined && (primaryOwnerId === req.userId || owners.includes(req.userId));
            const isAssociatedArtist = req.artistId !== undefined && req.artistId !== null && item.artist_id !== undefined && item.artist_id !== null && Number(item.artist_id) === Number(req.artistId);
            
            const isPrivileged = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT);
            const canManagePrivate = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY);
            
            if (!isPrivileged && !isOwner && !canManagePrivate && !isAssociatedArtist) {
                console.warn(`⛔ [Debug] Access Denied for user ${req.username} on item ${id}. Owners: ${owners}, PrimaryOwner: ${primaryOwnerId}, Request UserId: ${req.userId}`);
                return res.status(403).json({ error: "Access denied: Insufficient permissions to modify this item" });
            }

            const updates: any = {};
            if (body.title) updates.title = body.title;
            const finalArtistId = body.artistId || body.artist_id;
            if (finalArtistId) updates.artist_id = finalArtistId;
            if (body.date) updates.date = body.date;
            if (body.description !== undefined) updates.description = body.description;
            if (body.type) {
                updates.type = body.type;
                updates.product_type = body.type === 'podcast' ? 'podcast' : 'music';
            }
            if (body.year) updates.year = body.year;
            if (body.album_artist !== undefined) updates.album_artist = body.album_artist;
            if (body.albumArtist !== undefined) updates.album_artist = body.albumArtist;
            if (body.license !== undefined) updates.license = body.license;
            if (body.visibility) {
                const oldVisibility = release ? release.visibility : album?.visibility;
                updates.visibility = body.visibility;
                
                // If visibility is changing TO public/unlisted OR it was public but had no status
                const isBecomingPublic = (body.visibility === 'public' || body.visibility === 'unlisted') && 
                                       (oldVisibility !== 'public' && oldVisibility !== 'unlisted');
                
                if (isBecomingPublic) {
                    if (isPrivileged) {
                        updates.status = 'released';
                        updates.published_at = new Date().toISOString();
                    } else {
                        updates.status = 'pending';
                        updates.published_at = null; // Don't set until released
                    }
                }
            }
            if (body.status && isPrivileged) {
                updates.status = body.status;
                if (body.status === 'released' && !item.published_at) {
                    updates.published_at = new Date().toISOString();
                }
            }
            if (body.download !== undefined) updates.download = body.download;
            // Artists with can_sell disabled publish free content only: zero out
            // any price submitted, mirroring the gate enforced at checkout.
            const sellerArtistId = finalArtistId ?? item.artist_id;
            const sellerArtist: any = sellerArtistId ? library.getArtistSimple(Number(sellerArtistId)) : null;
            const salesAllowed = !sellerArtist || sellerArtist.can_sell !== 0;
            if (body.price !== undefined) updates.price = salesAllowed ? body.price : 0;
            if (body.priceUsdc !== undefined) updates.price_usdc = salesAllowed ? body.priceUsdc : 0;
            if (body.priceUsdt !== undefined) updates.price_usdt = salesAllowed ? body.priceUsdt : 0;
            if (body.currency) updates.currency = body.currency;            if (body.use_nft !== undefined) {
                updates.use_nft = body.use_nft ? 1 : 0;
            }
            const genreToUse = body.genre || body.genres;
            if (genreToUse) {
                const genreStr = Array.isArray(genreToUse) ? genreToUse.join(", ") : genreToUse;
                updates.genre = genreStr;
            }
            if (body.externalLinks) updates.external_links = JSON.stringify(body.externalLinks);
            if (body.publishedToZen !== undefined) {
                updates.published_to_gundb = body.publishedToZen;
            } else if (body.publishedToGunDB !== undefined) {
                updates.published_to_gundb = body.publishedToGunDB;
            } else if (updates.visibility === 'public' || updates.visibility === 'unlisted') {
                updates.published_to_gundb = true;
            }
            
            if (body.publishedToAP !== undefined) {
                updates.published_to_ap = body.publishedToAP;
            } else if (updates.visibility === 'public' || updates.visibility === 'unlisted') {
                updates.published_to_ap = true;
            }

            // --- TRANSACTIONAL UPDATE ---
            database.transaction(() => {
                if (Object.keys(updates).length > 0) {
                    if (release) {
                        console.log(`   - Updating formal release metadata:`, Object.keys(updates));
                        library.updateRelease(id, updates);
                    } else {
                        console.log(`   - Updating library album metadata:`, Object.keys(updates));
                        if (updates.title) library.updateAlbumTitle(id, updates.title);
                        if (updates.genre) library.updateAlbumGenre(id, updates.genre);
                        if (updates.year) library.updateAlbumYear(id, updates.year);
                        if (updates.visibility) library.updateAlbumVisibility(id, updates.visibility);
                        if (updates.download !== undefined) library.updateAlbumDownload(id, updates.download);
                        if (updates.price !== undefined || updates.price_usdc !== undefined) {
                            const curr = library.getAlbum(id);
                            if (curr) {
                                const p = updates.price !== undefined ? Number(updates.price) : (curr.price ?? 0);
                                const pu = updates.price_usdc !== undefined ? Number(updates.price_usdc) : (curr.price_usdc ?? 0);
                                library.updateAlbumPrice(id, p, pu, (updates.currency || curr.currency || 'ETH') as 'ETH' | 'USD');
                            }
                        }
                        if (updates.external_links) library.updateAlbumLinks(id, updates.external_links);
                        if (updates.published_to_gundb !== undefined || updates.published_to_ap !== undefined) {
                            library.updateAlbumFederationSettings(id, !!updates.published_to_gundb, !!updates.published_to_ap);
                        }
                    }
                }
            });


            // --- TRACKS UPDATE LOGIC ---
            if (body.track_ids && Array.isArray(body.track_ids)) {
                const newTrackIds = body.track_ids.map((tid: any) => parseInt(tid, 10)).filter((tid: any) => !isNaN(tid));
                console.log(`   - Received ${newTrackIds.length} track IDs from frontend for sync:`, newTrackIds);
                
                if (release) {
                    database.transaction(() => {
                        // Atomic sync of tracks (wipe and re-add in order)
                        console.log(`     🔄 Performing atomic track sync for formal release ${id}`);
                        library.syncReleaseTracks(id, newTrackIds);

                        // If additional per-track metadata was provided (e.g. custom titles for this release)
                        if (body.tracks_data && Array.isArray(body.tracks_data)) {
                            console.log(`     📝 Updating track override metadata for formal release ${id}`);
                            for (const td of body.tracks_data) {
                                library.updateReleaseTrackMetadata(id, td.id, {
                                    title: td.title,
                                    price: salesAllowed ? td.price : 0,
                                    price_usdc: salesAllowed ? td.priceUsdc : 0,
                                    currency: td.currency || 'ETH'
                                });
                            }
                        }
                    });
                } else if (album) {
                    database.transaction(() => {
                        // Update library album tracks (standard library logic)
                        const existingTracks = library.getTracks(id);
                        const existingTrackIds = existingTracks.map(t => t.id);
                        
                        const toAdd = newTrackIds.filter((ntid: number) => !existingTrackIds.includes(ntid));
                        const toRemove = existingTrackIds.filter((etid: number) => !newTrackIds.includes(etid));

                        console.log(`   - Library Album Sync: toAdd=${toAdd.length}, toRemove=${toRemove.length}`);

                        if (toAdd.length > 0) {
                            library.updateTracksAlbum(toAdd, id);
                        }
                        if (toRemove.length > 0) {
                            library.updateTracksAlbum(toRemove, null);
                        }

                        // Update order in the library tracks table
                        const trackOrders = newTrackIds.map((trackId: number, index: number) => ({
                            id: trackId,
                            trackNum: index + 1
                        }));
                        library.updateTracksOrder(trackOrders);
                    });
                }
            }


            // Sync changes
            publishingService.syncRelease(id).catch(e => console.error("❌ Failed to sync release update:", e));

            const finalItem = release ? library.getRelease(id) : library.getAlbum(id);
            console.log(`✅ [Debug] PUT /api/admin/releases/${id} completed successfully`);
            res.json(finalItem || { message: "Updated successfully" });

        } catch (error) {
            console.error("❌ Error updating release:", error);
            res.status(500).json({ error: "Failed to update release" });
        }
    });

    /**
     * GET /api/admin/releases/:id/folder
     * Get folder contents for a release
     */
    router.get("/releases/:id/folder", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const tracks = library.getTracksByReleaseId(id); // Use the more robust unified getter
            
            if (tracks.length === 0) return res.json({ folder: null, files: [] });

            const firstWithFile = tracks.find(t => t.file_path);
            if (!firstWithFile || !firstWithFile.file_path) {
                return res.json({ folder: null, files: [] });
            }

            const trackDir = path.dirname(firstWithFile.file_path);
            const releaseDir = trackDir.includes("releases") ? trackDir : path.join(musicDir, "releases", path.basename(trackDir));
            // Security: ensure we are within musicDir
            const absoluteReleaseDir = path.resolve(musicDir, releaseDir);
            if (!absoluteReleaseDir.startsWith(path.resolve(musicDir))) {
                return res.status(403).json({ error: "Invalid path" });
            }

            const files: any[] = [];
            async function walkDir(dir: string, prefix = "") {
                if (!(await fs.pathExists(dir))) return;
                const entries = await fs.readdir(dir, { withFileTypes: true });
                await Promise.all(entries.map(async (entry) => {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walkDir(fullPath, `${prefix}${entry.name}/`);
                    } else {
                        const stat = await fs.stat(fullPath);
                        files.push({
                            name: `${prefix}${entry.name}`,
                            type: path.extname(entry.name).substring(1),
                            size: stat.size,
                        });
                    }
                }));
            }
            
            if (await fs.pathExists(absoluteReleaseDir)) {
                await walkDir(absoluteReleaseDir);
            }
            res.json({ folder: releaseDir, files });
        } catch (error) {
            console.error("Error getting release folder:", error);
            res.status(500).json({ error: "Failed to get folder" });
        }
    });

    /**
     * DELETE /api/admin/releases/batch
     * Delete multiple albums or formal releases
     */
    router.delete("/releases/batch", async (req: AuthenticatedRequest, res: any) => {
        try {
            const { ids, keepFiles } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: "Invalid or empty IDs list" });
            }

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to delete releases" });
            }

            const releaseIds: number[] = [];
            const albumIds: number[] = [];

            for (const id of ids) {
                const release = library.getRelease(id);
                const album = library.getAlbum(id);

                if (!release && !album) continue;

                // Permission Check
                if (release && !req.isRootAdmin) {
                    return res.status(403).json({ error: `Only Root Admin can delete formal release ${id}` });
                }

                const ownerId = release ? release.owner_id : album?.owner_id;
                if (req.userId !== undefined && !req.isRootAdmin && ownerId !== req.userId) {
                    return res.status(403).json({ error: `Access denied for item ${id}` });
                }

                if (release) {
                    releaseIds.push(id);
                    // Handle unpublishing for formal releases
                    try {
                        await (publishingService as any).unpublishReleaseFromAP(release);
                    } catch (e) {
                        console.error(`Failed to unpublish formal release ${id}:`, e);
                    }
                } else if (album) {
                    albumIds.push(id);
                }
            }

            const allIds = [...releaseIds, ...albumIds];
            if (allIds.length > 0) {
                library.deleteAlbumsBatch(allIds, !!keepFiles);
            }

            res.json({ message: "Releases deleted successfully", count: allIds.length });
        } catch (error) {
            console.error("Batch delete error:", error);
            res.status(500).json({ error: "Failed to delete releases" });
        }
    });

    /**
     * PUT /api/admin/releases/batch/visibility
     * Update visibility for multiple albums/releases
     */
    router.put("/releases/batch/visibility", async (req: AuthenticatedRequest, res: any) => {
        try {
            const { ids, visibility } = req.body;
            if (!Array.isArray(ids) || ids.length === 0 || !visibility) {
                return res.status(400).json({ error: "Invalid parameters" });
            }

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied" });
            }

            const processedIds: number[] = [];
            for (const id of ids) {
                const release = library.getRelease(id);
                const album = library.getAlbum(id);
                if (!release && !album) continue;

                // Permission Check
                const ownerId = release ? release.owner_id : album?.owner_id;
                if (req.userId !== undefined && !req.isRootAdmin && ownerId !== req.userId) {
                    continue; // Skip items not owned
                }

                processedIds.push(id);
            }

            if (processedIds.length > 0) {
                library.updateAlbumsVisibilityBatch(processedIds, visibility);
                // Sync with publishing service
                for (const id of processedIds) {
                    publishingService.syncRelease(id).catch(e => console.error(`Failed to sync batch visibility for ${id}:`, e));
                }
            }

            res.json({ message: "Visibility updated successfully", count: processedIds.length });
        } catch (error) {
            console.error("Batch visibility update error:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });

    /**
     * DELETE /api/admin/releases/:id
     * Delete an album or formal release
     */
    router.delete("/releases/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const keepFiles = req.query.keepFiles === 'true';

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to delete releases" });
            }

            // Check if it's a formal release or a library album
            const release = library.getRelease(id);
            const album = library.getAlbum(id);

            if (!release && !album) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Permission Check: Managers/Root Admins manage everything, while the
            // release/album owner — or the artist whose profile the item is linked
            // to — can delete their own content. Centralized in canManageItem so
            // the rule stays in sync with editing (PUT) and the release router.
            const item = (release ?? album) as { owner_id?: number | null; artist_id?: number | null };
            if (!req.context || !VisibilityGuardian.canManageItem(req.context, item)) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (release) {
                // Handle unpublishing for formal releases
                try {
                    await (publishingService as any).unpublishReleaseFromAP(release);
                } catch (e) {
                    console.error("Failed to unpublish formal release:", e);
                }
                library.deleteRelease(id);
            } else if (album) {
                library.deleteAlbum(id, keepFiles);
            }

            res.json({ message: "Release deleted successfully" });
        } catch (error) {
            console.error("Error deleting release:", error);
            res.status(500).json({ error: "Failed to delete release" });
        }
    });

    /**
     * GET /api/admin/artists/:id/identity
     * Get artist identity keypair (Root Admin or Assigned Artist Admin only)
     */
    router.get("/artists/:id/identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            const artistId = parseInt(req.params.id);
            if (isNaN(artistId)) {
                return res.status(400).json({ error: "Invalid artist ID" });
            }

            // Permission Check
            // ONLY the artist themselves or root admin can see keys.
            const isSystemAdmin = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM);
            if (!isSystemAdmin && (!req.artistId || req.artistId !== artistId)) {
                return res.status(403).json({ error: "Access denied: Only the artist or root admin can access their identity keys" });
            }

            const artist = library.getArtist(artistId);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Generate keys on-the-fly if they don't exist
            if (!artist.public_key || !artist.private_key) {
                await apService.ensureArtistKeys(artistId);
            }

            const updatedArtist = library.getArtist(artistId) || artist;

            // Return keys (even if null/empty, let frontend handle it)
            res.json({
                publicKey: updatedArtist.public_key,
                privateKey: updatedArtist.private_key
            });
        } catch (error) {
            console.error("Error getting artist identity:", error);
            res.status(500).json({ error: "Failed to get artist identity" });
        }
    });

    /**
     * POST /api/admin/artists/:id/refresh-identity
     *
     * Re-asserts an artist's federated identity: ensures it has a valid RSA key
     * pair and broadcasts a signed Update(Person) so remote servers re-fetch the
     * actor document and replace any stale cached public key. Use this when
     * followers report rejected activities ("Public key not found"), typically
     * after keys changed or after a listener account became an artist on the
     * same handle.
     */
    router.post("/artists/:id/refresh-identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            const artistId = parseInt(req.params.id);
            if (isNaN(artistId)) {
                return res.status(400).json({ error: "Invalid artist ID" });
            }

            // Same permission model as GET identity: only the artist themselves or root admin.
            const isSystemAdmin = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM);
            if (!isSystemAdmin && (!req.artistId || req.artistId !== artistId)) {
                return res.status(403).json({ error: "Access denied: Only the artist or root admin can refresh this identity" });
            }

            const artist = library.getArtist(artistId);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            const { inboxes } = await apService.broadcastActorUpdate(artistId);
            res.json({
                success: true,
                inboxes,
                message: inboxes > 0
                    ? `Identity refresh sent to ${inboxes} follower inbox(es).`
                    : "Keys ensured and announced to relay (no direct followers).",
            });
        } catch (error) {
            console.error("Error refreshing artist identity:", error);
            res.status(500).json({ error: "Failed to refresh artist identity" });
        }
    });

    /**
     * DELETE /api/admin/artists/batch
     * Delete multiple artists
     */
    router.delete("/artists/batch", async (req: AuthenticatedRequest, res: any) => {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: "Invalid or empty IDs list" });
            }

            // Only Root Admin or Super User can delete artists batch
            if (!req.isRootAdmin && req.role !== 'super_user') {
                return res.status(403).json({ error: "Access denied" });
            }

            library.deleteArtistsBatch(ids);
            res.json({ message: "Artists deleted successfully", count: ids.length });
        } catch (error) {
            console.error("Batch delete artists error:", error);
            res.status(500).json({ error: "Failed to delete artists" });
        }
    });

    /**
     * PUT /api/admin/artists/batch/visibility
     * Update visibility for multiple artists
     */
    router.put("/artists/batch/visibility", async (req: AuthenticatedRequest, res: any) => {
        try {
            const { ids, visibility } = req.body;
            if (!Array.isArray(ids) || ids.length === 0 || !visibility) {
                return res.status(400).json({ error: "Invalid parameters" });
            }

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied" });
            }

            const processedIds: number[] = [];
            for (const id of ids) {
                // Permission Check
                if (!req.isRootAdmin && req.role !== 'super_user' && req.artistId !== id) {
                    continue; // Skip if not owner and not admin
                }
                processedIds.push(id);
            }

            if (processedIds.length > 0) {
                library.updateArtistsVisibilityBatch(processedIds, visibility);
                // Sync with publishing service (if artist sync exists, but artists are usually synced via updates)
                // Note: Artist visibility might trigger Actor updates in AP
            }

            res.json({ message: "Visibility updated successfully", count: processedIds.length });
        } catch (error) {
            console.error("Batch artist visibility update error:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });

    /**
     * GET /api/admin/system/me
     * Get current admin user info (username, isRootAdmin)
     */
    router.get("/system/me", (req: AuthenticatedRequest, res: any) => {
        try {
            const username = req.username || "";
            const dbUser = username ? authService.getUserByUsername(username) : null;
            res.json({ 
                username, 
                isAdmin: dbUser ? (dbUser.role === 'admin' || dbUser.role === 'super_user' || dbUser.role === 'root_admin') : !!req.isAdmin,
                isRootAdmin: dbUser ? dbUser.is_root : !!req.isRootAdmin, 
                artistId: dbUser ? dbUser.artist_id : req.artistId 
            });
        } catch (error) {
            console.error("Error getting current admin:", error);
            res.status(500).json({ error: "Failed to get current admin" });
        }
    });

    /**
     * GET /api/admin/system/users
     * List all admin users
     */
    router.get("/system/users", (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin or manager can list users
            if (!req.context || !(req.role === 'root_admin' || req.role === 'admin')) {
                return res.status(403).json({ error: "Only Root Admin or Manager can list users" });
            }
            const admins = authService.listAdmins();
            res.json(admins);
        } catch (error) {
            console.error("Error listing admins:", error);
            res.status(500).json({ error: "Failed to list admins" });
        }
    });

    /**
     * POST /api/admin/system/users
     * Create new admin user (root admin only)
     */
    router.post("/system/users", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can create new admins" });
            }
            const { username, password, artistId, isAdmin, role, storageQuota } = req.body;
            if (!username) {
                return res.status(400).json({ error: "Username is required" });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const targetRole: UserRole = role || (isAdmin ? UserRole.ADMIN : UserRole.NORMAL_USER);
            const quota = storageQuota !== undefined ? Number(storageQuota) : (targetRole === UserRole.NORMAL_USER ? 1024 * 1024 * 1024 : 0);

            if (targetRole === UserRole.ADMIN || targetRole === UserRole.SUPER_USER) {
                const { id } = await authService.createAdmin(username, password, artistId, targetRole);
                if (storageQuota !== undefined) {
                    authService.updateAdmin(id, artistId, targetRole, quota);
                }
            } else {
                // Listeners (NORMAL_USER) cannot have an artist profile linked
                await authService.createUser(username, password, null, quota, undefined, targetRole);
            }
            res.json({ message: "Admin user created" });
        } catch (error: any) {
            console.error("Error creating admin:", error);
            if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(409).json({ error: "Username already exists" });
            }
            res.status(500).json({ error: "Failed to create admin" });
        }
    });

    /**
     * PUT /api/admin/system/users/:id
     * Update admin user (root admin only)
     */
    router.put("/system/users/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can manage users" });
            }
            const id = parseInt(req.params.id, 10);
            const { artistId, isAdmin, role, storageQuota } = req.body;

            const currentAdmin = authService.getAdminById(id);
            const targetRole = role || (isAdmin === undefined ? (currentAdmin?.role || 'user') : (isAdmin ? 'admin' : 'user'));
            const quota = storageQuota !== undefined ? Number(storageQuota) : undefined;
            // Standard users CAN have an artist profile linked (community
            // artists): uploads work via the link and stay owner-scoped.
            authService.updateAdmin(id, artistId, targetRole as UserRole, quota);
            res.json({ message: "Admin user updated" });
        } catch (error) {
            console.error("Error updating admin:", error);
            res.status(500).json({ error: "Failed to update admin" });
        }
    });

    /**
     * POST /api/admin/system/users/:id/approve-artist
     * One-click approval of a listener's artist-profile request: creates an
     * artist named after the user (selling disabled until verified), links it,
     * and promotes the account to Curator — publishing requires the role, not
     * just the artist link, and the approval is the direct admin–artist contact.
     */
    router.post("/system/users/:id/approve-artist", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can approve artist requests" });
            }
            const id = parseInt(req.params.id, 10);
            const user = authService.getAdminById(id);
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }
            if (user.artist_id) {
                authService.setArtistRequest(id, false);
                return res.status(400).json({ error: "User already has an artist profile" });
            }

            const existingArtist = library.getArtistByName(user.username);
            const artistId = existingArtist 
                ? existingArtist.id 
                : library.createArtist(user.username, undefined, undefined, undefined, undefined, undefined, 'public');
            library.setArtistCanSell(artistId, false);
            // Keep the user's role unchanged — the artist-profile link grants
            // publishing rights; Curator/Manager elevation is a separate admin action.
            const newRole = user.role as UserRole;
            
            // Grant the admin-configured default storage quota for physical uploads.
            const quotaMb = Number(identity?.getSetting("listenerSelfPublishQuota"));
            const quotaBytes = (Number.isFinite(quotaMb) && quotaMb >= 0 ? quotaMb : 1024) * 1024 * 1024;
            
            authService.updateAdmin(id, artistId, newRole, quotaBytes);
            authService.setArtistRequest(id, false);

            res.json({ success: true, artistId, message: `Artist profile created for ${user.username}` });
        } catch (error: any) {
            console.error("Error approving artist request:", error);
            res.status(500).json({ error: error.message || "Failed to approve artist request" });
        }
    });

    // --- Stripe Connect onboarding (fiat direct charges to artist accounts) ---
    const getStripe = () => {
        const sKey = identity.getSetting("stripe_secret_key") || config.stripeSecretKey;
        return sKey ? new Stripe(sKey) : null;
    };
    const canManageConnect = (req: AuthenticatedRequest, artistId?: number): boolean => {
        if (!req.context) return false;
        if (VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY)) return true;
        // Artists may manage their own Stripe connect account
        return !!(artistId && req.artistId && req.artistId === artistId);
    };

    /**
     * POST /api/admin/artists/:id/stripe-connect/onboard
     * Create (or reuse) the artist's Stripe Express account and return a hosted
     * onboarding link. Once onboarding completes, fiat checkouts for the
     * artist's items are charged directly on their account (see payments.ts).
     */
    router.post("/artists/:id/stripe-connect/onboard", async (req: AuthenticatedRequest, res: any) => {
        try {
            const artistId = parseInt(req.params.id, 10);
            if (!artistId || artistId < 0) return res.status(400).json({ error: "Invalid artist id." });
            if (!canManageConnect(req, artistId)) return res.status(403).json({ error: "Access denied." });
            const stripe = getStripe();
            if (!stripe) return res.status(501).json({ error: "Stripe not configured on this server." });
            const artist: any = library.getArtistSimple(artistId);
            if (!artist) return res.status(404).json({ error: "Artist not found." });

            let accountId: string | null = artist.stripe_account_id || null;
            if (!accountId) {
                const account = await stripe.accounts.create({
                    type: "express",
                    metadata: { artistId: String(artistId), artistName: artist.name || "" }
                });
                accountId = account.id;
                library.setArtistStripeAccountId(artistId, accountId);
                console.log(`[Stripe Connect] Created Express account ${accountId} for artist ${artistId}`);
            }

            const base = (identity.getSetting("publicUrl") || config.publicUrl || "").replace(/\/$/, "");
            const origin = base || `${req.protocol}://${req.get("host")}`;
            // Caller may ask to be returned to its own page (e.g. the artist's
            // /profile) instead of /admin. Only accept a same-origin relative
            // path — never an absolute or protocol-relative URL — so a crafted
            // returnTo can't bounce the artist to an attacker page after KYC.
            const rawReturn = typeof req.body?.returnTo === "string" ? req.body.returnTo : "";
            const safePath = /^\/(?![/\\])/.test(rawReturn) ? rawReturn : "/admin";
            const returnUrl = `${origin}${safePath}`;
            const accountLink = await stripe.accountLinks.create({
                account: accountId,
                refresh_url: returnUrl,
                return_url: returnUrl,
                type: "account_onboarding"
            });

            res.json({ url: accountLink.url, accountId });
        } catch (error: any) {
            console.error("Stripe Connect onboard error:", error);
            res.status(500).json({ error: error.message || "Failed to start Stripe onboarding." });
        }
    });

    /**
     * GET /api/admin/artists/:id/stripe-connect/status
     * Report whether the artist's connected account can accept charges.
     */
    router.get("/artists/:id/stripe-connect/status", async (req: AuthenticatedRequest, res: any) => {
        try {
            const artistId = parseInt(req.params.id, 10);
            if (!canManageConnect(req, artistId)) return res.status(403).json({ error: "Access denied." });
            const artist: any = artistId ? library.getArtistSimple(artistId) : null;
            if (!artist) return res.status(404).json({ error: "Artist not found." });
            const accountId: string | null = artist.stripe_account_id || null;
            if (!accountId) return res.json({ connected: false });

            const stripe = getStripe();
            if (!stripe) return res.status(501).json({ error: "Stripe not configured on this server." });
            const acct: any = await stripe.accounts.retrieve(accountId);
            res.json({
                connected: true,
                accountId,
                chargesEnabled: acct.charges_enabled,
                payoutsEnabled: acct.payouts_enabled,
                detailsSubmitted: acct.details_submitted,
                country: acct.country || null
            });
        } catch (error: any) {
            console.error("Stripe Connect status error:", error);
            res.status(500).json({ error: error.message || "Failed to fetch Stripe status." });
        }
    });

    /**
     * DELETE /api/admin/artists/:id/stripe-connect
     * Unlink the connected account from the artist (does NOT delete it on
     * Stripe). The artist's fiat checkouts revert to the instance's own account.
     */
    router.delete("/artists/:id/stripe-connect", (req: AuthenticatedRequest, res: any) => {
        try {
            const artistId = parseInt(req.params.id, 10);
            if (!canManageConnect(req, artistId)) return res.status(403).json({ error: "Access denied." });
            const artist: any = artistId ? library.getArtistSimple(artistId) : null;
            if (!artist) return res.status(404).json({ error: "Artist not found." });
            library.setArtistStripeAccountId(artistId, null);
            res.json({ success: true });
        } catch (error: any) {
            console.error("Stripe Connect disconnect error:", error);
            res.status(500).json({ error: error.message || "Failed to unlink Stripe account." });
        }
    });

    /**
     * DELETE /api/admin/system/users/:id/artist-request
     * Dismiss a pending artist-profile request without creating anything.
     */
    router.delete("/system/users/:id/artist-request", (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can manage artist requests" });
            }
            const id = parseInt(req.params.id, 10);
            authService.setArtistRequest(id, false);
            res.json({ success: true });
        } catch (error) {
            console.error("Error dismissing artist request:", error);
            res.status(500).json({ error: "Failed to dismiss artist request" });
        }
    });

    /**
     * DELETE /api/admin/system/users/:id
     * Delete admin user (root admin only)
     */
    router.delete("/system/users/:id", (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can remove users" });
            }
            const id = parseInt(req.params.id, 10);
            authService.deleteAdmin(id);
            res.json({ message: "User deleted successfully" });
        } catch (error: any) {
            console.error("Error deleting user:", error);
            if (error.message.includes("last admin") || error.message.includes("primary admin")) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: `Failed to delete user: ${error.message}` });
        }
    });

    /**
     * DELETE /api/admin/system/users/batch
     * Delete multiple admin users (root admin only)
     */
    router.delete("/system/users/batch", (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can remove users" });
            }
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: "Invalid or empty IDs list" });
            }

            authService.deleteUsersBatch(ids);
            res.json({ message: "Users deleted successfully", count: ids.length });
        } catch (error) {
            console.error("Error deleting users batch:", error);
            res.status(500).json({ error: "Failed to delete users" });
        }
    });
    
    /**
     * PUT /api/admin/system/users/:id/status
     * Enable/disable admin user (root admin only)
     */
    router.put("/system/users/:id/status", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can manage user status" });
            }
            const id = parseInt(req.params.id, 10);
            const { active } = req.body;
            
            authService.toggleUserStatus(id, active);
            res.json({ message: `User ${active ? 'enabled' : 'disabled'} successfully` });
        } catch (error: any) {
            console.error("Error toggling user status:", error);
            res.status(500).json({ error: error.message || "Failed to toggle user status" });
        }
    });


    /**
     * PUT /api/admin/system/users/:id/password
     * Reset admin user password
     */
    router.put("/system/users/:id/password", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { password } = req.body;

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const admin = authService.getAdminById(id);

            if (!admin) {
                return res.status(404).json({ error: "User not found" });
            }

            // Permission Check
            // Only root admin can change other users' passwords
            const isRoot = req.isRootAdmin;
            if (!isRoot && admin.username !== req.username) {
                return res.status(403).json({ error: "Access denied: You can only change your own password" });
            }

            await authService.changePassword(admin.username, password);
            res.json({ message: "Password updated" });
        } catch (error) {
            console.error("Error resetting password:", error);
            res.status(500).json({ error: "Failed to reset password" });
        }
    });

    /**
     * PUT /api/admin/posts/:id
     * Update a post
     */
    router.put("/posts/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { content, visibility, title, summary } = req.body;

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to modify posts" });
            }

            const post = social.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Managers/Root Admins manage all posts; Curators only those of their own artist
            const ownsPost = VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })
                && post.artist_id === req.artistId;
            if (!req.isAdmin && !ownsPost) {
                return res.status(403).json({ error: "Access denied" });
            }

            social.updatePost(id, content, visibility, title, summary);
            const updatedPost = social.getPost(id);

            if (updatedPost) {
                // Use PublishingService
                publishingService.syncPost(id).catch(e => console.error("Failed to sync post update:", e));
            }

            res.json(updatedPost);
        } catch (error) {
            console.error("Error updating post:", error);
            res.status(500).json({ error: "Failed to update post" });
        }
    });

    /**
     * POST /api/admin/posts
     * Create a new post for an artist
     */
    router.post("/posts", async (req: AuthenticatedRequest, res: any) => {
        try {
            const { artistId, content, visibility, title, summary } = req.body;

            // Posting is artist-centric: reserved to Managers/Root Admins and Curators linked to an artist
            if (!VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })) {
                return res.status(403).json({ error: "Access denied: posting requires a Curator or Manager account" });
            }
            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to create posts" });
            }

            if (!content) {
                return res.status(400).json({ error: "Missing content" });
            }

            // Root admin without an artist association posts as the SITE actor (id = -1)
            const isSystemAdmin = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM);
            const resolvedArtistId = (artistId !== undefined && artistId !== null) ? parseInt(artistId) : (isSystemAdmin ? -1 : null);

            if (!resolvedArtistId) {
                return res.status(400).json({ error: "Missing artistId" });
            }

            // Non-admin artists can only post for their own artist
            if (req.artistId && !req.isAdmin && req.artistId !== resolvedArtistId) {
                return res.status(403).json({ error: "You can only post for your assigned artist" });
            }

            // Only root admin can post as the SITE actor
            if (resolvedArtistId === -1 && !isSystemAdmin) {
                return res.status(403).json({ error: "Only root admin can post as site actor" });
            }

            const postId = social.createPost(resolvedArtistId, content, visibility || 'public', title, summary);
            const post = social.getPost(postId);

            if (post) {
                // Use PublishingService
                publishingService.syncPost(postId).catch(e => console.error("Failed to sync new post:", e));
            }

            res.status(201).json(post);
        } catch (error) {
            console.error("Error creating post:", error);
            res.status(500).json({ error: "Failed to create post" });
        }
    });

    /**
     * DELETE /api/admin/posts/:id
     * Delete a post
     */
    router.delete("/posts/:id", (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to delete posts" });
            }

            const post = social.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Managers/Root Admins manage all posts; Curators only those of their own artist
            const ownsPost = VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })
                && post.artist_id === req.artistId;
            if (!req.isAdmin && !ownsPost) {
                return res.status(403).json({ error: "Access denied" });
            }

            social.deletePost(id);

            // Use PublishingService
            publishingService.unpublishPostFromAP(post).catch(e => console.error("Failed to sync post delete:", e));

            res.json({ message: "Post deleted" });
        } catch (error) {
            console.error("Error deleting post:", error);
            res.status(500).json({ error: "Failed to delete post" });
        }
    });

    // ─── Assets (Store) ──────────────────────────────────────────────────────

    /**
     * GET /api/admin/assets
     */
    router.get("/assets", (req: AuthenticatedRequest, res: any) => {
        try {
            const isSystemAdmin = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM);
            const assets = isSystemAdmin
                ? integration.getAllAssets()
                : req.artistId
                    ? integration.getAssetsByArtist(req.artistId)
                    : [];
            res.json(assets);
        } catch (error) {
            console.error("Error fetching assets:", error);
            res.status(500).json({ error: "Failed to fetch assets" });
        }
    });

    /**
     * POST /api/admin/assets
     */
    router.post("/assets", upload.single("file"), async (req: AuthenticatedRequest, res: any) => {
        try {
            // Selling assets is reserved to Managers/Root Admins and Curators linked to an artist
            if (!VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })) {
                return res.status(403).json({ error: "Access denied: publishing requires a Curator or Manager account" });
            }
            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied" });
            }
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { title, description, artist_id, type, price, price_usdc, currency, visibility, requires_subscription } = body;
            if (!title) return res.status(400).json({ error: "Title required" });

            const isSystemAdmin = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM);
            const resolvedArtistId = artist_id ? parseInt(artist_id) : (req.artistId || null);
            if (!isSystemAdmin && req.artistId && resolvedArtistId !== req.artistId) {
                return res.status(403).json({ error: "Cannot create assets for another artist" });
            }

            const data: any = {
                title, description, type: type || 'digital',
                artist_id: resolvedArtistId,
                owner_id: req.userId || null,
                price: parseFloat(price) || 0,
                price_usdc: parseFloat(price_usdc) || 0,
                currency: currency || 'ETH',
                visibility: visibility || 'public',
                requires_subscription: requires_subscription === 'true' || requires_subscription === true,
            };

            if (req.file) {
                data.file_path = req.file.path;
                data.mime_type = req.file.mimetype;
                data.file_size = req.file.size;
            }

            const id = integration.createAsset(data);
            res.status(201).json(integration.getAsset(id));
        } catch (error) {
            console.error("Error creating asset:", error);
            res.status(500).json({ error: "Failed to create asset" });
        }
    });

    /**
     * PUT /api/admin/assets/:id
     */
    router.put("/assets/:id", upload.single("file"), async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const asset = integration.getAsset(id);
            if (!asset) return res.status(404).json({ error: "Asset not found" });

            // Managers/Root Admins manage all assets; Curators only those of their own artist
            const ownsAsset = VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })
                && asset.artist_id === req.artistId;
            if (!req.isAdmin && !ownsAsset) {
                return res.status(403).json({ error: "Access denied" });
            }

            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const updates: any = {};
            if (body.title !== undefined) updates.title = body.title;
            if (body.description !== undefined) updates.description = body.description;
            if (body.type !== undefined) updates.type = body.type;
            if (body.artist_id !== undefined) updates.artist_id = parseInt(body.artist_id);
            if (body.price !== undefined) updates.price = parseFloat(body.price);
            if (body.price_usdc !== undefined) updates.price_usdc = parseFloat(body.price_usdc);
            if (body.currency !== undefined) updates.currency = body.currency;
            if (body.visibility !== undefined) updates.visibility = body.visibility;
            if (body.requires_subscription !== undefined) updates.requires_subscription = body.requires_subscription === 'true' || body.requires_subscription === true;
            if (req.file) {
                updates.file_path = req.file.path;
                updates.mime_type = req.file.mimetype;
                updates.file_size = req.file.size;
            }

            integration.updateAsset(id, updates);
            res.json(integration.getAsset(id));
        } catch (error) {
            console.error("Error updating asset:", error);
            res.status(500).json({ error: "Failed to update asset" });
        }
    });

    /**
     * POST /api/admin/assets/:id/cover
     */
    router.post("/assets/:id/cover", upload.single("cover"), async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const asset = integration.getAsset(id);
            if (!asset) return res.status(404).json({ error: "Asset not found" });
            if (!req.file) return res.status(400).json({ error: "No file uploaded" });

            // Managers/Root Admins manage all assets; Curators only those of their own artist
            const ownsAsset = VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })
                && asset.artist_id === req.artistId;
            if (!req.isAdmin && !ownsAsset) {
                return res.status(403).json({ error: "Access denied" });
            }

            // Move to musicDir/assets/covers/
            const ext = path.extname(req.file.originalname || '.jpg');
            const destDir = path.join(musicDir, "assets", "covers");
            await fs.ensureDir(destDir);
            const destPath = path.join(destDir, `asset-${id}${ext}`);
            await fs.move(req.file.path, destPath, { overwrite: true });

            integration.updateAsset(id, { cover_path: destPath });
            res.json({ cover_path: destPath });
        } catch (error) {
            console.error("Error uploading asset cover:", error);
            res.status(500).json({ error: "Failed to upload cover" });
        }
    });

    /**
     * DELETE /api/admin/assets/:id
     */
    router.delete("/assets/:id", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            const asset = integration.getAsset(id);
            if (!asset) return res.status(404).json({ error: "Asset not found" });

            // Managers/Root Admins manage all assets; Curators only those of their own artist
            const ownsAsset = VisibilityGuardian.canPublishContent({ userId: req.userId, artistId: req.artistId, role: req.role! })
                && asset.artist_id === req.artistId;
            if (!req.isAdmin && !ownsAsset) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (asset.file_path) {
                fs.remove(asset.file_path).catch(() => {});
            }
            if (asset.cover_path) {
                fs.remove(asset.cover_path).catch(() => {});
            }
            integration.deleteAsset(id);
            res.json({ message: "Asset deleted" });
        } catch (error) {
            console.error("Error deleting asset:", error);
            res.status(500).json({ error: "Failed to delete asset" });
        }
    });

    /**
     * GET /api/admin/system/health
     * Check status of external APIs
     */
    router.get("/system/health", async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin access required" });

        const results: any = {};

        // 1. Soulseek
        try {
            results.soulseek = await soulseekService.checkStatus();
        } catch (e) {
            results.soulseek = { connected: false, error: "Service error" };
        }

        // 2. iTunes
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const itunesRes = await fetch("https://itunes.apple.com/search?term=jack+jackson&limit=1", { signal: controller.signal });
            clearTimeout(timeout);
            results.itunes = { online: itunesRes.ok };
        } catch (e) {
            results.itunes = { online: false };
        }

        // 3. MusicBrainz
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const mbRes = await fetch("https://musicbrainz.org/ws/2/release/?query=test&fmt=json", { 
                headers: { "User-Agent": "TuneCamp/1.0.0 ( contact@tunecamp.app )" },
                signal: controller.signal
            });
            clearTimeout(timeout);
            results.musicbrainz = { online: mbRes.ok };
        } catch (e) {
            results.musicbrainz = { online: false };
        }

        // 4. Discogs (Check if token is present)
        const discogsToken = identity.getSetting("discogs_token") || process.env.DISCOGS_TOKEN;
        results.discogs = { configured: !!discogsToken };

        // 5. Telegram
        try {
            const isBotActive = await telegramBotService.isActive();
            results.telegram = { active: isBotActive };
        } catch (e) {
            results.telegram = { active: false };
        }

        // 6. OpenRouter
        const orKey = identity.getSetting("openrouter_api_key") || config.openrouterApiKey;
        const orPluginState = identity.getPluginState("openrouter");
        const isOrPluginEnabled = orPluginState ? orPluginState.enabled : true;
        results.openrouter = {
            configured: !!orKey && isOrPluginEnabled,
            model: identity.getSetting("openrouter_model") || config.openrouterModel || "openrouter/free"
        };

        // 7. Stripe
        const stripeKey = identity.getSetting("stripe_secret_key") || config.stripeSecretKey;
        const stripeWebhook = identity.getSetting("stripe_webhook_secret") || config.stripeWebhookSecret;
        results.stripe = { 
            configured: !!stripeKey,
            webhookConfigured: !!stripeWebhook
        };
        
        // 8. Google Drive
        results.gdrive = {
            configured: !!(config.gdriveClientId && config.gdriveClientSecret),
            active: !!gdriveService
        };

        // 9. YouTube
        try {
            const ytRes = await fetch("https://www.youtube.com", { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            results.youtube = { online: ytRes.ok };
        } catch {
            results.youtube = { online: false };
        }

        // 10. Bandcamp
        try {
            const bcRes = await fetch("https://bandcamp.com", { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            results.bandcamp = { online: bcRes.ok };
        } catch {
            results.bandcamp = { online: false };
        }

        // 11. Deezer
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const deezerRes = await fetch("https://api.deezer.com/version", { signal: controller.signal });
            clearTimeout(timeout);
            results.deezer = { online: deezerRes.ok };
        } catch (e) {
            results.deezer = { online: false };
        }

        // 12. Last.fm
        results.lastfm = {
            configured: !!(identity.getSetting("lastfm_session_key") || identity.getSetting("lastfm_api_key")),
            online: true // Assume online if no specific check, or add one
        };

        // 13. ListenBrainz
        results.listenbrainz = {
            configured: !!identity.getSetting("listenbrainz_token"),
            online: true
        };

        // 15. Spotify
        try {
            const spotifyRes = await fetch("https://open.spotify.com", { method: 'HEAD' });
            results.spotify = { online: spotifyRes.ok };
        } catch {
            results.spotify = { online: false };
        }

        // 16. SoundCloud
        try {
            const scRes = await fetch("https://soundcloud.com", { method: 'HEAD' });
            results.soundcloud = { online: scRes.ok };
        } catch {
            results.soundcloud = { online: false };
        }

        res.json(results);
    });

    /**
     * GET /api/admin/network/ap/peers
     * List followed ActivityPub actors
     */
    router.get("/network/ap/peers", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can view peers" });
            }
            const peers = social.getFollowedActors();
            res.json(peers);
        } catch (error) {
            console.error("Error listing peers:", error);
            res.status(500).json({ error: "Failed to list peers" });
        }
    });

    /**
     * POST /api/admin/network/ap/unfollow
     * Unfollow a remote ActivityPub actor
     */
    router.post("/network/ap/unfollow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can unfollow peers" });
            }
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ error: "URL is required" });
            }

            await apService.unfollowRemoteActor(url, getSiteHandle(database));
            // Remove from gossip-discovery cache so the instance stops appearing
            // in Network → Instances immediately rather than after the 7-day expiry.
            federatedDiscoveryService.deleteInstance(url);
            res.json({ message: `Successfully sent unfollow request to ${url}` });
        } catch (error: any) {
            console.error("Error unfollowing AP actor:", error);
            res.status(500).json({ error: error.message || "Failed to unfollow remote actor" });
        }
    });

    /**
     * POST /api/admin/network/ap/sync
     * Force sync remote actors content
     */
    router.post("/network/ap/sync", async (req: AuthenticatedRequest, res: any) => {
        try {
             if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can sync peers" });
            }
            const { url } = req.body;
            if (url) {
                await apService.fetchRemoteOutbox(url);
                res.json({ message: `Sync triggered for ${url}` });
            } else {
                // RSS feeds are refreshed by the RSS service, not the AP outbox fetcher.
                const peers = social.getFollowedActors().filter(p => p.type !== 'rss');
                for (const peer of peers) {
                    apService.fetchRemoteOutbox(peer.uri).catch(e => console.error(`Failed to sync ${peer.uri}:`, e));
                }
                rssService.refreshAll().catch(e => console.error("Failed to refresh RSS feeds:", e));
                res.json({ message: `Sync triggered for ${peers.length} peers` });
            }
        } catch (error: any) {
            console.error("Error syncing AP actors:", error);
            res.status(500).json({ error: error.message || "Failed to sync remote actors" });
        }
    });

    /**
     * DELETE /api/admin/network/local-cache
     * Remove remote_content entries whose actor_uri belongs to this instance.
     * These are stale duplicates created by outbox re-fetches (e.g. after key
     * regeneration) and are already surfaced via the local posts path.
     */
    router.delete("/network/local-cache", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can purge the local remote-content cache" });
            }
            const publicUrl = identity.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
            const baseUrl = publicUrl.replace(/\/$/, "");
            const deleted = social.deleteRemoteContentByActorPrefix(baseUrl);
            console.log(`🧹 [Admin] Purged ${deleted} stale local entries from remote_content`);
            res.json({ success: true, deleted, message: `Removed ${deleted} stale local post(s) from the federated cache.` });
        } catch (error: any) {
            console.error("Error purging local remote-content cache:", error);
            res.status(500).json({ error: error.message || "Failed to purge local cache" });
        }
    });

    /**
     * POST /api/admin/network/rss/follow
     * Follow a plain RSS/Atom source (podcast, Owncast, blog).
     */
    router.post("/network/rss/follow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can follow feeds" });
            }
            const { url } = req.body;
            if (!url || typeof url !== "string") {
                return res.status(400).json({ error: "Feed URL is required" });
            }
            const result = await rssService.addFeed(url);
            res.json({ message: `Now following "${result.name}" (${result.items} items)`, ...result });
        } catch (error: any) {
            console.error("Error following RSS feed:", error);
            res.status(400).json({ error: error.message || "Failed to follow RSS feed" });
        }
    });

    /**
     * POST /api/admin/network/rss/unfollow
     * Stop following an RSS source.
     */
    router.post("/network/rss/unfollow", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can unfollow feeds" });
            }
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ error: "URL is required" });
            }
            rssService.removeFeed(url);
            res.json({ message: `Unfollowed ${url}` });
        } catch (error: any) {
            console.error("Error unfollowing RSS feed:", error);
            res.status(500).json({ error: error.message || "Failed to unfollow RSS feed" });
        }
    });

    /**
     * POST /api/admin/network/rss/sync
     * Refresh one feed (with url) or all followed feeds.
     */
    router.post("/network/rss/sync", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can sync feeds" });
            }
            const { url } = req.body;
            if (url) {
                const n = await rssService.refreshFeed(url);
                res.json({ message: `Refreshed ${url}: ${n} items` });
            } else {
                rssService.refreshAll().catch(e => console.error("Failed to refresh RSS feeds:", e));
                res.json({ message: "RSS refresh triggered for all feeds" });
            }
        } catch (error: any) {
            console.error("Error syncing RSS feeds:", error);
            res.status(500).json({ error: error.message || "Failed to sync RSS feeds" });
        }
    });

    /**
     * POST /api/admin/network/catalog/refresh
     * Drops the cached HTTP catalog for one peer (with url) or all peers, forcing
     * the next Network load to refetch live. Use this when a remote instance's
     * catalog changed (e.g. a release was deleted there) and you don't want to wait
     * for the stale-while-revalidate TTL to expire.
     */
    router.post("/network/catalog/refresh", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admin can refresh peer catalogs" });
            }
            if (!catalogCache) {
                return res.status(503).json({ error: "Catalog cache unavailable" });
            }
            const { url } = req.body;
            const removed = catalogCache.invalidate(url || undefined);
            res.json({
                message: url
                    ? `Cleared cached catalog for ${url} — it will refetch on next load`
                    : `Cleared ${removed} cached peer catalog(s) — they will refetch on next load`,
                removed
            });
        } catch (error: any) {
            console.error("Error refreshing peer catalogs:", error);
            res.status(500).json({ error: error.message || "Failed to refresh peer catalogs" });
        }
    });


    /**
     * GET /api/admin/system/plugins
     * List all registered plugins and their enabled status
     */
    router.get("/system/plugins", (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
            return res.status(403).json({ error: "Super Root access required" });
        }

        const externalIds = getExternalProviderIds();
        const flat = [
            ...scanner.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'scanner' })),
            ...metadataService.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'metadata' })),
            ...streamingService.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'streaming' })),
            ...playlistService?.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'playlist' })) || [],
            ...scrobbleService?.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'scrobble' })) || [],
            ...getDownloadService()?.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'download' })) || [],
            ...aiService?.getRegistry().getRegistryInfo().map((p: any) => ({ ...p, type: 'ai' })) || []
        ];

        const byId = new Map<string, any>();
        for (const p of flat) {
            if (byId.has(p.id)) {
                byId.get(p.id).types.push(p.type);
            } else {
                byId.set(p.id, { ...p, types: [p.type], isExternal: externalIds.has(p.id) });
            }
        }

        res.json([...byId.values()]);
    });

    /**
     * PUT /api/admin/system/plugins/:id/toggle
     * Enable/disable a plugin
     */
    router.put("/system/plugins/:id/toggle", async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
            return res.status(403).json({ error: "Super Root access required" });
        }

        const { id } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: "Field 'enabled' (boolean) is required" });
        }

        try {
            // Find plugin in all registries
            const registries = [
                scanner.getRegistry(),
                metadataService.getRegistry(),
                streamingService.getRegistry(),
                playlistService?.getRegistry(),
                scrobbleService?.getRegistry(),
                getDownloadService()?.getRegistry(),
                aiService?.getRegistry()
            ].filter(Boolean);

            let found = false;
            for (const registry of registries) {
                if (registry?.get(id)) {
                    if (enabled) {
                        await registry.enable(id);
                    } else {
                        await registry.disable(id);
                    }
                    found = true;
                }
            }

            if (!found) {
                return res.status(404).json({ error: "Plugin not found" });
            }

            // Persist to database
            identity.setPluginEnabled(id, enabled);

            res.json({ message: `Plugin ${id} ${enabled ? 'enabled' : 'disabled'} successfully`, id, enabled });
        } catch (error) {
            console.error(`Error toggling plugin ${id}:`, error);
            res.status(500).json({ error: "Failed to toggle plugin" });
        }
    });

    /**
     * GET /api/admin/reports
     * List all reports for moderation.
     */
    router.get("/reports", (req: AuthenticatedRequest, res: any) => {
        try {
            const canView = req.context && VisibilityGuardian.can(req.context, Capability.VIEW_PRIVATE_LIBRARY);
            if (!canView) {
                return res.status(403).json({ error: "Access denied" });
            }

            const reports = database.getReports();
            res.json(reports);
        } catch (error) {
            console.error("Error getting reports:", error);
            res.status(500).json({ error: "Failed to get reports" });
        }
    });

    /**
     * DELETE /api/admin/reports/:id
     * Dismiss/delete a report.
     */
    router.delete("/reports/:id", (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id, 10);
            database.deleteReport(id);
            res.json({ success: true, message: "Report dismissed" });
        } catch (error) {
            console.error("Error deleting report:", error);
            res.status(500).json({ error: "Failed to dismiss report" });
        }
    });

    return router;
}


