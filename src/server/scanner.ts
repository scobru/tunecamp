import path from "path";
import chokidar from "chokidar";
import { parseFile } from "music-metadata";
import { parse } from "yaml";
import { WaveformPeakService } from "./waveform.js";
import { slugify } from "../utils/audioUtils.js";
import { convertWavToMp3, getDurationFromFfmpeg } from "./ffmpeg.js";
import { getFastFileHash } from "../utils/fileUtils.js";
import type { DatabaseService, Track, Album, Artist, Release } from "./database.js";
/**
 * Simple sequential processing queue to avoid over-parallelizing heavy tasks (ffmpeg, conversion)
 */
class ProcessingQueue {
    queue: (() => Promise<any>)[] = [];
    processing = false;
    MAX_QUEUE_SIZE = 100; // Reduced from 500 to prevent memory pressure
    async add(task: () => Promise<any>): Promise<any> {
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            console.warn(`[Queue] ⚠️ Maximum queue size (${this.MAX_QUEUE_SIZE}) reached. Throttling scanner...`);
            await new Promise(r => setTimeout(r, 2000)); // Increased wait time
        }
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                }
                catch (err) {
                    reject(err);
                }
            });
            this.process();
        });
    }
    async process() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                try {
                    await task();
                }
                catch (e) {
                }
            }
        }
        this.processing = false;
    }
    get size() {
        return this.queue.length;
    }
}
/**
 * Robust wrapper for music-metadata parseFile with retry mechanism.
 */
async function parseFileWithRetry(filePath: string, retries = 3, delay = 500) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await parseFile(filePath, { skipCovers: true });
        }
        catch (err: any) {
            lastError = err;
            const isRangeError = err instanceof RangeError || err?.code === 'ERR_OUT_OF_RANGE';
            if (isRangeError || err?.code === 'EBUSY' || err?.code === 'ENOENT') {
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
export class Scanner {
    database: DatabaseService;
    storage: any;
    watcher: any | null = null;
    isScanning = false;
    pendingScan: Promise<any> | null = null;
    processQueue = new ProcessingQueue();
    folderToAlbumMap = new Map<string, number>();
    folderToArtistMap = new Map<string, number>();
    folderToExistingAlbumMap = new Map<string, number>();
    lastGcTime = Date.now();
    musicDirectory: string | null = null;
    hashingSemaphore = 0;
    MAX_CONCURRENT_HASHING = 2;
    isConsolidating = false;
    scannerStartTime = Date.now();
    WATCHER_STARTUP_DELAY = 60000;
    primaryAdminId: number | null = null;
    constructor(database: DatabaseService, storage: any) {
        this.database = database;
        this.storage = storage;
        this.lookupPrimaryAdmin();
    }
    lookupPrimaryAdmin() {
        try {
            const admin = this.database.db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
            if (admin) {
                this.primaryAdminId = admin.id;
            }
        }
        catch (e) {
            console.error("[Scanner] Failed to lookup primary admin:", e);
        }
    }
    clearCaches() {
        this.folderToAlbumMap.clear();
        this.folderToArtistMap.clear();
        this.folderToExistingAlbumMap.clear();
        const mem = process.memoryUsage();
        const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
        const shouldForceGc = heapUsedMB > 1500;
        if (typeof global.gc === 'function' && (shouldForceGc || Date.now() - this.lastGcTime > 60000)) {
            try {
                global.gc();
                this.lastGcTime = Date.now();
            }
            catch (e) { }
        }
    }
    async getOrCreateLibraryAlbum(dir: string, musicDir: string, forcedCoverPath?: string | null, ownerId?: number | null, albumArtist?: string | null): Promise<number> {
        const relativeDir = this.normalizePath(dir, musicDir);
        const isRoot = relativeDir === "." || relativeDir === "";
        if (this.folderToAlbumMap.has(dir))
            return this.folderToAlbumMap.get(dir) as number;
        // Check if this is a formal release directory (music/releases/slug)
        // We use the slug from the directory name to look up the release
        if (relativeDir.startsWith("releases/")) {
            const pathParts = relativeDir.split("/");
            if (pathParts.length >= 2) {
                const releaseSlug = pathParts[1];
                const formalRelease = this.database.getReleaseBySlug(releaseSlug);
                if (formalRelease && formalRelease.id !== undefined) {
                    console.log(`📂 [Scanner] Recognized formal release directory: ${relativeDir} -> Release ${formalRelease.id}`);
                    this.folderToAlbumMap.set(dir, formalRelease.id!);
                    return formalRelease.id!;
                }
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
    normalizePath(filePath: string, musicDir: string): string {
        try {
            const absoluteMusicDir = path.resolve(musicDir);
            const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(musicDir, filePath);
            let relative = path.relative(absoluteMusicDir, absoluteFilePath).replace(/\\/g, "/");
            while (relative.startsWith("../")) {
                relative = relative.substring(3);
            }
            if (relative === "..")
                return ".";
            return relative;
        }
        catch (e) {
            return filePath.replace(/\\/g, "/");
        }
    }
    async processGlobalConfigs(rootDir: string, musicDir: string): Promise<void> {
        const artistPath = path.join(rootDir, "artist.yaml");
        if (await this.storage.pathExists(artistPath)) {
            try {
                const content = await this.storage.readFile(artistPath, "utf-8");
                const config = parse(content);
                if (config.name) {
                    const existingArtist = this.database.getArtistByName(config.name);
                    let artistId;
                    const avatarPath = config.avatar
                        ? this.normalizePath(path.resolve(rootDir, config.avatar), musicDir)
                        : (config.image ? this.normalizePath(path.resolve(rootDir, config.image), musicDir) : undefined);
                    if (existingArtist) {
                        artistId = existingArtist.id;
                        this.database.updateArtist(artistId, config.name, config.bio, avatarPath, config.links);
                    }
                    else {
                        artistId = this.database.createArtist(config.name, config.bio, avatarPath, config.links);
                    }
                    this.folderToArtistMap.set(rootDir, artistId);
                }
            }
            catch (e) { }
        }
        const catalogPath = path.join(rootDir, "catalog.yaml");
        if (await this.storage.pathExists(catalogPath)) {
            try {
                const content = await this.storage.readFile(catalogPath, "utf-8");
                const config = parse(content);
                if (config.title)
                    this.database.setSetting("siteName", config.title);
                if (config.description)
                    this.database.setSetting("siteDescription", config.description);
                if (config.url)
                    this.database.setSetting("siteUrl", config.url);
                if (config.donationLinks) {
                    this.database.setSetting("donationLinks", JSON.stringify(config.donationLinks));
                }
            }
            catch (e) { }
        }
    }
    async processReleaseConfig(filePath: string, musicDir: string): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            const content = await this.storage.readFile(filePath, "utf-8");
            const config = parse(content);
            if (!config.title)
                return;
            let artistId: number | null = null;
            if (config.artist) {
                const existingArtist = this.database.getArtistByName(config.artist);
                artistId = existingArtist ? existingArtist.id! : this.database.createArtist(config.artist);
            }
            else {
                let current = dir;
                while (current.length >= path.dirname(current).length) {
                    if (this.folderToArtistMap.has(current)) {
                        artistId = this.folderToArtistMap.get(current) as number;
                        break;
                    }
                    const parent = path.dirname(current);
                    if (parent === current)
                        break;
                    current = parent;
                }
            }
            let coverPath = null;
            if (config.cover) {
                const absoluteCoverPath = path.resolve(dir, config.cover);
                if (await this.storage.pathExists(absoluteCoverPath)) {
                    coverPath = this.normalizePath(absoluteCoverPath, musicDir);
                }
            }
            else {
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
            let existingRelease = this.database.getReleaseBySlug(slug);
            let releaseId;
            let linksJson = null;
            if (config.links) {
                const links = [];
                if (Array.isArray(config.links)) {
                    links.push(...config.links);
                }
                else {
                    for (const [label, url] of Object.entries(config.links)) {
                        links.push({ label, url: url });
                    }
                }
                linksJson = JSON.stringify(links);
            }
            if (existingRelease) {
                releaseId = existingRelease.id as number;
                this.database.updateRelease(releaseId, {
                    artist_id: artistId || existingRelease.artist_id,
                    cover_path: coverPath || existingRelease.cover_path,
                    genre: config.genres?.join(", ") || existingRelease.genre,
                    description: config.description || existingRelease.description,
                    download: config.download || existingRelease.download,
                    external_links: linksJson || existingRelease.external_links,
                    type: config.type || existingRelease.type,
                    year: config.year || existingRelease.year
                });
            }
            else {
                releaseId = this.database.createRelease({
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
                    visibility: 'private',
                    published_at: null,
                    published_to_gundb: false,
                    published_to_ap: false,
                    license: null,
                    status: 'draft',
                });
            }
            this.folderToAlbumMap.set(dir, releaseId!);
            if (config.metadata?.tracks) {
                for (const tc of config.metadata.tracks) {
                    if (tc.url) {
                        this.database.addTrackToRelease(releaseId, 0, {
                            title: tc.title || "External Track",
                            artist_name: config.artist || null,
                            track_num: tc.trackNum || tc.track || null,
                            duration: tc.duration || null,
                            file_path: tc.url,
                            price: 0,
                            price_usdc: 0,
                            currency: 'ETH'
                        });
                    }
                }
            }
        }
        catch (e) { }
    }
    async processAudioFile(filePath: string, musicDir: string, overrideArtistId?: number | null, ownerId?: number | null, overrideAlbumId?: number | null, suggestedCoverPath?: string | null, metadataHints?: any): Promise<any> {
        let currentFilePath = filePath.replace(/^@@[a-z0-9]+\\?/, "").replace(/\\/g, "/").replace(/\/+/g, "/");
        if (!path.isAbsolute(currentFilePath) && !await this.storage.pathExists(currentFilePath)) {
            const resolved = path.join(musicDir, currentFilePath);
            if (await this.storage.pathExists(resolved))
                currentFilePath = resolved;
        }
        const ext = path.extname(currentFilePath).toLowerCase();
        const dir = path.dirname(currentFilePath);
        if (!AUDIO_EXTENSIONS.includes(ext))
            return null;
        while (this.hashingSemaphore >= this.MAX_CONCURRENT_HASHING) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        this.hashingSemaphore++;
        let hash = null;
        let metadata = null;
        const LOSSLESS_EXTENSIONS = ['.wav', '.flac'];
        const normalizedPath = this.normalizePath(currentFilePath, musicDir);
        let existing = this.database.getTrackByPath(normalizedPath);
        let albumId = overrideAlbumId || this.folderToAlbumMap.get(dir) || null;
        let artistId = overrideArtistId || null;
        try {
            try {
                hash = await getFastFileHash(currentFilePath);
                const existingByHash = this.database.getTrackByHash(hash);
                if (existingByHash && ownerId) {
                    this.database.addTrackOwner(existingByHash.id, ownerId);
                    if (existingByHash.owner_id === null) {
                        this.database.db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, existingByHash.id);
                    }
                    if (existingByHash.album_id) {
                        this.database.addAlbumOwner(existingByHash.album_id, ownerId);
                    }
                    if (currentFilePath.includes(path.sep + 'tmp' + path.sep) || currentFilePath.includes('/tmp/')) {
                        await this.storage.remove(currentFilePath);
                    }
                    return { originalPath: filePath, success: true, message: "Duplicate hash matched.", trackId: existingByHash.id };
                }
            }
            catch (e) { }
            // 1. Get Metadata if needed for hints/tags
            if (!metadata) {
                try {
                    metadata = await parseFileWithRetry(currentFilePath);
                }
                catch (e) { }
            }
            const common = (metadata?.common || {}) as any;
            const format = (metadata?.format || {}) as any;
            const albumArtist = common.albumartist;
            // 2. Resolve Artist (Priority: override > hint > tag > unknown)
            if (!artistId) {
                const artName = metadataHints?.artist || common.artist || "Unknown Artist";
                const existArt = this.database.getArtistByName(artName);
                artistId = existArt ? existArt.id : this.database.createArtist(artName);
            }
            // 3. Resolve Album (Priority: override > hint > folder)
            if (!albumId && metadataHints?.album) {
                const albumName = metadataHints.album;
                // Use a slug that includes artistId to avoid collisions across different artists with same album name
                const albumSlug = slugify("hint-" + artistId + "-" + albumName);
                let album = this.database.getAlbumBySlug(albumSlug);
                if (!album) {
                    albumId = this.database.createAlbum({
                        title: albumName,
                        slug: albumSlug,
                        artist_id: artistId,
                        album_artist: albumArtist || null,
                        owner_id: ownerId || this.primaryAdminId,
                        date: metadataHints.year ? `${metadataHints.year}-01-01` : null,
                        year: metadataHints.year || null,
                        cover_path: suggestedCoverPath ? this.normalizePath(suggestedCoverPath, musicDir) : null,
                        genre: metadataHints.genre || "Imported",
                        description: `Imported via Telegram`,
                        type: 'album',
                        download: null,
                        price: 0,
                        price_usdc: 0,
                        currency: 'ETH',
                        external_links: null,
                        is_public: true,
                        visibility: 'public',
                        is_release: false,
                        published_at: new Date().toISOString(),
                        published_to_gundb: false,
                        published_to_ap: false,
                        license: null,
                        status: 'draft',
                    });
                }
                else {
                    albumId = album.id;
                    // Update cover if hint provided a new one and album has none
                    if (suggestedCoverPath && !album.cover_path) {
                        this.database.updateAlbumCover(albumId, this.normalizePath(suggestedCoverPath, musicDir));
                    }
                    // Update artist if it was missing or different (though slug includes artistId now)
                    if (artistId && album.artist_id !== artistId) {
                        this.database.updateAlbumArtist(albumId, artistId);
                    }
                }
            }
            // Fallback to folder-based album
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
                        if (sExt === ext)
                            continue;
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
                if (hash && !existing.hash) {
                    this.database.db.prepare("UPDATE tracks SET hash = ? WHERE id = ?").run(hash, existing.id);
                }
                if (ownerId)
                    this.database.addTrackOwner(existing.id, ownerId);
                const isLossless = LOSSLESS_EXTENSIONS.includes(ext);
                const mp3Path = isLossless ? normalizedPath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3') : normalizedPath;
                if (isLossless && !existing.lossless_path) {
                    this.database.updateTrackLosslessPath(existing.id, normalizedPath);
                }
                this.database.updateTrackPath(existing.id, mp3Path, albumId);
                if (existing.album_id !== albumId)
                    this.database.updateTrackAlbum(existing.id, albumId);
                if (artistId && existing.artist_id !== artistId)
                    this.database.updateTrackArtist(existing.id, artistId);
                // If duration is missing, re-fetch it
                if (!existing.duration || existing.duration <= 0) {
                    const { common, format } = await parseFile(currentFilePath);
                    let duration = await getDurationFromFfmpeg(currentFilePath);
                    if (duration == null)
                        duration = format.duration || null;
                    if (duration) {
                        this.database.updateTrackDuration(existing.id, duration);
                        // Also update bitrate/sample rate if available
                        if (format.bitrate)
                            this.database.updateTrackBitrate(existing.id, Math.round(format.bitrate / 1000));
                    }
                }
                if (!existing.waveform) {
                    processQueueWaveform(currentFilePath, existing.id, existing.duration || undefined, this.processQueue, this.database);
                }
                return { originalPath: filePath, success: true, message: "Track updated.", trackId: existing.id };
            }
            // 5. Create New Track
            let duration = await getDurationFromFfmpeg(currentFilePath);
            if (duration == null)
                duration = format.duration || null;
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
            return { originalPath: filePath, success: true, message: "Processed.", trackId, queuedConversion };
        }
        catch (error) {
            return { originalPath: filePath, success: false, message: String(error) };
        }
        finally {
            this.hashingSemaphore--;
        }
    }
    async scanDirectory(dir: string): Promise<any> {
        if (this.isScanning)
            return this.pendingScan || Promise.resolve({ successful: [], failed: [] });
        this.musicDirectory = dir;
        this.isScanning = true;
        this.pendingScan = (async () => {
            try {
                return await this.doScan(dir);
            }
            finally {
                this.isScanning = false;
                this.pendingScan = null;
            }
        })();
        return this.pendingScan;
    }
    async mapFoldersToExistingAlbums() {
        this.folderToExistingAlbumMap.clear();
        this.folderToAlbumMap.clear();
        this.folderToArtistMap.clear();
        const stmt = this.database.db.prepare("SELECT album_id, file_path FROM tracks WHERE album_id IS NOT NULL AND file_path IS NOT NULL");
        const counts = new Map<string, Map<number, number>>();
        for (const track of stmt.iterate() as IterableIterator<{ album_id: number, file_path: string }>) {
            const dir = path.dirname(track.file_path).replace(/\\/g, "/");
            if (!counts.has(dir))
                counts.set(dir, new Map());
            const albumCounts = counts.get(dir)!;
            albumCounts.set(track.album_id, (albumCounts.get(track.album_id) || 0) + 1);
        }
        for (const [dir, albumCounts] of counts.entries()) {
            let maxCount = 0, bestId = -1;
            for (const [id, count] of albumCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    bestId = id;
                }
            }
            if (bestId !== -1)
                this.folderToExistingAlbumMap.set(dir, bestId);
        }
    }
    async doScan(dir: string): Promise<any> {
        if (!(await this.storage.pathExists(dir)))
            return { successful: [], failed: [] };
        await this.mapFoldersToExistingAlbums();
        const audioFiles: string[] = [], yamlFiles: string[] = [];
        const walkDir = async (currentDir: string) => {
            const entries = await this.storage.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(currentDir, entry.name);
                if (entry.isDirectory())
                    await walkDir(full);
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (AUDIO_EXTENSIONS.includes(ext))
                        audioFiles.push(full);
                    else if (ext === ".yaml" || ext === ".yml")
                        yamlFiles.push(full);
                }
            }
        };
        await walkDir(dir);
        const knownFiles = new Set<string>();
        for (const f of audioFiles)
            knownFiles.add(this.normalizePath(f, dir).toLowerCase());
        for (const f of yamlFiles.filter(f => f.endsWith("artist.yaml") || f.endsWith("catalog.yaml"))) {
            await this.processGlobalConfigs(path.dirname(f), dir);
        }
        const releaseConfigs = yamlFiles.filter(f => f.endsWith("release.yaml"));
        for (const f of releaseConfigs)
            await this.processReleaseConfig(f, dir);
        const audioDirs = new Set(audioFiles.map(f => path.dirname(f)));
        for (const ad of audioDirs) {
            if (!releaseConfigs.some(rc => path.dirname(rc) === ad))
                await this.getOrCreateLibraryAlbum(ad, dir);
        }
        const successful = [], failed = [];
        for (let i = 0; i < audioFiles.length; i += 50) {
            const batch = audioFiles.slice(i, i + 50);
            for (const file of batch) {
                const result = await this.processAudioFile(file, dir);
                if (result) {
                    if (result.success)
                        successful.push(result);
                    else
                        failed.push(result);
                    if (result.queuedConversion && ['.wav', '.flac'].includes(path.extname(file).toLowerCase())) {
                        knownFiles.add(this.normalizePath(file.replace(/\.[^/.]+$/, ".mp3"), dir).toLowerCase());
                    }
                }
            }
            if (i % 100 === 0 && global.gc)
                global.gc();
        }
        let allTracks = this.database.getTracks();
        allTracks = await this.deduplicateTracks(allTracks);
        await this.cleanupStaleTracks(dir, knownFiles, allTracks);
        await this.fixOrphanAlbums();
        this.clearCaches();
        return { successful, failed };
    }
    async fixOrphanAlbums() {
        try {
            const orphans = this.database.db.prepare("SELECT id, title FROM albums WHERE artist_id IS NULL").all() as { id: number, title: string }[];
            for (const o of orphans) {
                const tracks = this.database.getTracks(o.id);
                if (tracks.length === 0) {
                    this.database.deleteAlbum(o.id);
                    continue;
                }
                const arts = [...new Set(tracks.map(t => t.artist_id).filter((id): id is number => id !== null))];
                if (arts.length === 1)
                    this.database.updateAlbumArtist(o.id, arts[0]);
            }
        }
        catch (e) { }
    }
    async deduplicateTracks(tracks: Track[]) {
        const groups = new Map<string, Track[]>();
        for (const t of tracks) {
            const k = `${t.album_id}|${t.artist_id}|${t.title.toLowerCase().trim()}`;
            if (!groups.has(k))
                groups.set(k, []);
            groups.get(k)!.push(t);
        }
        const toRem = new Set();
        for (const g of groups.values()) {
            if (g.length <= 1)
                continue;
            const primary = g.find(t => path.extname(t.file_path || '').toLowerCase() === '.mp3') || g[0];
            for (const other of g.filter(t => t.id !== primary.id)) {
                const lossless = other.lossless_path || (path.extname(other.file_path || '').toLowerCase() === '.wav' ? other.file_path : null);
                if (lossless && !primary.lossless_path) {
                    this.database.updateTrackLosslessPath(primary.id, lossless);
                    primary.lossless_path = lossless;
                }
                this.database.deleteTrack(other.id);
                toRem.add(other.id);
            }
        }
        return tracks.filter((t: Track) => !toRem.has(t.id));
    }
    async cleanupStaleTracks(musicDir: string, knownFiles: Set<string>, allTracks: Track[]): Promise<void> {
        for (const t of allTracks) {
            if (!t.file_path)
                continue;
            const pKey = t.file_path.toLowerCase();
            const pExists = knownFiles.has(pKey);
            const lExists = t.lossless_path ? knownFiles.has(t.lossless_path.toLowerCase()) : false;
            if (!pExists && !lExists)
                this.database.deleteTrack(t.id);
            else if (pExists && t.lossless_path && !lExists)
                this.database.updateTrackLosslessPath(t.id, null);
        }
    }
    startWatching(dir: string): void {
        this.musicDirectory = dir;
        if (this.watcher)
            this.watcher.close();
        this.watcher = chokidar.watch(dir, { ignored: /(^|[\/\\])\../, persistent: true, ignoreInitial: true });
        this.watcher!.on("add", (f: string) => { if (!this.isConsolidating)
            this.processAudioFile(f, dir); });
    }
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
    async consolidateFiles(musicDir: string): Promise<any> {
        if (this.isConsolidating)
            return { success: 0, failed: 0, skipped: 0, deleted: 0 };
        this.isConsolidating = true;
        try {
            let success = 0, failed = 0, skipped = 0, deleted = 0, count = 0;
            const cache = new Map<number, Artist>();
            const iter = Array.from(this.database.iterateTracks("file_path IS NOT NULL")) as Track[];
            for (const t of iter) {
                try {
                    if (!t.file_path) {
                        count++;
                        continue;
                    }
                    const oldP = t.file_path;
                    const fOld = path.join(musicDir, oldP);
                    const existsOld = await this.storage.pathExists(fOld);
                    let art = t.artist_id ? (cache.get(t.artist_id) || this.database.getArtist(t.artist_id)) : null;
                    if (t.artist_id && art)
                        cache.set(t.artist_id, art);
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
                        }
                        else if (oldP !== newP) {
                            // File already exists at new path, just update DB
                            this.database.updateTrackPath(t.id, newP, t.album_id);
                            success++;
                            count++;
                            continue;
                        }
                    }
                    if (oldP === newP) {
                        skipped++;
                        count++;
                        continue;
                    }
                    if (await this.storage.pathExists(fOld)) {
                        await this.storage.move(fOld, fNew, { overwrite: true });
                        this.database.updateTrackPath(t.id, newP, t.album_id);
                        success++;
                    }
                    else
                        skipped++;
                }
                catch (e) {
                    console.error(`❌ [Consolidate] Failed to process ${t.file_path}:`, e);
                    failed++;
                }
                count++;
                if (count % 100 === 0 && global.gc)
                    global.gc();
            }
            return { success, failed, skipped, deleted };
        }
        finally {
            this.isConsolidating = false;
        }
    }
}
function processQueueWaveform(file: string, id: number, dur: number | undefined, queue: ProcessingQueue, db: DatabaseService): void {
    queue.add(() => WaveformPeakService.generateWaveform(file, 100, dur))
        .then(p => db.updateTrackWaveform(id, JSON.stringify(p)))
        .catch(() => { });
}
