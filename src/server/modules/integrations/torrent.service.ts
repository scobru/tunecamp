import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs-extra';
import { DatabaseService, Torrent, TorrentStatus } from '../../core/database.types.js';
import { Scanner } from '../catalog/scanner.js';

export class TorrentService {
    private client: WebTorrent.Instance;
    private db: DatabaseService;
    private scanner: Scanner;
    private musicDir: string;
    private torrentDir: string;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(db: DatabaseService, scanner: Scanner, musicDir: string) {
        this.db = db;
        this.scanner = scanner;
        this.musicDir = musicDir;
        // Separate torrents from main music dir to avoid automatic scanning of incomplete files
        this.torrentDir = path.join(this.musicDir, "downloads", "torrents");
        this.client = new WebTorrent({ utp: false });

        this.client.on('error', (err: any) => {
            console.error("🌊 WebTorrent client error:", err);
        });

        // Ensure download directory exists
        fs.ensureDirSync(this.torrentDir);

        // Resume active torrents from DB on startup
        setTimeout(() => {
            this.resumeTorrents()
                .catch(err => console.error("❌ Torrent resume error:", err));
        }, 10000); // Wait 10 seconds for other services to be ready

        // Periodic status update to DB
        this.startStatusUpdates();
        
        console.log("🧲 TorrentService initialized. Downloads in:", this.torrentDir);
    }

    private async resumeTorrents() {
        try {
            const torrents = this.db.getTorrents();
            const activeToResume = torrents.filter(t => t.status === 'downloading' || t.status === 'metadata');
            
            if (activeToResume.length === 0) return;
            
            console.log(`📡 Resuming ${activeToResume.length} active torrents...`);
            
            for (const t of activeToResume) {
                try {
                    this.addTorrent(t.magnet_uri, t.owner_id || 0);
                    // Gradual resume to avoid CPU spikes during startup
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (err) {
                    console.error(`❌ Failed to resume torrent ${t.info_hash}:`, err);
                }
            }
        } catch (err) {
            console.error("❌ Error during torrent resume:", err);
        }
    }

    private startStatusUpdates() {
        this.updateInterval = setInterval(() => {
            try {
                if (!this.client || !this.client.torrents) return;
                
                for (const torrent of this.client.torrents) {
                    this.db.updateTorrentProgress(
                        torrent.infoHash,
                        torrent.progress || 0,
                        torrent.done ? 'completed' : 'downloading',
                        torrent.downloadSpeed || 0,
                        torrent.uploadSpeed || 0,
                        torrent.numPeers || 0,
                        torrent.length || 0,
                        torrent.path || null
                    );
                }
            } catch (err) {
                console.error("❌ Error during periodic torrent status update:", err);
            }
        }, 5000);
    }

    public addTorrent(magnetUri: string, ownerId: number) {
        try {
            // Check if torrent already exists in client to avoid "Cannot add duplicate torrent" error
            const infoHashMatch = magnetUri.match(/btih:([a-f0-9]+)/i);
            if (infoHashMatch) {
                const infoHash = infoHashMatch[1].toLowerCase();
                if (this.client.get(infoHash)) {
                    console.debug(`🧲 Torrent ${infoHash} already in client, skipping add.`);
                    return;
                }
            }

            this.client.add(magnetUri, { path: this.torrentDir }, (torrent) => {
                try {
                    console.log(`🧲 Torrent added: ${torrent.name} (${torrent.infoHash})`);

                    // Check if it already exists in DB
                    const existing = this.db.getTorrent(torrent.infoHash);
                    if (!existing) {
                        this.db.createTorrent({
                            info_hash: torrent.infoHash,
                            name: torrent.name,
                            magnet_uri: magnetUri,
                            owner_id: ownerId,
                            status: 'metadata',
                            progress: 0,
                            download_speed: 0,
                            upload_speed: 0,
                            num_peers: 0,
                            size: torrent.length || 0,
                            path: torrent.path || null
                        });
                    }

                    torrent.on('done', () => {
                        console.log(`✅ Torrent completed: ${torrent.name}`);
                        this.db.updateTorrentProgress(
                            torrent.infoHash,
                            1,
                            'completed',
                            0,
                            0,
                            0,
                            torrent.length || 0,
                            torrent.path || null
                        );
                        this.processCompletedTorrent(torrent, ownerId);
                    });

                    torrent.on('error', (err) => {
                        console.error(`❌ Torrent error (${torrent.name}):`, err);
                        this.db.updateTorrentProgress(
                            torrent.infoHash,
                            torrent.progress || 0,
                            'failed',
                            0,
                            0,
                            0,
                            torrent.length || 0,
                            torrent.path || null
                        );
                    });
                    
                    // Immediate update
                    this.db.updateTorrentProgress(
                        torrent.infoHash,
                        torrent.progress || 0,
                        torrent.done ? 'completed' : 'downloading',
                        torrent.downloadSpeed || 0,
                        torrent.uploadSpeed || 0,
                        torrent.numPeers || 0,
                        torrent.length || 0,
                        torrent.path || null
                    );
                } catch (cbErr) {
                    console.error("🌊 Error inside client.add callback:", cbErr);
                }
            });
        } catch (err) {
            console.error("❌ Failed to add torrent:", err);
            throw err;
        }
    }

    public async syncTorrent(infoHash: string) {
        const torrentRecord = this.db.getTorrent(infoHash);
        if (!torrentRecord) throw new Error("Torrent not found in database");

        console.log(`🔄 Manual sync requested for torrent: ${torrentRecord.name} (${infoHash})`);

        // 1. Try to find active torrent in client first
        const activeTorrent = await (this.client.get(infoHash) as any);
        if (activeTorrent && activeTorrent.done) {
            await this.processCompletedTorrent(activeTorrent as any, torrentRecord.owner_id || 0);
            return { message: "Sync complete (active torrent processed)" };
        }

        // 2. Fallback: Scan directory on disk if path exists
        if (torrentRecord.path && fs.existsSync(torrentRecord.path)) {
            const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.opus'];
            
            // We need to walk the directory since we don't have the file list from WebTorrent
            const walk = async (dir: string) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (AUDIO_EXTENSIONS.includes(ext)) {
                            console.log(`🎵 Re-importing track from disk: ${entry.name}`);
                            await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, torrentRecord.owner_id || 0, undefined, undefined, { album: torrentRecord.name });
                        }
                    }
                }
            };

            await walk(torrentRecord.path);
            return { message: "Sync complete (disk scan processed)" };
        }

        throw new Error("Cannot sync: Torrent is not active and files are missing from expected path");
    }

    private async processCompletedTorrent(torrent: WebTorrent.Torrent, ownerId: number) {
        console.log(`🔄 Processing completed torrent: ${torrent.name}`);
        
        const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.opus'];
        
        for (const file of torrent.files) {
            const ext = path.extname(file.name).toLowerCase();
            if (AUDIO_EXTENSIONS.includes(ext)) {
                const fullPath = path.join(torrent.path, file.path);
                try {
                    console.log(`🎵 Importing track from torrent: ${file.name}`);
                    // Copy to library to keep the original for seeding
                    await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, ownerId, undefined, undefined, { album: torrent.name });
                } catch (err) {
                    console.error(`❌ Failed to import torrent file ${file.name}:`, err);
                }
            }
        }
    }

    public getStatus(includeFiles: boolean = false): TorrentStatus[] {
        if (!this.client) return [];
        
        // Safety check: WebTorrent client can sometimes be in a weird state
        if (typeof this.client.torrents === 'undefined') {
            console.warn("⚠️ [TorrentService] client.torrents is undefined!");
            return [];
        }
        
        const startTime = Date.now();
        try {
            const status = this.client.torrents.map(t => ({
                infoHash: t.infoHash,
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
                files: includeFiles && t.files ? t.files.map(f => ({
                    name: f.name,
                    path: f.path,
                    progress: f.progress,
                    length: f.length,
                    downloaded: f.downloaded
                })) : []
            }));

            const duration = Date.now() - startTime;
            if (duration > 100) {
                console.warn(`⚠️ [TorrentService] getStatus took ${duration}ms (includeFiles=${includeFiles}, count=${this.client.torrents.length})`);
            }

            return status;
        } catch (err) {
            console.error("❌ Error getting torrent status:", err);
            return [];
        }
    }


    public async removeTorrent(infoHash: string, deleteFiles: boolean = false) {
        try {
            const torrent = await (this.client.get(infoHash) as any);
            if (torrent && typeof torrent.destroy === 'function') {
                torrent.destroy({ destroyStore: deleteFiles }, (err: any) => {
                    if (err) console.error(`❌ Error destroying torrent ${infoHash}:`, err);
                    this.db.deleteTorrent(infoHash);
                });
            } else {
                this.db.deleteTorrent(infoHash);
            }
        } catch (err) {
            this.db.deleteTorrent(infoHash);
        }
    }
}
