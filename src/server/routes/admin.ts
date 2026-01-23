import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { GunDBService } from "../gundb.js";
import type { ServerConfig } from "../config.js";

export function createAdminRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string,
    gundbService: GunDBService,
    config: ServerConfig
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
            if (config.publicUrl) {
                const siteInfo = {
                    url: config.publicUrl,
                    title: config.siteName || "TuneCamp Server",
                    artistName: album.artist_name || "",
                };

                if (isPublic) {
                    // Register tracks to community
                    const tracks = database.getTracks(id);
                    await gundbService.registerTracks(siteInfo, album, tracks);
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

    return router;
}
