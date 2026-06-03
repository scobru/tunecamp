import path from "path";
import fs from "fs-extra";
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
    type?: 'album' | 'single' | 'ep';
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
    consolidateFiles(musicDir: string): Promise<{ success: number, failed: number, skipped: number, deleted: number }>;
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
    private isConsolidating = false;
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
            for (const name of coverNames) {
                const p = path.resolve(dir, name);
                if (await this.storage.pathExists(p)) {
                    coverPath = this.normalizePath(p, musicDir);
                    break;
                }
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
            } catch (e) {}
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
            } catch (e) {}
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
                const full = path.join(currentDir, entry.name);
                if (entry.isDirectory()) await walkDir(full);
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (AUDIO_EXTENSIONS.includes(ext) || GENERIC_EXTENSIONS.includes(ext)) audioFiles.push(full);
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
        
        const successful = [], failed = [];
        for (let i = 0; i < audioFiles.length; i += 50) {
            const batch = audioFiles.slice(i, i + 50);
            for (const file of batch) {
                const result = await this.processAudioFile(file, dir);
                if (result) {
                    if (result.success) successful.push(result); else failed.push(result);
                    if (result.queuedConversion && ['.wav', '.flac'].includes(path.extname(file).toLowerCase())) {
                        knownFiles.add(this.normalizePath(file.replace(/\.[^/.]+$/, ".mp3"), dir).toLowerCase());
                    }
                }
            }
            
            if (onProgress) {
                onProgress(Math.min(i + batch.length, audioFiles.length), audioFiles.length);
            }

            if (i % 100 === 0 && (global as any).gc) (global as any).gc();
        }

        await this.deduplicateLibraryTracks();
        await this.cleanupStaleLibraryTracks(dir, knownFiles);

        await this.librarySync.cleanupEmptyEntities();
        this.clearCaches();
        return { successful, failed };
    }

    private async deduplicateLibraryTracks() {
        console.log("🧹 [Scanner] Running memory-efficient deduplication...");
        const groups = new Map<string, { id: number, score: number }[]>();
        const tracksIter = this.database.iterateTracks();

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

        for (const [, entries] of groups.entries()) {
            if (entries.length <= 1) continue;
            // Sort by richness desc, then by id asc (oldest)
            entries.sort((a, b) => b.score - a.score || a.id - b.id);
            const primaryId = entries[0].id;

            for (let i = 1; i < entries.length; i++) {
                const otherId = entries[i].id;
                try {
                    // mergeTracks transfers ownership/plays/bookmarks/ratings/release_tracks
                    // and carries over metadata fields the keeper is missing.
                    // It also handles the lossless_path carry-over.
                    this.database.mergeTracks(otherId, primaryId);
                } catch (e) {
                    console.error(`[Scanner] Dedup merge failed (${otherId} -> ${primaryId}):`, e);
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

        for (const id of toDelete) this.database.deleteTrack(id);
        for (const id of toUpdateLossless) this.database.updateTrackLosslessPath(id, null);
        for (const { id, lossless } of toPromoteLossless) {
            try {
                // Don't pass album_id (would null it out). Just update the path.
                this.database.updateTrack(id, { file_path: lossless });
            } catch (e) {
                console.warn(`[Scanner] Could not promote lossless_path for track ${id}:`, (e as any).message);
            }
        }
    }

    public startWatching(dir: string): void {
        this.musicDirectory = dir;
        if (this.watcher) this.watcher.close();
        this.watcher = chokidar.watch(dir, { ignored: /(^|[\/\\])\../, persistent: true, ignoreInitial: true });
        this.watcher.on("add", (f) => { if (!this.isConsolidating) this.processAudioFile(f, dir); });
    }

    public stopWatching(): void {
        if (this.watcher) { this.watcher.close(); this.watcher = null; }
    }

    public async consolidateFiles(musicDir: string): Promise<{ success: number, failed: number, skipped: number, deleted: number }> {
        if (this.isConsolidating) return { success: 0, failed: 0, skipped: 0, deleted: 0 };
        this.isConsolidating = true;
        try {
            let success = 0, failed = 0, skipped = 0, deleted = 0, count = 0;
            const cache = new Map<string, any>();
            const migratedDirsMap = new Map<string, string>();
            const iter = Array.from(this.database.iterateTracks("file_path IS NOT NULL"));
            for (const t of iter) {
                try {
                    if (!t.file_path) { count++; continue; }
                    // Skip Google Drive and remote tracks
                    if (t.service && t.service !== 'local-fs') { count++; continue; }
                    if (t.file_path.startsWith('gdrive://') || t.file_path.startsWith('http://') || t.file_path.startsWith('https://')) { count++; continue; }
                    const oldP = t.file_path;
                    const fOld = path.join(musicDir, oldP);
                    const existsOld = await this.storage.pathExists(fOld);
                    
                    let art = t.artist_id ? (cache.get(`artist_${t.artist_id}`) || this.database.getArtist(t.artist_id)) : null;
                    if (t.artist_id && art) cache.set(`artist_${t.artist_id}`, art);
                    
                    let album = t.album_id ? (cache.get(`album_${t.album_id}`) || this.database.getAlbum(t.album_id)) : null;
                    if (t.album_id && album) cache.set(`album_${t.album_id}`, album);

                    const name = (art?.name || "Unknown").trim();
                    const albumTitle = (album?.title || "Unknown Album").trim();
                    const title = (t.title || "Untitled").trim();
                    const safe = (s: string) => s.replace(/[^a-zA-Z0-9\s._-]/g, "_").trim();
                    
                    const safeName = safe(name);
                    const safeAlbum = safe(albumTitle);
                    const safeTitle = safe(title);
                    const trackPrefix = t.track_num ? String(t.track_num).padStart(2, '0') + " - " : "";
                    const base = `${trackPrefix}${safeTitle}`;
                    
                    const ext = path.extname(oldP).toLowerCase();
                    
                    // Retain subfolder prefix (releases, downloads, tracks, import, localized, cloud_imports, gdrive, gdrive:, artwork, assets, artists)
                    const pathParts = oldP.split("/");
                    let subfolder = "";
                    if (pathParts.length > 1) {
                        const firstSegment = pathParts[0];
                        const recognized = ["releases", "downloads", "tracks", "import", "localized", "cloud_imports", "gdrive", "gdrive:", "artwork", "assets", "artists"];
                        if (recognized.includes(firstSegment)) {
                            subfolder = firstSegment;
                        }
                    }
                    
                    const newDir = subfolder 
                        ? path.join(subfolder, safeName, safeAlbum).replace(/\\/g, "/") 
                        : path.join("tracks", safeName, safeAlbum).replace(/\\/g, "/");
                    const newP = path.join(newDir, `${base}${ext}`).replace(/\\/g, "/");
                    const fNew = path.join(musicDir, newP);
                    
                    if (!existsOld) {
                        const existsNew = await this.storage.pathExists(fNew);
                        if (!existsNew) {
                            const existsLossless = t.lossless_path ? await this.storage.pathExists(path.join(musicDir, t.lossless_path)) : false;
                            if (!existsLossless && !t.url) {
                                console.log(`🗑️ [Consolidate] File missing for track ${t.id} (${oldP}), deleting from DB`);
                                this.database.deleteTrack(t.id);
                                deleted++; count++; continue;
                            }
                        } else if (oldP !== newP) {
                            this.database.updateTrackPath(t.id, newP, t.album_id);
                            success++; count++; continue;
                        }
                    }
                    if (oldP === newP) { skipped++; count++; continue; }
                    if (await this.storage.pathExists(fOld)) {
                        await this.storage.ensureDir(path.dirname(fNew));
                        // Pick a non-colliding destination if another track already lives at newP.
                        // Overwriting would silently destroy a different track's file.
                        let finalNewP = newP;
                        let finalFNew = fNew;
                        if (await this.storage.pathExists(finalFNew)) {
                            const owner = this.database.getTrackByPath(finalNewP);
                            if (owner && owner.id !== t.id) {
                                const parsed = path.parse(newP);
                                let attempt = 1;
                                while (attempt < 1000) {
                                    const candidate = path.join(parsed.dir, `${parsed.name} (${attempt})${parsed.ext}`).replace(/\\/g, "/");
                                    const candidateAbs = path.join(musicDir, candidate);
                                    if (!await this.storage.pathExists(candidateAbs)) {
                                        finalNewP = candidate;
                                        finalFNew = candidateAbs;
                                        break;
                                    }
                                    attempt++;
                                }
                                console.warn(`⚠️ [Consolidate] Destination ${newP} owned by track ${owner.id}, renaming to ${finalNewP}`);
                            }
                        }
                        await this.storage.move(fOld, finalFNew, { overwrite: true });
                        this.database.updateTrackPath(t.id, finalNewP, t.album_id);
                        migratedDirsMap.set(path.dirname(fOld), path.dirname(finalFNew));
                        if (t.lossless_path) {
                            const oldLossless = path.join(musicDir, t.lossless_path);
                            const losslessExt = path.extname(t.lossless_path);
                            const losslessBase = path.parse(finalNewP).name;
                            let newLosslessP = path.join(path.dirname(finalNewP), `${losslessBase}${losslessExt}`).replace(/\\/g, "/");
                            let newLossless = path.join(musicDir, newLosslessP);
                            if (await this.storage.pathExists(oldLossless) && oldLossless !== newLossless) {
                                // Same collision check for lossless
                                if (await this.storage.pathExists(newLossless)) {
                                    const losslessOwner = this.database.getTrackByPath(newLosslessP);
                                    if (losslessOwner && losslessOwner.id !== t.id) {
                                        const parsed = path.parse(newLosslessP);
                                        let attempt = 1;
                                        while (attempt < 1000) {
                                            const candidate = path.join(parsed.dir, `${parsed.name} (${attempt})${parsed.ext}`).replace(/\\/g, "/");
                                            const candidateAbs = path.join(musicDir, candidate);
                                            if (!await this.storage.pathExists(candidateAbs)) {
                                                newLosslessP = candidate;
                                                newLossless = candidateAbs;
                                                break;
                                            }
                                            attempt++;
                                        }
                                    }
                                }
                                await this.storage.ensureDir(path.dirname(newLossless));
                                await this.storage.move(oldLossless, newLossless, { overwrite: true });
                                this.database.updateTrackLosslessPath(t.id, newLosslessP);
                            }
                        }
                        success++;
                    } else skipped++;
                } catch (e) { console.error(`❌ [Consolidate] Failed to process ${t.file_path}:`, e); failed++; }
                count++;
                if (count % 100 === 0 && (global as any).gc) (global as any).gc();
            }

            // Migrate remaining non-audio files (covers, artwork, info files)
            for (const [oldDir, newDir] of migratedDirsMap.entries()) {
                try {
                    if (await this.storage.pathExists(oldDir)) {
                        const files = await this.storage.readdir(oldDir);
                        for (const file of files) {
                            const oldFile = path.join(oldDir, file);
                            const newFile = path.join(newDir, file);
                            const stat = await fs.stat(oldFile);
                            if (stat.isFile() && !await this.storage.pathExists(newFile)) {
                                console.log(`🚚 [Consolidate] Moving remaining non-audio file: ${file} -> ${path.relative(musicDir, newFile)}`);
                                await this.storage.ensureDir(newDir);
                                await this.storage.move(oldFile, newFile);
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`⚠️ [Consolidate] Failed to move leftover files in ${oldDir}:`, (err as any).message);
                }
            }
            // Sweep root directory for leftover artist folders (including those already consolidated in the past)
            try {
                const rootEntries = await this.storage.readdir(musicDir, { withFileTypes: true });
                const recognized = ["releases", "downloads", "tracks", "import", "localized", "cloud_imports", "gdrive", "gdrive:", "artwork", "assets", "artists"];
                
                for (const entry of rootEntries) {
                    if (entry.isDirectory() && !recognized.includes(entry.name.toLowerCase())) {
                        const artistDir = path.join(musicDir, entry.name);
                        const safeArtistName = entry.name.replace(/[^a-zA-Z0-9\s._-]/g, "_").trim();
                        
                        const albumEntries = await this.storage.readdir(artistDir, { withFileTypes: true });
                        for (const albumEntry of albumEntries) {
                            if (albumEntry.isDirectory()) {
                                const albumDir = path.join(artistDir, albumEntry.name);
                                const safeAlbumTitle = albumEntry.name.replace(/[^a-zA-Z0-9\s._-]/g, "_").trim();
                                
                                // Determine the target directory under tracks/
                                const targetDir = path.join(musicDir, "tracks", safeArtistName, safeAlbumTitle);
                                
                                // If the target directory already exists (meaning it was consolidated in the past or present)
                                if (await this.storage.pathExists(targetDir)) {
                                    // Move all files from albumDir to targetDir
                                    const files = await this.storage.readdir(albumDir);
                                    for (const file of files) {
                                        const srcFile = path.join(albumDir, file);
                                        const destFile = path.join(targetDir, file);
                                        try {
                                            const stat = await fs.stat(srcFile);
                                            if (stat.isFile() && !await this.storage.pathExists(destFile)) {
                                                console.log(`🚚 [Sweep Cleanup] Migrating leftover file: ${file} -> ${path.relative(musicDir, destFile)}`);
                                                await this.storage.move(srcFile, destFile);
                                            }
                                        } catch (fileErr) {}
                                    }
                                }
                            }
                        }

                        // Also check for any files directly inside the artist folder (e.g. cover.jpg)
                        const targetUnknownDir = path.join(musicDir, "tracks", safeArtistName, "Unknown Album");
                        if (await this.storage.pathExists(targetUnknownDir)) {
                            const files = await this.storage.readdir(artistDir);
                            for (const file of files) {
                                const srcFile = path.join(artistDir, file);
                                try {
                                    const stat = await fs.stat(srcFile);
                                    if (stat.isFile()) {
                                        const destFile = path.join(targetUnknownDir, file);
                                        if (!await this.storage.pathExists(destFile)) {
                                            console.log(`🚚 [Sweep Cleanup] Migrating leftover artist-level file: ${file} -> ${path.relative(musicDir, destFile)}`);
                                            await this.storage.move(srcFile, destFile);
                                        }
                                    }
                                } catch (fileErr) {}
                            }
                        }
                    }
                }
            } catch (sweepErr: any) {
                console.warn("⚠️ [Consolidate Sweep] Error sweeping root directory:", sweepErr.message);
            }

            if (deleted > 0) await this.librarySync.cleanupEmptyEntities();

            // Repair stale cover_paths caused by file moves.
            // For every album/artist whose cover/photo no longer exists on disk,
            // look at where the album's tracks now live and re-scan for cover images.
            await this.repairStaleCoverPaths(musicDir);

            // Clean up empty directories bottom-up
            await this.cleanupEmptyFolders(musicDir);

            return { success, failed, skipped, deleted };
        } finally { this.isConsolidating = false; }
    }

    /**
     * After consolidation (or any bulk file move), some albums/artists may have
     * cover_path / photo_path values pointing to files that were moved.
     * This pass locates the track-based directory for each album and re-discovers
     * a cover image there, updating the DB record so covers reappear immediately.
     */
    private async repairStaleCoverPaths(musicDir: string): Promise<void> {
        const absMusic = path.resolve(musicDir);
        const COVER_NAMES = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork.jpg", "artwork.png", "artwork/cover.jpg", "artwork/cover.png"];

        console.log(`🖼️ [Consolidate] Repairing stale album cover paths...`);
        let repairedAlbums = 0;
        let repairedArtists = 0;

        // --- Albums ---
        const albums = this.database.db.prepare("SELECT id, cover_path FROM albums WHERE cover_path IS NOT NULL").all() as { id: number, cover_path: string }[];
        for (const album of albums) {
            const absPath = path.join(absMusic, album.cover_path);
            if (await this.storage.pathExists(absPath)) continue; // still valid

            // Cover is gone — find any track in this album to locate the new directory
            const row = this.database.db.prepare(
                "SELECT file_path FROM tracks WHERE album_id = ? AND file_path IS NOT NULL LIMIT 1"
            ).get(album.id) as { file_path: string } | undefined;
            if (!row) continue;

            const trackDir = path.join(absMusic, path.dirname(row.file_path));
            let found = false;
            for (const name of COVER_NAMES) {
                const candidate = path.join(trackDir, name);
                if (await this.storage.pathExists(candidate)) {
                    const relCandidate = path.relative(absMusic, candidate).replace(/\\/g, "/");
                    this.database.updateAlbumCover(album.id, relCandidate);
                    repairedAlbums++;
                    found = true;
                    break;
                }
            }
            // If no cover found on disk, null out the stale path so placeholder shows cleanly
            if (!found) {
                this.database.updateAlbumCover(album.id, null as any);
            }
        }

        // --- Artists ---
        const artists = this.database.db.prepare("SELECT id, photo_path FROM artists WHERE photo_path IS NOT NULL").all() as { id: number, photo_path: string }[];
        for (const artist of artists) {
            const absPath = path.join(absMusic, artist.photo_path);
            if (await this.storage.pathExists(absPath)) continue; // still valid

            // Artist photo moved — find any track by this artist to get the directory
            const row = this.database.db.prepare(
                "SELECT file_path FROM tracks WHERE artist_id = ? AND file_path IS NOT NULL LIMIT 1"
            ).get(artist.id) as { file_path: string } | undefined;
            if (!row) continue;

            // Look for artist photo files in the artist directory (one level up from the album dir)
            const trackDir = path.join(absMusic, path.dirname(row.file_path));
            const artistDir = path.dirname(trackDir);
            const photoNames = ["artist.jpg", "artist.png", "photo.jpg", "photo.png", "avatar.jpg", "avatar.png", "folder.jpg", "folder.png"];
            let artistPhotoFixed = false;
            outer: for (const searchDir of [trackDir, artistDir]) {
                for (const name of photoNames) {
                    const candidate = path.join(searchDir, name);
                    if (await this.storage.pathExists(candidate)) {
                        const relCandidate = path.relative(absMusic, candidate).replace(/\\/g, "/");
                        this.database.db.prepare("UPDATE artists SET photo_path = ? WHERE id = ?").run(relCandidate, artist.id);
                        repairedArtists++;
                        artistPhotoFixed = true;
                        break outer;
                    }
                }
            }
            // Null out stale path if no photo found on disk
            if (!artistPhotoFixed) {
                this.database.db.prepare("UPDATE artists SET photo_path = NULL WHERE id = ?").run(artist.id);
            }
        }

        if (repairedAlbums > 0 || repairedArtists > 0) {
            console.log(`✅ [Consolidate] Repaired ${repairedAlbums} album covers, ${repairedArtists} artist photos.`);
        } else {
            console.log(`✨ [Consolidate] All cover paths are up to date.`);
        }
    }

    private async cleanupEmptyFolders(musicDir: string): Promise<void> {
        const IGNORED_FILES = new Set(['.ds_store', 'thumbs.db', '.gitkeep', '.jwt-secret']);
        
        const getDirectoryTree = async (dirPath: string): Promise<string[]> => {
            const subdirs: string[] = [];
            try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const fullPath = path.join(dirPath, entry.name);
                        subdirs.push(fullPath);
                        const nested = await getDirectoryTree(fullPath);
                        subdirs.push(...nested);
                    }
                }
            } catch (e) {}
            return subdirs;
        };

        const isDirEmptyOrDead = async (dirPath: string): Promise<boolean> => {
            try {
                if (!await fs.pathExists(dirPath)) return true;
                const entries = await fs.readdir(dirPath);
                const validEntries = entries.filter(e => !IGNORED_FILES.has(e.toLowerCase()));
                return validEntries.length === 0;
            } catch (e) {
                return false;
            }
        };

        try {
            const allDirs = await getDirectoryTree(musicDir);
            // Sort deepest first
            const sortedDirs = allDirs.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
            for (const dir of sortedDirs) {
                const isEmpty = await isDirEmptyOrDead(dir);
                if (isEmpty) {
                    console.log(`🗑️ [Consolidate Cleanup] Removing empty folder: ${path.relative(musicDir, dir)}`);
                    await fs.remove(dir);
                }
            }
        } catch (e: any) {
            console.error("⚠️ [Consolidate Cleanup] Error cleaning empty folders:", e.message);
        }
    }
}

function processQueueWaveform(file: string, id: number, dur: number | undefined, queue: ProcessingQueue, db: DatabaseService) {
    queue.add(() => WaveformPeakService.generateWaveform(file, 100, dur))
        .then(p => db.updateTrackWaveform(id, JSON.stringify(p)))
        .catch(() => {});
}
