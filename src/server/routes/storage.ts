import { Router } from "express";
import { type GoogleDriveService } from "../services/google-drive.service.js";
import { type DatabaseService } from "../database.types.js";
import { type AuthenticatedRequest } from "../middleware/auth.js";

export function createStorageRouter(database: DatabaseService, gdriveService: GoogleDriveService, authMiddleware: any) {
    const router = Router();

    router.get("/gdrive/auth", authMiddleware.requireAdmin, (req: AuthenticatedRequest, res) => {
        const url = gdriveService.getAuthUrl();
        res.json({ url });
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

    return router;
}
