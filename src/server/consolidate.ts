import path from "path";
import fs from "fs-extra";
import {
    formatAudioFilename,
    formatAlbumDirectory,
    getStandardCoverFilename,
    getFileExtension
} from "../utils/audioUtils.js";
import type { DatabaseService } from "./database.js";

export class ConsolidationService {
    constructor(private database: DatabaseService, private rootDir: string) { }

    /**
     * Consolidates a track by moving it to its proper location
     */
    async consolidateTrack(trackId: number): Promise<boolean> {
        const track = this.database.getTrack(trackId);
        if (!track || !track.file_path) return false;

        const album = track.album_id ? this.database.getAlbum(track.album_id) : null;
        const artist = track.artist_id ? this.database.getArtist(track.artist_id) : null;

        if (!album || !artist) {
            console.warn(`[Consolidate] Skipping track ${track.title}: Missing album or artist info`);
            return false;
        }

        // 1. Calculate target directory: library/Artist - Album (Year)
        const targetDirName = formatAlbumDirectory(
            artist.name,
            album.title
        );
        const targetDir = path.join(this.rootDir, "library", targetDirName);

        // 2. Calculate target filename: 01 - Title.mp3
        const ext = getFileExtension(track.file_path);
        const targetFileName = formatAudioFilename(
            track.track_num || 0,
            track.title,
            ext
        );
        const targetPath = path.join(targetDir, targetFileName);

        // 3. Move file if path is different
        if (path.resolve(track.file_path) === path.resolve(targetPath)) {
            return true;
        }

        try {
            await fs.ensureDir(targetDir);
            console.log(`[Consolidate] Moving: ${path.basename(track.file_path)} -> ${targetPath}`);
            await fs.move(track.file_path, targetPath, { overwrite: true });

            // 4. Update database
            this.database.updateTrackPath(trackId, targetPath, album.id);

            // 5. Consolidate cover if it exists
            if (album.cover_path && await fs.pathExists(album.cover_path)) {
                const coverExt = getFileExtension(album.cover_path);
                const standardCoverName = getStandardCoverFilename(coverExt);
                const targetCoverPath = path.join(targetDir, standardCoverName);

                if (path.resolve(album.cover_path) !== path.resolve(targetCoverPath)) {
                    console.log(`[Consolidate] Moving cover: ${path.basename(album.cover_path)} -> ${targetCoverPath}`);
                    await fs.move(album.cover_path, targetCoverPath, { overwrite: true });
                    this.database.updateAlbumCover(album.id, targetCoverPath);
                }
            }

            return true;
        } catch (error) {
            console.error(`[Consolidate] Error moving file ${track.file_path}:`, error);
            return false;
        }
    }

    /**
     * Consolidates the entire library
     */
    async consolidateAll(): Promise<{ success: number; failed: number }> {
        const stats = await this.database.getStats();
        console.log(`[Consolidate] Starting consolidation of ${stats.tracks} tracks...`);

        const allTracks = this.database.getTracks();
        let success = 0;
        let failed = 0;

        for (const track of allTracks) {
            const ok = await this.consolidateTrack(track.id);
            if (ok) success++; else failed++;
        }

        console.log(`[Consolidate] Done: ${success} tracks moved, ${failed} failed.`);
        return { success, failed };
    }
}
