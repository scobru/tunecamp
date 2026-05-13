import { Router } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { ZenDBService } from "../../modules/network/zendb.service.js";

export function createPlaylistsRoutes(database: DatabaseService, zendbService?: ZenDBService): Router {
    const router = Router();

    /**
     * GET /api/playlists
     * List all playlists
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const genres = database.getGenres(!(req.isAdmin || req.isSuperUser));
            const genreCounts = database.getGenreTrackCounts(!(req.isAdmin || req.isSuperUser));
            
            const dynamicPlaylists = genres.map(genre => ({
                id: `genre:${genre}`,
                name: `${genre.charAt(0).toUpperCase() + genre.slice(1)} Mix`,
                username: "system",
                description: `Dynamic playlist for ${genre}`,
                isPublic: true,
                coverPath: null,
                created_at: new Date().toISOString(),
                trackCount: genreCounts.get(genre.toLowerCase()) || 0 
            }));

            if (req.isAdmin || req.isSuperUser) {
                res.json([...database.getPlaylists(), ...dynamicPlaylists]);
            } else if (req.username) {
                const myPlaylists = database.getPlaylists(req.username, false);
                const publicPlaylists = database.getPlaylists(undefined, true);
                
                const seenIds = new Set(myPlaylists.map(p => p.id));
                const combined = [...myPlaylists];
                for (const p of publicPlaylists) {
                    if (!seenIds.has(p.id)) {
                        combined.push(p);
                    }
                }
                res.json([...combined, ...dynamicPlaylists]);
            } else {
                res.json([...database.getPlaylists(undefined, true), ...dynamicPlaylists]);
            }
        } catch (error) {
            console.error("Error getting playlists:", error);
            res.status(500).json({ error: "Failed to get playlists" });
        }
    });

    /**
     * POST /api/playlists
     * Create new playlist
     */
    router.post("/", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
        try {
            const { name, description, isPublic } = req.body;

            if (!name || typeof name !== "string") {
                return res.status(400).json({ error: "Name is required" });
            }

            const username = req.username || "admin";
            const id = database.createPlaylist(name, username, description, !!isPublic);
            

            
            res.status(201).json({ id, name, username, description, isPublic: !!isPublic });
        } catch (error) {
            console.error("Error creating playlist:", error);
            res.status(500).json({ error: "Failed to create playlist" });
        }
    });

    /**
     * PUT /api/playlists/:id
     * Update playlist (rename, visibility, cover)
     */
    router.put("/:id", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
        
        const idStr = req.params.id as string;
        if (idStr.startsWith("genre:")) {
            return res.status(403).json({ error: "Cannot modify dynamic genre playlists" });
        }

        try {
            const id = parseInt(idStr, 10);
            const playlist = database.getPlaylist(id);
            if (!playlist) return res.status(404).json({ error: "Playlist not found" });
            
            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            const { isPublic, coverPath } = req.body;

            if (isPublic !== undefined) {
                database.updatePlaylistVisibility(id, isPublic);
            }
            if (coverPath !== undefined) {
                database.updatePlaylistCover(id, coverPath || null);
            }



            res.json({ message: "Playlist updated" });
        } catch (error) {
            console.error("Error updating playlist:", error);
            res.status(500).json({ error: "Failed to update playlist" });
        }
    });

    /**
     * GET /api/playlists/:id
     * Get playlist with tracks
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const idStr = req.params.id as string;
            
            // Handle dynamic genre playlists
            if (idStr.startsWith("genre:")) {
                const genre = idStr.replace("genre:", "");
                const tracks = database.getTracksByGenre(genre, !(req.isAdmin || req.isSuperUser));
                const genreCounts = database.getGenreTrackCounts(!(req.isAdmin || req.isSuperUser));
                
                return res.json({
                    id: idStr,
                    name: `${genre.charAt(0).toUpperCase() + genre.slice(1)} Mix`,
                    username: "system",
                    description: `Dynamic playlist for ${genre}`,
                    isPublic: true,
                    coverPath: null,
                    created_at: new Date().toISOString(),
                    trackCount: genreCounts.get(genre.toLowerCase()) || tracks.length,
                    tracks,
                });
            }

            const id = parseInt(idStr, 10);
            const playlist = database.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && !req.isSuperUser && !playlist.isPublic) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const tracks = database.getPlaylistTracks(id);

            res.json({
                ...playlist,
                tracks,
            });
        } catch (error) {
            console.error("Error getting playlist:", error);
            res.status(500).json({ error: "Failed to get playlist" });
        }
    });

    /**
     * DELETE /api/playlists/:id
     * Delete playlist
     */
    router.delete("/:id", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
        try {
            const id = parseInt(req.params.id as string, 10);
            const playlist = database.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            database.deletePlaylist(id);

            
            res.json({ message: "Playlist deleted" });
        } catch (error) {
            console.error("Error deleting playlist:", error);
            res.status(500).json({ error: "Failed to delete playlist" });
        }
    });

    /**
     * POST /api/playlists/:id/tracks
     * Add track to playlist
     */
    router.post("/:id/tracks", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
        try {
            const playlistId = parseInt(req.params.id as string, 10);
            let { trackId, metadata } = req.body;

            let actualTrackId: number;

            // Handle trackId as string or number
            if (typeof trackId === "string") {
                actualTrackId = parseInt(trackId, 10);
                if (isNaN(actualTrackId)) {
                    if (trackId.startsWith("ext:") || trackId.startsWith("http")) {
                        const existing = database.getTrackByExternalId(trackId);
                        if (existing) {
                            actualTrackId = existing.id;
                        } else if (metadata) {
                            const { title, artist, coverUrl, duration } = metadata;
                            if (!title) {
                                return res.status(400).json({ error: "Title required in metadata to link external track" });
                            }

                            let artistId = null;
                            if (artist) {
                                const a = database.getArtistByName(artist);
                                artistId = a ? a.id : database.createArtist(artist);
                            }

                            actualTrackId = database.createTrack({
                                title,
                                artist_id: artistId,
                                artist_name: artist || null,
                                owner_id: req.userId || null,
                                album_id: null,
                                track_num: 1,
                                duration: duration || 0,
                                external_id: trackId,
                                external_artwork: coverUrl || null,
                                service: trackId.startsWith("ext:") ? trackId.split(":")[1] : "link",
                                url: trackId,
                                file_path: null, format: null, bitrate: null, sample_rate: null, lossless_path: null,
                                price: 0, price_usdc: 0, currency: 'ETH', waveform: null, lyrics: null
                            });
                        } else {
                            return res.status(400).json({ error: "External track not found in library, metadata required to add." });
                        }
                    } else {
                        return res.status(400).json({ error: "Invalid trackId format" });
                    }
                }
            } else {
                actualTrackId = trackId;
            }

            if (!actualTrackId || isNaN(actualTrackId)) {
                return res.status(400).json({ error: "trackId is required" });
            }

            const playlist = database.getPlaylist(playlistId);
            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            const track = database.getTrack(actualTrackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // SECURITY: Prevent adding private tracks to playlists unless you're the owner or an admin
            if (!req.isAdmin && track.album_id) {
                const album = database.getAlbum(track.album_id);
                const isOwner = track.owner_id === req.userId || (track.artist_id && track.artist_id === req.artistId);
                
                if (album && album.visibility === 'private' && !isOwner) {
                    console.warn(`🛑 [Playlist] User ${req.username} tried to add private track ${actualTrackId} from album ${album.id} to playlist ${playlistId}`);
                    return res.status(403).json({ error: "Cannot add private tracks you don't own to a playlist" });
                }
            }

            database.addTrackToPlaylist(playlistId, actualTrackId);



            res.json({ message: "Track added to playlist" });
        } catch (error) {
            console.error("Error adding track to playlist:", error);
            res.status(500).json({ error: "Failed to add track" });
        }
    });

    /**
     * DELETE /api/playlists/:id/tracks/:trackId
     * Remove track from playlist
     */
    router.delete("/:id/tracks/:trackId", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isAdmin && !req.isActive) return res.status(403).json({ error: "Account not active" });
        try {
            const playlistId = parseInt(req.params.id as string, 10);
            const trackId = parseInt(req.params.trackId as string, 10);

            const playlist = database.getPlaylist(playlistId);
            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }
            
            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            database.removeTrackFromPlaylist(playlistId, trackId);



            res.json({ message: "Track removed from playlist" });
        } catch (error) {
            console.error("Error removing track from playlist:", error);
            res.status(500).json({ error: "Failed to remove track" });
        }
    });

    return router;
}

