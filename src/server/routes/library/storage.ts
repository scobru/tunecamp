import { Router } from "express";
import { type GoogleDriveService } from "../../modules/storage/google-drive.service.js";
import { type DatabaseService } from "../../core/database.types.js";
import { type AuthenticatedRequest } from "../../middleware/auth.js";
import { type CatalogService } from "../../modules/catalog/catalog.service.js";

export function createStorageRouter(database: DatabaseService, gdriveService: GoogleDriveService, authMiddleware: any, catalogService: CatalogService) {
    const router = Router();

    router.get("/gdrive/auth", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        const url = gdriveService.getAuthUrl();
        res.json({ url });
    });

    router.get("/gdrive/accounts", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        const accounts = database.getStorageAccounts(req.userId);
        res.json(accounts.filter(a => a.provider === "google"));
    });

    router.get("/gdrive/callback", async (req: any, res) => {
        const { code } = req.query;
        if (!code) return res.status(400).send("No code provided");

        try {
            // For the callback, we don't have the auth header in the redirect.
            // We'll use the first admin for this prototype.
            const userId = database.getPrimaryAdminId();
            if (!userId) return res.status(500).send("No admin found");

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
            if (file.name.includes(" - ")) {
                const parts = file.name.split(" - ");
                title = parts[1].replace(/\.[^/.]+$/, ""); // Remove extension
            } else {
                title = file.name.replace(/\.[^/.]+$/, "");
            }

            const trackId = database.createTrack({
                title,
                artist_id: artistId || null,
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

    router.delete("/gdrive/accounts/:id", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        const id = parseInt(req.params.id);
        const account = database.getStorageAccount(id);
        if (!account || account.user_id !== req.userId) return res.status(404).send("Account not found");
        database.deleteStorageAccount(id);
        res.json({ success: true });
    });

    return router;
}

