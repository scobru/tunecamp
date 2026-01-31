import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { GunDBService } from "../gundb.js";
import type { ServerConfig } from "../config.js";
import type { AuthService } from "../auth.js";
import type { ActivityPubService } from "../activitypub.js";

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
    router.put("/releases/:id/visibility", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { isPublic } = req.body;

            if (typeof isPublic !== "boolean") {
                return res.status(400).json({ error: "isPublic must be a boolean" });
            }

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            database.updateAlbumVisibility(id, isPublic);

            // Register/unregister tracks on GunDB based on visibility
            const publicUrl = database.getSetting("publicUrl") || config.publicUrl;

            if (publicUrl) {
                const siteInfo = {
                    url: publicUrl,
                    title: config.siteName || "TuneCamp Server",
                    artistName: album.artist_name || "",
                };

                if (isPublic) {
                    // Ensure site is registered first
                    await gundbService.registerSite(siteInfo);

                    // Register tracks to community
                    const tracks = database.getTracks(id);
                    await gundbService.registerTracks(siteInfo, album, tracks);

                    // ActivityPub Broadcast
                    // We fetch album again to ensure we have latest data if needed, 
                    // but 'album' var has old state? No, getAlbum(id) returns current state *before* update?
                    // The 'album' variable was fetched at line 45, BEFORE updateAlbumVisibility (line 50).
                    // So if album.is_public was false, and now isPublic is true, we invoke broadcast.
                    if (!album.is_public) {
                        // It was private, now public. Broadcast!
                        // We should pass the updated album object ideally, or at least one with is_public=1
                        const updatedAlbum = { ...album, is_public: true };
                        // We technically need to be sure broadcastRelease uses the ID to fetch fresh or uses the object.
                        // broadcastRelease uses object.artist_id and object.title/slug.
                        // So passing 'album' or 'updatedAlbum' works for those fields.
                        // Let's pass 'updatedAlbum' to be safe logically.
                        apService.broadcastRelease(updatedAlbum as any);
                    }

                } else {
                    // Unregister tracks from community
                    await gundbService.unregisterTracks(siteInfo, album);
                }
            }

            res.json({ message: "Visibility updated", isPublic });
        } catch (error) {
            console.error("Error updating visibility:", error);
            res.status(500).json({ error: "Failed to update visibility" });
        }
    });

    /**
     * POST /api/admin/scan
     * Force library rescan
     */
    router.post("/scan", async (req, res) => {
        try {
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
    router.put("/settings", async (req, res) => {
        try {
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
                // Background image doesn't affect network registration, so no settingsChanged update needed for this one alone
            }

            // Re-register on GunDB if settings changed and publicUrl is available
            const currentPublicUrl = publicUrl !== undefined ? publicUrl : database.getSetting("publicUrl") || config.publicUrl;

            if (settingsChanged && currentPublicUrl) {
                const currentSiteName = siteName !== undefined ? siteName : database.getSetting("siteName") || config.siteName || "TuneCamp Server";
                const currentArtistName = artistName !== undefined ? artistName : database.getSetting("artistName") || "";
                // If artistName is not set in settings, try to get from first artist in DB
                const effectiveArtistName = currentArtistName || (database.getArtists()[0]?.name || "");

                const siteInfo = {
                    url: currentPublicUrl,
                    title: currentSiteName,
                    description: siteDescription !== undefined ? siteDescription : database.getSetting("siteDescription") || "",
                    artistName: effectiveArtistName,
                    coverImage: coverImage !== undefined ? coverImage : database.getSetting("coverImage") || ""
                };

                // Re-register site
                await gundbService.registerSite(siteInfo);

                // Re-register tracks if we have a public URL
                // Note: This might be expensive for large libraries, maybe optimize later?
                // For now, re-registering public albums ensures tracks have correct metadata (like updated artist name/site URL)
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
    router.get("/system/identity", async (req, res) => {
        try {
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
    router.post("/system/identity", async (req, res) => {
        try {
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
    router.get("/system/users", (req, res) => {
        try {
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
            const { username, password } = req.body;
            if (!username || !password || password.length < 6) {
                return res.status(400).json({ error: "Invalid username or password (min 6 chars)" });
            }

            await authService.createAdmin(username, password);
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
            // We need username to reset password. 
            // Ideally we'd look up by ID, but authService.changePassword takes username.
            // We can find username from the list.
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

    return router;
}
