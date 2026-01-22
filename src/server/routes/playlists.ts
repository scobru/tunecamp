import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createPlaylistsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/playlists
     * List all playlists
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const isPublicOnly = !req.isAdmin;
            const playlists = database.getPlaylists(isPublicOnly);
            res.json(playlists);
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
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { name, description } = req.body;

            if (!name || typeof name !== "string") {
                return res.status(400).json({ error: "Name is required" });
            }

            const id = database.createPlaylist(name, description);
            res.status(201).json({ id, name, description });
        } catch (error) {
            console.error("Error creating playlist:", error);
            res.status(500).json({ error: "Failed to create playlist" });
        }
    });

    /**
     * PUT /api/playlists/:id
     * Update playlist (rename, visibility)
     */
    router.put("/:id", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = parseInt(req.params.id as string, 10);
            const { isPublic } = req.body;

            // For now only supports toggling visibility
            if (isPublic !== undefined) {
                database.updatePlaylistVisibility(id, isPublic);
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
            const id = parseInt(req.params.id as string, 10);
            const playlist = database.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && !playlist.is_public) {
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
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = parseInt(req.params.id as string, 10);
            const playlist = database.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
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
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        try {
            const playlistId = parseInt(req.params.id as string, 10);
            const { trackId } = req.body;

            if (!trackId || typeof trackId !== "number") {
                return res.status(400).json({ error: "trackId is required" });
            }

            const playlist = database.getPlaylist(playlistId);
            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            const track = database.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            database.addTrackToPlaylist(playlistId, trackId);
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
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });
        try {
            const playlistId = parseInt(req.params.id as string, 10);
            const trackId = parseInt(req.params.trackId as string, 10);

            database.removeTrackFromPlaylist(playlistId, trackId);
            res.json({ message: "Track removed from playlist" });
        } catch (error) {
            console.error("Error removing track from playlist:", error);
            res.status(500).json({ error: "Failed to remove track" });
        }
    });

    return router;
}
