import type { AuthenticatedRequest } from "../middleware/auth.js";
import { Router } from "express";
import path from "path";
import fs from "fs-extra";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { ZenDBService } from "../zendb.js";
import type { ServerConfig } from "../config.js";
import type { AuthService } from "../auth.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { validatePassword } from "../validators.js";
import type { PublishingService } from "../publishing.js";
import type { ActivityPubService } from "../activitypub.js";
import type { SoulseekService } from "../soulseek.js";
import { VisibilityGuardian, Capability, UserRole } from "../common/visibility.js";

export function createAdminRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string,
    zendbService: ZenDBService,
    config: ServerConfig,
    authService: AuthService,
    publishingService: PublishingService,
    apService: ActivityPubService,
    telegramBotService: any,
    soulseekService: SoulseekService
): Router {
    const router = Router();
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
            const isAdmin = req.isAdmin;
            const isRoot = req.isRootAdmin;
            let releases: any[] = [];
            
            const includeLibrary = req.query.includeLibrary === 'true';
            
            const canSeeAll = req.context && VisibilityGuardian.can(req.context, Capability.VIEW_PRIVATE_LIBRARY);
            
            if (showMine) {
                // "My Releases" view: always show ONLY formal releases owned by this user.
                // Library albums (scanned content) are never shown here, regardless of role.
                releases = req.userId
                    ? database.getReleasesByOwner(req.userId, false).map(r => ({ ...r, is_formal_release: true }))
                    : [];
            } else if (canSeeAll) {
                // Admin/SuperUser global view: all formal releases
                const formalReleases = database.getReleases(false).map(r => ({ ...r, is_formal_release: true }));
                releases = [...formalReleases];

                // Only include library albums in promotion pipeline if explicitly requested (Curation Queue)
                if (includeLibrary) {
                    const pendingAlbums = database.getAlbums(false)
                        .filter(a => a.status !== 'draft')
                        .map(a => ({ ...a, is_formal_release: false }));
                    releases = [...releases, ...pendingAlbums];
                }
            } else if (req.userId) {
                // Non-admin artist: their formal releases + library albums they submitted for promotion
                const ownedFormalReleases = database.getReleasesByOwner(req.userId, false).map(r => ({ ...r, is_formal_release: true }));
                const ownedPendingAlbums = database.getAlbumsByOwner(req.userId, false)
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
            const release = database.getRelease(id);
            const album = database.getAlbum(id);
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
            const canManageAll = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM);
            
            if (req.userId !== undefined && !canManageAll && ownerId !== req.userId) {
                return res.status(403).json({ error: "Access denied: You can only manage your own content" });
            }

            const isNowPublic = newVisibility === 'public' || newVisibility === 'unlisted';

            // Update visibility in DB
            if (release) {
                database.updateRelease(id, { 
                    visibility: newVisibility,
                    published_to_ap: isNowPublic,
                    published_to_gundb: isNowPublic
                });
            } else {
                database.updateAlbumVisibility(id, newVisibility);
                database.updateAlbumFederationSettings(id, isNowPublic, isNowPublic);
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
            
            const stats = await database.getStats(artistId, ownerId);
            res.json(stats);
        } catch (error) {
            console.error("Error getting stats:", error);
            res.status(500).json({ error: "Failed to get stats" });
        }
    });

    /**
     * GET /api/admin/settings
     * Get all site settings
     */
    router.get("/settings", (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) return res.status(403).json({ error: "Super Root access required" });
        try {
            const settings = database.getAllSettings();
            res.json(settings);
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
                zenPeers, web3_checkout_address, web3_nft_address,
                coinbase_cdp_api_key_name, coinbase_cdp_api_key_secret,
                telegram_bot_token, telegram_allowed_channels,
                adminFeePercentage, adminTreasuryAddress,
                soulseek_username, soulseek_password,
                onramp_provider, moonpay_api_key,
                stripe_secret_key, stripe_webhook_secret,
                paypal_client_id, paypal_client_secret, paypal_environment,
                discogs_token
            } = req.body;
            let settingsChanged = false;

            if (siteName !== undefined) {
                database.setSetting("siteName", siteName);
                settingsChanged = true;
            }
            if (mode !== undefined) {
                database.setSetting("mode", mode);
                settingsChanged = true;
            }
            if (siteDescription !== undefined) {
                database.setSetting("siteDescription", siteDescription);
                settingsChanged = true;
            }
            if (publicUrl !== undefined) {
                database.setSetting("publicUrl", publicUrl);
                settingsChanged = true;
            }
            if (artistName !== undefined) {
                database.setSetting("artistName", artistName);
                settingsChanged = true;
            }
            if (coverImage !== undefined) {
                database.setSetting("coverImage", coverImage);
                settingsChanged = true;
            }
            if (req.body.backgroundImage !== undefined) {
                database.setSetting("backgroundImage", req.body.backgroundImage);
            }
            if (zenPeers !== undefined) {
                database.setSetting("zenPeers", zenPeers);
                settingsChanged = true;
            }
            if (web3_checkout_address !== undefined) {
                database.setSetting("web3_checkout_address", web3_checkout_address);
            }
            if (web3_nft_address !== undefined) {
                database.setSetting("web3_nft_address", web3_nft_address);
            }
            if (coinbase_cdp_api_key_name !== undefined) {
                database.setSetting("coinbase_cdp_api_key_name", coinbase_cdp_api_key_name);
            }
            if (coinbase_cdp_api_key_secret !== undefined) {
                database.setSetting("coinbase_cdp_api_key_secret", coinbase_cdp_api_key_secret);
            }
            if (telegram_bot_token !== undefined) {
                database.setSetting("telegram_bot_token", telegram_bot_token);
                settingsChanged = true;
            }
            if (telegram_allowed_channels !== undefined) {
                database.setSetting("telegram_allowed_channels", telegram_allowed_channels);
                settingsChanged = true;
            }
            if (adminFeePercentage !== undefined) {
                database.setSetting("adminFeePercentage", adminFeePercentage.toString());
            }
            if (adminTreasuryAddress !== undefined) {
                database.setSetting("adminTreasuryAddress", adminTreasuryAddress);
            }
            if (soulseek_username !== undefined) {
                database.setSetting("soulseek_username", soulseek_username);
            }
            if (soulseek_password !== undefined) {
                database.setSetting("soulseek_password", soulseek_password);
            }
            if (onramp_provider !== undefined) {
                database.setSetting("onramp_provider", onramp_provider);
            }
            if (moonpay_api_key !== undefined) {
                database.setSetting("moonpay_api_key", moonpay_api_key);
            }
            if (stripe_secret_key !== undefined) {
                database.setSetting("stripe_secret_key", stripe_secret_key);
            }
            if (stripe_webhook_secret !== undefined) {
                database.setSetting("stripe_webhook_secret", stripe_webhook_secret);
            }
            if (paypal_client_id !== undefined) {
                database.setSetting("paypal_client_id", paypal_client_id);
            }
            if (paypal_client_secret !== undefined) {
                database.setSetting("paypal_client_secret", paypal_client_secret);
            }
            if (paypal_environment !== undefined) {
                database.setSetting("paypal_environment", paypal_environment);
            }
            if (discogs_token !== undefined) {
                database.setSetting("discogs_token", discogs_token);
            }

            // Restart telegram bot if settings changed
            if (telegram_bot_token !== undefined || telegram_allowed_channels !== undefined) {
                telegramBotService.restart().catch((err: any) => console.error("Failed to restart Telegram bot:", err));
            }

            // Reconnect Soulseek if credentials changed
            if (soulseek_username !== undefined || soulseek_password !== undefined) {
                const sUsername = soulseek_username !== undefined ? soulseek_username : database.getSetting("soulseek_username");
                const sPassword = soulseek_password !== undefined ? soulseek_password : database.getSetting("soulseek_password");
                if (sUsername && sPassword) {
                    soulseekService.connect(sUsername, sPassword).catch((err: any) => console.error("Failed to reconnect Soulseek:", err));
                }
            }

            // Re-register on GunDB if settings changed and publicUrl is available
            const currentPublicUrl = publicUrl !== undefined ? publicUrl : database.getSetting("publicUrl") || config.publicUrl;

            if (settingsChanged && currentPublicUrl) {
                const currentSiteName = siteName !== undefined ? siteName : database.getSetting("siteName") || config.siteName || "TuneCamp Server";
                const currentArtistName = artistName !== undefined ? artistName : database.getSetting("artistName") || "";
                const effectiveArtistName = currentArtistName || (database.getArtists()[0]?.name || "");

                const siteInfo = {
                    url: currentPublicUrl,
                    title: currentSiteName,
                    description: siteDescription !== undefined ? siteDescription : database.getSetting("siteDescription") || "",
                    artistName: effectiveArtistName,
                    coverImage: coverImage !== undefined ? coverImage : database.getSetting("coverImage") || ""
                };

                await zendbService.registerSite(siteInfo);
                console.log(`🌐 Re-registered site on Zen with updated settings: ${currentPublicUrl}`);
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

            await apService.followRemoteActor(url, "site");
            res.json({ message: `Successfully sent follow request to ${url}` });
        } catch (error: any) {
            console.error("Error following AP actor:", error);
            res.status(500).json({ error: error.message || "Failed to follow remote actor" });
        }
    });

    /**
     * GET /api/admin/system/identity
     * Get server identity keypair (ROOT ADMIN ONLY)
     */
    router.get("/system/identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can access system identity
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can access system identity" });
            }
            const pair = await zendbService.getIdentityKeyPair();
            res.json(pair);
        } catch (error) {
            console.error("Error getting identity:", error);
            res.status(500).json({ error: "Failed to get identity" });
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
            const publicKey = database.getSetting("site_public_key");
            const privateKey = database.getSetting("site_private_key");
            res.json({ publicKey, privateKey });
        } catch (error) {
            console.error("Error getting site AP identity:", error);
            res.status(500).json({ error: "Failed to get site AP identity" });
        }
    });

    /**
     * POST /api/admin/system/identity
     * Import server identity keypair (ROOT ADMIN ONLY)
     */
    router.post("/system/identity", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only root admin can import system identity
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only root admin can import system identity" });
            }
            const pair = req.body;
            const success = await zendbService.setIdentityKeyPair(pair);
            if (success) {
                res.json({ message: "Identity imported successfully" });
            } else {
                res.status(400).json({ error: "Invalid keypair or authentication failed" });
            }
        } catch (error) {
            console.error("Error setting identity:", error);
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
            
            console.log(`🔍 [Admin] Manual library rescan triggered by ${req.username}`);
            const { runStartupMaintenance } = await import("../maintenance.js");
            
            // Run it in the background to avoid timeout
            runStartupMaintenance(database, config)
                .then(() => console.log("✅ Manual library rescan completed"))
                .catch(err => console.error("❌ Manual library rescan failed:", err));

            res.json({ message: "Library rescan triggered in background" });
        } catch (error) {
            console.error("Error triggering rescan:", error);
            res.status(500).json({ error: "Failed to trigger rescan" });
        }
    });

    /**
     * POST /api/admin/system/consolidate-db
     * Deep clean database by removing empty/orphaned records (Any Admin)
     */
    router.post("/system/consolidate-db", async (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT)) {
                return res.status(403).json({ error: "Only admin can trigger database consolidation" });
            }
            
            console.log(`🧹 [Admin] Manual database consolidation triggered by ${req.username}`);
            database.consolidateDatabase();

            res.json({ message: "Database consolidation completed" });
        } catch (error) {
            console.error("Error consolidating database:", error);
            res.status(500).json({ error: "Failed to consolidate database" });
        }
    });

    /**
     * POST /api/admin/system/sync
     * Force sync with Zen network (Any Admin)
     */
    router.post("/system/sync", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only super root admin can force sync
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only super root admin can force sync" });
            }
            await zendbService.syncNetwork();
            res.json({ message: "Network sync completed" });
        } catch (error) {
            console.error("Error syncing network:", error);
            res.status(500).json({ error: "Failed to sync network" });
        }
    });

    /**
     * POST /api/admin/system/consolidate
     * Consolidate files in the filesystem based on DB tags (Any Admin)
     */
    router.post("/system/consolidate", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only super root admin can trigger consolidation
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only super root admin can trigger file consolidation" });
            }

            const result = await scanner.consolidateFiles(musicDir);
            res.json({ 
                message: "File consolidation completed",
                ...result
            });
        } catch (error) {
            console.error("Error consolidating files:", error);
            res.status(500).json({ error: "Failed to consolidate files" });
        }
    });

    /**
     * POST /api/admin/network/cleanup
     * Force global cleanup of unreachable sites in Zen network (Any Admin)
     */
    router.post("/network/cleanup", async (req: AuthenticatedRequest, res: any) => {
        try {
            // Only super root admin can trigger global cleanup
            if (!req.isRootAdmin) {
                return res.status(403).json({ error: "Only super root admin can trigger global network cleanup" });
            }

            // This can take a while, so we don't await it here if we want to return immediately,
            // but for a cleanup triggered by a button, it's probably better to await or return status.
            // Awaiting for now to provide better feedback to the admin.
            await zendbService.cleanupGlobalNetwork();

            res.json({ message: "Global network cleanup completed" });
        } catch (error) {
            console.error("Error in global network cleanup:", error);
            res.status(500).json({ error: "Global cleanup failed" });
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
            const release = database.getRelease(id);
            const album = database.getAlbum(id);
            const item = release || album;

            if (!item) {
                console.warn(`⚠️ [Debug] Release/Album ${id} not found during update`);
                return res.status(404).json({ error: "Release or album not found" });
            }

            // Permission Check: Root Admin/Admin can edit anything. 
            // Others (Super Users) can edit if they own the item OR if it has no owner (legacy/system).
            const ownerId = release ? release.owner_id : album?.owner_id;
            const isPrivileged = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT);
            const canManagePrivate = req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY);
            
            if (req.userId !== undefined && !isPrivileged && ownerId !== null && ownerId !== req.userId) {
                console.warn(`⛔ [Debug] Access Denied for user ${req.username} on item ${id}. Owner: ${ownerId}, Request UserId: ${req.userId}`);
                return res.status(403).json({ error: "Access denied" });
            }

            if (!isPrivileged && !canManagePrivate && ownerId !== req.userId) {
                return res.status(403).json({ error: "Access denied: Insufficient permissions" });
            }

            const updates: any = {};
            if (body.title) updates.title = body.title;
            const finalArtistId = body.artistId || body.artist_id;
            if (finalArtistId) updates.artist_id = finalArtistId;
            if (body.date) updates.date = body.date;
            if (body.description !== undefined) updates.description = body.description;
            if (body.type) updates.type = body.type;
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
            if (body.price !== undefined) updates.price = body.price;
            if (body.priceUsdc !== undefined) updates.price_usdc = body.priceUsdc;
            if (body.priceUsdt !== undefined) updates.price_usdt = body.priceUsdt;
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
                        database.updateRelease(id, updates);
                    } else {
                        console.log(`   - Updating library album metadata:`, Object.keys(updates));
                        if (updates.title) database.updateAlbumTitle(id, updates.title);
                        if (updates.genre) database.updateAlbumGenre(id, updates.genre);
                        if (updates.year) database.updateAlbumYear(id, updates.year);
                        if (updates.visibility) database.updateAlbumVisibility(id, updates.visibility);
                        if (updates.download !== undefined) database.updateAlbumDownload(id, updates.download);
                        if (updates.price !== undefined || updates.price_usdc !== undefined) {
                            const curr = database.getAlbum(id);
                            if (curr) {
                                const p = updates.price !== undefined ? Number(updates.price) : (curr.price ?? 0);
                                const pu = updates.price_usdc !== undefined ? Number(updates.price_usdc) : (curr.price_usdc ?? 0);
                                database.updateAlbumPrice(id, p, pu, (updates.currency || curr.currency || 'ETH') as 'ETH' | 'USD');
                            }
                        }
                        if (updates.external_links) database.updateAlbumLinks(id, updates.external_links);
                        if (updates.published_to_gundb !== undefined || updates.published_to_ap !== undefined) {
                            database.updateAlbumFederationSettings(id, !!updates.published_to_gundb, !!updates.published_to_ap);
                        }
                    }
                }
            })();


            // --- TRACKS UPDATE LOGIC ---
            if (body.track_ids && Array.isArray(body.track_ids)) {
                const newTrackIds = body.track_ids.map((tid: any) => parseInt(tid, 10)).filter((tid: any) => !isNaN(tid));
                console.log(`   - Received ${newTrackIds.length} track IDs from frontend for sync:`, newTrackIds);
                
                if (release) {
                    database.transaction(() => {
                        // Atomic sync of tracks (wipe and re-add in order)
                        console.log(`     🔄 Performing atomic track sync for formal release ${id}`);
                        database.syncReleaseTracks(id, newTrackIds);

                        // If additional per-track metadata was provided (e.g. custom titles for this release)
                        if (body.tracks_data && Array.isArray(body.tracks_data)) {
                            console.log(`     📝 Updating track override metadata for formal release ${id}`);
                            for (const td of body.tracks_data) {
                                database.updateReleaseTrackMetadata(id, td.id, {
                                    title: td.title,
                                    price: td.price,
                                    price_usdc: td.priceUsdc,
                                    currency: td.currency || 'ETH'
                                });
                            }
                        }
                    })();
                } else if (album) {
                    database.transaction(() => {
                        // Update library album tracks (standard library logic)
                        const existingTracks = database.getTracks(id);
                        const existingTrackIds = existingTracks.map(t => t.id);
                        
                        const toAdd = newTrackIds.filter((ntid: number) => !existingTrackIds.includes(ntid));
                        const toRemove = existingTrackIds.filter((etid: number) => !newTrackIds.includes(etid));

                        console.log(`   - Library Album Sync: toAdd=${toAdd.length}, toRemove=${toRemove.length}`);

                        if (toAdd.length > 0) {
                            database.updateTracksAlbum(toAdd, id);
                        }
                        if (toRemove.length > 0) {
                            database.updateTracksAlbum(toRemove, null);
                        }

                        // Update order in the library tracks table
                        const trackOrders = newTrackIds.map((trackId: number, index: number) => ({
                            id: trackId,
                            trackNum: index + 1
                        }));
                        database.updateTracksOrder(trackOrders);
                    })();
                }
            }


            // Sync changes
            publishingService.syncRelease(id).catch(e => console.error("❌ Failed to sync release update:", e));

            const finalItem = release ? database.getRelease(id) : database.getAlbum(id);
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
            const tracks = database.getTracksByReleaseId(id); // Use the more robust unified getter
            
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
            const release = database.getRelease(id);
            const album = database.getAlbum(id);

            if (!release && !album) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Permission Check
            // Permission Check: 
            // - Formal releases can ONLY be deleted by Root Admin
            // - Library albums can be deleted by Root Admin or the owner
            if (release && !req.isRootAdmin) {
                return res.status(403).json({ error: "Only Root Admin can delete formal releases" });
            }

            const ownerId = release ? release.owner_id : album?.owner_id;
            if (req.userId !== undefined && !req.isRootAdmin && ownerId !== req.userId) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (release) {
                // Handle unpublishing for formal releases
                try {
                    await (publishingService as any).unpublishReleaseFromAP(release);
                    await zendbService.unpublishRelease(id);
                } catch (e) {
                    console.error("Failed to unpublish formal release:", e);
                }
                database.deleteRelease(id);
            } else if (album) {
                database.deleteAlbum(id, keepFiles);
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

            const artist = database.getArtist(artistId);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Return keys (even if null/empty, let frontend handle it)
            res.json({
                publicKey: artist.public_key,
                privateKey: artist.private_key
            });
        } catch (error) {
            console.error("Error getting artist identity:", error);
            res.status(500).json({ error: "Failed to get artist identity" });
        }
    });

    /**
     * GET /api/admin/system/me
     * Get current admin user info (username, isRootAdmin)
     */
    router.get("/system/me", (req: AuthenticatedRequest, res: any) => {
        try {
            const username = req.username || "";
            res.json({ 
                username, 
                isAdmin: !!req.isAdmin,
                isRootAdmin: !!req.isRootAdmin, 
                artistId: req.artistId 
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
            // Only root admin can list users
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only Root Admin can list users" });
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
            const { username, password, artistId, isAdmin, role } = req.body;
            if (!username) {
                return res.status(400).json({ error: "Username is required" });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const targetRole: UserRole = role || (isAdmin ? UserRole.ADMIN : UserRole.NORMAL_USER);

            if (targetRole === UserRole.ADMIN || targetRole === UserRole.SUPER_USER) {
                await authService.createAdmin(username, password, artistId, targetRole);
            } else {
                await authService.createUser(username, password, artistId || null, 1024 * 1024 * 1024, undefined, targetRole);
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
            const { artistId, isAdmin, role } = req.body;

            const targetRole = role || (isAdmin === undefined ? undefined : (isAdmin ? 'admin' : 'user'));
            authService.updateAdmin(id, artistId, targetRole as UserRole);
            res.json({ message: "Admin user updated" });
        } catch (error) {
            console.error("Error updating admin:", error);
            res.status(500).json({ error: "Failed to update admin" });
        }
    });

    /**
     * DELETE /api/admin/system/users/:id
     * Delete admin user (root admin only)
     */
    router.delete("/system/users/:id", (req: AuthenticatedRequest, res: any) => {
        try {
            if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Only the primary admin can remove admins" });
            }
            const id = parseInt(req.params.id, 10);
            authService.deleteAdmin(id);
            res.json({ message: "Admin user deleted" });
        } catch (error: any) {
            console.error("Error deleting admin:", error);
            if (error.message.includes("last admin")) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: "Failed to delete admin" });
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
            const { content, visibility } = req.body;

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to modify posts" });
            }

            const post = database.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Permission Check
            if (req.artistId && !req.isAdmin && post.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            const oldVisibility = post.visibility;
            database.updatePost(id, content, visibility);
            const updatedPost = database.getPost(id);

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
            const { artistId, content, visibility } = req.body;

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to create posts" });
            }

            if (!artistId || !content) {
                return res.status(400).json({ error: "Missing artistId or content" });
            }

            // Permission Check
            if (req.artistId && !req.isAdmin && req.artistId !== parseInt(artistId)) {
                return res.status(403).json({ error: "You can only post for your assign artist" });
            }

            const postId = database.createPost(artistId, content, visibility || 'public');
            const post = database.getPost(postId);

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

            const post = database.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Permission Check
            if (req.artistId && !req.isAdmin && post.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            database.deletePost(id);

            // Use PublishingService
            publishingService.unpublishPostFromAP(post).catch(e => console.error("Failed to sync post delete:", e));

            res.json({ message: "Post deleted" });
        } catch (error) {
            console.error("Error deleting post:", error);
            res.status(500).json({ error: "Failed to delete post" });
        }
    });

    /**
     * GET /api/admin/system/health
     * Check status of external APIs
     */
    router.get("/system/health", async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin access required" });

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
        const discogsToken = database.getSetting("discogs_token") || process.env.DISCOGS_TOKEN;
        results.discogs = { configured: !!discogsToken };

        // 5. Telegram
        try {
            const isBotActive = await telegramBotService.isActive();
            results.telegram = { active: isBotActive };
        } catch (e) {
            results.telegram = { active: false };
        }

        // 6. OpenRouter
        const orKey = database.getSetting("openrouter_api_key") || config.openrouterApiKey;
        results.openrouter = { 
            configured: !!orKey,
            model: database.getSetting("openrouter_model") || config.openrouterModel || "openrouter/free"
        };

        // 7. Stripe
        const stripeKey = database.getSetting("stripe_secret_key") || config.stripeSecretKey;
        const stripeWebhook = database.getSetting("stripe_webhook_secret") || config.stripeWebhookSecret;
        results.stripe = { 
            configured: !!stripeKey,
            webhookConfigured: !!stripeWebhook
        };
        
        // 8. PayPal
        const ppId = database.getSetting("paypal_client_id") || config.paypalClientId;
        const ppSecret = database.getSetting("paypal_client_secret") || config.paypalClientSecret;
        results.paypal = { 
            configured: !!ppId && !!ppSecret,
            environment: database.getSetting("paypal_environment") || config.paypalEnvironment || "sandbox"
        };
        
        // 9. MoonPay
        results.moonpay = {
            configured: !!database.getSetting("moonpay_api_key")
        };

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
            const peers = database.getFollowedActors();
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

            await apService.unfollowRemoteActor(url, "site");
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
                const peers = database.getFollowedActors();
                for (const peer of peers) {
                    apService.fetchRemoteOutbox(peer.uri).catch(e => console.error(`Failed to sync ${peer.uri}:`, e));
                }
                res.json({ message: `Sync triggered for ${peers.length} peers` });
            }
        } catch (error: any) {
            console.error("Error syncing AP actors:", error);
            res.status(500).json({ error: error.message || "Failed to sync remote actors" });
        }
    });


    return router;
}
