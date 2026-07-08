import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs-extra";
import { readFile } from "fs/promises";
import type { ServiceContainer } from "../../core/container.js";
import { VisibilityGuardian, VisibilityProfile } from "../../common/visibility.js";
import { create } from "xmlbuilder2";
import { getSiteHandle } from "../../core/site-actor.js";
import { getDownloadService } from "../../modules/catalog/download.service.js";
import { getExternalProviderIds } from "../../core/plugin-loader.js";

// Read package.json using process.cwd() so this works in both ESM and CJS (Jest)
let pkg: { version: string } = { version: '0.0.0' };
try {
    pkg = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'));
} catch {
    // fallback: version stays '0.0.0'
}

function getFilteredChangelog(): string {
    try {
        const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
        if (!fs.existsSync(changelogPath)) {
            return "Changelog not found.";
        }
        const content = fs.readFileSync(changelogPath, 'utf8');
        const sections = content.split(/^## /m);
        const header = sections[0] || "# Changelog\n\n";
        const versionBlocks = sections.slice(1, 9);
        
        const processedBlocks = versionBlocks.map(block => {
            const lines = block.split('\n');
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('-') && (
                    /test|ci|mock|jest|coverage|lint|eslint|refactor|workspace|dependency|docker|github|vitest|tsbuildinfo|knip/i.test(trimmed)
                )) {
                    return false;
                }
                return true;
            });
            return filteredLines.join('\n');
        });
        
        return [header.trim(), ...processedBlocks].join('\n\n## ');
    } catch {
        return "Changelog unavailable.";
    }
}

export function createMiscRoutes(container: ServiceContainer): Router {
    const router = Router();
    const config = container.config;
    const waveformService = container.waveformService;
    const metadataService = container.metadataService;
    const scannerService = container.scannerService;
    const streamingService = container.streamingService;
    const playlistService = container.playlistService;
    const authMiddleware = container.authMiddleware;
    const library = container.library;
    const integration = container.integration;
    const identity = container.identity;
    const social = container.social;
    const database = container.database;
    const radioService = (container as any).radioService;

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

    router.get("/api/version", (_req: Request, res: Response) => {
        res.json({ version: pkg.version });
    });

    router.get("/api/changelog", (_req: Request, res: Response) => {
        res.json({ changelog: getFilteredChangelog() });
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

            // Use path.resolve but check if it's within the musicDir
            // This allows absolute paths within musicDir and relative paths.
            // Also sanitize the input to prevent escaping the directory
            // Path traversal via relative paths like `../../etc/passwd` will be blocked
            // Path traversal via absolute paths like `/etc/passwd` will be resolved to `/etc/passwd` and blocked.
            const resolvedMusicDir = path.resolve(config.musicDir);
            const expectedDir = path.resolve(resolvedMusicDir, "assets");

            // To ensure compatibility and block things like /etc/passwd completely while allowing safe
            // resolution if it's relative, we combine them. path.resolve with an absolute path as second arg
            // ignores the first arg. So we can check if it escapes.

            // First normalize the input cover_path to remove leading slashes if we want it to always be relative
            // However, the database might contain valid absolute paths already inside the music dir.
            const resolvedPath = path.resolve(resolvedMusicDir, asset.cover_path);
            if (!resolvedPath.startsWith(expectedDir + path.sep)) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (!await fs.pathExists(resolvedPath)) {
                return res.status(404).json({ error: "Cover file not found" });
            }
            res.sendFile(resolvedPath);
        } catch { res.status(500).json({ error: "Failed to serve cover" }); }
    });

    router.get("/api/plugins", authMiddleware.requireAdmin, (req, res) => {
        const externalIds = getExternalProviderIds();
        res.json({
            metadata:    metadataService.getRegistry().getRegistryInfo(),
            scanner:     scannerService.getRegistry().getRegistryInfo(),
            streaming:   streamingService.getRegistry().getRegistryInfo(),
            playlist:    playlistService.getRegistry().getRegistryInfo(),
            // Download providers, flagged so ContentSearch can build a generic
            // search tab for enabled external (community) plugins.
            download:    (getDownloadService()?.getRegistry().getRegistryInfo() ?? [])
                             .map(p => ({ ...p, isExternal: externalIds.has(p.id) })),
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
                    fid: `${publicUrl}/users/${getSiteHandle(identity)}`,
                    url: publicUrl,
                    name: identity.getSetting("siteName") || "TuneCamp",
                    preferred_username: getSiteHandle(identity),
                    domain: new URL(publicUrl).hostname,
                }
            }]
        });
    });

    router.get("/api/v1/instance/nodeinfo/2.0", async (req, res) => {
        const publicUrl = (identity.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`).trim().replace(/\/$/, "");
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
                // Site-actor URI so peers following us by bare domain can resolve our
                // instance actor when WebFinger handle guesses miss (discoverSiteActor fallback).
                actorId: `${publicUrl}/users/${getSiteHandle(identity)}`,
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
        const apNote = social.getApNoteByContent(post.artist_id, 'post', post.id);
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

    // Serve a site asset (background / logo / cover) found by filename prefix.
    // These live at constant URLs, so we force revalidation: combined with the
    // versioned URL stored in settings on upload, a replaced image is always
    // picked up instead of being served stale from the browser cache.
    async function serveSiteAsset(res: any, prefix: string) {
        try {
            const assetsDir = path.join(config.musicDir, "assets");
            const files = await fs.readdir(assetsDir);
            const match = files.find((f) => f.startsWith(prefix));
            if (!match) return res.status(404).json({ error: "Not found" });
            res.setHeader("Cache-Control", "no-cache");
            res.sendFile(path.resolve(path.join(assetsDir, match)));
        } catch { res.status(404).json({ error: "Not found" }); }
    }

    router.get("/api/settings/background", (_req, res) => serveSiteAsset(res, "background."));
    router.get("/api/settings/logo", (_req, res) => serveSiteAsset(res, "site-logo."));
    router.get("/api/settings/cover", (_req, res) => serveSiteAsset(res, "site-cover."));

    // Serve post media images
    router.get("/api/posts/media/:filename", async (req: Request, res: Response) => {
        try {
            const filename = req.params.filename;
            // Retain original business logic enforcing a flat directory
            if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
                return res.status(400).json({ error: "Invalid filename" });
            }

            const mediaDir = path.resolve(path.join(config.musicDir, "assets", "posts"));
            const filePath = path.resolve(path.join(mediaDir, filename));

            if (!filePath.startsWith(mediaDir + path.sep)) {
                return res.status(400).json({ error: "Invalid filename" });
            }

            if (!await fs.pathExists(filePath)) {
                return res.status(404).json({ error: "File not found" });
            }
            res.sendFile(filePath);
        } catch (error) {
            res.status(500).json({ error: "Failed to serve post media" });
        }
    });

    // Helper function to build RSS 2.0 feed
    function buildRssFeed(
        publicUrl: string,
        title: string,
        description: string,
        tracks: any[],
        radio?: {
            active: boolean;
            name: string;
            hlsUrl: string;
            startedAt?: string;
            currentTrack?: { id: number; title: string; artist_name?: string } | null;
        } | null
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

        // Live radio: when a station is on air, surface it as the first item so
        // podcast/RSS clients can tune into the live HLS stream straight from the
        // main feed. Mirrors the dedicated /api/radio/feed.rss feed.
        if (radio?.active && radio.hlsUrl) {
            const radioStreamUrl = radio.hlsUrl.startsWith("http")
                ? radio.hlsUrl
                : `${publicUrl}${radio.hlsUrl}`;
            const nowPlaying = radio.currentTrack
                ? `${radio.currentTrack.artist_name ? radio.currentTrack.artist_name + " — " : ""}${radio.currentTrack.title}`
                : "Live stream";
            const radioPubDate = radio.startedAt
                ? new Date(radio.startedAt).toUTCString()
                : new Date().toUTCString();

            doc.ele("item")
                .ele("title").txt(`${radio.name} (Live) — ${nowPlaying}`).up()
                .ele("link").txt(`${publicUrl}/radio`).up()
                .ele("description").txt(
                    `Live radio stream${radio.currentTrack ? `\nNow playing: ${nowPlaying}` : ""}`
                ).up()
                .ele("pubDate").txt(radioPubDate).up()
                .ele("guid", { isPermaLink: "false" }).txt(`${publicUrl}/radio#live`).up()
                .ele("enclosure", {
                    url: radioStreamUrl,
                    length: "0",
                    type: "application/vnd.apple.mpegurl"
                }).up()
                .up();
        }

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
            const radio = radioService?.getStatus?.() ?? null;
            const xml = buildRssFeed(publicUrl, title, description, tracks, radio);

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
