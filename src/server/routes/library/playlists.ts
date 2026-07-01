import { Router, json } from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import type { DatabaseService } from "../../core/database.js";
import { VisibilityProfile, VisibilityGuardian, Capability, UserRole, canConsumeTrack } from "../../common/visibility.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { mapTrackDTO } from "../../modules/catalog/catalog.mappers.js";
import { resolveSafePath } from "../../../utils/fileUtils.js";

import type { ServiceContainer } from "../../core/container.js";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

export function createPlaylistsRoutes(container: ServiceContainer): Router {
    const library = container.library;
    const database = container.database;
    const config = container.config;
    const router = Router();
    router.use(json());

    const coverUpload = multer({
        storage: multer.memoryStorage(),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, IMAGE_EXTENSIONS.includes(ext));
        },
        limits: { fileSize: 10 * 1024 * 1024 },
    });

    // Lazy DB lookups for canConsumeTrack (arrow-wrapped to preserve `this`).
    const trackLookups = {
        getRelease: (id: number) => library.getRelease(id),
        getAlbum: (id: number) => library.getAlbum(id),
        isTrackInPublicPlaylist: (id: number) => library.isTrackInPublicPlaylist(id),
    };

    /**
     * GET /api/playlists
     * List all playlists
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        // Playlists are a members-only feature: no anonymous access
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const isAdmin = req.isAdmin || req.isSuperUser;
            const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
            
            const genres = library.getGenres(profile);
            const genreCounts = library.getGenreTrackCounts(profile);
            
            const dynamicPlaylists = genres.map(genre => {
                const rawTracks = library.getTracksByGenre(genre, profile);
                const trackCovers = Array.from(
                    new Map(
                        rawTracks
                            .filter((t: any) => t.album_id || t.albumId)
                            .map((t: any) => [t.album_id ?? t.albumId, `/api/tracks/${t.id}/cover`])
                    ).values()
                ).slice(0, 4);

                return {
                    id: `genre:${genre}`,
                    name: `${genre.charAt(0).toUpperCase() + genre.slice(1)} Mix`,
                    username: "system",
                    description: `Dynamic playlist for ${genre}`,
                    isPublic: true,
                    coverPath: null,
                    created_at: new Date().toISOString(),
                    trackCount: genreCounts.get(genre.toLowerCase()) || 0,
                    trackCovers
                };
            });

            if (req.isAdmin || req.isSuperUser) {
                const playlists = library.getPlaylists(undefined, VisibilityProfile.ALL_ACCESS);
                const mappedPlaylists = playlists.map(p => {
                    const tracks = library.getPlaylistTracks(Number(p.id));
                    const trackCovers = Array.from(
                        new Map(
                            tracks
                                .filter((t: any) => t.album_id || t.albumId)
                                .map((t: any) => [t.album_id ?? t.albumId, `/api/tracks/${t.id}/cover`])
                        ).values()
                    ).slice(0, 4);
                    return { ...p, trackCovers };
                });
                res.json([...mappedPlaylists, ...dynamicPlaylists]);
            } else {
                const myPlaylists = library.getPlaylists(req.username, VisibilityProfile.ALL_ACCESS);
                const publicPlaylists = library.getPlaylists(undefined, VisibilityProfile.PUBLIC_STAGE);

                const seenIds = new Set(myPlaylists.map(p => p.id));
                const combined = [...myPlaylists];
                for (const p of publicPlaylists) {
                    if (!seenIds.has(p.id)) {
                        combined.push(p);
                    }
                }
                const mappedPlaylists = combined.map(p => {
                    const tracks = library.getPlaylistTracks(Number(p.id));
                    const trackCovers = Array.from(
                        new Map(
                            tracks
                                .filter((t: any) => t.album_id || t.albumId)
                                .map((t: any) => [t.album_id ?? t.albumId, `/api/tracks/${t.id}/cover`])
                        ).values()
                    ).slice(0, 4);
                    return { ...p, trackCovers };
                });
                res.json([...mappedPlaylists, ...dynamicPlaylists]);
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
            const id = library.createPlaylist(name, username, description, !!isPublic);
            

            
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
            const playlist = library.getPlaylist(id);
            if (!playlist) return res.status(404).json({ error: "Playlist not found" });
            
            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            const { isPublic, coverPath, name, description } = req.body;

            if (isPublic !== undefined) {
                library.updatePlaylistVisibility(id, isPublic);
            }
            if (coverPath !== undefined) {
                library.updatePlaylistCover(id, coverPath || null);
            }
            if (name !== undefined || description !== undefined) {
                const trimmedName = typeof name === "string" ? name.trim() : undefined;
                if (trimmedName !== undefined && trimmedName.length === 0) {
                    return res.status(400).json({ error: "Name cannot be empty" });
                }
                library.updatePlaylistDetails(id, trimmedName, description);
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
        // Playlists are a members-only feature: no anonymous access
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const idStr = req.params.id as string;
            
            // Handle dynamic genre playlists
            if (idStr.startsWith("genre:")) {
                const genre = idStr.replace("genre:", "");
                const isAdmin = req.isAdmin || req.isSuperUser;
                const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;

                const rawTracks = library.getTracksByGenre(genre, profile);
                const genreCounts = library.getGenreTrackCounts(profile);
                const tracks = rawTracks.map(t => mapTrackDTO(t, database, req.username));

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
            const playlist = library.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && !req.isSuperUser && !playlist.isPublic && playlist.username !== req.username) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            const tracks = library.getPlaylistTracks(id).map(t => mapTrackDTO(t, database, req.username));

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
            const playlist = library.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            library.deletePlaylist(id);

            
            res.json({ message: "Playlist deleted" });
        } catch (error) {
            console.error("Error deleting playlist:", error);
            res.status(500).json({ error: "Failed to delete playlist" });
        }
    });

    /**
     * GET /api/playlists/:id/cover
     * Serve the playlist cover image (or 404 if none set).
     */
    router.get("/:id/cover", async (req: AuthenticatedRequest, res: any) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const playlist = library.getPlaylist(id);
            if (!playlist?.coverPath) return res.status(404).end();

            if (playlist.coverPath.startsWith("http")) return res.redirect(playlist.coverPath);

            const abs = resolveSafePath(config.musicDir, playlist.coverPath);
            if (abs && await fs.pathExists(abs)) {
                return res.sendFile(abs, { maxAge: 86400000 });
            }
            return res.status(404).end();
        } catch {
            res.status(500).end();
        }
    });

    /**
     * POST /api/playlists/:id/cover
     * Upload a custom cover image for a playlist (admin or owner).
     */
    router.post("/:id/cover", coverUpload.single("file"), async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id = parseInt(req.params.id as string, 10);
            const playlist = library.getPlaylist(id);
            if (!playlist) return res.status(404).json({ error: "Playlist not found" });
            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) return res.status(400).json({ error: "No file uploaded" });

            const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
            const coversDir = path.join(config.musicDir, "playlists", "covers");
            await fs.ensureDir(coversDir);

            const filename = `${id}-${crypto.randomBytes(4).toString("hex")}${ext}`;
            const dest = path.join(coversDir, filename);
            await fs.writeFile(dest, file.buffer);

            const relativePath = path.join("playlists", "covers", filename);
            library.updatePlaylistCover(id, relativePath);

            res.json({ coverPath: `/api/playlists/${id}/cover` });
        } catch (err: any) {
            console.error("[Playlists] Cover upload failed:", err);
            res.status(500).json({ error: "Cover upload failed" });
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
                        const existing = library.getTrackByExternalId(trackId);
                        if (existing) {
                            actualTrackId = existing.id;
                        } else if (metadata) {
                            const { title, artist, coverUrl, duration } = metadata;
                            if (!title) {
                                return res.status(400).json({ error: "Title required in metadata to link external track" });
                            }

                            let artistId = null;
                            if (artist) {
                                const a = library.getArtistByName(artist);
                                artistId = a ? a.id : library.createArtist(artist);
                            }

                            actualTrackId = library.createTrack({
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

            const playlist = library.getPlaylist(playlistId);
            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            const track = library.getTrack(actualTrackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // SECURITY: Prevent adding tracks the user can't consume (private-library
            // tracks they don't own) to a playlist. Same rule as stream/download.
            if (!canConsumeTrack(track, req.context || { role: UserRole.GUEST }, trackLookups)) {
                console.warn(`🛑 [Playlist] User ${req.username} tried to add track ${actualTrackId} they cannot consume to playlist ${playlistId}`);
                return res.status(403).json({ error: "Cannot add private tracks you don't own to a playlist" });
            }

            library.addTrackToPlaylist(playlistId, actualTrackId);



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

            const playlist = library.getPlaylist(playlistId);
            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }
            
            if (!req.isAdmin && playlist.username !== req.username) {
                return res.status(403).json({ error: "Not your playlist" });
            }

            library.removeTrackFromPlaylist(playlistId, trackId);



            res.json({ message: "Track removed from playlist" });
        } catch (error) {
            console.error("Error removing track from playlist:", error);
            res.status(500).json({ error: "Failed to remove track" });
        }
    });

    return router;
}

