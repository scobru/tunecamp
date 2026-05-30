import path from "path";
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
    scanDirectory(dir: string): Promise<ScanResult>;
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
            if (!album.cover_path || forcedCoverPath) {
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
        if (!AUDIO_EXTENSIONS.includes(ext)) return null;

        while (this.hashingSemaphore >= this.MAX_CONCURRENT_HASHING) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.hashingSemaphore++;
        try {
            // Get Metadata — use worker thread to keep main event loop free
            let metadata: any = null;
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
                    if (!track.waveform) {
                        processQueueWaveform(currentFilePath, track.id, track.duration || undefined, this.waveformQueue, this.database);
                    }

                    // Process Conversion if needed (separate queue, limited concurrency)
                    if (syncResult.queuedConversion) {
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

    public async scanDirectory(dir: string): Promise<ScanResult> {
        if (this.isScanning) return this.pendingScan || Promise.resolve({ successful: [], failed: [] });
        this.musicDirectory = dir;
        this.isScanning = true;
        this.pendingScan = (async () => {
            try { return await this.doScan(dir); } finally { this.isScanning = false; this.pendingScan = null; }
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

    private async doScan(dir: string): Promise<ScanResult> {
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
                    if (AUDIO_EXTENSIONS.includes(ext)) audioFiles.push(full);
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
        const groups = new Map<string, number[]>();
        const tracksIter = this.database.iterateTracks();
        
        for (const t of tracksIter) {
            const k = `${t.album_id}|${t.artist_id}|${t.title.toLowerCase().trim()}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(t.id);
        }

        for (const [key, ids] of groups.entries()) {
            if (ids.length <= 1) continue;
            const primaryId = ids[0];
            const primary = this.database.getTrack(primaryId);
            if (!primary) continue;

            for (let i = 1; i < ids.length; i++) {
                const other = this.database.getTrack(ids[i]);
                if (!other) continue;
                const lossless = other.lossless_path || (path.extname(other.file_path || '').toLowerCase() === '.wav' ? other.file_path : null);
                if (lossless && !primary.lossless_path) this.database.updateTrackLosslessPath(primary.id, lossless);
                this.database.deleteTrack(other.id);
            }
        }
    }

    private async cleanupStaleLibraryTracks(musicDir: string, knownFiles: Set<string>) {
        console.log("🧹 [Scanner] Running memory-efficient stale track cleanup...");
        const tracksIter = this.database.iterateTracks();
        const toDelete: number[] = [];
        const toUpdateLossless: number[] = [];

        for (const t of tracksIter) {
            if (!t.file_path) continue;
            // Ignore Google Drive and remote tracks
            if (t.service && t.service !== 'local-fs') continue;
            if (t.file_path.startsWith('gdrive://') || t.file_path.startsWith('http://') || t.file_path.startsWith('https://')) continue;

            const pKey = t.file_path.toLowerCase();
            const pExists = knownFiles.has(pKey);
            const lExists = t.lossless_path ? knownFiles.has(t.lossless_path.toLowerCase()) : false;
            if (!pExists && !lExists) toDelete.push(t.id);
            else if (pExists && t.lossless_path && !lExists) toUpdateLossless.push(t.id);
        }

        for (const id of toDelete) this.database.deleteTrack(id);
        for (const id of toUpdateLossless) this.database.updateTrackLosslessPath(id, null);
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
                    
                    // Retain subfolder prefix (releases, downloads, tracks, import, localized, cloud_imports, gdrive, artwork, assets)
                    const pathParts = oldP.split("/");
                    let subfolder = "";
                    if (pathParts.length > 1) {
                        const firstSegment = pathParts[0];
                        const recognized = ["releases", "downloads", "tracks", "import", "localized", "cloud_imports", "gdrive", "artwork", "assets"];
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
                        await this.storage.move(fOld, fNew, { overwrite: true });
                        this.database.updateTrackPath(t.id, newP, t.album_id);
                        if (t.lossless_path) {
                            const oldLossless = path.join(musicDir, t.lossless_path);
                            const losslessExt = path.extname(t.lossless_path);
                            const newLosslessP = path.join(newDir, `${base}${losslessExt}`).replace(/\\/g, "/");
                            const newLossless = path.join(musicDir, newLosslessP);
                            if (await this.storage.pathExists(oldLossless) && oldLossless !== newLossless) {
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
            if (deleted > 0) await this.librarySync.cleanupEmptyEntities();
            return { success, failed, skipped, deleted };
        } finally { this.isConsolidating = false; }
    }
}

function processQueueWaveform(file: string, id: number, dur: number | undefined, queue: ProcessingQueue, db: DatabaseService) {
    queue.add(() => WaveformPeakService.generateWaveform(file, 100, dur))
        .then(p => db.updateTrackWaveform(id, JSON.stringify(p)))
        .catch(() => {});
}
