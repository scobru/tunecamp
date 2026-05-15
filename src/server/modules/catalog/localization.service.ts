import youtubedl from "youtube-dl-exec";
import path from "path";
import fs from "fs-extra";
import { type DatabaseService, type Track } from "../../core/database.types.js";
import { type CatalogService } from "./catalog.service.js";

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
        private cookiesPath?: string
    ) {}

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

        const options: any = {
            extractAudio: true,
            audioFormat: 'mp3',
            output: outputTemplate,
            noPlaylist: true,
            addMetadata: true,
            embedThumbnail: true,
            noWarnings: true,
            noCheckCertificate: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            // Sync with YouTubeStreamingProvider for resilience
            extractorArgs: 'youtube:player_client=android,web;player_skip=configs,web_embedded_player',
            referer: 'https://www.youtube.com/'
        };

        if (this.cookiesPath && fs.existsSync(this.cookiesPath)) {
            options.cookies = this.cookiesPath;
            console.log(`🎬 [Localization] Using cookies for authentication`);
        }

        try {
            await youtubedl(url, options);
            
            // Find the downloaded file
            const files = await fs.readdir(localizedDir);
            const idSuffix = `[${trackId}]`;
            const downloadedFile = files.find(f => f.includes(idSuffix));
            
            if (!downloadedFile) {
                throw new Error("Download completed but no file matching the pattern was found");
            }

            const relativePath = path.join("localized", downloadedFile);
            
            // Update track in database
            this.database.updateTrackPath(trackId, relativePath, track.album_id);
            
            // Clear external service info as it's now a local file
            // Actually, keeping the external_id might be useful for history, 
            // but the system prioritizes file_path.
            
            console.log(`✅ [Localization] Track localized to: ${relativePath}`);

            // Return updated track
            const updatedTrack = this.database.getTrack(trackId);
            return updatedTrack!;
        } catch (error: any) {
            console.error(`❌ [Localization] Error during download:`, error.message);
            throw new Error(`Localization failed: ${error.message}`);
        }
    }
}
