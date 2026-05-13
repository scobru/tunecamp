import { Router } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { SoulseekService } from "../../modules/integrations/soulseek.js";
import type { ScannerService } from "../../modules/catalog/scanner.service.js";
import path from "path";
import { metadataService as defaultMetadataService } from "../../modules/catalog/metadata.service.js";
import { streamingService as defaultStreamingService } from "../../modules/streaming/streaming.service.js";
import type { MetadataService } from "../../modules/catalog/metadata.service.js";
import type { StreamingService } from "../../modules/streaming/streaming.service.js";
import { VisibilityGuardian, UserRole, Capability } from "../../common/visibility.js";

export function createSearchRoutes(
    database: DatabaseService,
    soulseek: SoulseekService,
    scanner: ScannerService,
    metadataService: MetadataService = defaultMetadataService,
    streamingService: StreamingService = defaultStreamingService
): Router {
    const router = Router();

    /**
     * GET /api/search/soulseek
     * Search Soulseek for music
     */
    router.get("/soulseek", async (req: AuthenticatedRequest, res) => {
        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        try {
            // Check if user has personal credentials
            if (req.userId) {
                const creds = database.getUserSoulseekCredentials(req.userId);
                if (creds && creds.username && creds.password_encrypted) {
                    await soulseek.connect(creds.username, creds.password_encrypted);
                } else {
                    // Fallback to global credentials
                    const globalUser = database.getSetting("soulseek_username");
                    const globalPass = database.getSetting("soulseek_password");
                    if (globalUser && globalPass) {
                        await soulseek.connect(globalUser, globalPass);
                    }
                }
            }

            const results = await soulseek.search(query);
            res.json(results);
        } catch (error) {
            res.status(500).json({ error: "Soulseek search failed" });
        }
    });

    /**
     * POST /api/search/soulseek/download
     * Trigger a Soulseek download
     */
    router.post("/soulseek/download", async (req: AuthenticatedRequest, res) => {
        const { result } = req.body;
        if (!result || !result.file) {
            return res.status(400).json({ error: "Valid search result with file path required" });
        }

        if (!req.userId) {
            console.error("❌ Soulseek Download: No userId in request");
            return res.status(401).json({ error: "Unauthorized: User ID missing" });
        }

        try {
            const filePath = result.file;
            const downloadId = database.createSoulseekDownload({
                user_id: req.userId!,
                file_path: filePath,
                filename: filePath.split(/[/\\]/).pop() || "unknown",
                status: 'pending'
            });

            // Start download in background
            soulseek.download(result).then(async (dest) => {
                database.updateSoulseekDownloadProgress(downloadId, 1, 'completed', dest);
                // Trigger scanner on the new file
                console.log(`📡 Soulseek download finished: ${dest}`);
            }).catch(err => {
                console.error(`❌ Soulseek background download failed:`, err);
                database.updateSoulseekDownloadProgress(downloadId, 0, 'failed');
            });

            res.json({ success: true, downloadId });
        } catch (error: any) {
            console.error("❌ Soulseek Download Route Error:", error);
            res.status(500).json({ error: "Download failed", details: error.message });
        }
    });

    /**
     * POST /api/search/soulseek/credentials
     * Update user's Soulseek credentials
     */
    router.post("/soulseek/credentials", async (req: AuthenticatedRequest, res) => {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Credentials required" });

        try {
            database.updateUserSoulseekCredentials(req.userId!, username, password);
            // Try to connect to verify
            const success = await soulseek.connect(username, password);
            res.json({ success });
        } catch (error) {
            res.status(500).json({ error: "Failed to update credentials" });
        }
    });

    /**
     * GET /api/search/soulseek/status
     * Get user's Soulseek download status
     */
    router.get("/soulseek/status", async (req: AuthenticatedRequest, res) => {
        try {
            const downloads = database.getSoulseekDownloads(req.userId);
            res.json(downloads);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch status" });
        }
    });

    /**
     * POST /api/search/content/soulseek/sync/:id
     * Manually trigger library indexing for a completed Soulseek download
     */
    router.post("/soulseek/sync/:id", async (req: AuthenticatedRequest, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        try {
            const download = database.getSoulseekDownload(id);
            if (!download) return res.status(404).json({ error: "Download not found" });
            if (download.status !== 'completed') return res.status(400).json({ error: "Download not completed" });
            if (!download.file_path) return res.status(400).json({ error: "No file path available" });
            if (download.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

            // Trigger scanner
            const settings = database.getAllSettings();
            const musicDir = settings.musicDir || process.env.TUNECAMP_MUSIC_DIR || "music";
            
            const filePath = download.file_path;
            const result = await scanner.processAudioFile(filePath, musicDir, undefined, req.userId);
            res.json({ success: true, result });
        } catch (error: any) {
            console.error("❌ Soulseek Sync Error:", error);
            res.status(500).json({ error: "Sync failed", details: error.message });
        }
    });

    /**
     * DELETE /api/search/content/soulseek/status/failed
     * Clear all failed Soulseek downloads for the current user
     */
    router.delete("/soulseek/status/failed", async (req: AuthenticatedRequest, res) => {
        try {
            database.clearFailedSoulseekDownloads(req.userId!);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: "Failed to clear downloads" });
        }
    });

    /**
     * DELETE /api/search/content/soulseek/status/:id
     * Remove a specific Soulseek download entry
     */
    router.delete("/soulseek/status/:id", async (req: AuthenticatedRequest, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        try {
            const download = database.getSoulseekDownload(id);
            if (!download) return res.status(404).json({ error: "Download not found" });
            if (download.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

            database.deleteSoulseekDownload(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: "Failed to delete download" });
        }
    });

    /**
     * GET /api/search/global
     * Main search endpoint for all users.
     * Merges local database results (role-filtered) with external plugin results.
     */
    router.get("/global", async (req: AuthenticatedRequest, res) => {
        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
        const onlyPublic = !canSeePrivate;
        console.log(`🔍 [Global Search] Query: "${query}", Public Only: ${onlyPublic}, User: ${req.username || 'Guest'} (Role: ${req.role || 'none'})`);
        
        try {
            // 1. Search Local Database
            const localResults = database.search(query, onlyPublic);

            // 2. Search External Plugins (Metadata providers like Bandcamp)
            const externalResults = await metadataService.getRegistry().getEnabled().reduce(async (accPromise, provider) => {
                const acc = await accPromise;
                try {
                    const results = await provider.searchRecording(query);
                    return [...acc, ...results.map(r => ({ 
                        ...r, 
                        isExternal: true, 
                        providerId: provider.id,
                        source: provider.id
                    }))];
                } catch (e) {
                    return acc;
                }
            }, Promise.resolve([] as any[]));

            // 3. Search Streaming Providers (YouTube, SoundCloud, Bandcamp)
            const candidates = await streamingService.search(query);
            const streamingResults = candidates.map(r => ({ 
                ...r, 
                isStreaming: true, 
                providerId: r.provider,
                source: r.provider // Frontend expects 'source' for ID construction
            }));

            res.json({
                local: localResults,
                external: externalResults,
                streaming: streamingResults,
                query
            });
        } catch (error) {
            console.error("❌ Global Search Error:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });

    return router;
}

