import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs-extra";
import { createRequire } from "module";
import { kprs } from "../../modules/network/zen-network.js";
import type { ServiceContainer } from "../../core/container.js";
import { VisibilityGuardian, VisibilityProfile } from "../../common/visibility.js";
import { create } from "xmlbuilder2";

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

    // Helper function to build RSS 2.0 feed
    function buildRssFeed(
        publicUrl: string,
        title: string,
        description: string,
        tracks: any[]
    ): string {
        const doc = create({ version: "1.0", encoding: "UTF-8" })
            .ele("rss", {
                version: "2.0",
                "xmlns:itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
                "xmlns:content": "http://purl.org/rss/1.0/modules/content/"
            })
            .ele("channel")
                .ele("title").txt(title).up()
                .ele("description").txt(description).up()
                .ele("link").txt(publicUrl).up()
                .ele("generator").txt("TuneCamp").up()
                .ele("language").txt("en").up();

        // Sort tracks by created_at desc (latest first)
        const sortedTracks = [...tracks].sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });

        for (const track of sortedTracks) {
            // Resolve link: if track belongs to an album/release, link to it. Else, artist slug.
            let link = `${publicUrl}/#/artist/${track.artistSlug || 'unknown'}`;
            if (track.album_id) {
                const album = library.getAlbum(track.album_id);
                if (album && album.slug) {
                    link = `${publicUrl}/#/album/${album.slug}`;
                }
            }

            const pubDate = track.created_at ? new Date(track.created_at).toUTCString() : new Date().toUTCString();
            const duration = track.duration ? Math.round(track.duration) : 0;
            const mimeType = track.mime_type || "audio/mpeg";
            const fileSize = track.file_size || 0;
            const streamUrl = `${publicUrl}/api/tracks/${track.id}/stream`;

            const item = doc.ele("item")
                .ele("title").txt(track.title).up()
                .ele("link").txt(link).up()
                .ele("description").txt(
                    `Artist: ${track.artist_name || 'Unknown'}\n` +
                    (track.album_title ? `Album: ${track.album_title}\n` : '') +
                    (track.genre ? `Genre: ${track.genre}\n` : '')
                ).up()
                .ele("pubDate").txt(pubDate).up()
                .ele("guid", { isPermaLink: "false" }).txt(`${publicUrl}/api/tracks/${track.id}`).up()
                .ele("enclosure", {
                    url: streamUrl,
                    length: String(fileSize),
                    type: mimeType
                }).up();

            if (duration > 0) {
                const hours = Math.floor(duration / 3600);
                const minutes = Math.floor((duration % 3600) / 60);
                const seconds = Math.floor(duration % 60);
                const durationStr = hours > 0 
                    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                    : `${minutes}:${String(seconds).padStart(2, '0')}`;
                item.ele("itunes:duration").txt(durationStr).up();
            }
            item.up();
        }

        return doc.end({ prettyPrint: true });
    }

    // Global Feed
    router.get(["/feed.xml", "/rss.xml"], async (req, res) => {
        try {
            const dbPublicUrl = identity.getSetting("publicUrl");
            const publicUrl = (dbPublicUrl || config.publicUrl || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, "");
            const title = identity.getSetting("siteName") || config.siteName || "TuneCamp";
            const description = identity.getSetting("siteDescription") || config.siteDescription || "TuneCamp self-hosted federated music platform";
            
            const tracks = library.getTracks(undefined, VisibilityProfile.PUBLIC_STAGE);
            const xml = buildRssFeed(publicUrl, title, description, tracks);
            
            res.setHeader("Content-Type", "text/xml");
            res.send(xml);
        } catch (error) {
            console.error("Error generating global RSS feed:", error);
            res.status(500).send("Error generating feed");
        }
    });

    // Artist-Specific Feed
    router.get(["/artists/:slug/feed.xml", "/artists/:slug/rss.xml"], async (req, res) => {
        try {
            const { slug } = req.params;
            const artist = library.getArtistBySlug(slug);
            if (!artist) {
                return res.status(404).send("Artist not found");
            }

            const dbPublicUrl = identity.getSetting("publicUrl");
            const publicUrl = (dbPublicUrl || config.publicUrl || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, "");
            const title = `${artist.name} - TuneCamp Feed`;
            const description = artist.bio || `TuneCamp music feed for ${artist.name}`;
            
            const tracks = library.getTracksByArtist(artist.id, VisibilityProfile.PUBLIC_STAGE);
            const xml = buildRssFeed(publicUrl, title, description, tracks);
            
            res.setHeader("Content-Type", "text/xml");
            res.send(xml);
        } catch (error) {
            console.error("Error generating artist RSS feed:", error);
            res.status(500).send("Error generating feed");
        }
    });

    return router;
}
