import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { GunDBService } from "../gundb.js";
import type { ServerConfig } from "../config.js";
import type { AuthService } from "../auth.js";
import type { ActivityPubService } from "../activitypub.js";
import { ConsolidationService } from "../consolidate.js";

export function createAdminRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string,
    gundbService: GunDBService,
    config: ServerConfig,
    authService: AuthService,
    apService: ActivityPubService
) {
    const router = Router();

    /**
     * GET /api/admin/releases
     * List all albums with visibility status
     */
    router.get("/releases", (req, res) => {
        try {
            const albums = database.getAlbums(false); // Include private
            res.json(albums);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * PUT /api/admin/releases/:id/visibility
     * Toggle album visibility
     */
    router.put("/releases/:id/visibility", async (req: any, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { isPublic, visibility } = req.body;

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
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
            if (req.artistId && album.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied: You can only manage your own releases" });
            }

            const currentVisibility = album.visibility || (album.is_public ? 'public' : 'private');

            // Update visibility in DB
            database.updateAlbumVisibility(id, newVisibility);

            // Register/unregister tracks on GunDB based on visibility
            const publicUrl = database.getSetting("publicUrl") || config.publicUrl;

            if (publicUrl) {
                const siteInfo = {
                    url: publicUrl,
                    title: config.siteName || "TuneCamp Server",
                    artistName: album.artist_name || "",
                };

                // Public or Unlisted -> Register on GunDB/ActivityPub
                if (newVisibility === 'public' || newVisibility === 'unlisted') {
                    // Ensure site is registered first
                    await gundbService.registerSite(siteInfo);

                    // Register tracks to community
                    const tracks = database.getTracks(id);
                    await gundbService.registerTracks(siteInfo, album, tracks);

                    // ActivityPub Broadcast
                    // We must refetch the album to get the new published_at date which is used for the ID
                    const freshAlbum = database.getAlbum(id);
                    if (freshAlbum && (freshAlbum.visibility === 'public' || freshAlbum.visibility === 'unlisted')) {
                        apService.broadcastRelease(freshAlbum);
                    }

                } else {
                    // Private
                    // Unregister tracks from community
                    await gundbService.unregisterTracks(siteInfo, album);

                    // ActivityPub Broadcast Delete if it was previously visible
                    if (currentVisibility !== 'private') {
                        apService.broadcastDelete(album).catch(e => console.error("Failed to broadcast delete:", e));
                    }
                }
            }

            res.json({ message: "Visibility updated", visibility: newVisibility });
        } catch (error) {
            console.error("Error updating visibility:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });

    /**
     * POST /api/admin/scan
     * Force library rescan
     */
    router.post("/scan", async (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot trigger manual scans" });
            }
            await scanner.scanDirectory(musicDir);
            const stats = database.getStats();
            res.json({
                message: "Scan complete",
                stats,
            });
        } catch (error) {
            console.error("Error scanning:", error);
            res.status(500).json({ error: "Scan failed" });
        }
    });

    /**
     * POST /api/admin/consolidate
     * Consolidate library into universal format (runs in background)
     */
    router.post("/consolidate", async (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot trigger consolidation" });
            }

            const consolidator = new ConsolidationService(database, musicDir);

            // Start in background
            consolidator.consolidateAll()
                .then(result => {
                    console.log(`✅ Library consolidated: ${result.success} moved, ${result.failed} failed.`);
                    // Trigger a scan after consolidation to update paths in memory/watcher
                    scanner.scanDirectory(musicDir).catch(e => console.error("Scan after consolidation failed:", e));
                })
                .catch(error => {
                    console.error("❌ Consolidation background process failed:", error);
                });

            res.json({
                message: "Consolidation started in background",
            });
        } catch (error) {
            console.error("Error starting consolidation:", error);
            res.status(500).json({ error: "Failed to start consolidation" });
        }
    });

    /**
     * GET /api/admin/stats
     * Get admin statistics
     */
    router.get("/stats", (req, res) => {
        try {
            const stats = database.getStats();
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
    router.get("/settings", (req, res) => {
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
    router.put("/settings", async (req: any, res) => {
        try {
            // Restricted admins cannot change global settings
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot change site settings" });
            }

            const { siteName, siteDescription, publicUrl, artistName, coverImage } = req.body;
            let settingsChanged = false;

            if (siteName !== undefined) {
                database.setSetting("siteName", siteName);
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

                await gundbService.registerSite(siteInfo);

                const publicAlbums = database.getAlbums(true);
                for (const album of publicAlbums) {
                    const tracks = database.getTracks(album.id);
                    await gundbService.registerTracks(siteInfo, album, tracks);
                }
                console.log(`🌐 Re-registered site and tracks on GunDB with updated settings: ${currentPublicUrl}`);
            }

            res.json({ message: "Settings updated" });
        } catch (error) {
            console.error("Error updating settings:", error);
            res.status(500).json({ error: "Failed to update settings" });
        }
    });

    /**
     * GET /api/admin/system/identity
     * Get server identity keypair (ADMIN ONLY)
     */
    router.get("/system/identity", async (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot access system identity" });
            }
            const pair = await gundbService.getIdentityKeyPair();
            res.json(pair);
        } catch (error) {
            console.error("Error getting identity:", error);
            res.status(500).json({ error: "Failed to get identity" });
        }
    });

    /**
     * POST /api/admin/system/identity
     * Import server identity keypair (ADMIN ONLY)
     */
    router.post("/system/identity", async (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot import system identity" });
            }
            const pair = req.body;
            const success = await gundbService.setIdentityKeyPair(pair);
            if (success) {
                res.json({ message: "Identity imported successfully" });
            } else {
                res.status(400).json({ error: "Invalid keypair or authentication failed" });
            }
        } catch (error) {
            console.error("Error setting identity:", error);
            res.status(500).json({ error: "Failed to set identity" });
        }
    });

    /**
     * GET /api/admin/artists/:id/identity
     * Get artist identity keypair (Root Admin or Assigned Artist Admin only)
     */
    router.get("/artists/:id/identity", async (req: any, res) => {
        try {
            const artistId = parseInt(req.params.id);
            if (isNaN(artistId)) {
                return res.status(400).json({ error: "Invalid artist ID" });
            }

            // Permission Check
            const isRoot = authService.isRootAdmin(req.username || "");
            if (!isRoot) {
                // If not root, must be assigned to this artist
                if (!req.artistId || req.artistId !== artistId) {
                    return res.status(403).json({ error: "Access denied" });
                }
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
    router.get("/system/me", (req: any, res) => {
        try {
            const username = req.username || "";
            res.json({ username, isRootAdmin: authService.isRootAdmin(username) });
        } catch (error) {
            console.error("Error getting current admin:", error);
            res.status(500).json({ error: "Failed to get current admin" });
        }
    });

    /**
     * GET /api/admin/system/users
     * List all admin users
     */
    router.get("/system/users", (req: any, res) => {
        try {
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot list users" });
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
    router.post("/system/users", async (req: any, res) => {
        try {
            if (!authService.isRootAdmin(req.username || "")) {
                return res.status(403).json({ error: "Only the primary admin can create new admins" });
            }
            const { username, password, artistId } = req.body;
            if (!username || !password || password.length < 6) {
                return res.status(400).json({ error: "Invalid username or password (min 6 chars)" });
            }

            await authService.createAdmin(username, password, artistId);
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
    router.put("/system/users/:id", async (req: any, res) => {
        try {
            if (!authService.isRootAdmin(req.username || "")) {
                return res.status(403).json({ error: "Only the primary admin can manage users" });
            }
            const id = parseInt(req.params.id, 10);
            const { artistId } = req.body;

            authService.updateAdmin(id, artistId);
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
    router.delete("/system/users/:id", (req: any, res) => {
        try {
            if (!authService.isRootAdmin(req.username || "")) {
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
     * PUT /api/admin/system/users/:id/password
     * Reset admin user password
     */
    router.put("/system/users/:id/password", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { password } = req.body;

            if (!password || password.length < 6) {
                return res.status(400).json({ error: "Password must be at least 6 chars" });
            }

            const admins = authService.listAdmins();
            const admin = admins.find(a => a.id === id);

            if (!admin) {
                return res.status(404).json({ error: "User not found" });
            }

            await authService.changePassword(admin.username, password);
            res.json({ message: "Password updated" });
        } catch (error) {
            console.error("Error resetting password:", error);
            res.status(500).json({ error: "Failed to reset password" });
        }
    });


    /**
     * POST /api/admin/posts
     * Create a new post for an artist
     */
    router.post("/posts", async (req: any, res) => {
        try {
            const { artistId, content } = req.body;
            if (!artistId || !content) {
                return res.status(400).json({ error: "Missing artistId or content" });
            }

            // Permission Check
            if (req.artistId && req.artistId !== parseInt(artistId)) {
                return res.status(403).json({ error: "You can only post for your assign artist" });
            }

            const postId = database.createPost(artistId, content);
            const post = database.getPost(postId);

            if (post) {
                // Broadcast to followers
                apService.broadcastPost(post).catch(e => console.error("Failed to broadcast post:", e));
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
    router.delete("/posts/:id", (req: any, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const post = database.getPost(id);
            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Permission Check
            if (req.artistId && post.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            database.deletePost(id);

            // TODO: Broadcast Undo/Delete activity? 
            // For now just local delete is fine.

            res.json({ message: "Post deleted" });
        } catch (error) {
            console.error("Error deleting post:", error);
            res.status(500).json({ error: "Failed to delete post" });
        }
    });

    return router;
}
