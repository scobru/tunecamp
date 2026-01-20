import path from "path";
import fs from "fs-extra";
import chokidar, { type FSWatcher } from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";
import type { DatabaseService } from "./database.js";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];

interface ArtistConfig {
    name: string;
    bio?: string;
    image?: string;
}

interface ReleaseConfig {
    title: string;
    date?: string;
    description?: string;
    cover?: string;
    genres?: string[];
    artist?: string; // Override artist
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

                    if (existingArtist) {
                        artistId = existingArtist.id;
                        console.log(`  Found existing artist: ${config.name}`);
                    } else {
                        artistId = database.createArtist(config.name, config.bio, config.image ? path.resolve(rootDir, config.image) : undefined);
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
            // Logic for catalog.yaml if needed
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
                artistId = database.createArtist(config.artist);
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
                // Try common cover names
                const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png"];
                for (const name of coverNames) {
                    const p = path.resolve(dir, name);
                    if (await fs.pathExists(p)) {
                        coverPath = p;
                        break;
                    }
                }
            }

            // Check for existing album to avoid duplicates
            const existingAlbum = database.getAlbumByTitle(config.title, artistId || undefined);
            let albumId: number;

            if (existingAlbum) {
                albumId = existingAlbum.id;
                console.log(`  Found existing album: ${config.title}`);
            } else {
                albumId = database.createAlbum({
                    title: config.title,
                    artist_id: artistId,
                    date: config.date || null,
                    cover_path: coverPath,
                    genre: config.genres?.join(", ") || null,
                    description: config.description || null,
                    is_public: false, // Default to private
                    published_at: null,
                });
                console.log(`  Created album from config: ${config.title}`);
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
        const ext = path.extname(filePath).toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(ext)) return;

        // Skip if already in database, but verify album linking
        const existing = database.getTrackByPath(filePath);
        if (existing) {
            const dir = path.dirname(filePath);
            const albumId = folderToAlbumMap.get(dir) || folderToAlbumMap.get(path.dirname(dir)); // Check parent too (e.g. tracks/)

            if (albumId && !existing.album_id) {
                console.log(`  Updating track album link: ${path.basename(filePath)}`);
                database.updateTrackAlbum(existing.id, albumId);
            }
            return;
        }

        try {
            console.log("  Processing track: " + path.basename(filePath));
            const metadata = await parseFile(filePath);
            const common = metadata.common;
            const format = metadata.format;
            const dir = path.dirname(filePath);

            // 1. Try to get Album ID from folder map (from release.yaml)
            let albumId = folderToAlbumMap.get(dir) || folderToAlbumMap.get(path.dirname(dir)) || null;
            let artistId = folderToArtistMap.get(dir) || null;

            // 2. Fallback to metadata if no release.yaml found
            if (!albumId && common.album) {
                // Try to find artist ID from metadata
                if (!artistId && common.artist) {
                    const existingArtist = database.getArtistByName(common.artist);
                    artistId = existingArtist ? existingArtist.id : database.createArtist(common.artist);
                }

                const existingAlbum = database.getAlbumByTitle(common.album, artistId || undefined);
                if (existingAlbum) {
                    albumId = existingAlbum.id;
                } else {
                    // Create new album from metadata
                    // ... (cover finding logic same as before)
                    let coverPath: string | null = null;
                    // ...

                    albumId = database.createAlbum({
                        title: common.album,
                        artist_id: artistId,
                        date: common.year?.toString() || null,
                        cover_path: null, // Basic fallback
                        genre: common.genre?.join(", ") || null,
                        description: null,
                        is_public: false,
                        published_at: null,
                    });
                }
            }

            // If we have an album but no artist yet, try to get artist from album
            if (albumId && !artistId) {
                const album = database.getAlbum(albumId);
                if (album && album.artist_id) artistId = album.artist_id;
            }

            // Create track
            database.createTrack({
                title: common.title || path.basename(filePath, ext),
                album_id: albumId,
                artist_id: artistId,
                track_num: common.track?.no || null,
                duration: format.duration || null,
                file_path: filePath,
                format: format.codec || ext.substring(1),
                bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                sample_rate: format.sampleRate || null,
            });
        } catch (error) {
            console.error("  Error processing " + filePath + ":", error);
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

        const stats = database.getStats();
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
