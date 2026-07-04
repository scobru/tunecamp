import WebTorrent from 'webtorrent';
import path from 'path';
import fs from '../../../utils/fs.js';
import { type DatabaseService, type Torrent, type TorrentStatus } from '../../core/database.types.js';
import type { Scanner } from '../catalog/scanner.js';

export class TorrentService {
    private client: WebTorrent.Instance | null = null;
    private metadataStartedAt: Map<string, number> = new Map();
    private sweepInterval: NodeJS.Timeout | null = null;

    private parseInfoHashFromMagnet(magnetUri: string): string | null {
        if (!magnetUri) return null;
        const match = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
        return match ? match[1].toLowerCase() : null;
    }

    constructor(
        private database: DatabaseService,
        private scanner: Scanner,
        private musicDir: string
    ) {
        // Defer WebTorrent initialization to prevent event loop block or crashes during initial server startup
        setTimeout(() => {
            this.init();
        }, 5000);

        // Periodically mark stuck-on-metadata torrents as 'error' so the UI can flag/purge them
        this.sweepInterval = setInterval(() => {
            try {
                this.sweepStuckMetadata();
            } catch (err) {
                console.error("⚠️ [TorrentService] sweep error:", err);
            }
        }, 60 * 1000);
        // Don't keep the event loop alive solely for this timer
        this.sweepInterval.unref?.();
    }

    public shutdown() {
        if (this.sweepInterval) {
            clearInterval(this.sweepInterval);
            this.sweepInterval = null;
        }
    }

    private init() {
        try {
            // Disable uTP (UDP) to prevent native utp-native library crashes/segfaults on Alpine Linux (Docker)
            this.client = new WebTorrent({ utp: false });
            this.client.on('error', (err) => {
                console.error("🚨 [TorrentService] WebTorrent error:", err);
            });
            console.log("✅ [TorrentService] WebTorrent client initialized (TCP-only, deferred)");
            
            // Resume existing torrents sequentially with a delay to prevent CPU/memory OOM spikes from concurrent hashing
            const torrents = this.database.getTorrents();
            (async () => {
                for (const t of torrents) {
                    try {
                        if (t.status === 'downloading' || t.status === 'metadata') {
                            await this.addTorrent(t.magnet_uri, t.owner_id);
                        } else if (t.status === 'seeding' && t.path) {
                            await this.resumeSeeding(t);
                        }
                        // Pause briefly between torrents to allow V8 to run GC
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        if (global.gc) global.gc();
                    } catch (err: any) {
                        console.error(`🚨 [TorrentService] Error resuming torrent:`, err.message);
                    }
                }
            })();
        } catch (e) {
            console.error("🚨 [TorrentService] Failed to initialize WebTorrent:", e);
        }
    }

    private async resumeSeeding(t: Torrent): Promise<boolean> {
        const torrentPath = t.path;
        if (!torrentPath || !await fs.pathExists(torrentPath)) {
            console.warn(`⚠️ [TorrentService] Cannot resume seeding for ${t.name}, path missing: ${torrentPath}`);
            this.database.updateTorrentStatus(t.info_hash.toLowerCase(), 'error');
            return false;
        }

        return new Promise(async (resolve) => {
            try {
                // Find all files in the directory if it's a directory
                const stats = await fs.stat(torrentPath);
                let files: string[] = [];
                if (stats.isDirectory()) {
                    const entries = await fs.readdir(torrentPath);
                    files = entries.map(e => path.join(torrentPath, e));
                } else {
                    files = [torrentPath];
                }

                if (!this.client) {
                    resolve(false);
                    return;
                }

                this.client.seed(files, { name: t.name || undefined } as any, (torrent) => {
                    const infoHash = (torrent.infoHash || '').toLowerCase();
                    console.log(`📡 [TorrentService] Resumed seeding: ${torrent.name} (${infoHash})`);
                    this.setupTorrentEvents(torrent, t.owner_id);
                    resolve(true);
                });
            } catch (err) {
                console.error(`❌ [TorrentService] Failed to resume seeding ${t.info_hash.toLowerCase()}:`, err);
                resolve(false);
            }
        });
    }

    public async seedFiles(filePaths: string[], name: string, ownerId: number | null, artist?: string): Promise<string> {
        if (!this.client) throw new Error("Torrent client not initialized");

        // Resolve relative paths (stored as relative to musicDir in the DB) to absolute.
        // This keeps existence checks and stored seed paths consistent regardless of CWD.
        const resolvedFiles = filePaths.map(p => path.isAbsolute(p) ? p : path.join(this.musicDir, p));

        return new Promise((resolve, reject) => {
            const missingFiles = resolvedFiles.filter(p => !fs.existsSync(p));
            if (missingFiles.length > 0) {
                return reject(new Error(`The following paths do not exist: ${missingFiles.join(', ')}`));
            }
            const existingFiles = resolvedFiles;
            // Torrents are always named "Artist - Title"; skip the prefix if the caller already added it.
            const torrentName = artist && !name.toLowerCase().startsWith(`${artist.toLowerCase()} - `)
                ? `${artist} - ${name}`
                : name;
            const opts: any = { name: torrentName };
            this.client!.seed(existingFiles, opts, (torrent) => {
                const infoHash = (torrent.infoHash || '').toLowerCase();
                console.log(`📡 [TorrentService] Started seeding: ${torrent.name} (${infoHash})`);
                
                // Determine common base path
                const commonPath = existingFiles.length === 1 ? existingFiles[0] : path.dirname(existingFiles[0]);

                // Save to database
                this.database.createTorrent({
                    info_hash: infoHash,
                    magnet_uri: torrent.magnetURI,
                    owner_id: ownerId,
                    status: 'seeding',
                    name: torrent.name,
                    artist: artist || null,
                    path: commonPath
                });

                this.setupTorrentEvents(torrent, ownerId);
                resolve(torrent.magnetURI);
            });
        });
    }

    private setupTorrentEvents(torrent: WebTorrent.Torrent, ownerId: number | null) {
        torrent.on('upload', () => {
            this.updateDbProgress(torrent);
        });

        torrent.on('download', () => {
            this.updateDbProgress(torrent);
        });

        torrent.on('done', () => {
            const infoHash = (torrent.infoHash || '').toLowerCase();
            const tRecord = this.database.getTorrent(infoHash);
            const isSeeding = tRecord && tRecord.status === 'seeding';

            if (!isSeeding) { // If it was a download that finished
                console.log(`✅ [TorrentService] Torrent complete: ${torrent.name}`);
                this.updateDbProgress(torrent, 'completed');
                this.processCompletedTorrent(torrent, ownerId || 1);
            } else {
                this.updateDbProgress(torrent, 'seeding');
            }
        });

        torrent.on('error', (err) => {
            const infoHash = (torrent.infoHash || '').toLowerCase();
            console.error(`❌ [TorrentService] Torrent ${infoHash} error:`, err);
            this.updateDbProgress(torrent, 'error');
        });
    }

    public async addTorrent(magnetUri: string, ownerId: number | null): Promise<string> {
        if (!this.client) throw new Error("Torrent client not initialized");

        const parsedInfoHash = this.parseInfoHashFromMagnet(magnetUri);

        try {
            // Check if already active in client to prevent duplicate error
            const active = await this.client.get(parsedInfoHash || magnetUri);
            if (active) {
                const activeInfoHash = (active.infoHash || parsedInfoHash || '').toLowerCase();
                console.log(`ℹ️ [TorrentService] Torrent already active: ${activeInfoHash}`);
                return activeInfoHash;
            }
        } catch (e) {
            console.warn("⚠️ [TorrentService] client.get failed during addTorrent precheck:", e);
        }

        return new Promise((resolve, reject) => {
            try {
                // Call add() synchronously without ontorrent callback
                const torrent = this.client!.add(magnetUri, { path: path.join(this.musicDir, "downloads", "torrents") });
                const infoHash = (torrent.infoHash || parsedInfoHash || '').toLowerCase();
                if (!infoHash) {
                    throw new Error("Could not determine infoHash from torrent or magnet URI");
                }
                console.log(`📥 [TorrentService] Added torrent synchronously: ${infoHash}`);

                // Save to database if not exists
                const existing = this.database.getTorrent(infoHash);
                if (!existing) {
                    this.database.createTorrent({
                        info_hash: infoHash,
                        magnet_uri: magnetUri,
                        owner_id: ownerId,
                        status: 'metadata',
                        name: torrent.name || 'Fetching metadata...'
                    });
                }

                // Track when metadata fetching started so we can detect stuck torrents
                this.metadataStartedAt.set(infoHash, Date.now());

                torrent.on('metadata', () => {
                    const readyInfoHash = (torrent.infoHash || infoHash).toLowerCase();
                    console.log(`📡 [TorrentService] Metadata received for: ${torrent.name} (${readyInfoHash})`);
                    this.metadataStartedAt.delete(readyInfoHash);
                    this.database.updateTorrentProgress(readyInfoHash, 0, 'downloading', 0, 0, 0, torrent.length, torrent.path);
                    this.database.db.prepare("UPDATE torrents SET name = ? WHERE info_hash = ? COLLATE NOCASE").run(torrent.name, readyInfoHash);
                });

                this.setupTorrentEvents(torrent, ownerId);

                // Resolve immediately so the HTTP request doesn't timeout while waiting for metadata
                resolve(infoHash);
            } catch (err: any) {
                console.error("❌ [TorrentService] Error adding torrent:", err);
                reject(err);
            }
        });
    }

    public async removeTorrent(infoHash: string) {
        if (!this.client) throw new Error("Torrent client not initialized");
        const lowerHash = infoHash.toLowerCase();
        try {
            const torrent = await this.client.get(lowerHash);
            if (torrent && typeof (torrent as any).destroy === 'function') {
                await new Promise<void>((resolve) => {
                    let done = false;
                    const finish = () => { if (!done) { done = true; resolve(); } };
                    const safety = setTimeout(finish, 3000);
                    (torrent as any).destroy({}, () => { clearTimeout(safety); finish(); });
                });
            }
        } catch (err) {
            console.warn(`⚠️ [TorrentService] Error destroying torrent ${lowerHash}:`, err);
        }
        this.metadataStartedAt.delete(lowerHash);
        this.database.deleteTorrent(lowerHash);
    }

    /**
     * Mark stuck-on-metadata torrents as 'error' so the user can purge them.
     * Called periodically.
     */
    public sweepStuckMetadata(timeoutMs: number = 5 * 60 * 1000) {
        const now = Date.now();
        for (const [infoHash, startedAt] of this.metadataStartedAt.entries()) {
            const lowerHash = infoHash.toLowerCase();
            const live = this.client?.torrents.find(t => (t.infoHash || '').toLowerCase() === lowerHash);
            // Live torrent is ready: metadata arrived, drop stale tracker
            if (live && live.ready) {
                this.metadataStartedAt.delete(lowerHash);
                continue;
            }
            if (now - startedAt < timeoutMs) continue;
            // Timed out without metadata: mark error
            console.warn(`⏱️ [TorrentService] Marking stuck-metadata torrent as error: ${lowerHash}`);
            this.database.updateTorrentStatus(lowerHash, 'error');
            this.metadataStartedAt.delete(infoHash);
        }
    }

    /**
     * Remove all torrents whose DB status is 'error'/'failed', or stuck on 'metadata'.
     * Stuck-metadata means: not active+ready in client AND either tracked for >= timeoutMs
     * or never tracked at all (e.g., persisted from a previous session).
     * Returns the list of removed info hashes.
     */
    public async purgeStuck(timeoutMs: number = 5 * 60 * 1000): Promise<string[]> {
        this.sweepStuckMetadata(timeoutMs);
        const all = this.database.getTorrents();
        const now = Date.now();
        const removed: string[] = [];
        for (const t of all) {
            const lowerHash = t.info_hash.toLowerCase();
            let shouldPurge = t.status === 'error' || t.status === 'failed';
            if (!shouldPurge && t.status === 'metadata') {
                const live = this.client?.torrents.find(x => (x.infoHash || '').toLowerCase() === lowerHash);
                if (!live) {
                    // Not in client at all — stuck from prior session or init hasn't fired yet
                    shouldPurge = true;
                } else if (!live.ready) {
                    const startedAt = this.metadataStartedAt.get(lowerHash);
                    // 0 peers → no source for metadata → stuck regardless of time elapsed
                    const zeroPeers = (live.numPeers ?? 0) === 0;
                    shouldPurge = zeroPeers || startedAt === undefined || (now - startedAt) >= timeoutMs;
                }
            }
            if (shouldPurge) {
                try {
                    await this.removeTorrent(lowerHash);
                    removed.push(lowerHash);
                } catch (err) {
                    console.error(`❌ [TorrentService] Failed to purge ${lowerHash}:`, err);
                }
            }
        }
        return removed;
    }

    private updateDbProgress(torrent: WebTorrent.Torrent, overrideStatus?: TorrentStatus) {
        const infoHash = (torrent.infoHash || '').toLowerCase();
        const tRecord = this.database.getTorrent(infoHash);
        const isSeeding = tRecord && tRecord.status === 'seeding';

        const status = overrideStatus || (isSeeding ? 'seeding' : (torrent.done ? 'completed' : 'downloading'));
        this.database.updateTorrentProgress(
            infoHash,
            torrent.progress,
            status,
            torrent.downloadSpeed,
            torrent.uploadSpeed,
            torrent.numPeers,
            torrent.length,
            torrent.path
        );
    }

    public async syncTorrentFiles(infoHash: string) {
        const lowerHash = infoHash.toLowerCase();
        const torrentRecord = this.database.getTorrent(lowerHash);
        if (!torrentRecord) throw new Error("Torrent not found in database");

        // 1. If active in client, process now
        const active = this.client ? (await this.client.get(lowerHash)) as any : null;
        if (active && active.done) {
            await this.processCompletedTorrent(active, torrentRecord.owner_id || 1);
            return { message: "Sync complete (active torrent processed)" };
        }

        // 2. If not active but files exist on disk, scan them
        if (torrentRecord.path && await fs.pathExists(torrentRecord.path)) {
            console.log(`📂 [TorrentService] Syncing files from disk for ${torrentRecord.name}`);
            const walk = async (dir: string) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.opus'];
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (AUDIO_EXTENSIONS.includes(ext)) {
                            console.log(`🎵 Re-importing track from disk: ${entry.name}`);
                            await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, torrentRecord.owner_id || 0, undefined, undefined, { artist: torrentRecord.artist || undefined, album: torrentRecord.name || "Torrent Download" });
                        }
                    }
                }
            };

            await walk(torrentRecord.path);
            return { message: "Sync complete (disk scan processed)" };
        }

        throw new Error("Cannot sync: Torrent is not active and files are missing from expected path");
    }

    private async processCompletedTorrent(torrent: any, ownerId: number) {
        console.log(`🔄 Processing completed torrent: ${torrent.name}`);

        const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.opus'];
        const torrentRecord = this.database.getTorrent((torrent.infoHash || '').toLowerCase());

        if (torrent.files) {
            for (const file of torrent.files) {
                const ext = path.extname(file.name).toLowerCase();
                if (AUDIO_EXTENSIONS.includes(ext)) {
                    const fullPath = path.join(torrent.path, file.path);
                    try {
                        console.log(`🎵 Importing track from torrent: ${file.name}`);
                        // Copy to library to keep the original for seeding
                        await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, ownerId, undefined, undefined, { artist: torrentRecord?.artist || undefined, album: torrent.name || "Torrent Download" });
                    } catch (err) {
                        console.error(`❌ Failed to import torrent file ${file.name}:`, err);
                    }
                }
            }
        }
    }

    public getTorrentsStatus(includeFiles: boolean = false): any[] {
        if (!this.client) return [];
        
        // Safety check: WebTorrent client can sometimes be in a weird state
        if (typeof this.client.torrents === 'undefined') {
            console.warn("⚠️ [TorrentService] client.torrents is undefined!");
            return [];
        }
        
        try {
            const status = this.client.torrents.map(t => ({
                infoHash: (t.infoHash || '').toLowerCase(),
                name: t.name,
                progress: t.progress,
                downloadSpeed: t.downloadSpeed,
                uploadSpeed: t.uploadSpeed,
                numPeers: t.numPeers,
                received: t.downloaded,
                uploaded: t.uploaded,
                size: t.length,
                path: t.path,
                timeRemaining: t.timeRemaining,
                done: t.done,
                ready: (t as any).ready === true,
                files: includeFiles && t.files ? t.files.map(f => ({
                    name: f.name,
                    path: f.path,
                    progress: f.progress,
                    length: f.length,
                    downloaded: f.downloaded
                })) : []
            }));

            return status;
        } catch (err) {
            console.error("❌ Error getting torrent status:", err);
            return [];
        }
    }
}
