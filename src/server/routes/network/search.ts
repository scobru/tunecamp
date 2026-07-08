import { Router, json } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { ScannerService } from "../../modules/catalog/scanner.service.js";
import path from "path";
import { metadataService as defaultMetadataService } from "../../modules/catalog/metadata.service.js";
import { streamingService as defaultStreamingService } from "../../modules/streaming/streaming.service.js";
import type { MetadataService } from "../../modules/catalog/metadata.service.js";
import type { StreamingService } from "../../modules/streaming/streaming.service.js";
import { VisibilityGuardian, UserRole, Capability, VisibilityProfile } from "../../common/visibility.js";
import { requireDownloadProvider } from "../../middleware/provider-gate.js";
import { getDownloadService } from "../../modules/catalog/download.service.js";

import type { ServiceContainer } from "../../core/container.js";

export function createSearchRoutes(container: ServiceContainer): Router {
    const scanner = container.scannerService;
    const metadataService = container.metadataService;
    const streamingService = container.streamingService;
    const integration = container.integration;
    const identity = container.identity;
    const library = container.library;
    const database = container.database;
    const router = Router();
    router.use(json());

    // ─── Generic Download Provider routes ───────────────────────────────
    // Any registered DownloadProvider (including community plugins) gets
    // search + download endpoints automatically via these two routes.

    /**
     * GET /api/search/content/provider/:providerId
     * Search a download provider by id
     */
    router.get("/content/provider/:providerId", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        const { providerId } = req.params;
        const registry = getDownloadService()?.getRegistry();
        if (!registry || !registry.isEnabled(providerId)) {
            return res.status(403).json({
                error: `The '${providerId}' integration is disabled. An administrator can enable it under Admin → Integrations.`
            });
        }

        const provider = registry.get(providerId);
        if (!provider) {
            return res.status(404).json({ error: `Provider '${providerId}' not found` });
        }

        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        try {
            const results = await provider.search(query);
            res.json(results);
        } catch (error: any) {
            console.error(`❌ Provider ${providerId} search failed:`, error);
            res.status(500).json({ error: `Search failed for provider ${providerId}` });
        }
    });

    /**
     * POST /api/search/content/provider/:providerId/download
     * Download a result from any download provider
     */
    router.post("/content/provider/:providerId/download", async (req: AuthenticatedRequest, res) => {
        const isAdmin = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Root Admin or Manager only" });
        }

        const { providerId } = req.params;
        const registry = getDownloadService()?.getRegistry();
        if (!registry || !registry.isEnabled(providerId)) {
            return res.status(403).json({
                error: `The '${providerId}' integration is disabled.`
            });
        }

        const provider = registry.get(providerId);
        if (!provider) {
            return res.status(404).json({ error: `Provider '${providerId}' not found` });
        }

        const { result } = req.body;
        if (!result) {
            return res.status(400).json({ error: "A valid DownloadResult is required in body.result" });
        }

        if (!req.userId) {
            return res.status(401).json({ error: "Unauthorized: User ID missing" });
        }

        try {
            // Start download in background + auto-index (same pattern as Soulseek)
            provider.download(result).then(async (dest) => {
                console.log(`📡 Provider ${providerId} download finished: ${dest}`);
                try {
                    const settings = identity.getAllSettings();
                    const musicDir = settings.musicDir || process.env.TUNECAMP_MUSIC_DIR || "music";
                    await scanner.processAudioFile(dest, musicDir, undefined, req.userId!);
                    console.log(`✅ Provider ${providerId} auto-sync completed: ${dest}`);
                } catch (syncErr) {
                    console.error(`⚠️ Provider ${providerId} auto-sync failed:`, syncErr);
                }
            }).catch(err => {
                console.error(`❌ Provider ${providerId} background download failed:`, err);
            });

            res.json({ success: true, provider: providerId });
        } catch (error: any) {
            console.error(`❌ Provider ${providerId} download error:`, error);
            res.status(500).json({ error: "Download failed", details: error.message });
        }
    });

    // Native TuneCamp Network Search
    // ...

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

