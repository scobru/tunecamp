import path from "path";
import fs from "fs-extra";
import pLimit from "p-limit";
import chokidar, { type FSWatcher } from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";

import type { DatabaseService, Artist, Album, Track } from "../../core/database.js";
import { WaveformPeakService } from "../waveform/waveform-peak.service.js";
import { slugify } from "../../../utils/audioUtils.js";
import { convertWavToMp3, getDurationFromFfmpeg } from "../media/ffmpeg.js";
import { getFastFileHash } from "../../../utils/fileUtils.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import { LibrarySync } from "./library-sync.js";
import { workerPool } from "../workers/worker-pool.js";

/**
 * Optimized processing queue with concurrency support to handle multiple heavy tasks (ffmpeg, conversion) in parallel.
 */
class ProcessingQueue {
    private queue: (() => Promise<any>)[] = [];
    private activeWorkers = 0;
    private readonly maxConcurrency: number;
    private readonly maxQueueSize: number;
    public readonly label: string;

    constructor(label = 'default', maxConcurrency = 4, maxQueueSize = 200) {
        this.label = label;
        this.maxConcurrency = maxConcurrency;
        this.maxQueueSize = maxQueueSize;
    }

    async add<T>(task: () => Promise<T>): Promise<T> {
        if (this.queue.length >= this.maxQueueSize) {
            console.warn(`[Queue:${this.label}] ⚠️ Maximum queue size (${this.maxQueueSize}) reached. Throttling...`);
            await new Promise(r => setTimeout(r, 2000));
        }

        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
            this.next();
        });
    }

    private async next() {
        if (this.activeWorkers >= this.maxConcurrency || this.queue.length === 0) return;
        
        this.activeWorkers++;
        const task = this.queue.shift();
        if (task) {
            try {
                await task();
            } catch (e) {
                console.error(`[Queue:${this.label}] Task execution failed:`, e);
            }
        }
        this.activeWorkers--;
        this.next();
    }

    public get size(): number {
        return this.queue.length;
    }
}

/**
 * Robust wrapper for music-metadata parseFile with retry mechanism.
 */
async function parseFileWithRetry(filePath: string, retries = 3, delay = 500): Promise<any> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await parseFile(filePath, { skipCovers: true });
        } catch (err) {
            lastError = err;
            const isRangeError = err instanceof RangeError || (err as any)?.code === 'ERR_OUT_OF_RANGE';
            if (isRangeError || (err as any)?.code === 'EBUSY' || (err as any)?.code === 'ENOENT') {
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
                    continue;
                }
            }
            throw err;
        }
    }
    throw lastError;
}

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const GENERIC_EXTENSIONS = [".zip", ".pdf", ".epub", ".rar", ".7z", ".tar.gz", ".dmg", ".exe", ".txt", ".png", ".jpg", ".jpeg"];

export function isArtworkOrAvatar(filePath: string): boolean {
    const ext = path.extname(filePath);
    const extLower = ext.toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(extLower)) {
        return false;
    }
    const baseName = path.basename(filePath, ext).toLowerCase();

    // Ignore exact matches for standard artwork/folder/avatar files
    if (["cover", "folder", "artwork", "avatar"].includes(baseName)) {
        return true;
    }

    // Ignore auto-generated or standard prefixes/patterns
    if (
        baseName.startsWith("cover-") || 
        baseName.startsWith("avatar-") ||
        baseName.startsWith("track-") ||
        baseName.startsWith("artwork-") ||
        baseName.startsWith("background") ||
        baseName.startsWith("site-cover") ||
        baseName.startsWith("site-logo")
    ) {
        return true;
    }

    // Check directory structure: if it is inside an "artwork" folder or "assets" folder
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes("/artwork/") || normalized.includes("/assets/")) {
        return true;
    }

    return false;
}

interface ArtistConfig {
    name: string;
    bio?: string;
    avatar?: string;
    image?: string;
    links?: any[];
}

interface ReleaseConfig {
    title: string;
    date?: string;
    description?: string;
    cover?: string;
    genres?: string[];
    artist?: string;
    type?: 'album' | 'single' | 'liveset' | 'podcast';
    year?: number;
    download?: string;
    links?: { label: string; url: string }[] | { [key: string]: string };
    metadata?: {
        tracks?: any[];
    };
}

interface ExternalLink {
    label: string;
    url: string;
}

export interface ScanResult {
    successful: Array<{ originalPath: string; message: string; convertedPath?: string }>;
    failed: Array<{ originalPath: string; message: string }>;
}

export interface ScannerService {
    scanDirectory(dir: string, onProgress?: (processed: number, total: number) => void): Promise<ScanResult>;
    startWatching(dir: string): void;
    stopWatching(): void;
    processAudioFile(filePath: string, musicDir: string, overrideArtistId?: number, ownerId?: number, overrideAlbumId?: number, suggestedCoverPath?: string, metadataHints?: { artist?: string, album?: string, year?: number, title?: string, genre?: string }): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number, queuedConversion?: boolean } | null>;
    getOrCreateLibraryAlbum(dir: string, musicDir: string, forcedCoverPath?: string): Promise<number | null>;
    clearCaches(): void;
}

import type { AutoTaggerService } from "./autotagger.service.js";
import type { CatalogService } from "./catalog.service.js";

export class Scanner implements ScannerService {
    private watcher: FSWatcher | null = null;
    private isScanning = false;
    private pendingScan: Promise<ScanResult> | null = null;
    /** Separate queues for different operation types to prevent starvation */
    private conversionQueue = new ProcessingQueue('conversion', 2);  // FFmpeg is CPU-heavy
    private waveformQueue = new ProcessingQueue('waveform', 4);      // Waveform is lighter
    private librarySync: LibrarySync;

    private folderToAlbumMap = new Map<string, number>();
    private folderToArtistMap = new Map<string, number>();
    private folderToExistingAlbumMap = new Map<string, number>();
    private lastGcTime = Date.now();

    private musicDirectory: string | null = null;
    private hashingSemaphore = 0;
    private readonly MAX_CONCURRENT_HASHING = 2;
    private scannerStartTime = Date.now();
    private readonly WATCHER_STARTUP_DELAY = 60000;
    private primaryAdminId: number | null = null;

    constructor(
        private database: DatabaseService,
        private storage: StorageEngine,
        private autotagger?: AutoTaggerService,
        private catalogService?: CatalogService
    ) {
        this.lookupPrimaryAdmin();
        this.librarySync = new LibrarySync(database, autotagger, this.primaryAdminId);
    }

    private lookupPrimaryAdmin() {
        try {
            const admin = this.database.db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
            if (admin) {
                this.primaryAdminId = admin.id;
            }
        } catch (e) {
            console.error("[Scanner] Failed to lookup primary admin:", e);
        }
    }

    public clearCaches(): void {
        this.folderToAlbumMap.clear();
        this.folderToArtistMap.clear();
        this.folderToExistingAlbumMap.clear();
        
        const mem = process.memoryUsage();
        const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
        const shouldForceGc = heapUsedMB > 1500;
        
        if (typeof (global as any).gc === 'function' && (shouldForceGc || Date.now() - this.lastGcTime > 60000)) {
            try {
                (global as any).gc();
                this.lastGcTime = Date.now();
            } catch (e) {}
        }
    }

    public async getOrCreateLibraryAlbum(dir: string, musicDir: string, forcedCoverPath?: string, ownerId?: number | null, albumArtist?: string | null): Promise<number | null> {
        const relativeDir = this.normalizePath(dir, musicDir);
        const isRoot = relativeDir === "." || relativeDir === "";

        if (this.folderToAlbumMap.has(dir)) return this.folderToAlbumMap.get(dir)!;

        // Check if this is a formal release directory (music/releases/slug)
        // We use the slug from the directory name to look up the release
        if (relativeDir.startsWith("releases/")) {
            const pathParts = relativeDir.split("/");
            if (pathParts.length === 2 && pathParts[0] === "releases") {
                const releaseSlug = pathParts[1];
                const formalRelease = this.database.getReleaseBySlug(releaseSlug);
                if (formalRelease) {
                    console.log(`📂 [Scanner] Recognized formal release directory: ${relativeDir} -> Release ${formalRelease.id}`);
                    this.folderToAlbumMap.set(dir, formalRelease.id);
                    return formalRelease.id;
                }
            } else {
                console.log(`📂 [Scanner] Subdirectory of release detected, not associating automatically: ${relativeDir}`);
            }
        }

        const folderName = isRoot ? path.basename(musicDir) : path.basename(dir);
        const slug = slugify("lib-" + (isRoot ? "root" : relativeDir)); 
        let album = this.database.getAlbumBySlug(slug);

        if (album) {
            // Re-scan for cover if: no cover, forced cover, OR existing cover_path points to a missing file
            const existingCoverMissing = album.cover_path
                ? !(await this.storage.pathExists(path.resolve(path.resolve(musicDir), album.cover_path)))
                : false;
            if (!album.cover_path || existingCoverMissing || forcedCoverPath) {
                let coverPath = forcedCoverPath ? this.normalizePath(forcedCoverPath, musicDir) : null;
                if (!coverPath) {
                    const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png", "artwork.jpg", "artwork.png"];
                    for (const name of coverNames) {
                        const p = path.resolve(dir, name);
                        if (await this.storage.pathExists(p)) {
                            coverPath = this.normalizePath(p, musicDir);
                            break;
                        }
                    }
                }
                if (coverPath && coverPath !== album.cover_path) {
                    this.database.updateAlbumCover(album.id, coverPath);
                }
            }
            this.folderToAlbumMap.set(dir, album.id);
            return album.id;
        }

        let coverPath: string | null = forcedCoverPath ? this.normalizePath(forcedCoverPath, musicDir) : null;
        if (!coverPath) {
            const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png", "artwork.jpg", "artwork.png"];
            const paths = coverNames.map(name => path.resolve(dir, name));
            const exists = await Promise.all(paths.map(p => this.storage.pathExists(p)));
            const index = exists.findIndex(e => e);
            if (index !== -1) {
                coverPath = this.normalizePath(paths[index], musicDir);
            }
        }

        const albumId = this.database.createAlbum({
            title: folderName,
            slug: slug,
            artist_id: null,
            album_artist: albumArtist || null,
            owner_id: ownerId || this.primaryAdminId,
            date: null,
            cover_path: coverPath,
            genre: "Library",
            description: `Auto-generated album for folder ${folderName}`,
            type: 'album',
            year: null,
            download: null,
            price: 0,
            price_usdc: 0,
            currency: 'ETH',
            external_links: null,
            is_public: false,
            visibility: 'private',
            is_release: false,
            published_at: null,
            published_to_gundb: false,
            published_to_ap: false,
            license: null,
            status: 'draft',
        });

        this.folderToAlbumMap.set(dir, albumId);
        return albumId;
    }

    private normalizePath(filePath: string, musicDir: string): string {
        try {
            const absoluteMusicDir = path.resolve(musicDir);
            const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(musicDir, filePath);
            let relative = path.relative(absoluteMusicDir, absoluteFilePath).replace(/\\/g, "/");
            while (relative.startsWith("../")) {
                relative = relative.substring(3);
            }
            if (relative === "..") return ".";
            return relative;
        } catch (e) {
            return filePath.replace(/\\/g, "/");
        }
    }

    private async processGlobalConfigs(rootDir: string, musicDir: string): Promise<void> {
        const artistPath = path.join(rootDir, "artist.yaml");
        if (await this.storage.pathExists(artistPath)) {
            try {
                const content = await this.storage.readFile(artistPath, "utf-8");
                const config = parse(content) as ArtistConfig;
                if (config.name) {
                    const existingArtist = this.database.getArtistByName(config.name);
                    let artistId: number;
                    const avatarPath = config.avatar
                        ? this.normalizePath(path.resolve(rootDir, config.avatar), musicDir)
                        : (config.image ? this.normalizePath(path.resolve(rootDir, config.image), musicDir) : undefined);

                    if (existingArtist) {
                        artistId = existingArtist.id;
                        this.database.updateArtist(artistId, config.name, config.bio, avatarPath, config.links);
                    } else {
                        artistId = this.database.createArtist(config.name, config.bio, avatarPath, config.links, undefined, undefined, 'private');
                    }
                    this.folderToArtistMap.set(rootDir, artistId);
                }
            } catch (e) { console.warn(`[Scanner] Failed to parse artist.yaml at ${artistPath}:`, (e as any).message); }
        }

        const catalogPath = path.join(rootDir, "catalog.yaml");
        if (await this.storage.pathExists(catalogPath)) {
            try {
                const content = await this.storage.readFile(catalogPath, "utf-8");
                const config = parse(content);
                if (config.title) this.database.setSetting("siteName", config.title);
                if (config.description) this.database.setSetting("siteDescription", config.description);
                if (config.url) this.database.setSetting("siteUrl", config.url);
                if (config.donationLinks) {
                    this.database.setSetting("donationLinks", JSON.stringify(config.donationLinks));
                }
            } catch (e) { console.warn(`[Scanner] Failed to parse catalog.yaml at ${catalogPath}:`, (e as any).message); }
        }
    }

    private async processReleaseConfig(filePath: string, musicDir: string): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            const content = await this.storage.readFile(filePath, "utf-8");
            const config = parse(content) as ReleaseConfig;
            if (!config.title) return;

            let artistId: number | null = null;
            if (config.artist) {
                const existingArtist = this.database.getArtistByName(config.artist);
                artistId = existingArtist ? existingArtist.id : this.database.createArtist(config.artist, undefined, undefined, undefined, undefined, undefined, 'private');
            } else {
                let current = dir;
                while (current.length >= path.dirname(current).length) {
                    if (this.folderToArtistMap.has(current)) {
                        artistId = this.folderToArtistMap.get(current)!;
                        break;
                    }
                    const parent = path.dirname(current);
                    if (parent === current) break;
                    current = parent;
                }
            }

            let coverPath: string | null = null;
            if (config.cover) {
                if (config.cover.startsWith('http')) {
                    coverPath = config.cover;
                } else {
                    const absoluteCoverPath = path.resolve(dir, config.cover);
                    if (await this.storage.pathExists(absoluteCoverPath)) {
                        coverPath = this.normalizePath(absoluteCoverPath, musicDir);
                    }
                }
            } else {
                const coverNames = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png"];
                for (const name of coverNames) {
                    const p = path.resolve(dir, name);
                    if (await this.storage.pathExists(p)) {
                        coverPath = this.normalizePath(p, musicDir);
                        break;
                    }
                }
            }

            const slug = slugify(config.title);
            let existingAlbum = this.database.getAlbumBySlug(slug);
            let albumId: number;

            let linksJson: string | null = null;
            if (config.links) {
                const links: ExternalLink[] = [];
                if (Array.isArray(config.links)) {
                    links.push(...config.links);
                } else {
                    for (const [label, url] of Object.entries(config.links)) {
                        links.push({ label, url: url as string });
                    }
                }
                linksJson = JSON.stringify(links);
            }

            if (existingAlbum) {
                albumId = existingAlbum.id;
                const updateData = {
                    artist_id: artistId || existingAlbum.artist_id,
                    cover_path: coverPath || existingAlbum.cover_path,
                    genre: config.genres?.join(", ") || existingAlbum.genre,
                    description: config.description || existingAlbum.description,
                    download: config.download || existingAlbum.download,
                    external_links: linksJson || existingAlbum.external_links,
                    type: config.type || existingAlbum.type,
                    year: config.year || existingAlbum.year
                };

                if (this.catalogService) {
                    await this.catalogService.updateAlbum(albumId, updateData);
                } else {
                    this.database.updateAlbum(albumId, updateData);
                }
            } else {
                albumId = this.database.createAlbum({
                    title: config.title,
                    slug: slug,
                    artist_id: artistId,
                    owner_id: this.primaryAdminId,
                    date: config.date || null,
                    cover_path: coverPath,
                    genre: config.genres?.join(", ") || null,
                    description: config.description || null,
                    type: config.type || 'album',
                    year: config.year || (config.date ? new Date(config.date).getFullYear() : null),
                    download: config.download || null,
                    price: 0,
                    price_usdc: 0,
                    currency: 'ETH',
                    external_links: linksJson,
                    is_public: false,
                    visibility: 'private',
                    published_at: null,
                    published_to_gundb: false,
                    published_to_ap: false,
                    license: null,
                    status: 'draft',
                    is_release: false
                });

                // Trigger download if it was a URL
                if (coverPath && coverPath.startsWith('http') && this.catalogService) {
                    await this.catalogService.updateAlbum(albumId, { cover_path: coverPath });
                }
            }

            this.folderToAlbumMap.set(dir, albumId);
        } catch (e) {
            console.error(`❌ [Scanner] Error processing release config at ${filePath}:`, e);
        }
    }

    public async processAudioFile(
        filePath: string, 
        musicDirRaw: string, 
        overrideArtistId?: number, 
        ownerId?: number, 
        overrideAlbumId?: number, 
        suggestedCoverPath?: string,
        metadataHints?: { artist?: string, album?: string, year?: number, title?: string, genre?: string }
    ): Promise<{ originalPath: string, success: boolean, message: string, convertedPath?: string, trackId?: number, queuedConversion?: boolean } | null> {
        const musicDir = musicDirRaw.replace(/\\/g, "/");
        let currentFilePath = filePath.replace(/^@@[a-z0-9]+\\?/, "").replace(/\\/g, "/").replace(/\/+/g, "/");
        if (!path.isAbsolute(currentFilePath) && !await this.storage.pathExists(currentFilePath)) {
            const resolved = path.join(musicDir, currentFilePath);
            if (await this.storage.pathExists(resolved)) currentFilePath = resolved;
        }

        const ext = path.extname(currentFilePath).toLowerCase();
        const dir = path.dirname(currentFilePath);
        const isAudio = AUDIO_EXTENSIONS.includes(ext);
        const isGeneric = GENERIC_EXTENSIONS.includes(ext);
        if (!isAudio && !isGeneric) return null;
        if (isArtworkOrAvatar(currentFilePath)) return null;

        while (this.hashingSemaphore >= this.MAX_CONCURRENT_HASHING) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.hashingSemaphore++;
        try {
            // Get Metadata — use worker thread to keep main event loop free or create standard metadata for generic assets
            let metadata: any = null;
            if (isGeneric) {
                const title = metadataHints?.title || path.basename(currentFilePath, ext);
                let mimeType = 'application/octet-stream';
                if (ext === '.zip') mimeType = 'application/zip';
                else if (ext === '.pdf') mimeType = 'application/pdf';
                else if (ext === '.epub') mimeType = 'application/epub+zip';
                else if (ext === '.png') mimeType = 'image/png';
                else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                else if (ext === '.txt') mimeType = 'text/plain';

                const stats = await fs.stat(currentFilePath);
                
                metadata = {
                    common: {
                        title: title,
                        artist: metadataHints?.artist || "Library",
                        album: metadataHints?.album || "Imported Assets",
                        genre: [metadataHints?.genre || "Generic Asset"]
                    },
                    format: {
                        duration: 0,
                        codec: ext.substring(1),
                        mimeType: mimeType,
                        fileSize: stats.size
                    }
                };
            } else {
                try {
                    metadata = await workerPool.runTask('parse-metadata', currentFilePath);
                } catch (e) {
                    // Fallback to main-thread parsing if worker fails
                    try {
                        metadata = await parseFileWithRetry(currentFilePath);
                    } catch (e2) {
                        console.warn(`[Scanner] Metadata parse failed for ${currentFilePath}, using filename fallback.`);
                    }
                }
            }

            // Fallback to folder-based album if not recognized and we are in musicDir
            if (!overrideAlbumId && !this.folderToAlbumMap.has(dir) && dir.startsWith(musicDir)) {
                await this.getOrCreateLibraryAlbum(dir, musicDir, suggestedCoverPath, ownerId);
            }

            // music-metadata does not report file size for audio files; stat the
            // file so tracks.file_size is populated and storage metrics stay accurate.
            if (metadata?.format && !metadata.format.fileSize) {
                try {
                    metadata.format.fileSize = (await fs.stat(currentFilePath)).size;
                } catch {
                    // Leave unset if the file is unreadable; backfill can fix it later.
                }
            }

            const syncResult = await this.librarySync.syncFile(currentFilePath, metadata, {
                musicDir,
                overrideArtistId,
                ownerId,
                overrideAlbumId,
                suggestedCoverPath,
                metadataHints
            });

            if (syncResult.success && syncResult.trackId) {
                const track = this.database.getTrack(syncResult.trackId);
                if (track) {
                    // Process Waveform if missing (separate queue, won't block conversions)
                    if (!track.waveform && !isGeneric) {
                        processQueueWaveform(currentFilePath, track.id, track.duration || undefined, this.waveformQueue, this.database);
                    }

                    // Process Conversion if needed (separate queue, limited concurrency)
                    if (syncResult.queuedConversion && !isGeneric) {
                        this.conversionQueue.add(() => convertWavToMp3(currentFilePath));
                    } else if (!isGeneric && track.lossless_path && track.file_path) {
                        // Self-healing for libraries scanned before flac pre-transcoding
                        // existed: the track row points at an .mp3 that was never
                        // generated, so every stream transcodes on the fly. Queue it now.
                        const mp3Path = path.join(musicDir, track.file_path);
                        if (track.file_path.toLowerCase().endsWith('.mp3') && !(await this.storage.pathExists(mp3Path))) {
                            const losslessPath = path.join(musicDir, track.lossless_path);
                            if (await this.storage.pathExists(losslessPath)) {
                                this.conversionQueue.add(() => convertWavToMp3(losslessPath));
                            }
                        }
                    }
                }
            }

            return { 
                originalPath: filePath, 
                success: syncResult.success, 
                message: syncResult.message, 
                trackId: syncResult.trackId, 
                queuedConversion: syncResult.queuedConversion 
            };
        } catch (error) {
            return { originalPath: filePath, success: false, message: String(error) };
        } finally {
            this.hashingSemaphore--;
        }
    }

    public async scanDirectory(dir: string, onProgress?: (processed: number, total: number) => void): Promise<ScanResult> {
        if (this.isScanning) return this.pendingScan || Promise.resolve({ successful: [], failed: [] });
        this.musicDirectory = dir;
        this.isScanning = true;
        this.pendingScan = (async () => {
            try { return await this.doScan(dir, onProgress); } finally { this.isScanning = false; this.pendingScan = null; }
        })();
        return this.pendingScan;
    }

    private async mapFoldersToExistingAlbums(): Promise<void> {
        this.folderToExistingAlbumMap.clear();
        this.folderToAlbumMap.clear();
        this.folderToArtistMap.clear();
        const stmt = this.database.db.prepare("SELECT album_id, file_path FROM tracks WHERE album_id IS NOT NULL AND file_path IS NOT NULL");
        const counts = new Map<string, Map<number, number>>();
        for (const track of stmt.iterate() as Iterable<any>) {
            const dir = path.dirname(track.file_path).replace(/\\/g, "/");
            if (!counts.has(dir)) counts.set(dir, new Map());
            const albumCounts = counts.get(dir)!;
            albumCounts.set(track.album_id, (albumCounts.get(track.album_id) || 0) + 1);
        }
        for (const [dir, albumCounts] of counts.entries()) {
            let maxCount = 0, bestId = -1;
            for (const [id, count] of albumCounts.entries()) {
                if (count > maxCount) { maxCount = count; bestId = id; }
            }
            if (bestId !== -1) this.folderToExistingAlbumMap.set(dir, bestId);
        }
    }

    private async doScan(dir: string, onProgress?: (processed: number, total: number) => void): Promise<ScanResult> {
        if (!(await this.storage.pathExists(dir))) return { successful: [], failed: [] };
        await this.mapFoldersToExistingAlbums();
        const audioFiles: string[] = [], yamlFiles: string[] = [];
        const walkDir = async (currentDir: string) => {
            const entries = await this.storage.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                // Skip hidden directories (e.g. ".wav", ".git", ".trash"): files
                // dropped there are not part of the curated library and scanning
                // them creates orphan/duplicate tracks the dedup chain can't catch.
                if (entry.isDirectory() && entry.name.startsWith(".")) continue;
                const full = path.join(currentDir, entry.name);
                if (entry.isDirectory()) await walkDir(full);
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (AUDIO_EXTENSIONS.includes(ext) || GENERIC_EXTENSIONS.includes(ext)) {
                        if (!isArtworkOrAvatar(full)) {
                            audioFiles.push(full);
                        }
                    }
                    else if (ext === ".yaml" || ext === ".yml") yamlFiles.push(full);
                }
            }
        };
        await walkDir(dir);
        const knownFiles = new Set<string>();
        for (const f of audioFiles) knownFiles.add(this.normalizePath(f, dir).toLowerCase());

        for (const f of yamlFiles.filter(f => f.endsWith("artist.yaml") || f.endsWith("catalog.yaml"))) {
            await this.processGlobalConfigs(path.dirname(f), dir);
        }
        const releaseConfigs = yamlFiles.filter(f => f.endsWith("release.yaml"));
        for (const f of releaseConfigs) await this.processReleaseConfig(f, dir);
        
        const successful: any[] = [], failed: any[] = [];
        const limit = pLimit(10);
        let processedFiles = 0;
        await Promise.all(audioFiles.map(file => limit(async () => {
            const result = await this.processAudioFile(file, dir, undefined, this.primaryAdminId || undefined);
            if (result) {
                if (result.success) successful.push(result); else failed.push(result);
                if (result.queuedConversion && ['.wav', '.flac'].includes(path.extname(file).toLowerCase())) {
                    knownFiles.add(this.normalizePath(file.replace(/\.[^/.]+$/, ".mp3"), dir).toLowerCase());
                }
            }
            processedFiles++;
            if (onProgress && processedFiles % 50 === 0) {
                onProgress(Math.min(processedFiles, audioFiles.length), audioFiles.length);
            }
            if (processedFiles % 100 === 0 && (global as any).gc) (global as any).gc();
        })));
        if (onProgress && processedFiles % 50 !== 0) {
            onProgress(processedFiles, audioFiles.length);
        }

        await this.deduplicateLibraryTracks();
        await this.cleanupStaleLibraryTracks(dir, knownFiles);

        await this.librarySync.cleanupEmptyEntities();
        this.clearCaches();
        return { successful, failed };
    }

    /**
     * Collects the physical file paths of a "loser" track that should be deleted
     * after its DB record has been merged into the keeper. Only queues paths that
     * differ from the keeper's own paths to avoid accidentally deleting the
     * canonical file.
     */
    private queueOrphanFileDeletion(
        loserTrack: Track,
        keeperId: number,
        queue: string[]
    ): void {
        const keeper = this.database.getTrack(keeperId);
        if (!keeper || !this.musicDirectory) return;

        const keeperPaths = new Set<string>(
            [keeper.file_path, keeper.lossless_path]
                .filter((p): p is string => !!p)
                .map(p => p.toLowerCase())
        );

        for (const p of [loserTrack.file_path, loserTrack.lossless_path]) {
            if (!p) continue;
            if (keeperPaths.has(p.toLowerCase())) continue; // Same file as keeper — keep it
            const abs = path.join(this.musicDirectory, p);
            queue.push(abs);
        }
    }

    /**
     * Deletes physical files that were queued for removal after deduplication.
     * Failures are logged but never fatal — stale files will simply be retried
     * on the next scan cycle.
     */
    private async deleteOrphanFiles(files: string[]): Promise<void> {
        let deleted = 0;
        for (const f of files) {
            try {
                if (await this.storage.pathExists(f)) {
                    await fs.unlink(f);
                    deleted++;
                    console.log(`🗑️ [Scanner] Deleted duplicate file: ${path.basename(f)}`);
                }
            } catch (e) {
                console.warn(`[Scanner] Could not delete duplicate file ${f}:`, (e as any).message);
            }
        }
        if (deleted > 0) {
            console.log(`🧹 [Scanner] Cleaned up ${deleted} duplicate physical files.`);
        }
    }

    private async deduplicateLibraryTracks() {
        console.log("🧹 [Scanner] Running memory-efficient deduplication...");
        const groups = new Map<string, { id: number, score: number }[]>();
        const tracksIter = this.database.iterateTracks();
        const filesToDelete: string[] = [];

        for (const t of tracksIter) {
            const k = `${t.album_id}|${t.artist_id}|${t.title.toLowerCase().trim()}`;
            // Score: prefer tracks with album, duration, fingerprint, external_id, lyrics, lossless
            const score =
                (t.album_id ? 16 : 0) +
                (t.duration ? 8 : 0) +
                ((t as any).fingerprint ? 4 : 0) +
                ((t as any).external_id ? 2 : 0) +
                ((t as any).lyrics ? 1 : 0) +
                (t.lossless_path ? 1 : 0);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push({ id: t.id, score });
        }

        const idsToFetch: number[] = [];
        for (const [, entries] of groups.entries()) {
            if (entries.length <= 1) continue;
            // Sort by richness desc, then by id asc (oldest)
            entries.sort((a, b) => b.score - a.score || a.id - b.id);
            for (let i = 1; i < entries.length; i++) {
                idsToFetch.push(entries[i].id);
            }
        }

        const fetchedTracks = new Map<number, any>();
        for (let i = 0; i < idsToFetch.length; i += 900) {
            const chunk = idsToFetch.slice(i, i + 900);
            const tracks = this.database.getTracksByIds(chunk);
            for (const t of tracks) {
                fetchedTracks.set(t.id, t);
            }
        }

        for (const [, entries] of groups.entries()) {
            if (entries.length <= 1) continue;
            const primaryId = entries[0].id;

            for (let i = 1; i < entries.length; i++) {
                const otherId = entries[i].id;
                try {
                    // Capture paths BEFORE merge deletes the row from the DB
                    const loserTrack = fetchedTracks.get(otherId);
                    // mergeTracks transfers ownership/plays/bookmarks/ratings/release_tracks
                    // and carries over metadata fields the keeper is missing.
                    // It also handles the lossless_path carry-over.
                    this.database.mergeTracks(otherId, primaryId);
                    // Queue physical file deletion for the merged-away track
                    if (loserTrack && this.musicDirectory) {
                        this.queueOrphanFileDeletion(loserTrack, primaryId, filesToDelete);
                    }
                } catch (e) {
                    console.error(`[Scanner] Dedup merge failed (${otherId} -> ${primaryId}):`, e);
                }
            }
        }

        await this.softMergeUntaggedDuplicates(filesToDelete);

        // Delete all queued physical files after all DB merges are complete
        await this.deleteOrphanFiles(filesToDelete);
    }

    /**
     * Soft merge: collapse rows that share the same title (and duration, when known)
     * but where one row carries full album/artist metadata and the others don't.
     * Common cause: a file scanned without tags before a tagged copy was imported.
     * The strict pass above never catches these because the keys differ on NULLs.
     */
    private async softMergeUntaggedDuplicates(filesToDelete: string[]) {
        const titleGroups = new Map<string, number[]>();
        for (const t of this.database.iterateTracks()) {
            if (!t.title) continue;
            const title = t.title.toLowerCase().trim();
            if (!title) continue;
            const durBucket = t.duration ? Math.round(t.duration) : 'x';
            const k = `${title}|${durBucket}`;
            if (!titleGroups.has(k)) titleGroups.set(k, []);
            titleGroups.get(k)!.push(t.id);
        }

        const score = (t: Track) => (t.album_id ? 2 : 0) + (t.artist_id ? 1 : 0);

        const allIdsToFetch: number[] = [];
        for (const ids of titleGroups.values()) {
            if (ids.length > 1) {
                allIdsToFetch.push(...ids);
            }
        }

        const fetchedTracks = this.database.getTracksByIds(allIdsToFetch);
        const trackMap = new Map<number, Track>();
        for (let i = 0; i < fetchedTracks.length; i++) {
            trackMap.set(fetchedTracks[i].id, fetchedTracks[i]);
        }

        for (const [, ids] of titleGroups.entries()) {
            if (ids.length <= 1) continue;

            const rows: Track[] = [];
            for (let i = 0; i < ids.length; i++) {
                const t = trackMap.get(ids[i]);
                if (t) rows.push(t);
            }
            if (rows.length <= 1) continue;

            rows.sort((a, b) => score(b) - score(a));
            const primary = rows[0];
            const primaryScore = score(primary);
            if (primaryScore === 0) continue; // nothing to enrich from

            for (let i = 1; i < rows.length; i++) {
                const other = rows[i];
                // Only merge rows strictly less tagged than primary; leave equally-tagged
                // entries alone (likely genuine alt versions on different albums).
                if (score(other) >= primaryScore) continue;

                try {
                    this.database.mergeTracks(other.id, primary.id);
                    // Queue physical file deletion for the merged-away track
                    if (this.musicDirectory) {
                        this.queueOrphanFileDeletion(other, primary.id, filesToDelete);
                    }
                } catch (e) {
                    console.error(`[Scanner] Soft-merge failed (${other.id} -> ${primary.id}):`, e);
                }
            }
        }
    }

    private async cleanupStaleLibraryTracks(musicDir: string, knownFiles: Set<string>) {
        console.log("🧹 [Scanner] Running memory-efficient stale track cleanup...");
        const tracksIter = this.database.iterateTracks();
        const toDelete: number[] = [];
        const toUpdateLossless: number[] = [];
        const toPromoteLossless: { id: number, lossless: string }[] = [];

        for (const t of tracksIter) {
            if (!t.file_path) continue;
            // Ignore Google Drive and remote tracks
            if (t.service && t.service !== 'local-fs') continue;
            if (t.file_path.startsWith('gdrive://') || t.file_path.startsWith('http://') || t.file_path.startsWith('https://')) continue;

            const pKey = t.file_path.toLowerCase();
            const pExists = knownFiles.has(pKey);
            const lExists = t.lossless_path ? knownFiles.has(t.lossless_path.toLowerCase()) : false;
            if (!pExists && !lExists) {
                toDelete.push(t.id);
            } else if (pExists && t.lossless_path && !lExists) {
                toUpdateLossless.push(t.id);
            } else if (!pExists && lExists && t.lossless_path) {
                // file_path is dead but the lossless companion still exists.
                // Promote lossless_path to file_path so the dead pointer is replaced.
                toPromoteLossless.push({ id: t.id, lossless: t.lossless_path });
            }
        }

        try {
            if (toDelete.length > 0) this.database.deleteTracksBatch(toDelete);
            if (toUpdateLossless.length > 0) this.database.updateTracksLosslessPathBatch(toUpdateLossless, null);
            if (toPromoteLossless.length > 0) {
                this.database.updateTracksPathsBatch(
                    toPromoteLossless.map(x => ({ id: x.id, path: x.lossless }))
                );
            }
        } catch (e) {
            console.warn(`[Scanner] Error during memory-efficient stale track cleanup batch operations:`, (e as any).message);
        }
    }

    public startWatching(dir: string): void {
        this.musicDirectory = dir;
        if (this.watcher) this.watcher.close();
        this.watcher = chokidar.watch(dir, { ignored: /(^|[\/\\])\../, persistent: true, ignoreInitial: true });
        this.watcher.on("add", (f) => {
            if (!isArtworkOrAvatar(f)) {
                this.processAudioFile(f, dir, undefined, this.primaryAdminId || undefined);
            }
        });
    }

    public stopWatching(): void {
        if (this.watcher) { this.watcher.close(); this.watcher = null; }
    }
}

function processQueueWaveform(file: string, id: number, dur: number | undefined, queue: ProcessingQueue, db: DatabaseService) {
    queue.add(() => WaveformPeakService.generateWaveform(file, 100, dur))
        .then(p => db.updateTrackWaveform(id, JSON.stringify(p)))
        .catch(() => {});
}
