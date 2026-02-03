import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { resolveFile } from "../utils/pathHelper.js";

export function createArtistsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/artists
     * List all artists (for admin) or only those with public releases (for non-admin)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const allArtists = database.getArtists();

            if (req.isAdmin) {
                return res.json(allArtists);
            }

            // Filter to only artists that have at least one public release
            const publicReleases = database.getReleases(true); // publicOnly = true
            const artistsWithPublicReleases = new Set(
                publicReleases.map(r => r.artist_id).filter(id => id !== null)
            );

            const filteredArtists = allArtists.filter(a => artistsWithPublicReleases.has(a.id));

            // Map to frontend expected format
            const mappedArtists = (req.isAdmin ? allArtists : filteredArtists).map(a => ({
                ...a,
                coverImage: a.photo_path
            }));

            res.json(mappedArtists);
        } catch (error) {
            console.error("Error getting artists:", error);
            res.status(500).json({ error: "Failed to get artists" });
        }
    });

    /**
     * POST /api/artists
     * Create a new artist (admin only)
     */
    router.post("/", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Only Root Admin can create new artists
        if (req.artistId) {
            return res.status(403).json({ error: "Restricted admins cannot create new artists" });
        }

        try {
            const { name, bio, links, postParams } = req.body;

            if (!name) {
                return res.status(400).json({ error: "Name is required" });
            }

            // Check if artist already exists
            const existing = database.getArtistByName(name);
            if (existing) {
                return res.status(409).json({ error: "Artist already exists", artist: existing });
            }

            // Parse links if it's a string
            let parsedLinks = links;
            if (typeof links === 'string') {
                try {
                    parsedLinks = JSON.parse(links);
                } catch (e) {
                    parsedLinks = null;
                }
            }

            const artistId = database.createArtist(name, bio || undefined, undefined, parsedLinks, postParams);
            const artist = database.getArtist(artistId);

            console.log(`🎤 Created artist: ${name}`);
            res.status(201).json(artist);
        } catch (error) {
            console.error("Error creating artist:", error);
            res.status(500).json({ error: "Failed to create artist" });
        }
    });

    /**
     * PUT /api/artists/:id
     * Update an existing artist (admin only)
     */
    router.put("/:id", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const { bio, links, postParams } = req.body;

            const artist = database.getArtist(id);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Permission Check: Restricted admin can only update their own artist
            if (req.artistId && req.artistId !== id) {
                return res.status(403).json({ error: "Access denied: You can only manage your assigned artist" });
            }

            // Parse links if it's a string or array
            let parsedLinks = links;
            if (typeof links === 'string') {
                try {
                    parsedLinks = JSON.parse(links);
                } catch (e) {
                    parsedLinks = artist.links ? JSON.parse(artist.links) : null;
                }
            }

            // Parse postParams if it's a string, or fallback to existing
            let parsedPostParams = postParams;
            if (typeof postParams === 'string') {
                try {
                    parsedPostParams = JSON.parse(postParams);
                } catch (e) {
                    parsedPostParams = artist.post_params ? JSON.parse(artist.post_params) : null;
                }
            } else if (postParams === undefined && artist.post_params) {
                // Convert existing string to object if not provided in update
                try { parsedPostParams = JSON.parse(artist.post_params); } catch (e) { }
            }


            database.updateArtist(id, bio || artist.bio || undefined, artist.photo_path || undefined, parsedLinks, parsedPostParams);

            const updatedArtist = database.getArtist(id);
            console.log(`🎤 Updated artist: ${artist.name}`);
            res.json(updatedArtist);
        } catch (error) {
            console.error("Error updating artist:", error);
            res.status(500).json({ error: "Failed to update artist" });
        }
    });

    /**
     * DELETE /api/artists/:id
     * Delete an artist (admin only)
     */
    router.delete("/:id", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const artist = database.getArtist(id);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Only Root Admin can delete artists
            if (req.artistId) {
                return res.status(403).json({ error: "Restricted admins cannot delete artists" });
            }

            database.deleteArtist(id);
            console.log(`🗑️  Deleted artist: ${artist.name}`);
            res.json({ message: "Artist deleted" });
        } catch (error) {
            console.error("Error deleting artist:", error);
            res.status(500).json({ error: "Failed to delete artist" });
        }
    });

    /**
     * GET /api/artists/:idOrSlug
     * Get artist details with albums (supports numeric ID or slug)
     */
    router.get("/:idOrSlug", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let artist;

            // Check if it's a numeric ID or a slug
            if (/^\d+$/.test(param)) {
                artist = database.getArtist(parseInt(param, 10));
            } else {
                artist = database.getArtistBySlug(param);
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            const albums = database.getAlbumsByArtist(artist.id, req.isAdmin !== true);

            // Get cover image from first album if artist has no photo
            let coverImage = artist.photo_path;
            if (!coverImage && albums.length > 0) {
                coverImage = albums[0].cover_path;
            }

            // Get tracks by this artist that have no album (loose tracks) - only for admin
            let looseTracks: ReturnType<typeof database.getTracks> = [];
            if (req.isAdmin) {
                const allTracks = database.getTracks();
                looseTracks = allTracks.filter(t => t.artist_id === artist.id && !t.album_id);
            }

            // Parse links JSON if present
            let links = null;
            if (artist.links) {
                try {
                    links = JSON.parse(artist.links);
                } catch (e) {
                    links = null;
                }
            }

            // Parse postParams for admin
            let postParams = undefined;
            if (req.isAdmin && artist.post_params) {
                try {
                    postParams = JSON.parse(artist.post_params);
                } catch (e) { }
            }

            res.json({
                ...artist,
                links,
                postParams,
                coverImage,
                albums,
                tracks: looseTracks,
            });
        } catch (error) {
            console.error("Error getting artist:", error);
            res.status(500).json({ error: "Failed to get artist" });
        }
    });

    /**
     * GET /api/artists/:idOrSlug/cover
     * Get artist cover image (photo or first album cover)
     */
    router.get("/:idOrSlug/cover", async (req, res) => {
        try {
            const fs = await import("fs");
            const path = await import("path");

            const param = req.params.idOrSlug as string;
            let artist;

            if (/^\d+$/.test(param)) {
                artist = database.getArtist(parseInt(param, 10));
            } else {
                artist = database.getArtistBySlug(param);
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Try artist photo first
            if (artist.photo_path) {
                const photoPath = resolveFile(artist.photo_path);
                if (photoPath) {
                    const ext = path.extname(photoPath).toLowerCase();
                    const contentTypes: Record<string, string> = {
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                        ".gif": "image/gif",
                        ".webp": "image/webp",
                    };
                    res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
                    res.setHeader("Cache-Control", "public, max-age=86400");
                    fs.createReadStream(photoPath).pipe(res);
                    return;
                }
            }

            // Fallback to first album cover
            const albums = database.getAlbumsByArtist(artist.id, false);
            for (const album of albums) {
                if (album.cover_path) {
                    const coverPath = resolveFile(album.cover_path);
                    if (coverPath) {
                        const ext = path.extname(coverPath).toLowerCase();
                        const contentTypes: Record<string, string> = {
                            ".jpg": "image/jpeg",
                            ".jpeg": "image/jpeg",
                            ".png": "image/png",
                            ".gif": "image/gif",
                            ".webp": "image/webp",
                        };
                        res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
                        res.setHeader("Cache-Control", "public, max-age=86400");
                        fs.createReadStream(coverPath).pipe(res);
                        return;
                    }
                }
            }

            res.status(404).json({ error: "No cover found" });
        } catch (error) {
            console.error("Error getting artist cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    /**
     * GET /api/artists/:idOrSlug/posts
     * Get posts for an artist
     */
    router.get("/:idOrSlug/posts", (req, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let artist;

            if (/^\d+$/.test(param)) {
                artist = database.getArtist(parseInt(param, 10));
            } else {
                artist = database.getArtistBySlug(param);
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            const posts = database.getPostsByArtist(artist.id);
            res.json(posts);
        } catch (error) {
            console.error("Error getting artist posts:", error);
            res.status(500).json({ error: "Failed to get artist posts" });
        }
    });

    return router;
}
