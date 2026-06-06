import { Router, json } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import path from "path";
import fs from "fs-extra";
import { getPlaceholderSVG } from "../../../utils/audioUtils.js";
import { VisibilityGuardian, VisibilityProfile, Capability } from "../../common/visibility.js";
import type { MetadataService } from "../../modules/catalog/metadata.service.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
import type { DiscoveryService } from "../../modules/catalog/discovery.service.js";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import type { ServiceContainer } from "../../core/container.js";

/**
 * Artists Routes — Handles artist profile discovery and content listings.
 * Refactored to separate Discovery (Read) from Catalog (Write).
 */
export function createArtistsRoutes(container: ServiceContainer): Router {
    const musicDir: ServiceContainer['musicDir'] = (container as any).musicDir || (container as any);
    const metadataService: ServiceContainer['metadataService'] = (container as any).metadataService || (container as any);
    const catalogService: ServiceContainer['catalogService'] = (container as any).catalogService || (container as any);
    const discoveryService: ServiceContainer['discoveryService'] = (container as any).discoveryService || (container as any);
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const social: ServiceContainer['social'] = (container as any).social || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const router = Router();
    router.use(json());

    /**
     * GET /api/artists
     * List all artists (for admin) or only those with public releases (for non-admin)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const isAdmin = req.isAdmin || req.isSuperUser;
            
            // Fetch all artists so that we can check if they have public content
            // even if their default visibility in the artists table is 'private' (default from scanner)
            const allArtists = library.getArtists(VisibilityProfile.ALL_ACCESS);
            const username = req.username;

            // 1. Determine which artists have PUBLIC formal releases
            const publicReleases = library.getReleases(VisibilityProfile.PUBLIC_STAGE);
            const formalReleaseArtistIds = new Set(
                publicReleases.map(r => r.artist_id).filter(id => id !== null)
            );

            // 2. Determine which artists have PUBLIC library albums
            const publicAlbums = library.getAlbums(VisibilityProfile.PUBLIC_STAGE);
            const publicAlbumArtistIds = new Set(
                publicAlbums.map(a => a.artist_id).filter(id => id !== null)
            );

            // 3. Determine which artists have PUBLIC tracks
            const publicTracks = library.getTracks(undefined, VisibilityProfile.PUBLIC_STAGE);
            const publicTrackArtistIds = new Set(
                publicTracks.map(t => t.artist_id).filter(id => id !== null)
            );

            // 4. Determine which artists are STARRED by the user
            const starredItems = username ? social.getStarredItems(username, 'artist') : [];
            const starredArtistIds = new Set(starredItems.map((i: any) => parseInt(i.item_id, 10)).filter(id => !isNaN(id)));

            const filtered = allArtists.filter(artist => {
                if (isAdmin) return true;
                if (req.artistId && artist.id === req.artistId) return true;
                if (artist.visibility === 'public' || artist.visibility === 'unlisted') return true;
                if (formalReleaseArtistIds.has(artist.id)) return true;
                if (publicAlbumArtistIds.has(artist.id)) return true;
                if (publicTrackArtistIds.has(artist.id)) return true;
                if (starredArtistIds.has(artist.id)) return true;
                return false;
            });

            res.json(filtered.map(a => ({
                ...a,
                coverImage: `/api/artists/${a.id}/cover`,
                starred: username ? social.isStarred(username, 'artist', String(a.id)) : false,
                rating: username ? social.getItemRating(username, 'artist', String(a.id)) : 0
            })));
        } catch (error) {
            console.error("Error getting artists:", error);
            res.status(500).json({ error: "Failed to fetch artists" });
        }
    });

    /**
     * POST /api/artists
     * Create a new artist profile (Admin only)
     */
    router.post("/", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        try {
            const { name, bio, photoPath, walletAddress, externalLinks, status } = req.body;
            if (!name) {
                return res.status(400).json({ error: "Artist name is required" });
            }
            const newArtistId = library.createArtist(name, bio, photoPath, walletAddress, externalLinks, status);
            res.status(201).json({ id: newArtistId, name, bio });
        } catch (error) {
            console.error("Error creating artist:", error);
            res.status(500).json({ error: "Failed to create artist" });
        }
    });

    /**
     * PUT /api/artists/:id
     * Update an artist profile (Admin or self only)
     */
    router.put("/:id", async (req: AuthenticatedRequest, res) => {
        if (!req.username) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: "Invalid artist ID" });
            }

            const artist = library.getArtist(id);
            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

            const isAdmin = req.isAdmin || req.isSuperUser;
            const isSelf = req.artistId && req.artistId === id;

            if (!isAdmin && !isSelf) {
                return res.status(403).json({ error: "Forbidden: You can only edit your own profile" });
            }

            const { name, bio, photoPath, links, postParams, walletAddress, visibility } = req.body;

            library.updateArtist(
                id,
                name,
                bio,
                photoPath,
                links ? (typeof links === 'string' ? JSON.parse(links) : links) : undefined,
                postParams ? (typeof postParams === 'string' ? JSON.parse(postParams) : postParams) : undefined,
                walletAddress,
                visibility
            );

            const updated = library.getArtist(id);
            res.json(updated);
        } catch (error) {
            console.error("Error updating artist:", error);
            res.status(500).json({ error: "Failed to update artist" });
        }
    });

    /**
     * GET /api/artists/starred
     * Get user's starred artists
     */
    router.get("/starred", async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const starredItems = social.getStarredItems(req.username, 'artist');
            // Return IDs for easy lookup
            res.json(starredItems.map((i: any) => i.item_id));
        } catch (error) {
            console.error("Error getting starred artists:", error);
            res.status(500).json({ error: "Failed to fetch starred artists" });
        }
    });

    /**
     * GET /api/artists/:id
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.id;
            let artist;
            
            if (isNaN(parseInt(param))) {
                artist = library.getArtistBySlug(param);
            } else {
                artist = library.getArtist(parseInt(param));
            }

            if (!artist) {
                return res.status(404).json({ error: "Artist not found" });
            }

             const isAdmin = req.isAdmin || req.isSuperUser || (req.artistId && req.artistId === artist.id);
             const username = req.username;
 
             // Get formal releases (visible to everyone if public)
             const formalReleases = library.getReleasesByArtist(artist.id, isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE, artist.name);
             const publicFormalReleases = formalReleases.filter(r => r.visibility === 'public' || r.visibility === 'unlisted');
 
             // Get all library albums (non-formal releases) - fetch with ALL_ACCESS if we need to filter starred items, or just PUBLIC_STAGE otherwise
             const allLibraryAlbums = library.getAlbumsByArtist(artist.id, VisibilityProfile.ALL_ACCESS, artist.name);
 
             // Get starred items for user to enable visibility override
             const starredAlbums = username ? social.getStarredItems(username, 'album') : [];
             const starredAlbumIds = new Set(starredAlbums.map((i: any) => parseInt(i.item_id, 10)).filter(id => !isNaN(id)));
 
             const starredTracks = username ? social.getStarredItems(username, 'track') : [];
             const starredTrackIds = new Set(starredTracks.map((i: any) => parseInt(i.item_id, 10)).filter(id => !isNaN(id)));
 
             const allArtistTracks = library.getTracksByArtist(artist.id, VisibilityProfile.ALL_ACCESS, artist.name);
             const starredTrackAlbumIds = new Set(
                 allArtistTracks.filter(t => starredTrackIds.has(t.id)).map(t => t.album_id).filter(id => id !== null)
             );
 
             // Filter library albums based on visibility and starred status
             const libraryAlbums = allLibraryAlbums.filter(album => {
                 if (isAdmin) return true;
                 if (album.visibility === 'public' || album.visibility === 'unlisted') return true;
                 if (req.userId && album.owner_id === req.userId) return true;
                 if (starredAlbumIds.has(album.id)) return true;
                 if (starredTrackAlbumIds.has(album.id)) return true;
                 return false;
             });
 
             // Filter loose tracks based on visibility and starred status
             const looseTracks = allArtistTracks.filter(track => {
                 if (track.album_id) return false; // not loose track
                 if (isAdmin) return true;
                 const trackVisibility = (track as any).visibility || 'public';
                 if (trackVisibility === 'public' || trackVisibility === 'unlisted') return true;
                 if (req.userId && (track as any).owner_id === req.userId) return true;
                 if (starredTrackIds.has(track.id)) return true;
                 return false;
             });
 
             res.json({
                 ...artist,
                 coverImage: `/api/artists/${artist.id}/cover`,
                 releases: publicFormalReleases.map(r => ({ ...r, coverImage: r.cover_path })),
                 albums: libraryAlbums.map(a => ({ ...a, coverImage: a.cover_path })),
                 tracks: looseTracks,
                 starred: req.username ? social.isStarred(req.username, 'artist', String(artist.id)) : false,
                 rating: req.username ? social.getItemRating(req.username, 'artist', String(artist.id)) : 0
             });
         } catch (error) {
             console.error("Error getting artist:", error);
             res.status(500).json({ error: "Failed to fetch artist" });
         }
     });

    /**
     * GET /api/artists/:id/cover
     */
    router.get("/:id/cover", (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const artist = library.getArtist(id);
            
            let photoPathToUse = artist?.photo_path;
            
            // Fallback: If no custom artist photo, try to find cover art from their releases, albums, or tracks
            if (artist && !photoPathToUse) {
                // 1. Try formal releases
                const releases = library.getReleasesByArtist(artist.id, VisibilityProfile.ALL_ACCESS);
                const releaseWithCover = releases.find(r => r.cover_path);
                if (releaseWithCover) {
                    photoPathToUse = releaseWithCover.cover_path;
                } else {
                    // 2. Try library albums
                    const albums = library.getAlbumsByArtist(artist.id, VisibilityProfile.ALL_ACCESS);
                    const albumWithCover = albums.find(a => a.cover_path);
                    if (albumWithCover) {
                        photoPathToUse = albumWithCover.cover_path;
                    } else {
                        // 3. Try tracks
                        const tracks = library.getTracksByArtist(artist.id, VisibilityProfile.ALL_ACCESS);
                        const trackWithCover = tracks.find(t => t.external_artwork);
                        if (trackWithCover) {
                            photoPathToUse = trackWithCover.external_artwork;
                        }
                    }
                }
            }
            
            if (photoPathToUse) {
                if (photoPathToUse.startsWith('http')) {
                    return res.redirect(photoPathToUse);
                }
                const photoPath = path.join(musicDir, photoPathToUse);
                if (fs.existsSync(photoPath)) {
                    return res.sendFile(path.resolve(photoPath), { maxAge: 86400000 });
                }
            }
            
            // Generate placeholder
            const svg = getPlaceholderSVG(artist?.name || "Unknown");
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.send(svg);
        } catch (e) {
            res.status(500).send("Error loading cover");
        }
    });

    /**
     * POST /api/artists/:id/star
     */
    router.post("/:id/star", async (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        const id = parseInt(req.params.id);
        
        const artist = library.getArtist(id);
        if (!artist) return res.status(404).json({ error: "Artist not found" });

        if (req.context && !VisibilityGuardian.can(req.context, Capability.VIEW_PRIVATE_LIBRARY)) {
            const isPublic = artist.visibility === 'public' || artist.visibility === 'unlisted';
            // Also check if they have at least one formal release to be considered "Public Stage"
            const hasFormalRelease = library.getReleasesByArtist(artist.id).length > 0;
            if (!isPublic || !hasFormalRelease) {
                return res.status(403).json({ error: "You can only favorite public artists" });
            }
        }

        social.starItem(req.username, 'artist', String(id));
        res.json({ success: true, starred: true });
    });

    /**
     * DELETE /api/artists/:id/star
     */
    router.delete("/:id/star", async (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        const id = parseInt(req.params.id);
        social.unstarItem(req.username, 'artist', String(id));
        res.json({ success: true, starred: false });
    });

    /**
     * GET /api/artists/:id/posts
     */
    router.get("/:id/posts", async (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.id;
            let artist;
            
            if (isNaN(parseInt(param))) {
                artist = library.getArtistBySlug(param);
            } else {
                artist = library.getArtist(parseInt(param));
            }

            if (!artist) return res.status(404).json({ error: "Artist not found" });

            const isAdmin = (req as any).isAdmin === true;
            const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
            const posts = social.getPostsByArtist(artist.id, profile);
            
            const mappedPosts = posts.map(p => ({
                ...p,
                artistId: p.artist_id,
                createdAt: p.created_at,
                publishedAt: p.published_at,
                updatedAt: p.created_at, // fallback
                artistName: artist.name,
                artistSlug: artist.slug,
                artistPhoto: artist.photo_path
            }));
            
            res.json(mappedPosts);

        } catch (error) {
            console.error("Error getting artist posts:", error);
            res.status(500).json({ error: "Failed to get artist posts" });
        }
    });

    /**
     * POST /api/artists/:id/repair-links
     * Internal tool to fix tracks/albums not linked to their artist record
     */
    router.post("/:id/repair-links", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Forbidden" });
        
        const id = parseInt(req.params.id);
        const artist = library.getArtist(id);
        if (!artist) return res.status(404).json({ error: "Artist not found" });

        console.log(`🔧 [Repair] Repairing links for artist: ${artist.name} (#${artist.id})`);
        const results = library.repairArtistLinks(artist.id, artist.name);
        
        res.json({ 
            success: true, 
            message: `Linked ${results.tracks} tracks and ${results.albums} albums to artist ${artist.name}`,
            ...results
        });
    });

    /**
     * DELETE /api/artists/:id
     * Delete artist and un-link their content (Admin only)
     */
    router.delete("/:id", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Forbidden" });
        
        const id = parseInt(req.params.id);
        const artist = library.getArtist(id);
        if (!artist) return res.status(404).json({ error: "Artist not found" });

        try {
            // Check if artist has releases, albums, or tracks
            const libraryAlbums = library.getAlbumsByArtist(id, VisibilityProfile.ALL_ACCESS);
            const formalReleases = library.getReleasesByArtist(id, VisibilityProfile.ALL_ACCESS);
            const tracks = library.getTracksByArtist(id, VisibilityProfile.ALL_ACCESS);

            if (libraryAlbums.length > 0 || formalReleases.length > 0 || tracks.length > 0) {
                return res.status(400).json({ 
                    error: "Cannot delete artist: they still have associated content. Un-link or delete content first.",
                    counts: { albums: libraryAlbums.length, releases: formalReleases.length, tracks: tracks.length }
                });
            }

            // Check if artist is associated with a user account
            try {
                const user = (database as any).db.prepare("SELECT username FROM admin WHERE artist_id = ?").get(id);
                if (user) {
                    return res.status(400).json({ error: "Cannot delete artist: they are associated with a user account." });
                }
            } catch (e) {
                console.error("Error checking user association:", e);
            }

            library.deleteArtist(id);
            res.json({ success: true, message: `Artist ${artist.name} deleted` });

        } catch (error) {
            console.error("Error deleting artist:", error);
            res.status(500).json({ error: "Failed to delete artist" });
        }
    });

    return router;
}
