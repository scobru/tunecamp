import path from "path";
import fs from "fs-extra";
import chokidar, { type FSWatcher } from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";
import type { DatabaseService } from "./database.js";
import { WaveformService } from "./waveform.js";
import { slugify, getStandardCoverFilename } from "../utils/audioUtils.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath && ffprobePath.path) {
    ffmpeg.setFfprobePath(ffprobePath.path);
}

function getDurationFromFfmpeg(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`    [Scanner] ffprobe failed for ${path.basename(filePath)}:`, err.message);
                resolve(null);
            } else {
                const duration = metadata.format.duration;
                resolve(duration ? parseFloat(duration as any) : null);
            }
        });
    });
}

/**
 * Convert a WAV file to MP3 using ffmpeg
 * Returns the path to the new MP3 file
 */
function convertWavToMp3(wavPath: string, bitrate: string = '320k'): Promise<string> {
    return new Promise((resolve, reject) => {
        const mp3Path = wavPath.replace(/\.wav$/i, '.mp3');

        console.log(`    [Scanner] Converting WAV to MP3: ${path.basename(wavPath)}`);

        ffmpeg(wavPath)
            .audioBitrate(bitrate)
            .audioCodec('libmp3lame')
            .format('mp3')
            .on('end', () => {
                console.log(`    [Scanner] Converted to: ${path.basename(mp3Path)}`);
                resolve(mp3Path);
            })
            .on('error', (err) => {
                console.error(`    [Scanner] Conversion failed: ${err.message}`);
                reject(err);
            })
            .save(mp3Path);
    });
}

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
// Note: WAV files will be auto-converted to MP3 on import for better streaming support

interface ArtistConfig {
    name: string;
    bio?: string;
    image?: string;  // Legacy field
    avatar?: string; // New avatar field
    links?: any[];   // Array of link objects
}

interface ReleaseConfig {
    title: string;
    date?: string;
    description?: string;
    cover?: string;
    genres?: string[];
    artist?: string; // Override artist
    type?: 'album' | 'single' | 'ep'; // Added
    year?: number; // Added
    download?: string; // 'free' | 'paid'
    links?: { label: string; url: string }[] | { [key: string]: string }; // Array or Object
}

interface ExternalLink {
    label: string;
    url: string;
}

export interface ScannerService {
    scanDirectory(dir: string): Promise<void>;
    startWatching(dir: string): void;
    stopWatching(): void;
}

export function createScanner(database: DatabaseService): ScannerService {
    let watcher: FSWatcher | null = null;
    // Map directory paths to album IDs to efficiently link tracks
    const folderToAlbumMap = new Map<string, number>();
    // Map directory paths to artist IDs
    const folderToArtistMap = new Map<string, number>();

    async function processGlobalConfigs(rootDir: string): Promise<void> {
        // Check for artist.yaml in root
        const artistPath = path.join(rootDir, "artist.yaml");
        if (await fs.pathExists(artistPath)) {
            try {
                const content = await fs.readFile(artistPath, "utf-8");
                const config = parse(content) as ArtistConfig;
                if (config.name) {
                    const existingArtist = database.getArtistByName(config.name);
                    let artistId: number;
                    // Use avatar field, fallback to image for legacy support
                    const avatarPath = config.avatar
                        ? path.resolve(rootDir, config.avatar)
                        : (config.image ? path.resolve(rootDir, config.image) : undefined);

                    if (existingArtist) {
                        artistId = existingArtist.id;
                        // Update artist with bio/photo/links if they're in the config
                        database.updateArtist(artistId, config.bio, avatarPath, config.links);
                        console.log(`  Found existing artist: ${config.name}`);
                    } else {
                        artistId = database.createArtist(config.name, config.bio, avatarPath, config.links);
                        console.log(`  Created artist from config: ${config.name}`);
                    }
                    folderToArtistMap.set(rootDir, artistId);
                }
            } catch (e) {
                console.error("Error parsing artist.yaml:", e);
            }
        }

        // Check for catalog.yaml (could contain artist info in some versions)
        const catalogPath = path.join(rootDir, "catalog.yaml");
        if (await fs.pathExists(catalogPath)) {
            try {
                const content = await fs.readFile(catalogPath, "utf-8");
                const config = parse(content);

                // Save site settings
                if (config.title) database.setSetting("siteName", config.title);
                if (config.description) database.setSetting("siteDescription", config.description);
                if (config.url) database.setSetting("siteUrl", config.url);

                // Save donation links
                if (config.donationLinks) {
                    database.setSetting("donationLinks", JSON.stringify(config.donationLinks));
                    console.log(`  Loaded donation links from catalog.yaml`);
                }

                // If catalog has artist info (legacy or single artist mode)
                if (config.artist || (config.name && !config.title)) { // Some older configs might mix fields
                    // ... generic artist logic if needed, but artist.yaml is preferred
                }

            } catch (e) {
                console.error("Error parsing catalog.yaml:", e);
            }
        }
    }

    async function processReleaseConfig(filePath: string): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            const content = await fs.readFile(filePath, "utf-8");
            const config = parse(content) as ReleaseConfig;

            if (!config.title) return;

            console.log(`  Found release config: ${config.title}`);

            // Determine artist
            let artistId: number | null = null;
            if (config.artist) {
                // Check if artist already exists before creating
                const existingArtist = database.getArtistByName(config.artist);
                if (existingArtist) {
                    artistId = existingArtist.id;
                } else {
                    artistId = database.createArtist(config.artist);
                }
            } else {
                // Look up parent folders for artist config
                let current = dir;
                while (current.length >= path.dirname(current).length) {
                    if (folderToArtistMap.has(current)) {
                        artistId = folderToArtistMap.get(current)!;
                        break;
                    }
                    const parent = path.dirname(current);
                    if (parent === current) break;
                    current = parent;
                }
            }

            // Resolve cover path
            let coverPath: string | null = null;
            if (config.cover) {
                coverPath = path.resolve(dir, config.cover);
            } else {
                // Try common cover names, starting with Gleam-defined standard
                const standardCoverJpg = getStandardCoverFilename("jpg");
                const standardCoverPng = getStandardCoverFilename("png");
                const coverNames = [standardCoverJpg, standardCoverPng, "cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png"];
                for (const name of coverNames) {
                    const p = path.resolve(dir, name);
                    if (await fs.pathExists(p)) {
                        coverPath = p;
                        break;
                    }
                }
            }

            // Check for existing album by SLUG to avoid duplicates (race condition between watcher/scanner)
            const slug = slugify(config.title);
            const existingAlbum = database.getAlbumBySlug(slug);
            let albumId: number;

            // Prepare external links
            let linksJson: string | null = null;
            if (config.links) {
                const links: ExternalLink[] = [];
                if (Array.isArray(config.links)) {
                    links.push(...config.links);
                } else {
                    // Handle object format { 'Bandcamp': 'url' }
                    for (const [label, url] of Object.entries(config.links)) {
                        links.push({ label, url });
                    }
                }
                linksJson = JSON.stringify(links);
            }

            if (existingAlbum) {
                albumId = existingAlbum.id;

                // Update artist if we have one and existing doesn't
                if (artistId && !existingAlbum.artist_id) {
                    database.updateAlbumArtist(albumId, artistId);
                    console.log(`  Updated album artist: ${config.title} -> ID ${artistId}`);
                }

                // Update download setting
                database.updateAlbumDownload(albumId, config.download || null);

                // Update external links
                database.updateAlbumLinks(albumId, linksJson);

                // Mark existing album as a release if it wasn't already
                if (!existingAlbum.is_release) {
                    database.promoteToRelease(albumId);
                }
                console.log(`  Found existing album: ${config.title}`);
            } else {
                albumId = database.createAlbum({
                    title: config.title,
                    slug: slug,
                    artist_id: artistId,
                    date: config.date || null,
                    cover_path: coverPath,
                    genre: config.genres?.join(", ") || null,
                    description: config.description || null,
                    type: config.type || 'album',
                    year: config.year || (config.date ? new Date(config.date).getFullYear() : null),
                    download: config.download || null,
                    external_links: linksJson,
                    is_public: false, // Default to private
                    visibility: 'private',
                    is_release: true, // Albums from release.yaml are releases
                    published_at: null,
                });
                console.log(`  Created release from config: ${config.title}`);
            }

            // Map this folder and its subfolders (like 'tracks', 'audio') to this album
            folderToAlbumMap.set(dir, albumId);
            folderToAlbumMap.set(path.join(dir, "tracks"), albumId);
            folderToAlbumMap.set(path.join(dir, "audio"), albumId);
        } catch (e) {
            console.error(`Error processing release config ${filePath}:`, e);
        }
    }

    async function processAudioFile(filePath: string): Promise<void> {
        let currentFilePath = filePath;
        let ext = path.extname(currentFilePath).toLowerCase();

        if (!AUDIO_EXTENSIONS.includes(ext)) return;

        // Auto-convert WAV to MP3 on import
        if (ext === '.wav') {
            try {
                const mp3Path = await convertWavToMp3(currentFilePath);
                // If conversion successful, use the new MP3 path
                if (await fs.pathExists(mp3Path)) {
                    // Remove original WAV to keep library clean
                    await fs.remove(currentFilePath);
                    currentFilePath = mp3Path;
                    ext = '.mp3';
                    console.log(`    [Scanner] Switched to converted MP3: ${path.basename(currentFilePath)}`);
                }
            } catch (err) {
                console.error(`    [Scanner] Could not convert WAV, proceeding with original: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // Skip if already in database, but verify album/artist linking
        const existing = database.getTrackByPath(currentFilePath);
        if (existing) {
            // ... (rest of the existing logic using currentFilePath instead of filePath)
            // console.log(`Debug: Checking existing track ${path.basename(currentFilePath)} - Waveform: ${existing.waveform ? 'Present' : 'Missing'}`);
            const dir = path.dirname(currentFilePath);
            const albumId = folderToAlbumMap.get(dir) || folderToAlbumMap.get(path.dirname(dir)); // Check parent too (e.g. tracks/)

            let needsUpdate = false;

            if (albumId && !existing.album_id) {
                console.log(`  Updating track album link: ${path.basename(currentFilePath)}`);
                database.updateTrackAlbum(existing.id, albumId);
                needsUpdate = true;
            }

            // If track has no artist, try to get from metadata
            if (!existing.artist_id) {
                try {
                    const metadata = await parseFile(currentFilePath);
                    const common = metadata.common;
                    if (common.artist) {
                        const existingArtist = database.getArtistByName(common.artist);
                        const artistId = existingArtist ? existingArtist.id : database.createArtist(common.artist);
                        database.updateTrackArtist(existing.id, artistId);
                        console.log(`  Updating track artist link: ${path.basename(currentFilePath)} -> ${common.artist}`);
                    }
                } catch (e) {
                    // Ignore metadata errors for existing tracks
                }
            }

            // Check if waveform is missing
            if (!existing.waveform) {
                // Generate waveform in background
                WaveformService.generateWaveform(currentFilePath)
                    .then((peaks: number[]) => {
                        const json = JSON.stringify(peaks);
                        database.updateTrackWaveform(existing.id, json);
                        console.log(`    [Backfill] Generated waveform for: ${path.basename(currentFilePath)}`);
                    })
                    .catch((err: Error) => {
                        console.error(`    [Backfill] Failed to generate waveform for ${path.basename(currentFilePath)}:`, err.message);
                    });
            }

            // Check if duration is missing or suspiciously short (likely wrong metadata)
            const needsDurationBackfill = !existing.duration || (existing.duration > 0 && existing.duration < 90);
            if (needsDurationBackfill) {
                getDurationFromFfmpeg(currentFilePath).then((duration) => {
                    if (duration && duration > 0) {
                        database.updateTrackDuration(existing.id, duration);
                        console.log(`    [Backfill] Updated duration for: ${path.basename(currentFilePath)} -> ${duration}s`);
                    }
                }).catch(e => {
                    // ignore
                });
            }

            return;
        }

        try {
            console.log("  Processing track: " + path.basename(currentFilePath));
            const metadata = await parseFile(currentFilePath);
            const common = metadata.common;
            const format = metadata.format;
            const dir = path.dirname(currentFilePath);

            // 1. Try to get Album ID from folder map (from release.yaml)
            let albumId = folderToAlbumMap.get(dir) || folderToAlbumMap.get(path.dirname(dir)) || null;

            // Check if this is a "library" track (in library folder, not a release)
            const isLibraryTrack = dir.includes(path.sep + "library") || dir.endsWith("library");

            // 2. Determine artist based on track type
            let artistId: number | null = null;

            if (isLibraryTrack) {
                // LIBRARY MODE: ONLY use ID3 metadata, no fallback to artist.yaml
                if (common.artist) {
                    const existingArtist = database.getArtistByName(common.artist);
                    artistId = existingArtist ? existingArtist.id : database.createArtist(common.artist);
                    console.log(`    [Library] Using metadata artist: ${common.artist}`);
                } else {
                    // No metadata artist - leave as "Unknown Artist" (no artistId)
                    console.log(`    [Library] No metadata artist found`);
                }
            } else if (albumId) {
                // RELEASE MODE with album: use album's artist
                const album = database.getAlbum(albumId);
                if (album && album.artist_id) {
                    artistId = album.artist_id;
                }
            } else {
                // LOOSE TRACK (not in library, not in release): check metadata first, then folder
                if (common.artist) {
                    const existingArtist = database.getArtistByName(common.artist);
                    artistId = existingArtist ? existingArtist.id : database.createArtist(common.artist);
                    console.log(`    Using metadata artist: ${common.artist}`);
                } else {
                    // Fallback to parent folder artist config
                    let current = dir;
                    while (current.length >= path.dirname(current).length) {
                        if (folderToArtistMap.has(current)) {
                            artistId = folderToArtistMap.get(current)!;
                            break;
                        }
                        const parent = path.dirname(current);
                        if (parent === current) break;
                        current = parent;
                    }
                }
            }

            // 3. Fallback to metadata album if no release.yaml found
            if (!albumId && common.album) {
                // Try to find artist ID from metadata if still not set
                if (!artistId && common.artist) {
                    const existingArtist = database.getArtistByName(common.artist);
                    artistId = existingArtist ? existingArtist.id : database.createArtist(common.artist);
                }

                const existingAlbum = database.getAlbumByTitle(common.album, artistId || undefined);
                if (existingAlbum) {
                    albumId = existingAlbum.id;
                } else {
                    // Create new album from metadata
                    albumId = database.createAlbum({
                        title: common.album,
                        slug: common.album.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                        artist_id: artistId,
                        date: common.year?.toString() || null,
                        cover_path: null, // Basic fallback
                        genre: common.genre?.join(", ") || null,
                        description: null,
                        type: 'album',
                        year: common.year || null,
                        download: null,
                        external_links: null,
                        is_public: false,
                        visibility: 'private',
                        is_release: false, // Albums from metadata are library albums
                        published_at: null,
                    });
                }
            }

            // If we have an album but no artist yet, try to get artist from album
            if (albumId && !artistId) {
                const album = database.getAlbum(albumId);
                if (album && album.artist_id) artistId = album.artist_id;
            }


            // Prefer ffprobe for duration (reads actual stream; metadata tags are often wrong)
            let duration: number | null = await getDurationFromFfmpeg(currentFilePath);
            if (duration == null || !Number.isFinite(duration) || duration <= 0) {
                const metaDuration = format.duration;
                const parsed = metaDuration != null ? parseFloat(String(metaDuration)) : NaN;
                duration = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                if (duration != null) {
                    console.log(`    [Scanner] Using metadata duration: ${duration}s`);
                }
            }

            // Create track
            const trackId = database.createTrack({
                title: common.title || path.basename(currentFilePath, ext),
                album_id: albumId,
                artist_id: artistId,
                track_num: common.track?.no || null,
                duration: duration || null,
                file_path: currentFilePath,
                format: format.codec || ext.substring(1),
                bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                sample_rate: format.sampleRate || null,
                waveform: null // Pattern for now
            });

            // Generate waveform in background
            WaveformService.generateWaveform(currentFilePath)
                .then((peaks: number[]) => {
                    const json = JSON.stringify(peaks);
                    database.updateTrackWaveform(trackId, json);
                    console.log(`    Generated waveform for: ${path.basename(currentFilePath)}`);
                })
                .catch((err: Error) => {
                    console.error(`    Failed to generate waveform for ${path.basename(currentFilePath)}:`, err.message);
                });

        } catch (error) {
            console.error("  Error processing " + currentFilePath + ":", error);
        }
    }

    async function scanDirectory(dir: string): Promise<void> {
        console.log("Scanning directory: " + dir);

        if (!(await fs.pathExists(dir))) {
            console.warn("Directory does not exist: " + dir);
            return;
        }

        // Reset maps
        folderToAlbumMap.clear();
        folderToArtistMap.clear();

        // 1. Process Global Configs (artist.yaml)
        await processGlobalConfigs(dir);

        const files: string[] = [];
        const releaseConfigs: string[] = [];

        // 2. Discover files
        async function walkDir(currentDir: string): Promise<void> {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await walkDir(fullPath);
                } else if (entry.isFile()) {
                    if (entry.name === "release.yaml" || entry.name === "album.yaml") {
                        releaseConfigs.push(fullPath);
                    } else {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (AUDIO_EXTENSIONS.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            }
        }

        await walkDir(dir);

        // 3. Process Releases
        for (const configPath of releaseConfigs) {
            await processReleaseConfig(configPath);
        }

        // 4. Process Audio Files
        console.log("Found " + files.length + " audio file(s)");
        for (const file of files) {
            await processAudioFile(file);
        }

        const stats = await database.getStats();
        console.log("Scan complete: " + stats.artists + " artists, " + stats.albums + " albums, " + stats.tracks + " tracks");
    }

    function startWatching(dir: string): void {
        if (watcher) {
            watcher.close();
        }

        console.log("Watching for changes in: " + dir);

        watcher = chokidar.watch(dir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
        });

        watcher.on("add", async (filePath: string) => {
            const ext = path.extname(filePath).toLowerCase();
            // Reload on yaml change? For now just audio
            if (AUDIO_EXTENSIONS.includes(ext)) {
                await processAudioFile(filePath);
            } else if (path.basename(filePath) === 'release.yaml') {
                await processReleaseConfig(filePath);
                // Ideally re-scan folder tracks, but this is okay for MVP
            }
        });

        watcher.on("unlink", (filePath: string) => {
            const track = database.getTrackByPath(filePath);
            if (track) {
                database.deleteTrack(track.id);
            }
        });
    }

    function stopWatching(): void {
        if (watcher) {
            watcher.close();
            watcher = null;
        }
    }

    return {
        scanDirectory,
        startWatching,
        stopWatching,
    };
}
