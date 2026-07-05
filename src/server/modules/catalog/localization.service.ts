import path from "path";
import fs from "fs-extra";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

import { type DatabaseService, type Track } from "../../core/database.types.js";
import { type CatalogService } from "./catalog.service.js";
import { type GoogleDriveService } from "../storage/google-drive.service.js";
import { type StreamingService } from "../streaming/streaming.service.js";

// Bandcamp CDN stream links (t\d+.bcbits.com/stream/...) are signed with a short-lived
// token (embedded `ts=` expiry). They're only meant for immediate playback, not for
// storing as a durable source URL — by the time a localization runs, the token may
// already have expired (HTTP 410 Gone).
const BANDCAMP_SIGNED_STREAM_RE = /^https?:\/\/t\d+\.bcbits\.com\/stream\//;

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
        private gdriveService?: GoogleDriveService,
        private streamingService?: StreamingService
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
            url = track.external_id.includes('http') ? track.external_id : `https://www.youtube.com/watch?v=${track.external_id}`;
        } else if (!url && track.service === 'soundcloud' && track.external_id) {
            const id = track.external_id.includes(':') ? track.external_id.split(':').pop() : track.external_id;
            url = id && /^\d+$/.test(id) ? `https://api.soundcloud.com/tracks/${id}` : `https://soundcloud.com/${id}`;
        } else if (!url && track.external_id) {
            url = track.external_id;
        }

        if (!url) throw new Error("Could not determine source URL for localization");

        // A stored Bandcamp CDN stream link is a signed, short-lived URL — it was only ever
        // meant for immediate playback, so by the time a localization runs its token has
        // likely expired (410 Gone). Re-resolve a fresh one from Bandcamp instead of reusing it.
        if (BANDCAMP_SIGNED_STREAM_RE.test(url) && this.streamingService) {
            console.log(`🔄 [Localization] Track ${trackId} has a stale Bandcamp CDN link, re-resolving a fresh stream URL...`);
            const fresh = await this.streamingService.resolve(track.title, track.artist_name || "").catch(() => null);
            if (fresh) url = fresh;
        }

        // Strip internal prefixes and handle IDs
        if (url.startsWith('ext:')) {
            const parts = url.split(':');
            if (parts.length >= 3) {
                const provider = parts[1];
                const actual = parts.slice(2).join(':');

                if (actual.startsWith('http')) {
                    url = actual;
                } else if (provider === 'youtube') {
                    url = `https://www.youtube.com/watch?v=${actual}`;
                } else if (provider === 'soundcloud') {
                    url = /^\d+$/.test(actual) ? `https://api.soundcloud.com/tracks/${actual}` : `https://soundcloud.com/${actual}`;
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
        
        console.log(`🎬 [Localization] Localizing track ${trackId}: "${track.title}" from ${url} (Provider: ${track.service || 'unknown'})`);

        try {
            // Official Best Practice: Use native best audio without forced conversion to avoid quality loss.
            // We use ba* to get the best audio-only stream. 
            // We prefer m4a/mp4 for better compatibility if available, but keep quality as priority.
            const tempPath = path.join(localizedDir, `temp_${trackId}.%(ext)s`);

            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
            const isSoundCloud = url.includes('soundcloud.com') || url.includes('sndcdn.com');
            
            const args = [
                '-f', 'ba/ba*',
                '-o', tempPath,
                '--no-playlist',
                '--prefer-free-formats',
                '--add-metadata',
                '--embed-thumbnail',
                // Official Best Practice: Use multiple concurrent fragments for faster downloads
                '-N', '5',
                // Official Best Practice: Use native filename restriction
                '--restrict-filenames'
            ];

            if (isYouTube) {
                args.push('--referer', 'https://www.youtube.com/');
                // Use more resilient extractor args aligned with youtube.provider.ts
                args.push('--extractor-args', 'youtube:player_client=mweb,android,web;player_skip=configs,web_embedded_player;po_token=auto');
                args.push('--force-ipv4');
                args.push('--geo-bypass');
            }

            if (isSoundCloud) {
                args.push('--referer', 'https://soundcloud.com/');
            }

            if (this.cookiesPath && fs.existsSync(this.cookiesPath)) {
                args.push('--cookies', this.cookiesPath);
            }

            args.push(url);

            await execFileAsync('yt-dlp', args);

            // 3. Move to library and update DB
            // Find the downloaded file (yt-dlp adds the extension)
            const files = await fs.readdir(localizedDir);
            // Search for files starting with temp_{trackId}
            const downloadedFile = files.find(f => f.startsWith(`temp_${trackId}.`));
            
            if (!downloadedFile) {
                throw new Error("Downloaded file not found after yt-dlp execution");
            }

            const actualExt = path.extname(downloadedFile).substring(1); // e.g. 'opus', 'm4a', 'webm'
            
            let finalAlbumTitle = "Unknown Album";
            if (track.album_id) {
                const album = this.database.getAlbum(track.album_id);
                if (album) {
                    finalAlbumTitle = album.title;
                }
            } else if (track.album_title) {
                finalAlbumTitle = track.album_title;
            }

            const safeArtist = (track.artist_name || 'Unknown').replace(/[<>:"/\\|?*]/g, '_').trim();
            const safeAlbum = finalAlbumTitle.replace(/[<>:"/\\|?*]/g, '_').trim();
            const safeTitle = (track.title || 'Untitled').replace(/[<>:"/\\|?*]/g, '_').trim();
            const trackPrefix = track.track_num ? String(track.track_num).padStart(2, '0') + " - " : "";

            const relativePath = path.posix.join("localized", safeArtist, safeAlbum, `${trackPrefix}${safeTitle}.${actualExt}`);
            const finalPath = path.join(this.musicDir, relativePath);

            await fs.ensureDir(path.dirname(finalPath));
            await fs.move(path.join(localizedDir, downloadedFile), finalPath, { overwrite: true });

            // Update DB with local path, detected format and mark as local service
            this.database.updateTrack(trackId, { 
                file_path: relativePath, 
                format: actualExt,
                service: 'local' 
            });
            
            console.log(`✅ [Localization] Track ${trackId} localized to ${relativePath} (Format: ${actualExt})`);
            return this.database.getTrack(trackId)!;
        } catch (error: any) {
            console.error(`❌ [Localization] Error during download:`, error.message);
            throw new Error(`Localization failed: ${error.message}`);
        }
    }
}
