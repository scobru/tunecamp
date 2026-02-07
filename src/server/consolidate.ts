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

        let album = track.album_id ? this.database.getAlbum(track.album_id) : null;
        if (!album) {
            const dir = path.dirname(track.file_path);
            const parentDir = path.basename(dir);

            // Avoid misidentifying 'library' or 'music' as an album title
            const isGenericFolder = ['library', 'music', 'tracks', 'audio'].includes(parentDir.toLowerCase());

            if (!isGenericFolder) {
                console.log(`[Consolidate] Track ${track.title} missing album link, checking folder: ${parentDir}`);
                // Try to find album by folder name (as slug or title)
                const possibleAlbum = this.database.getAlbumByTitle(parentDir) || this.database.getAlbumBySlug(parentDir);
                if (possibleAlbum) {
                    console.log(`[Consolidate] Recovered: Linked track ${track.title} to album ${possibleAlbum.title}`);
                    this.database.updateTrackAlbum(track.id, possibleAlbum.id);
                    album = possibleAlbum;
                }
            }

            if (!album) {
                console.warn(`[Consolidate] Skipping track ${track.title}: No album link and no valid album folder found (in ${dir})`);
                return false;
            }
        }

        const trackArtist = track.artist_id ? this.database.getArtist(track.artist_id) : (album.artist_id ? this.database.getArtist(album.artist_id) : null);
        const artistName = trackArtist?.name || "Unknown Artist";

        // 1. Calculate target directory: library/Artist - Album (Year)
        const targetDirName = formatAlbumDirectory(
            artistName,
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
        if (path.resolve(this.rootDir, track.file_path) === path.resolve(targetPath)) {
            return true;
        }

        try {
            await fs.ensureDir(targetDir);

            // Guard: Check if a track already exists at targetPath in DB
            const existingTrack = this.database.getTrackByPath(targetPath);
            if (existingTrack && existingTrack.id !== trackId) {
                console.warn(`[Consolidate] Collision: A track record already exists for ${targetPath}. Skipping move to avoid UNIQUE constraint violation.`);
                // We should probably mark this track as consolidated anyway or link it?
                // For now, skip to be safe.
                return false;
            }

            console.log(`[Consolidate] Moving: ${path.basename(track.file_path)} -> ${targetPath}`);
            await fs.move(path.join(this.rootDir, track.file_path), targetPath, { overwrite: true });

            // 4. Update database
            this.database.updateTrackPath(trackId, targetPath, album.id);

            // 5. Consolidate cover if it exists
            if (album.cover_path && await fs.pathExists(path.join(this.rootDir, album.cover_path))) {
                const coverExt = getFileExtension(album.cover_path);
                const standardCoverName = getStandardCoverFilename(coverExt);
                const targetCoverPath = path.join(targetDir, standardCoverName);

                if (path.resolve(this.rootDir, album.cover_path) !== path.resolve(targetCoverPath)) {
                    console.log(`[Consolidate] Moving cover: ${path.basename(album.cover_path)} -> ${targetCoverPath}`);
                    await fs.move(path.join(this.rootDir, album.cover_path), targetCoverPath, { overwrite: true });
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

        // 6. Clean up empty directories left behind
        try {
            await this.removeEmptyDirs(this.rootDir);
        } catch (error) {
            console.error("[Consolidate] Error cleaning up empty directories:", error);
        }

        console.log(`[Consolidate] Done: ${success} tracks moved, ${failed} failed.`);
        return { success, failed };
    }

    /**
     * Recursively removes empty directories
     */
    private async removeEmptyDirs(dir: string) {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) return;

        const files = await fs.readdir(dir);
        const basename = path.basename(dir);
        const isProtected = basename === "library" ||
            basename === "releases" ||
            basename === "assets" ||
            basename === path.basename(this.rootDir);

        if (files.length > 0) {
            // Check subdirectories
            for (const file of files) {
                const fullPath = path.join(dir, file);
                await this.removeEmptyDirs(fullPath);
            }

            // Re-check after cleaning subdirectories
            const filesAfter = await fs.readdir(dir);
            if (filesAfter.length === 0 && !isProtected) {
                console.log(`[Consolidate] Removing empty directory: ${dir}`);
                await fs.remove(dir);
            }
        } else if (!isProtected) {
            // Directory is empty and not protected
            console.log(`[Consolidate] Removing empty directory: ${dir}`);
            await fs.remove(dir);
        }
    }
}
