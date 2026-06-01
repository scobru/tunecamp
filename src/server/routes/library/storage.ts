import { Router, json } from "express";
import { type GoogleDriveService } from "../../modules/storage/google-drive.service.js";
import { type DatabaseService } from "../../core/database.types.js";
import { type AuthenticatedRequest } from "../../middleware/auth.js";
import { type CatalogService } from "../../modules/catalog/catalog.service.js";
import { type DiscoveryService } from "../../modules/catalog/discovery.service.js";

export function createStorageRouter(database: DatabaseService, gdriveService: GoogleDriveService, authMiddleware: any, catalogService: CatalogService, discoveryService: DiscoveryService) {
    const router = Router();
    router.use(json());

    router.get("/gdrive/auth", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        // Pass userId as state to identify the user in the callback
        const state = req.userId ? String(req.userId) : "";
        const url = gdriveService.getAuthUrl(state);
        res.json({ url });
    });

    router.get("/gdrive/accounts", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        const accounts = database.getStorageAccounts(req.userId);
        res.json(accounts.filter(a => a.provider === "google"));
    });

    router.get("/gdrive/callback", async (req: any, res) => {
        const { code, state } = req.query;
        if (!code) return res.status(400).send("No code provided");

        try {
            // Use the userId passed via the state parameter
            let userId = state ? parseInt(state as string, 10) : null;
            
            // Fallback to primary admin only if no state was provided (legacy/direct call)
            if (!userId) {
                userId = database.getPrimaryAdminId();
            }
            
            if (!userId) return res.status(500).send("No user context found for authentication");

            await gdriveService.exchangeCode(code as string, userId);
            
            // Redirect back to the UI (assuming /admin/settings exists)
            res.send("<h1>Google Drive Connected!</h1><p>You can close this window and return to TuneCamp.</p><script>setTimeout(() => window.location.href='/', 2000)</script>");
        } catch (error: any) {
            console.error("GDrive OAuth Error:", error.response?.data || error.message);
            res.status(500).send("Authentication failed: " + (error.response?.data?.error_description || error.message));
        }
    });

    router.post("/gdrive/localize/:id", authMiddleware.requireAdmin, async (req: AuthenticatedRequest, res) => {
        try {
            const trackId = parseInt(req.params.id);
            if (isNaN(trackId)) return res.status(400).send("Invalid track ID");

            const updatedTrack = await catalogService.localizeTrack(trackId, gdriveService);
            res.json({ success: true, track: updatedTrack });
        } catch (error: any) {
            console.error("GDrive Localization Error:", error.message);
            res.status(500).json({ error: error.message });
        }
    });

    router.get("/gdrive/files", authMiddleware.requireAdmin, async (req: AuthenticatedRequest, res) => {
        try {
            const userId = req.userId!;
            const { folderId } = req.query;
            const files = await gdriveService.listFiles(userId, folderId as string);
            
            if (files.length > 0) {
                const fileIds = files.map(f => f.id);
                // Fast check against existing imported tracks using the raw DB connection
                const importedIds = new Set(
                    database.db.prepare(`SELECT external_id FROM tracks WHERE external_id IN (${fileIds.map(() => '?').join(',')}) AND service = 'google-drive'`)
                        .all(...fileIds)
                        .map((r: any) => r.external_id)
                );
                
                const enrichedFiles = files.map(f => ({
                    ...f,
                    isImported: importedIds.has(f.id)
                }));
                return res.json(enrichedFiles);
            }

            res.json(files);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post("/gdrive/import", authMiddleware.requireAdmin, async (req: AuthenticatedRequest, res) => {
        try {
            const userId = req.userId!;
            const { fileId, artistId, albumId } = req.body;
            if (!fileId) return res.status(400).send("No fileId provided");

            const file = await gdriveService.getFile(userId, fileId);
            
            // Basic filename parsing: "Artist - Title.mp3"
            let title = file.name;
            let parsedArtistId = artistId || null;

            if (file.name.includes(" - ")) {
                const parts = file.name.split(" - ");
                const artistName = parts[0].trim();
                title = parts[1].replace(/\.[^/.]+$/, "").trim(); // Remove extension

                if (!parsedArtistId && artistName) {
                    const existingArtist = database.getArtistByName(artistName);
                    parsedArtistId = existingArtist ? existingArtist.id : database.createArtist(artistName);
                }
            } else {
                title = file.name.replace(/\.[^/.]+$/, "").trim();
            }

            const trackId = database.createTrack({
                title,
                artist_id: parsedArtistId,
                album_id: albumId || null,
                owner_id: userId,
                track_num: null,
                duration: 0,
                file_path: `gdrive://${fileId}`,
                format: file.mimeType.split("/")[1] || "mp3",
                bitrate: 0,
                sample_rate: 0,
                price: 0,
                price_usdc: 0,
                price_usdt: 0,
                currency: 'ETH',
                lossless_path: null,
                waveform: null,
                url: null,
                service: 'google-drive',
                external_artwork: null,
                lyrics: null,
                hash: null,
                external_id: fileId
            });

            res.json({ success: true, trackId });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post("/gdrive/import-folder", authMiddleware.requireAdmin, async (req: AuthenticatedRequest, res) => {
        try {
            const userId = req.userId!;
            const { folderId, artistId, albumId } = req.body;
            if (!folderId) return res.status(400).send("No folderId provided");

            // 1. List all audio files recursively
            const audioFiles = await gdriveService.listAudioFilesRecursive(userId, folderId);
            
            if (audioFiles.length === 0) {
                return res.json({ success: true, count: 0, message: "No audio files found in folder" });
            }

            // 2. Query already imported tracks to avoid duplicate imports
            const fileIds = audioFiles.map(f => f.id);
            const importedIds = new Set(
                database.db.prepare(`SELECT external_id FROM tracks WHERE external_id IN (${fileIds.map(() => '?').join(',')}) AND service = 'google-drive'`)
                    .all(...fileIds)
                    .map((r: any) => r.external_id)
            );

            // Filter out already imported files
            const filesToImport = audioFiles.filter(f => !importedIds.has(f.id));

            let importedCount = 0;
            
            // 3. Batch insert the tracks inside a transaction
            database.transaction(() => {
                for (const file of filesToImport) {
                    let title = file.name;
                    let parsedArtistId = artistId || null;

                    if (file.name.includes(" - ")) {
                        const parts = file.name.split(" - ");
                        const artistName = parts[0].trim();
                        title = parts[1].replace(/\.[^/.]+$/, "").trim(); // Remove extension

                        if (!parsedArtistId && artistName) {
                            const existingArtist = database.getArtistByName(artistName);
                            parsedArtistId = existingArtist ? existingArtist.id : database.createArtist(artistName);
                        }
                    } else {
                        title = file.name.replace(/\.[^/.]+$/, "").trim();
                    }

                    database.createTrack({
                        title,
                        artist_id: parsedArtistId,
                        album_id: albumId || null,
                        owner_id: userId,
                        track_num: null,
                        duration: 0,
                        file_path: `gdrive://${file.id}`,
                        format: file.mimeType.split("/")[1] || "mp3",
                        bitrate: 0,
                        sample_rate: 0,
                        price: 0,
                        price_usdc: 0,
                        price_usdt: 0,
                        currency: 'ETH',
                        lossless_path: null,
                        waveform: null,
                        url: null,
                        service: 'google-drive',
                        external_artwork: null,
                        lyrics: null,
                        hash: null,
                        external_id: file.id
                    });
                    importedCount++;
                }
            });

            res.json({ 
                success: true, 
                count: importedCount, 
                message: `Successfully imported ${importedCount} audio files (${audioFiles.length - filesToImport.length} skipped as already imported)` 
            });
        } catch (error: any) {
            console.error("GDrive Recursive Import Error:", error.message);
            res.status(500).json({ error: error.message });
        }
    });

    router.delete("/gdrive/accounts/:id", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        const id = parseInt(req.params.id);
        const account = database.getStorageAccount(id);
        if (!account || account.user_id !== req.userId) return res.status(404).send("Account not found");
        database.deleteStorageAccount(id);
        res.json({ success: true });
    });

    return router;
}
