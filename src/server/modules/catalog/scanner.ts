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

/**
 * Optimized processing queue with concurrency support to handle multiple heavy tasks (ffmpeg, conversion) in parallel.
 */
class ProcessingQueue {
    private queue: (() => Promise<any>)[] = [];
    private activeWorkers = 0;
    private readonly MAX_CONCURRENCY = 4; // Allow up to 4 parallel processes
    private readonly MAX_QUEUE_SIZE = 200;

    async add<T>(task: () => Promise<T>): Promise<T> {
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            console.warn(`[Queue] ⚠️ Maximum queue size (${this.MAX_QUEUE_SIZE}) reached. Throttling scanner...`);
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
        if (this.activeWorkers >= this.MAX_CONCURRENCY || this.queue.length === 0) return;
        
        this.activeWorkers++;
        const task = this.queue.shift();
        if (task) {
            try {
                await task();
            } catch (e) {
                console.error("[Queue] Task execution failed:", e);
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

export class Scanner implements ScannerService {
    private watcher: FSWatcher | null = null;
    private isScanning = false;
    private pendingScan: Promise<ScanResult> | null = null;
    private processQueue = new ProcessingQueue();

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
        private autotagger?: AutoTaggerService
    ) {
        this.lookupPrimaryAdmin();
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
                const absoluteCoverPath = path.resolve(dir, config.cover);
                if (await this.storage.pathExists(absoluteCoverPath)) {
                    coverPath = this.normalizePath(absoluteCoverPath, musicDir);
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
                this.database.updateAlbum(albumId, {
                    artist_id: artistId || existingAlbum.artist_id,
                    cover_path: coverPath || existingAlbum.cover_path,
                    genre: config.genres?.join(", ") || existingAlbum.genre,
                    description: config.description || existingAlbum.description,
                    download: config.download || existingAlbum.download,
                    external_links: linksJson || existingAlbum.external_links,
                    type: config.type || existingAlbum.type,
                    year: config.year || existingAlbum.year
                });
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
            }

            this.folderToAlbumMap.set(dir, albumId);

            // Note: We skip processing config.metadata.tracks here for library albums
            // because library albums don't use the release_tracks table.
            // Tracks found in the folder will be scanned and associated with this albumId
            // by the processAudioFile method later in the scan process.
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
        let hash: string | null = null;
        let metadata: any = null;
        const LOSSLESS_EXTENSIONS = ['.wav', '.flac'];
        const normalizedPath = this.normalizePath(currentFilePath, musicDir);
        let existing: any = this.database.getTrackByPath(normalizedPath);
        let albumId: number | null = overrideAlbumId || this.folderToAlbumMap.get(dir) || null;
        let artistId: number | null = overrideArtistId || null;

        try {
            try {
                hash = await getFastFileHash(currentFilePath);
                const existingByHash = this.database.getTrackByHash(hash);
                if (existingByHash) {
                    if (ownerId) {
                        this.database.addTrackOwner(existingByHash.id, ownerId);
                        if (existingByHash.owner_id === null) {
                            this.database.db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, existingByHash.id);
                        }
                    }
                    if (existingByHash.album_id && ownerId) {
                        this.database.addAlbumOwner(existingByHash.album_id, ownerId);
                    }

                    // If it's a move (path changed), we update the path and continue processing
                    // to ensure metadata/album associations are refreshed for the new location.
                    if (existingByHash.file_path !== normalizedPath) {
                        console.log(`🚚 [Scanner] Track ${existingByHash.id} moved: ${existingByHash.file_path} -> ${normalizedPath}`);
                        this.database.updateTrackPath(existingByHash.id, normalizedPath, existingByHash.album_id);
                        if (!existing) existing = existingByHash;
                    } else {
                        // Same path and hash, safe to return early
                        if (currentFilePath.includes(path.sep + 'tmp' + path.sep) || currentFilePath.includes('/tmp/')) {
                            await this.storage.remove(currentFilePath);
                        }
                        return { originalPath: filePath, success: true, message: "Hash matched, path identical.", trackId: existingByHash.id };
                    }
                }
            } catch (e) {}

            // 1. Get Metadata if needed for hints/tags
            if (!metadata) {
                try {
                    metadata = await parseFileWithRetry(currentFilePath);
                } catch (e) {}
            }
            const common = metadata?.common || {};
            const format = metadata?.format || {};
            const albumArtist = common.albumartist;

            // 2. Resolve Artist (Priority: override > hint > tag > unknown)
            if (!artistId) {
                const artName = metadataHints?.artist || common.artist || "Unknown Artist";
                const existArt = this.database.getArtistByName(artName);
                artistId = existArt ? existArt.id : this.database.createArtist(artName, undefined, undefined, undefined, undefined, undefined, 'private');
            }

            // 3. Resolve Album (Priority: existing > override > hint > tag > folder)
            
            // 3.1 Use existing track's album if available (and if it's not a generic folder album)
            if (!albumId && existing && existing.album_id) {
                const currentAlbum = this.database.getAlbum(existing.album_id);
                if (currentAlbum && (currentAlbum.is_release || !currentAlbum.slug.startsWith("lib-"))) {
                    albumId = existing.album_id;
                } else {
                    // It's a generic folder album. We'll try to find a better one via tags or hints.
                    console.log(`📂 [Scanner] Track ${existing.id} currently in folder-based album "${currentAlbum?.title}". Checking for better metadata...`);
                }
            }


            // 3.2 Use hint or override if provided
            const albumNameHint = metadataHints?.album;
            if (!albumId && albumNameHint) {
                const albumSlug = slugify("hint-" + artistId + "-" + albumNameHint);
                let album = this.database.getAlbumBySlug(albumSlug);
                
                if (!album) {
                    albumId = this.database.createAlbum({
                        title: albumNameHint,
                        slug: albumSlug,
                        artist_id: artistId,
                        album_artist: albumArtist || null,
                        owner_id: ownerId || this.primaryAdminId,
                        date: metadataHints.year ? `${metadataHints.year}-01-01` : null,
                        year: metadataHints.year || null,
                        cover_path: suggestedCoverPath ? this.normalizePath(suggestedCoverPath, musicDir) : null,
                        genre: metadataHints.genre || "Imported",
                        description: `Imported via metadata hint`,
                        type: 'album',
                        download: null,
                        price: 0,
                        price_usdc: 0,
                        currency: 'ETH',
                        external_links: null,
                        is_public: false,
                        visibility: 'private',
                        is_release: false,
                        published_at: new Date().toISOString(),
                        published_to_gundb: false,
                        published_to_ap: false,
                        license: null,
                        status: 'draft',
                    });
                } else {
                    albumId = album.id;
                }
            }

            // 3.3 Resolve from Metadata Tags (ID3)
            if (!albumId && common.album) {
                const albumName = common.album;
                const albumSlug = slugify("tag-" + artistId + "-" + albumName);
                let album = this.database.getAlbumBySlug(albumSlug);
                
                if (!album) {
                    albumId = this.database.createAlbum({
                        title: albumName,
                        slug: albumSlug,
                        artist_id: artistId,
                        album_artist: albumArtist || common.artist || null,
                        owner_id: ownerId || this.primaryAdminId,
                        date: common.year ? `${common.year}-01-01` : (common.date ? common.date : null),
                        year: common.year || (common.date ? new Date(common.date).getFullYear() : null),
                        cover_path: suggestedCoverPath ? this.normalizePath(suggestedCoverPath, musicDir) : null,
                        genre: common.genre ? common.genre.join(", ") : "Library",
                        description: `Imported from tags`,
                        type: 'album',
                        download: null,
                        price: 0,
                        price_usdc: 0,
                        currency: 'ETH',
                        external_links: null,
                        is_public: false,
                        visibility: 'private',
                        is_release: false,
                        published_at: new Date().toISOString(),
                        published_to_gundb: false,
                        published_to_ap: false,
                        license: null,
                        status: 'draft',
                    });
                } else {
                    albumId = album.id;
                }
            }

            // 3.4 Fallback to folder-based album (Last Resort)
            if (albumId === null && dir.startsWith(musicDir)) {
                albumId = await this.getOrCreateLibraryAlbum(dir, musicDir, suggestedCoverPath, ownerId, albumArtist);
            }


            // 4. Handle Existing Track by Path or Metadata
            if (!existing) {
                // Try finding by metadata if title/artist/album are known
                const title = metadataHints?.title || common.title || path.basename(currentFilePath, ext);
                existing = this.database.getTrackByMetadata(title, artistId, albumId);
                
                if (!existing) {
                    // Try finding by path siblings
                    const baseName = path.basename(currentFilePath, ext);
                    const siblingExts = ['.wav', '.flac', '.mp3', '.m4a', '.ogg'];
                    for (const sExt of siblingExts) {
                        if (sExt === ext) continue;
                        const siblingPath = this.normalizePath(path.join(dir, baseName + sExt), musicDir);
                        const sibling = this.database.getTrackByPath(siblingPath);
                        if (sibling) {
                            existing = sibling;
                            break;
                        }
                    }
                }
            }

            if (existing) {
                // Update hash if it changed (e.g. metadata was updated)
                if (hash && existing.hash !== hash) {
                    this.database.updateTrackHash(existing.id, hash);
                }

                if (ownerId) this.database.addTrackOwner(existing.id, ownerId);
                
                const isLossless = LOSSLESS_EXTENSIONS.includes(ext);
                const mp3Path = isLossless ? normalizedPath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3') : normalizedPath;
                if (isLossless && !existing.lossless_path) {
                    this.database.updateTrackLosslessPath(existing.id, normalizedPath);
                }

                // --- ALBUM ASSOCIATION PROTECTION ---
                // Only update album if the track doesn't have one, or if we found a "stronger" one (like a formal Release)
                // We must NEVER overwrite a manual association (usually a Release) with a folder-based Library album.
                let finalAlbumId = albumId;
                if (existing.album_id && existing.album_id !== albumId) {
                    const existingAlbum = this.database.getAlbum(existing.album_id);
                    const newAlbum = albumId ? this.database.getAlbum(albumId) : null;
                    
                    const isExistingFormal = existingAlbum?.is_release || false;
                    const isNewFormal = newAlbum?.is_release || false;
                    
                    // Rule 1: If existing is a Release and new is just a folder, PROTECT.
                    // Rule 2: If both are same type, PROTECT existing (assume manual intent).
                    if (isExistingFormal && !isNewFormal) {
                        console.log(`🛡️ [Scanner] Protecting existing release association for track ${existing.id} (Current: ${existing.album_id}, Found Folder: ${albumId})`);
                        finalAlbumId = existing.album_id; 
                    } else if (existing.album_id && !isNewFormal) {
                        // General protection for any existing association if the new one isn't a "Formal Release"
                        finalAlbumId = existing.album_id;
                    }
                }

                this.database.updateTrackPath(existing.id, mp3Path, finalAlbumId);
                if (existing.album_id !== finalAlbumId) this.database.updateTrackAlbum(existing.id, finalAlbumId);


                // --- ARTIST ASSOCIATION PROTECTION ---
                if (artistId && existing.artist_id !== artistId) {
                    let shouldUpdateArtist = false;
                    
                    if (!existing.artist_id) {
                        shouldUpdateArtist = true;
                    } else {
                        const existingArt = this.database.getArtist(existing.artist_id);
                        const currentArtistName = existingArt?.name || existing.artist_name;
                        const newArtistName = metadataHints?.artist || common.artist;

                        // Only update if:
                        // 1. Existing is "Unknown Artist"
                        // 2. We have an explicit override (hint/config)
                        // 3. The artist record is missing AND the name in tags is actually different (not just a casing change)
                        if (!existingArt) {
                            if (currentArtistName && newArtistName && currentArtistName.toLowerCase() !== newArtistName.toLowerCase()) {
                                // If the record is missing but names match, don't update ID yet, let database repair handle it
                                // if names differ significantly, maybe it is a new artist.
                                // BUT in TuneCamp, we prefer protecting manual edits.
                                shouldUpdateArtist = false;
                            }
                        } else if (existingArt.name === 'Unknown Artist' || overrideArtistId) {
                            shouldUpdateArtist = true;
                        }
                    }

                    if (shouldUpdateArtist) {
                        this.database.updateTrackArtist(existing.id, artistId);
                    } else {
                        console.log(`🛡️ [Scanner] Protecting existing artist for track ${existing.id} (Current: ${existing.artist_name || 'ID ' + existing.artist_id}, Tag Suggested: ${common.artist || 'ID ' + artistId})`);
                    }
                }
                
                // If duration is missing, re-fetch it
                if (!existing.duration || existing.duration <= 0) {
                    const { common, format } = await parseFile(currentFilePath);
                    let duration: number | null = await getDurationFromFfmpeg(currentFilePath);
                    if (duration == null) duration = format.duration || null;
                    if (duration) {
                        this.database.updateTrackDuration(existing.id, duration);
                        // Also update bitrate/sample rate if available
                        if (format.bitrate) this.database.updateTrackBitrate(existing.id, Math.round(format.bitrate / 1000));
                    }
                }

                if (!existing.waveform) {
                    processQueueWaveform(currentFilePath, existing.id, existing.duration, this.processQueue, this.database);
                }
                return { originalPath: filePath, success: true, message: "Track updated.", trackId: existing.id };
            }

            // 5. Create New Track
            let duration: number | null = await getDurationFromFfmpeg(currentFilePath);
            if (duration == null) duration = format.duration || null;

            if (duration === null) {
                console.warn(`⚠️ [Scanner] Could not determine duration for: ${path.basename(currentFilePath)}. This will result in 0 storage usage stats.`);
            }

            const isLossless = LOSSLESS_EXTENSIONS.includes(ext);
            const trackId = this.database.createTrack({
                title: metadataHints?.title || common.title || path.basename(currentFilePath, ext),
                album_id: albumId,
                artist_id: artistId,
                owner_id: ownerId || this.primaryAdminId,
                track_num: common.track?.no || null,
                duration: duration,
                file_path: isLossless ? this.normalizePath(currentFilePath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3'), musicDir) : normalizedPath,
                format: isLossless ? 'mp3' : (format.codec || ext.substring(1)),
                bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                sample_rate: format.sampleRate || null,
                lossless_path: isLossless ? normalizedPath : null,
                waveform: null,
                year: metadataHints?.year || common.year || (common.date ? new Date(common.date).getFullYear() : null),
                genre: metadataHints?.genre || (common.genre ? common.genre.join(", ") : null),
                url: null,
                service: null,
                external_artwork: null,
                price: 0,
                price_usdc: 0,
                currency: 'ETH',
                hash: hash
            });

            processQueueWaveform(currentFilePath, trackId, duration || undefined, this.processQueue, this.database);

            let queuedConversion = false;
            if (ext === ".wav") {
                queuedConversion = true;
                this.processQueue.add(() => convertWavToMp3(currentFilePath));
            }

            if (this.autotagger && (artistId === null || albumId === null || trackId)) {
                const track = this.database.getTrack(trackId);
                if (track && (track.artist_name === 'Unknown Artist' || !track.album_id)) {
                    this.autotagger.auditTrack(track, { forceRepair: false, useAI: true }).catch(e => {
                        console.error(`[Scanner] Auto-tagging failed for track ${trackId}:`, e);
                    });
                }
            }

            return { originalPath: filePath, success: true, message: "Processed.", trackId, queuedConversion };
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

        // --- SCALABILITY FIX: Memory efficient deduplication and cleanup ---
        await this.deduplicateLibraryTracks();
        await this.cleanupStaleLibraryTracks(dir, knownFiles);
        // -------------------------------------------------------------------

        await this.cleanupEmptyEntities();
        this.clearCaches();
        return { successful, failed };
    }

    private async cleanupEmptyEntities() {
        console.log("🧹 [Scanner] Cleaning up empty albums and artists...");
        try {
            // 1. Clean up empty albums (albums with no tracks)
            // We exclude formal releases (is_release = 1) from automatic deletion 
            // just in case they are manually curated empty releases, though usually they aren't.
            const emptyAlbums = this.database.db.prepare(`
                SELECT a.id FROM albums a
                LEFT JOIN tracks t ON a.id = t.album_id
                WHERE t.id IS NULL AND a.is_release = 0
            `).all() as { id: number }[];
            
            for (const row of emptyAlbums) {
                console.log(`🗑️ [Scanner] Deleting empty album ${row.id}`);
                this.database.deleteAlbum(row.id);
            }

            // 2. Clean up empty artists (artists with no tracks AND no albums)
            const emptyArtists = this.database.db.prepare(`
                SELECT ar.id FROM artists ar
                LEFT JOIN albums a ON ar.id = a.artist_id
                LEFT JOIN tracks t ON ar.id = t.artist_id
                WHERE a.id IS NULL AND t.id IS NULL
            `).all() as { id: number }[];

            for (const row of emptyArtists) {
                console.log(`🗑️ [Scanner] Deleting empty artist ${row.id}`);
                this.database.deleteArtist(row.id);
            }

            // 3. Fix orphan albums (albums with no artist but all tracks share one artist)
            const orphans = this.database.db.prepare("SELECT id, title FROM albums WHERE artist_id IS NULL").all() as any[];
            for (const o of orphans) {
                const tracks = this.database.getTracks(o.id);
                if (tracks.length === 0) continue; // Should be caught by step 1
                const arts = [...new Set(tracks.map(t => t.artist_id).filter(id => id !== null))];
                if (arts.length === 1) this.database.updateAlbumArtist(o.id, arts[0]!);
            }
        } catch (e) {
            console.error("❌ [Scanner] Error cleaning up empty entities:", e);
        }
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
            
            // Keep the first one, delete others
            const primaryId = ids[0];
            const primary = this.database.getTrack(primaryId);
            if (!primary) continue;

            for (let i = 1; i < ids.length; i++) {
                const other = this.database.getTrack(ids[i]);
                if (!other) continue;

                const lossless = other.lossless_path || (path.extname(other.file_path || '').toLowerCase() === '.wav' ? other.file_path : null);
                if (lossless && !primary.lossless_path) {
                    this.database.updateTrackLosslessPath(primary.id, lossless);
                }
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
            const pKey = t.file_path.toLowerCase();
            const pExists = knownFiles.has(pKey);
            const lExists = t.lossless_path ? knownFiles.has(t.lossless_path.toLowerCase()) : false;
            if (!pExists && !lExists) {
                toDelete.push(t.id);
            } else if (pExists && t.lossless_path && !lExists) {
                toUpdateLossless.push(t.id);
            }
        }

        for (const id of toDelete) {
            this.database.deleteTrack(id);
        }
        for (const id of toUpdateLossless) {
            this.database.updateTrackLosslessPath(id, null);
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
            const cache = new Map<number, any>();
            const iter = Array.from(this.database.iterateTracks("file_path IS NOT NULL"));
            for (const t of iter) {
                try {
                    if (!t.file_path) { count++; continue; }
                    
                    const oldP = t.file_path;
                    const fOld = path.join(musicDir, oldP);
                    const existsOld = await this.storage.pathExists(fOld);
                    
                    let art = t.artist_id ? (cache.get(t.artist_id) || this.database.getArtist(t.artist_id)) : null;
                    if (t.artist_id && art) cache.set(t.artist_id, art);
                    
                    const name = (art?.name || "Unknown").trim();
                    const title = (t.title || "Untitled").trim();
                    const safe = (s: string) => s.replace(/[^a-zA-Z0-9\s._-]/g, "_").trim();
                    const base = `${safe(name)} - ${safe(title)}`;
                    
                    const ext = path.extname(oldP).toLowerCase();
                    const newP = path.join(path.dirname(oldP), `${base}${ext}`).replace(/\\/g, "/");
                    const fNew = path.join(musicDir, newP);

                    // If original file is missing
                    if (!existsOld) {
                        const existsNew = await this.storage.pathExists(fNew);
                        if (!existsNew) {
                            // Check lossless path as well if available
                            const existsLossless = t.lossless_path ? await this.storage.pathExists(path.join(musicDir, t.lossless_path)) : false;
                            
                            if (!existsLossless && !t.url) {
                                console.log(`🗑️ [Consolidate] File missing for track ${t.id} (${oldP}), deleting from DB`);
                                this.database.deleteTrack(t.id);
                                deleted++;
                                count++;
                                continue;
                            }
                        } else if (oldP !== newP) {
                            // File already exists at new path, just update DB
                            this.database.updateTrackPath(t.id, newP, t.album_id);
                            success++;
                            count++;
                            continue;
                        }
                    }

                    if (oldP === newP) { skipped++; count++; continue; }

                    if (await this.storage.pathExists(fOld)) {
                        await this.storage.move(fOld, fNew, { overwrite: true });
                        this.database.updateTrackPath(t.id, newP, t.album_id);
                        
                        // Also rename lossless path if it exists and follows the same naming pattern
                        if (t.lossless_path) {
                            const oldLossless = path.join(musicDir, t.lossless_path);
                            const losslessExt = path.extname(t.lossless_path);
                            const newLosslessP = path.join(path.dirname(t.lossless_path), `${base}${losslessExt}`).replace(/\\/g, "/");
                            const newLossless = path.join(musicDir, newLosslessP);
                            
                            if (await this.storage.pathExists(oldLossless) && oldLossless !== newLossless) {
                                await this.storage.move(oldLossless, newLossless, { overwrite: true });
                                this.database.updateTrackLosslessPath(t.id, newLosslessP);
                            }
                        }
                        success++;
                    } else skipped++;
                } catch (e) { 
                    console.error(`❌ [Consolidate] Failed to process ${t.file_path}:`, e);
                    failed++; 
                }
                count++;
                if (count % 100 === 0 && (global as any).gc) (global as any).gc();
            }
            
            // Clean up any albums/artists that became empty due to deleted tracks
            if (deleted > 0) {
                await this.cleanupEmptyEntities();
            }
            
            return { success, failed, skipped, deleted };
        } finally { this.isConsolidating = false; }
    }
}

function processQueueWaveform(file: string, id: number, dur: number | undefined, queue: ProcessingQueue, db: DatabaseService) {
    queue.add(() => WaveformPeakService.generateWaveform(file, 100, dur))
        .then(p => db.updateTrackWaveform(id, JSON.stringify(p)))
        .catch(() => {});
}
