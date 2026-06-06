import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs-extra";
import { createRequire } from "module";
import { kprs } from "../../modules/network/zen-network.js";
import type { ServiceContainer } from "../../core/container.js";
import { VisibilityGuardian } from "../../common/visibility.js";

const require = createRequire(import.meta.url);
const pkg = require("../../../../package.json");

export function createMiscRoutes(container: ServiceContainer): Router {
    const router = Router();
    const config: ServiceContainer['config'] = (container as any).config || (container as any);
    const waveformService: ServiceContainer['waveformService'] = (container as any).waveformService || (container as any);
    const metadataService: ServiceContainer['metadataService'] = (container as any).metadataService || (container as any);
    const scannerService: ServiceContainer['scannerService'] = (container as any).scannerService || (container as any);
    const streamingService: ServiceContainer['streamingService'] = (container as any).streamingService || (container as any);
    const playlistService: ServiceContainer['playlistService'] = (container as any).playlistService || (container as any);
    const authMiddleware: ServiceContainer['authMiddleware'] = (container as any).authMiddleware || (container as any);
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const integration: ServiceContainer['integration'] = (container as any).integration || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (container as any);
    const social: ServiceContainer['social'] = (container as any).social || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);

    router.get("/api/peers", (req, res) => {
        res.status(200).json(Array.from(kprs));
    });

    router.get("/api/waveform/:id(*)", async (req, res) => {
        try {
            const idParam = req.params.id;
            const trackId = parseInt(idParam);
            if (!isNaN(trackId) && trackId.toString() === idParam) {
                const track = library.getTrack(trackId);
                if (track && track.file_path) {
                    const filePath = path.join(config.musicDir, track.file_path);
                    const svg = await waveformService.getWaveformSVG(trackId, filePath);
                    res.setHeader("Content-Type", "image/svg+xml");
                    res.setHeader("Cache-Control", "public, max-age=31536000");
                    return res.send(svg);
                }
            }
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=31536000");
            return res.send('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100" viewBox="0 0 800 100"><line x1="0" y1="50" x2="800" y2="50" stroke="#888" stroke-width="2"/></svg>');
        } catch (e) {
            res.status(500).send("Error generating waveform");
        }
    });

    // Public assets store
    router.get("/api/assets", (req: Request, res: Response) => {
        try { res.json(integration.getPublicAssets()); }
        catch { res.status(500).json({ error: "Failed to fetch assets" }); }
    });

    router.get("/api/assets/:slug", (req: Request, res: Response) => {
        try {
            const asset = integration.getAssetBySlug(req.params.slug);
            if (!asset || asset.visibility !== 'public') return res.status(404).json({ error: "Not found" });
            res.json(asset);
        } catch { res.status(500).json({ error: "Failed to fetch asset" }); }
    });

    // Serve asset cover images by asset ID
    router.get("/api/assets/cover/:id", async (req: Request, res: Response) => {
        try {
            const asset = integration.getAsset(parseInt(req.params.id, 10));
            if (!asset || !asset.cover_path) return res.status(404).json({ error: "Not found" });
            if (!await fs.pathExists(asset.cover_path)) {
                return res.status(404).json({ error: "Cover file not found" });
            }
            res.sendFile(path.resolve(asset.cover_path));
        } catch { res.status(500).json({ error: "Failed to serve cover" }); }
    });

    router.get("/api/plugins", authMiddleware.requireAdmin, (req, res) => {
        res.json({
            metadata:    metadataService.getRegistry().getRegistryInfo(),
            scanner:     scannerService.getRegistry().getRegistryInfo(),
            streaming:   streamingService.getRegistry().getRegistryInfo(),
            playlist:    playlistService.getRegistry().getRegistryInfo(),
        });
    });

    router.get("/api/v1/federation/libraries", async (req, res) => {
        const publicUrl = (identity.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`).trim().replace(/\/$/, "");
        const stats = await library.getStats();
        res.json({
            count: 1,
            results: [{
                uuid: "tunecamp-library",
                fid: `${publicUrl}/federation/libraries/tunecamp-library`,
                name: identity.getSetting("siteName") || config.siteName || "TuneCamp Library",
                description: identity.getSetting("siteDescription") || "Tunecamp music library",
                privacy_level: "everyone",
                creation_date: new Date().toISOString(),
                uploads_count: stats.tracks,
                size: 0,
                actor: {
                    fid: `${publicUrl}/users/site`,
                    url: publicUrl,
                    name: identity.getSetting("siteName") || "TuneCamp",
                    preferred_username: "site",
                    domain: new URL(publicUrl).hostname,
                }
            }]
        });
    });

    router.get("/api/v1/instance/nodeinfo/2.0", async (req, res) => {
        const stats = await library.getStats();
        res.json({
            version: "2.0",
            software: { name: "tunecamp", version: pkg.version },
            protocols: ["activitypub"],
            openRegistrations: false,
            usage: {
                users: { total: stats.artists || 1, activeHalfyear: stats.artists || 1, activeMonth: stats.artists || 1 },
                localPosts: stats.tracks + (stats.albums || 0),
                localComments: 0,
            },
            metadata: {
                nodeName: identity.getSetting("siteName") || config.siteName || "TuneCamp",
                library: { federationEnabled: true },
            }
        });
    });

    router.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        const artist = library.getArtistBySlug(slug);
        res.redirect(artist ? `/artists/${artist.slug}` : "/");
    });

    router.get("/artist/:slug", (req, res) => {
        const { slug } = req.params;
        const artist = library.getArtistBySlug(slug);
        res.redirect(artist ? `/#/artist/${artist.slug}` : "/");
    });

    router.get("/note/release/:slug", (req, res) => {
        const { slug } = req.params;
        const album = library.getAlbumBySlug(slug);
        if (album) res.redirect(`/#/album/${album.slug}`);
        else res.status(404).send("Release not found");
    });

    router.get("/note/post/:slug", (req, res) => {
        const { slug } = req.params;
        const post = social.getPostBySlug(slug);
        if (post) {
            const artist = library.getArtist(post.artist_id);
            res.redirect(artist ? `/artists/${artist.slug}?post=${post.slug}` : "/");
        } else res.status(404).send("Post not found");
    });

    router.get("/api/posts/:slug", (req, res) => {
        const { slug } = req.params;
        const post = social.getPostBySlug(slug);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Exclude posts that are deleted from ActivityPub
        const apNotes = social.getApNotes(post.artist_id, true);
        const apNote = apNotes.find((n: any) => n.note_type === 'post' && n.content_id === post.id);
        if (apNote && apNote.deleted_at) {
            return res.status(404).json({ error: "Post not found" });
        }

        const artist = library.getArtist(post.artist_id);
        res.json({
            ...post,
            artistId: post.artist_id,
            artistName: artist ? artist.name : "Unknown Artist",
            artistSlug: artist ? artist.slug : "",
            artistPhoto: artist ? artist.photo_path : "",
            createdAt: post.created_at,
            publishedAt: post.published_at,
            updatedAt: post.created_at
        });
    });

    router.get("/api/settings/background", async (req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const bgFile = files.find((f) => f.startsWith("background."));
            if (!bgFile) return res.status(404).json({ error: "Not found" });
            res.sendFile(path.resolve(path.join(assetsDir, bgFile)));
        } catch { res.status(404).json({ error: "Not found" }); }
    });

    router.get("/api/settings/logo", async (req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const logoFile = files.find((f) => f.startsWith("site-logo."));
            if (!logoFile) return res.status(404).json({ error: "Not found" });
            res.sendFile(path.resolve(path.join(assetsDir, logoFile)));
        } catch { res.status(404).json({ error: "Not found" }); }
    });

    router.get("/api/settings/cover", async (req, res) => {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const coverFile = files.find((f) => f.startsWith("site-cover."));
            if (!coverFile) return res.status(404).json({ error: "Not found" });
            res.sendFile(path.resolve(path.join(assetsDir, coverFile)));
        } catch { res.status(404).json({ error: "Not found" }); }
    });

    return router;
}
