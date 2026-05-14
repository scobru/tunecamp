import { Router } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import path from "path";
import fs from "fs-extra";
import { getPlaceholderSVG } from "../../../utils/audioUtils.js";
import { VisibilityGuardian } from "../../common/visibility.js";

export function createArtistsRoutes(database: DatabaseService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/artists
     * List all artists (for admin) or only those with public releases (for non-admin)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const allArtists = database.getArtists();
            const username = req.username;

            // Filter logic:
            // 1. Admins see everyone (but still need to be mapped/sanitized)
            // 2. Non-admins see:
            //    - Themselves (if req.artistId is set)
            //    - Artists with at least one public release
            
            let filteredArtists = allArtists;

            if (!req.isAdmin && !req.isSuperUser) {
                const context = VisibilityGuardian.deriveContext(req);

                // Determine which artists have PUBLIC formal releases
                const publicReleases = database.getReleases(true);
                const publicArtistIds = new Set(
                    publicReleases.map(r => r.artist_id).filter(id => id !== null)
                );

                // ALSO include artists with PUBLIC library albums
                const publicAlbums = database.getAlbums(true);
                for (const pa of publicAlbums) {
                    if (pa.artist_id) publicArtistIds.add(pa.artist_id);
                }

                filteredArtists = allArtists.filter(a => {
                    // 1. User's own artist (always visible to them)
                    if (req.artistId && a.id === req.artistId) return true;

                    // 2. If the artist is NOT private AND they have public content
                    const isVisibleToPublic = a.visibility === 'public' || a.visibility === 'unlisted';
                    if (isVisibleToPublic && publicArtistIds.has(a.id)) return true;

                    // 3. Fallback: VisibilityGuardian check (for explicit ownership/shared access)
                    if (VisibilityGuardian.isItemVisible(a, context)) return true;

                    return false;
                });
            }

            // Map to frontend expected format and EXCLUDE private_key for EVERYONE
            const mappedArtists = filteredArtists.reduce((acc, a) => {
                const { private_key, ...safeArtist } = a;

                const hasPublicReleases = publicArtistIds.has(a.id);
                const isLibraryArtist = !!a.isLibraryArtist;

                // Do not show artists to non-admins if they have no public releases or public albums
                // (Unless it's their own artist profile)
                const isOwnArtist = req.artistId && a.id === req.artistId;
                if (!req.isAdmin && !req.isSuperUser && !isOwnArtist && !hasPublicReleases) {
                    return acc;
                }

                acc.push({
                    ...safeArtist,
                    walletAddress: a.wallet_address,
                    isLibraryArtist,
                    isReleasing: hasPublicReleases,
                    // Use the canonical cover API URL so the frontend benefits from backend fallbacks
                    coverImage: `/api/artists/${a.id}/cover`,
                    starred: username ? database.isStarred(username, 'artist', String(a.id)) : false,
                    rating: username ? database.getItemRating(username, 'artist', String(a.id)) : 0
                });
                return acc;
            }, [] as any[]);

            res.json(mappedArtists);
        } catch (error) {
            console.error("Error getting artists:", error);
            res.status(500).json({ error: "Failed to get artists" });
        }
    });

    /**
     * GET /api/artists/starred
     * Get user's starred artists
     */
    router.get("/starred", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const starredItems = database.getStarredItems(req.username, 'artist');
            res.json(starredItems.map((i: any) => i.item_id));
        } catch (error) {
            console.error("Error getting starred artists:", error);
            res.status(500).json({ error: "Failed to get starred artists" });
        }
    });

    /**
     * POST /api/artists/:id/repair-links
     * Repair links for tracks and albums that should belong to this artist (ADMIN ONLY)
     */
    router.post("/:id/repair-links", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });

        try {
            const id = parseInt(req.params.id, 10);
            const artist = database.getArtist(id);
            if (!artist) return res.status(404).json({ error: "Artist not found" });

            const results = database.repairArtistLinks(id, artist.name);
            res.json({ success: true, ...results });
        } catch (error) {
            console.error("Error repairing artist links:", error);
            res.status(500).json({ error: "Failed to repair links" });
        }
    });

    /**
     * POST /api/artists/:id/star
     */
    router.post("/:id/star", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = req.params.id;
            database.starItem(req.username, 'artist', id);
            res.json({ success: true, starred: true });
        } catch (error) {
            console.error("Error starring artist:", error);
            res.status(500).json({ error: "Failed to star artist" });
        }
    });

    /**
     * DELETE /api/artists/:id/star
     */
    router.delete("/:id/star", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = req.params.id;
            database.unstarItem(req.username, 'artist', id);
            res.json({ success: true, starred: false });
        } catch (error) {
            console.error("Error unstarring artist:", error);
            res.status(500).json({ error: "Failed to unstar artist" });
        }
    });

    /**
     * POST /api/artists/:id/rating
     */
    router.post("/:id/rating", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = req.params.id;
            const { rating } = req.body;
            const r = parseInt(rating);
            if (isNaN(r) || r < 0 || r > 5) return res.status(400).json({ error: "Invalid rating" });
            database.setItemRating(req.username, 'artist', id, r);
            res.json({ success: true, rating: r });
        } catch (error) {
            console.error("Error setting artist rating:", error);
            res.status(500).json({ error: "Failed to set rating" });
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

        // Restricted admins cannot create new artists
        if (req.artistId && !req.isRootAdmin) {
            return res.status(403).json({ error: "Restricted admins cannot create new artists" });
        }

        try {
            const { name, bio, links, postParams, walletAddress } = req.body;

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

            const artistId = database.createArtist(name, bio || undefined, undefined, parsedLinks, postParams, walletAddress);
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
        const id = parseInt(req.params.id as string, 10);

        // Allow if site admin OR if it's the artist themselves
        const isSelfUpdate = req.artistId && req.artistId === id;
        if (!req.isAdmin && !isSelfUpdate) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (!req.isAdmin && !req.isActive) {
            return res.status(403).json({ error: "Account not active" });
        }
        try {
            const id = parseInt(req.params.id as string, 10);
            const { name, bio, links, postParams, walletAddress } = req.body;

            const artist = database.getArtist(id);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Permission already checked at route level: 
            // - isAdmin (site admin) can update any artist
            // - isSelfUpdate (artistId matches) can update their own

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


            // Security: Artists can update their own wallet and postParams. 
            // Site admins can set wallet if missing, but cannot change existing wallet or any postParams for others.
            let finalWalletAddress = artist.wallet_address;
            let finalPostParams = parsedPostParams;

            const isSelf = req.artistId && req.artistId === id;

            if (walletAddress !== undefined) {
                if (isSelf) {
                    finalWalletAddress = walletAddress;
                } else if (req.isAdmin) {
                    if (!artist.wallet_address) {
                        finalWalletAddress = walletAddress;
                    } else {
                        console.warn(`Attempt by admin to change existing wallet for artist ${id} blocked.`);
                        finalWalletAddress = artist.wallet_address;
                    }
                }
            }

            if (!isSelf && req.isAdmin) {
                // Admin updating another artist: never allow changing postParams
                if (artist.post_params) {
                    try {
                        finalPostParams = JSON.parse(artist.post_params);
                    } catch (e) {
                        finalPostParams = null;
                    }
                } else {
                    finalPostParams = null;
                }
            }

            database.updateArtist(id, name || undefined, bio || artist.bio || undefined, artist.photo_path || undefined, parsedLinks, finalPostParams, finalWalletAddress || undefined);

            const updatedArtist = database.getArtist(id);
            if (!updatedArtist) {
                return res.status(404).json({ error: "Artist not found after update" });
            }
            console.log(`🎤 Updated artist: ${artist.name}`);
            
            let responseLinks = null;
            if (updatedArtist.links) {
                try { responseLinks = JSON.parse(updatedArtist.links); } catch(e) {}
            }

            let responsePostParams = undefined;
            if (updatedArtist.post_params) {
                try { responsePostParams = JSON.parse(updatedArtist.post_params); } catch(e) {}
            }

            const { private_key, ...safeArtist } = updatedArtist;

            res.json({
                ...safeArtist,
                walletAddress: updatedArtist.wallet_address,
                links: responseLinks,
                postParams: responsePostParams
            });
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

            // Permission Check: Any Admin can delete artists (user said "gli admin POSSONO RIMUOVERE")
            if (!req.isAdmin) {
                return res.status(403).json({ error: "Only admins can delete artists" });
            }

            // Check if artist has releases, albums, or tracks
            const libraryAlbums = database.getAlbumsByArtist(id, false);
            const formalReleases = database.getReleasesByArtist(id, false);
            const tracks = database.getTracksByArtist(id, false);
            
            if (libraryAlbums.length > 0 || formalReleases.length > 0 || tracks.length > 0) {
                return res.status(400).json({ error: "Cannot delete artist: they have existing releases, albums, or tracks." });
            }

            // Check if artist is associated with a user account
            try {
                const isUserArtist = database.db.prepare("SELECT id FROM admin WHERE artist_id = ?").get(id);
                if (isUserArtist) {
                    return res.status(400).json({ error: "Cannot delete artist: they are associated with a user account." });
                }
            } catch (e) {
                console.error("Error checking user association:", e);
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
        const param = req.params.idOrSlug as string;
        console.log(`🔍 [Debug] GET /api/artists/${param} requested by user: ${req.username || 'guest'}, isAdmin: ${req.isAdmin}, isSuperUser: ${req.isSuperUser}`);
        try {
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

            const isAdmin = req.isAdmin || req.isSuperUser || (req.artistId && req.artistId === artist.id);

            // Get formal releases (visible to everyone if public)
            const formalReleases = database.getReleasesByArtist(artist.id, !isAdmin, artist.name);
            const publicFormalReleases = formalReleases.filter(r => r.visibility === 'public' || r.visibility === 'unlisted');

            // Get library albums (non-formal releases)
            const libraryAlbums = database.getAlbumsByArtist(artist.id, !isAdmin, artist.name);

            // Get loose tracks (tracks with no album)
            const allArtistTracks = database.getTracksByArtist(artist.id, !isAdmin, artist.name);
            const looseTracks = allArtistTracks.filter(t => !t.album_id);

            // SECURITY: If not admin and no public formal releases, library albums, or loose tracks, hide the artist entirely
            if (!isAdmin && publicFormalReleases.length === 0 && libraryAlbums.length === 0 && looseTracks.length === 0) {
                console.log(`⛔ [Security] Denying access to library-only artist ${artist.name} with no public content to non-admin user`);
                return res.status(404).json({ error: "Artist not found" });
            }

            
            // Create a Set of lowercased formal release titles to avoid duplicates
            const formalReleaseTitles = new Set(
                formalReleases.map(r => (r.title || "").toLowerCase().trim())
            );

            // Filter out library albums that have the same title as a formal release
            const filteredLibraryAlbums = libraryAlbums.filter(
                a => !formalReleaseTitles.has((a.title || "").toLowerCase().trim())
            );

            // Combine and sort by date
            const albums = [
                ...filteredLibraryAlbums.map(a => ({ ...a, is_formal_release: false })),
                ...formalReleases.map(r => ({ ...r, is_formal_release: true }))
            ].sort((a, b) => {
                const dateA = new Date(a.date || a.created_at || 0).getTime();
                const dateB = new Date(b.date || b.created_at || 0).getTime();
                return dateB - dateA;
            });

            // Get cover image from first album if artist has no photo
            let coverImage = artist.photo_path;
            if (!coverImage && albums.length > 0) {
                coverImage = albums[0].cover_path;
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
            if ((req.isAdmin || req.isSuperUser) && artist.post_params) {
                try {
                    postParams = JSON.parse(artist.post_params);
                } catch (e) { }
            }

            const username = req.username;

            // Exclude sensitive data
            const { private_key, ...safeArtist } = artist;

            res.json({
                ...safeArtist,
                links,
                postParams,
                isLibraryArtist: !!artist.isLibraryArtist,
                isReleasing: publicFormalReleases.length > 0 || formalReleases.length > 0,
                walletAddress: artist.wallet_address,
                coverImage,
                albums: albums.map(a => ({ 
                    ...a, 
                    coverImage: a.cover_path,
                    starred: username ? database.isStarred(username, 'album', String(a.id)) : false,
                    rating: username ? database.getItemRating(username, 'album', String(a.id)) : 0
                })),
                tracks: looseTracks.map(t => ({
                    ...t,
                    starred: username ? database.isStarred(username, 'track', String(t.id)) : false,
                    rating: username ? database.getItemRating(username, 'track', String(t.id)) : 0
                })),
                starred: username ? database.isStarred(username, 'artist', String(artist.id)) : false,
                rating: username ? database.getItemRating(username, 'artist', String(artist.id)) : 0
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
            const param = req.params.idOrSlug as string;
            let artist;

            if (/^\d+$/.test(param)) {
                artist = database.getArtistSimple(parseInt(param, 10));
            } else {
                artist = database.getArtistBySlug(param);
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            // Try artist photo first
            if (artist.photo_path) {
                const photoPath = path.join(musicDir, artist.photo_path);
                console.log(`🖼️ [Debug] Serving artist cover: ${photoPath}`);
                if (await fs.pathExists(photoPath)) {
                    // Use res.sendFile to handle ETag/Last-Modified and correct Content-Type automatically
                    // Cache for 24 hours (86400000ms)
                    return res.sendFile(path.resolve(photoPath), { maxAge: 86400000 }, (err) => {
                        if (err) console.error(`❌ [Debug] Error sending file: ${err}`);
                    });
                } else {
                    console.warn(`⚠️ [Debug] Artist photo not found at: ${photoPath}`);
                }
            }

            // Fallback to formal release or album cover
            const coverPaths = database.getArtistCovers(artist.id);
            
            for (const relPath of coverPaths) {
                const coverPath = path.join(musicDir, relPath);
                if (await fs.pathExists(coverPath)) {
                    return res.sendFile(path.resolve(coverPath), { maxAge: 86400000 });
                }
            }

            // Fallback: Return SVG placeholder instead of 404
            const svg = getPlaceholderSVG(artist.name);
            res.setHeader("Content-Type", "image/svg+xml");
            // Also reduce cache for placeholder so if an image IS uploaded, it shows up
            res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
            res.send(svg);
            // res.status(404).json({ error: "No cover found" });
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

            const isAdmin = (req as any).isAdmin === true;
            // Use SQL filtering for public posts if user is not admin
            const posts = database.getPostsByArtist(artist.id, !isAdmin);

            // Map snake_case to camelCase for frontend and filter by visibility
            const mappedPosts = posts
                .filter(p => p.visibility === 'public' || isAdmin) // (AuthenticatedRequest cast for safety)
                .map(p => ({
                    id: p.id,
                    slug: p.slug,
                    content: p.content,
                    artistId: p.artist_id,
                    artistName: p.artist_name,
                    artistSlug: p.artist_slug,
                    artistAvatar: p.artist_photo,
                    createdAt: p.created_at,
                    visibility: p.visibility,
                    isPublic: p.visibility === 'public'
                }));
            res.json(mappedPosts);

        } catch (error) {
            console.error("Error getting artist posts:", error);
            res.status(500).json({ error: "Failed to get artist posts" });
        }
    });

    return router;
}

