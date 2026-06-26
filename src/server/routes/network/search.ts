import { Router, json } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { SoulseekService } from "../../modules/integrations/soulseek.js";
import type { ScannerService } from "../../modules/catalog/scanner.service.js";
import path from "path";
import { metadataService as defaultMetadataService } from "../../modules/catalog/metadata.service.js";
import { streamingService as defaultStreamingService } from "../../modules/streaming/streaming.service.js";
import type { MetadataService } from "../../modules/catalog/metadata.service.js";
import type { StreamingService } from "../../modules/streaming/streaming.service.js";
import { VisibilityGuardian, UserRole, Capability, VisibilityProfile } from "../../common/visibility.js";
import { requireDownloadProvider } from "../../middleware/provider-gate.js";

import type { ServiceContainer } from "../../core/container.js";

export function createSearchRoutes(container: ServiceContainer): Router {
    const soulseek: ServiceContainer['soulseekService'] = (container as any).soulseekService || (container as any);
    const scanner: ServiceContainer['scannerService'] = (container as any).scannerService || (container as any);
    const metadataService: ServiceContainer['metadataService'] = (container as any).metadataService || (container as any);
    const streamingService: ServiceContainer['streamingService'] = (container as any).streamingService || (container as any);
    const integration: ServiceContainer['integration'] = (container as any).integration || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (container as any);
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const router = Router();
    router.use(json());

    // Soulseek is disabled by default (grey-area P2P): all its endpoints
    // require the plugin to be explicitly enabled by the admin.
    router.use("/content/soulseek", requireDownloadProvider("soulseek"));

    /**
     * GET /api/search/content/soulseek
     * Search Soulseek for music
     */
    router.get("/content/soulseek", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        try {
            // Check if user has personal credentials
            if (req.userId) {
                const creds = integration.getUserSoulseekCredentials(req.userId);
                if (creds && creds.username && creds.password_encrypted) {
                    await soulseek.connect(creds.username, creds.password_encrypted);
                } else {
                    // Fallback to global credentials
                    const globalUser = identity.getSetting("soulseek_username");
                    const globalPass = identity.getSetting("soulseek_password");
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
     * POST /api/search/content/soulseek/download
     * Trigger a Soulseek download
     */
    router.post("/content/soulseek/download", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

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
            const downloadId = integration.createSoulseekDownload({
                user_id: req.userId!,
                file_path: filePath,
                filename: filePath.split(/[/\\]/).pop() || "unknown",
                status: 'pending'
            });

            // Start download in background
            soulseek.download(result).then(async (dest) => {
                integration.updateSoulseekDownloadProgress(downloadId, 1, 'completed', dest);
                console.log(`📡 Soulseek download finished: ${dest}`);
                // Auto-sync: index the downloaded file into the library
                try {
                    const settings = identity.getAllSettings();
                    const musicDir = settings.musicDir || process.env.TUNECAMP_MUSIC_DIR || "music";
                    await scanner.processAudioFile(dest, musicDir, undefined, req.userId!);
                    console.log(`✅ Soulseek auto-sync completed: ${dest}`);
                } catch (syncErr) {
                    console.error(`⚠️ Soulseek auto-sync failed:`, syncErr);
                }
            }).catch(err => {
                console.error(`❌ Soulseek background download failed:`, err);
                integration.updateSoulseekDownloadProgress(downloadId, 0, 'failed');
            });

            res.json({ success: true, downloadId });
        } catch (error: any) {
            console.error("❌ Soulseek Download Route Error:", error);
            res.status(500).json({ error: "Download failed", details: error.message });
        }
    });

    /**
     * POST /api/search/content/soulseek/credentials
     * Update user's Soulseek credentials
     */
    router.post("/content/soulseek/credentials", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Credentials required" });

        try {
            integration.updateUserSoulseekCredentials(req.userId!, username, password);
            // Try to connect to verify
            const success = await soulseek.connect(username, password);
            res.json({ success });
        } catch (error) {
            res.status(500).json({ error: "Failed to update credentials" });
        }
    });

    /**
     * GET /api/search/content/soulseek/status
     * Get user's Soulseek download status
     */
    router.get("/content/soulseek/status", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        try {
            const downloads = integration.getSoulseekDownloads(req.userId);
            res.json(downloads);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch status" });
        }
    });

    /**
     * POST /api/search/content/soulseek/sync/:id
     * Manually trigger library indexing for a completed Soulseek download
     */
    router.post("/content/soulseek/sync/:id", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        try {
            const download = integration.getSoulseekDownload(id);
            if (!download) return res.status(404).json({ error: "Download not found" });
            if (download.status !== 'completed') return res.status(400).json({ error: "Download not completed" });
            if (!download.file_path) return res.status(400).json({ error: "No file path available" });
            if (download.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

            // Trigger scanner
            const settings = identity.getAllSettings();
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
    router.delete("/content/soulseek/status/failed", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        try {
            integration.clearFailedSoulseekDownloads(req.userId!);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: "Failed to clear downloads" });
        }
    });

    /**
     * DELETE /api/search/content/soulseek/status/:id
     * Remove a specific Soulseek download entry
     */
    router.delete("/content/soulseek/status/:id", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        try {
            const download = integration.getSoulseekDownload(id);
            if (!download) return res.status(404).json({ error: "Download not found" });
            if (download.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

            integration.deleteSoulseekDownload(id);
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

        const isManagerOrAbove = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));

        // Respect visibility profiles even in search. 
        // Admin/SuperUser see everything (Santuario + Arena).
        // Normal users see only the public stage (Arena) + their own uploads.
        const profile = req.context ? VisibilityGuardian.getProfile(req.context) : VisibilityProfile.PUBLIC_STAGE;

        console.log(`🔍 [Global Search] Query: "${query}", Profile: ${profile}, User: ${req.username || 'Guest'} (Role: ${req.role || 'none'})`);
        try {
            // 1. Search Local Database
            const localResults = library.search(query, profile);

            // Provider search (Streaming & External Metadata) is restricted to Manager/Root
            let streamingResults: any[] = [];
            let externalResults: any[] = [];

            if (isManagerOrAbove) {
                // 2. Search Streaming Providers (SoundCloud, etc.)
                // These are direct playable results and should be prioritized
                const candidates = await streamingService.search(query);
                streamingResults = candidates.map(r => ({
                    ...r,
                    isStreaming: true,
                    providerId: r.provider,
                    source: r.provider // Frontend expects 'source' for ID construction
                }));

                // 3. Search External Metadata Plugins (MusicBrainz, Discogs, etc.)
                // We only include these if we have at least one active streaming provider to actually play the content
                // AND we skip providers that are already in the streaming service to avoid duplicates.
                const streamingProviders = streamingService.getRegistry().getEnabled();
                const hasAudioEngines = streamingProviders.length > 0;
                const streamingProviderIds = new Set(streamingService.listProviders().map(p => p.id));

                if (hasAudioEngines) {
                    const metadataProviders = metadataService.getRegistry().getEnabled()
                        .filter(p => !streamingProviderIds.has(p.id)); // Avoid duplicates

                    const metadataSearchPromises = metadataProviders.map(async (provider) => {
                        try {
                            // Use a local timeout for each provider to prevent one from hanging the whole search
                            const providerResults = await Promise.race([
                                provider.searchRecording(query),
                                new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                            ]);

                            const limit = 5; // Always 5 for managers/admins
                            return providerResults.slice(0, limit).map(r => ({
                                ...r,
                                isExternal: true,
                                providerId: provider.id,
                                source: provider.id
                            }));
                        } catch (e) {
                            return [];
                        }
                    });

                    const settles = await Promise.allSettled(metadataSearchPromises);
                    externalResults = settles
                        .filter((s): s is PromiseFulfilledResult<any[]> => s.status === 'fulfilled')
                        .flatMap(s => s.value);
                }
            }

            // 4. Search Peer Tracks (if authenticated)
            let peerResults: any[] = [];
            if (req.userId) {
                const peerEnabled = typeof identity.getSetting === 'function' ? identity.getSetting("peerEnabled") === "true" : false;
                if (peerEnabled) {
                    const peerService = (container as any).peerService;
                    if (peerService && typeof peerService.searchTracks === 'function') {
                        peerResults = peerService.searchTracks(query);
                    }
                }
            }

            res.json({
                local: localResults,
                external: externalResults,
                streaming: streamingResults,
                peers: peerResults,
                query
            });
        } catch (error) {
            console.error("❌ Global Search Error:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });
    return router;
}

