import { Router } from "express";
import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { resolveFile } from "../utils/pathHelper.js";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

export function createTracksRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/tracks
     * List all tracks (ADMIN ONLY)
     */
    /**
     * GET /api/tracks
     * List all tracks (ADMIN ONLY)
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            // Tracks list is admin only
            if (!req.isAdmin) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const allTracks = database.getTracks();
            res.json(allTracks);
        } catch (error) {
            console.error("Error getting tracks:", error);
            res.status(500).json({ error: "Failed to get tracks" });
        }
    });

    /**
     * GET /api/tracks/:id/lyrics
     * Get track lyrics from metadata
     */
    router.get("/:id/lyrics", async (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            const trackPath = resolveFile(track.file_path);
            if (!trackPath) {
                return res.status(404).json({ error: "File not found" });
            }

            const metadata = await parseFile(trackPath);
            const lyrics = metadata.common.lyrics;

            res.json({ lyrics: lyrics || [] });
        } catch (error) {
            console.error("Error getting lyrics:", error);
            res.status(500).json({ error: "Failed to get lyrics" });
        }
    });

    /**
     * GET /api/tracks/:id
     * Get track details
     */
    router.get("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Check album visibility for non-admin
            if (!req.isAdmin && track.album_id) {
                const album = database.getAlbum(track.album_id);
                if (album && !album.is_public) {
                    return res.status(404).json({ error: "Track not found" });
                }
            }

            res.json(track);
        } catch (error) {
            console.error("Error getting track:", error);
            res.status(500).json({ error: "Failed to get track" });
        }
    });

    /**
     * GET /api/tracks/:id/stream
     * Stream audio file with range support
     */
    router.get("/:id/stream", (req: AuthenticatedRequest, res) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Note: Track streaming is allowed regardless of album visibility
            // This allows users to play tracks they have direct links to

            const trackPath = resolveFile(track.file_path);
            if (!trackPath) {
                return res.status(404).json({ error: "Audio file not found" });
            }

            const stat = fs.statSync(trackPath);
            const fileSize = stat.size;
            const range = req.headers.range;

            // Determine content type
            const ext = path.extname(trackPath).toLowerCase();
            const contentTypes: Record<string, string> = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".ogg": "audio/ogg",
                ".wav": "audio/wav",
                ".m4a": "audio/mp4",
                ".aac": "audio/aac",
                ".opus": "audio/opus",
            };
            const contentType = contentTypes[ext] || "audio/mpeg";

            // Transcoding support
            const targetFormat = req.query.format as string; // e.g. 'mp3', 'aac'
            const shouldTranscode = !!targetFormat;

            if (shouldTranscode) {
                const format = targetFormat || 'mp3';
                const bitrate = (req.query.bitrate as string) || '128k';

                const contentTypeMap: Record<string, string> = {
                    'mp3': 'audio/mpeg',
                    'aac': 'audio/aac',
                    'ogg': 'audio/ogg',
                    'opus': 'audio/opus'
                };

                res.setHeader("Content-Type", contentTypeMap[format] || 'audio/mpeg');

                // Create ffmpeg command
                const command = ffmpeg(trackPath)
                    .format(format)
                    .audioBitrate(bitrate)
                    .on('error', (err) => {
                        // Only log error if it's not a client disconnect (broken pipe)
                        if (!err.message.includes("Output stream closed")) {
                            console.error('Transcoding error:', err.message);
                        }
                    });

                // Pipe to response
                command.pipe(res, { end: true });
                return;
            }

            if (range) {
                // Handle range request for seeking
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = end - start + 1;

                const stream = fs.createReadStream(trackPath, { start, end });

                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunkSize,
                    "Content-Type": contentType,
                });

                stream.pipe(res);
            } else {
                // Full file request
                res.writeHead(200, {
                    "Content-Length": fileSize,
                    "Content-Type": contentType,
                    "Accept-Ranges": "bytes",
                });

                fs.createReadStream(trackPath).pipe(res);
            }
        } catch (error) {
            console.error("Error streaming track:", error);
            res.status(500).json({ error: "Failed to stream track" });
        }
    });

    /**
     * PUT /api/tracks/:id
     * Update track metadata and ID3 tags (admin only)
     */
    router.put("/:id", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const track = database.getTrack(id);

            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Permission Check: Restricted admin can only update their own tracks
            if (req.artistId && track.artist_id && track.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied: You can only edit your own tracks" });
            }

            const { title, artist, album, trackNumber, genre } = req.body;

            // Update ID3 tags for MP3 files
            const ext = path.extname(track.file_path).toLowerCase();
            if (ext === ".mp3") {
                try {
                    const NodeID3 = await import("node-id3");

                    // Read existing tags
                    const existingTags = NodeID3.read(track.file_path) || {};

                    // Update tags
                    const newTags: any = { ...existingTags };
                    if (title !== undefined) newTags.title = title;
                    if (artist !== undefined) newTags.artist = artist;
                    if (album !== undefined) newTags.album = album;
                    if (trackNumber !== undefined) newTags.trackNumber = String(trackNumber);
                    if (genre !== undefined) newTags.genre = genre;

                    // Write tags to file
                    const success = NodeID3.write(newTags, track.file_path);
                    if (!success) {
                        console.warn(`⚠️  Could not write ID3 tags to ${track.file_path}`);
                    } else {
                        console.log(`🏷️  Updated ID3 tags for: ${track.file_path}`);
                    }
                } catch (tagError) {
                    console.error("Error updating ID3 tags:", tagError);
                    // Continue anyway - we can still update the database
                }
            } else {
                console.log(`ℹ️  Skipping ID3 update for non-MP3 file: ${ext}`);
            }

            // Update database
            if (title !== undefined) {
                database.updateTrackTitle(id, title);
            }

            // Update artist in database if provided
            if (artist !== undefined) {
                let artistRecord = database.getArtistByName(artist);
                if (!artistRecord && artist) {
                    const artistId = database.createArtist(artist);
                    artistRecord = database.getArtist(artistId);
                }
                if (artistRecord) {
                    database.updateTrackArtist(id, artistRecord.id);
                }
            }

            // Get updated track
            const updatedTrack = database.getTrack(id);
            res.json({ message: "Track updated", track: updatedTrack });
        } catch (error) {
            console.error("Error updating track:", error);
            res.status(500).json({ error: "Failed to update track" });
        }
    });



    /**
     * DELETE /api/tracks/:id
     * Delete a track, optionally deleting the file
     */
    router.delete("/:id", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const deleteFile = req.query.deleteFile === "true";

            const track = database.getTrack(id);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Permission Check: Restricted admin can only delete their own tracks
            if (req.artistId && track.artist_id && track.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied: You can only delete your own tracks" });
            }

            if (deleteFile) {
                const trackPath = resolveFile(track.file_path);
                if (trackPath) {
                    try {
                        fs.unlinkSync(trackPath);
                        console.log(`🗑️  Deleted file: ${trackPath}`);
                    } catch (err) {
                        console.error("Error deleting file:", err);
                        return res.status(500).json({ error: "Failed to delete file" });
                    }
                }
            }

            // Delete from database
            // Note: If file was deleted, watcher might have already triggered this, 
            // but it's safe to run again (idempotent if using specific ID delete)
            database.deleteTrack(id);

            res.json({ message: "Track deleted" });
        } catch (error) {
            console.error("Error deleting track:", error);
            res.status(500).json({ error: "Failed to delete track" });
        }
    });

    return router;
}
