import path from "path";
import fs from "fs-extra";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

import { type DatabaseService, type Track } from "../../core/database.types.js";
import { type CatalogService } from "./catalog.service.js";
import { type GoogleDriveService } from "../storage/google-drive.service.js";

/**
 * Universal Localization Service
 * Allows ripping external streams (YouTube, Bandcamp, SoundCloud, etc.)
 * into the local music library using yt-dlp.
 */
export class LocalizationService {
    constructor(
        private database: DatabaseService,
        private catalogService: CatalogService,
        private musicDir: string,
        private cookiesPath?: string,
        private gdriveService?: GoogleDriveService
    ) {}

    /**
     * Updates the Google Drive service for localization.
     */
    public setGDriveService(service: GoogleDriveService): void {
        this.gdriveService = service;
    }

    /**
     * Updates the cookies path for yt-dlp authentication.
     */
    public setCookiesPath(path: string): void {
        this.cookiesPath = path;
    }

    /**
     * Localizes a track by downloading it from its external source.
     * Updates the track's file_path in the database.
     */
    async localizeTrack(trackId: number): Promise<Track> {
        const track = this.database.getTrack(trackId);
        if (!track) throw new Error("Track not found");
        
        // Skip if already local (has file_path and no external_id/service/url)
        // But if it has a file_path starting with http or gdrive, we might still want to localize it.
        const isLocal = track.file_path && !track.file_path.startsWith('http') && !track.file_path.startsWith('gdrive://');
        
        if (isLocal && !track.external_id && !track.url) {
            throw new Error("Track is already localized");
        }

        // Handle Google Drive tracks directly without yt-dlp
        if (track.file_path?.startsWith('gdrive://')) {
            if (this.gdriveService) {
                console.log(`🎬 [Localization] Track ${trackId} is on Google Drive, using direct copy...`);
                return this.catalogService.localizeTrack(trackId, this.gdriveService);
            } else {
                throw new Error("Google Drive service not available for localization");
            }
        }

        // Determine the URL to download
        let url = track.url;
        if (!url && track.service === 'youtube' && track.external_id) {
            url = `https://www.youtube.com/watch?v=${track.external_id}`;
        } else if (!url && track.service === 'soundcloud' && track.external_id) {
            url = `https://soundcloud.com/${track.external_id}`;
        } else if (!url && track.external_id) {
            url = track.external_id;
        }

        if (!url) throw new Error("Could not determine source URL for localization");

        // Strip internal prefixes (e.g. ext:bandcamp:https://...)
        if (url.startsWith('ext:')) {
            const parts = url.split(':');
            // If it's ext:provider:http... -> take the http part
            if (parts.length >= 3 && parts[2].startsWith('//')) {
                 // Format ext:provider://... (unlikely but possible)
                 url = parts.slice(2).join(':');
            } else if (parts.length >= 3 && (parts[2].startsWith('http') || parts[1] === 'youtube' || parts[1] === 'soundcloud')) {
                // Common format: ext:provider:actual_id_or_url
                const actual = parts.slice(2).join(':');
                if (actual.startsWith('http')) {
                    url = actual;
                } else if (parts[1] === 'youtube') {
                    url = `https://www.youtube.com/watch?v=${actual}`;
                } else if (parts[1] === 'soundcloud') {
                    url = `https://soundcloud.com/${actual}`;
                }
            } else if (parts.length >= 2 && parts[1].startsWith('http')) {
                url = parts.slice(1).join(':');
            }
        }

        const localizedDir = path.join(this.musicDir, "localized");
        await fs.ensureDir(localizedDir);

        // Clean title for filename to avoid OS issues
        const safeTitle = track.title.replace(/[<>:"/\\|?*]/g, '_');
        const safeArtist = (track.artist_name || 'Unknown').replace(/[<>:"/\\|?*]/g, '_');
        
        // Output template for yt-dlp
        // Using [id] suffix to ensure uniqueness and easy retrieval
        const outputTemplate = path.join(localizedDir, `${safeArtist} - ${safeTitle} [${trackId}].%(ext)s`);

        console.log(`🎬 [Localization] Localizing track ${trackId}: "${track.title}" from ${url}`);

        try {
            const format = 'mp3';
            const tempPath = path.join(localizedDir, `temp_${trackId}.%(ext)s`);

            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
            const args = [
                '-x',
                '--audio-format', format,
                '--audio-quality', '0',
                '-o', tempPath,
                '--no-playlist',
                '--prefer-free-formats',
                '--add-metadata',
                '--embed-thumbnail',
            ];

            if (isYouTube) {
                args.push('--referer', 'https://www.youtube.com/');
                args.push('--extractor-args', 'youtube:player_client=web;player_skip=web_embedded_client,mweb');
            }

            if (this.cookiesPath && fs.existsSync(this.cookiesPath)) {
                args.push('--cookies', this.cookiesPath);
            }

            args.push(url);

            await execFileAsync('yt-dlp', args);

            // 3. Move to library and update DB
            const sanitizedTitle = (track.title || "Untitled").replace(/[^a-z0-9_\-]/gi, '_');
            const sanitizedArtist = (track.artist_name || "Unknown").replace(/[^a-z0-9_\-]/gi, '_');
            const relativePath = path.posix.join("localized", `${sanitizedArtist} - ${sanitizedTitle}.${format}`);
            const finalPath = path.join(this.musicDir, relativePath);

            await fs.ensureDir(path.dirname(finalPath));
            
            // Find the downloaded file (yt-dlp adds the extension)
            const files = await fs.readdir(localizedDir);
            const downloadedFile = files.find(f => f.startsWith(`temp_${trackId}.`));
            if (downloadedFile) {
                await fs.move(path.join(localizedDir, downloadedFile), finalPath, { overwrite: true });
            }

            // Update DB with local path and mark as local service
            this.database.updateTrack(trackId, { 
                file_path: relativePath, 
                service: 'local' 
            });
            
            console.log(`✅ [Localization] Track ${trackId} localized to ${relativePath}`);
            return this.database.getTrack(trackId)!;
        } catch (error: any) {
            console.error(`❌ [Localization] Error during download:`, error.message);
            throw new Error(`Localization failed: ${error.message}`);
        }
    }
}
