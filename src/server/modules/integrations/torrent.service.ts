import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs-extra';
import { type DatabaseService, type Torrent, type TorrentStatus } from '../../core/database.js';
import type { Scanner } from '../catalog/scanner.js';

export class TorrentService {
    private client: WebTorrent.Instance | null = null;

    constructor(
        private database: DatabaseService,
        private scanner: Scanner,
        private musicDir: string
    ) {
        this.init();
    }

    private init() {
        try {
            this.client = new WebTorrent();
            this.client.on('error', (err) => {
                console.error("🚨 [TorrentService] WebTorrent error:", err);
            });
            console.log("✅ [TorrentService] WebTorrent client initialized");
            
            // Resume existing torrents
            const torrents = this.database.getTorrents();
            for (const t of torrents) {
                if (t.status === 'downloading' || t.status === 'seeding' || t.status === 'metadata') {
                    this.addTorrent(t.magnet_uri, t.owner_id);
                }
            }
        } catch (e) {
            console.error("🚨 [TorrentService] Failed to initialize WebTorrent:", e);
        }
    }

    public async addTorrent(magnetUri: string, ownerId: number | null): Promise<string> {
        if (!this.client) throw new Error("Torrent client not initialized");

        return new Promise((resolve, reject) => {
            this.client!.add(magnetUri, { path: path.join(this.musicDir, "downloads", "torrents") }, (torrent) => {
                console.log(`📥 [TorrentService] Added torrent: ${torrent.name || torrent.infoHash}`);
                
                // Save to database
                this.database.createTorrent({
                    info_hash: torrent.infoHash,
                    magnet_uri: magnetUri,
                    owner_id: ownerId,
                    status: 'metadata',
                    name: torrent.name
                });

                torrent.on('metadata', () => {
                    this.database.updateTorrentProgress(torrent.infoHash, 0, 'downloading', 0, 0, 0, torrent.length, torrent.path);
                    this.database.db.prepare("UPDATE torrents SET name = ? WHERE info_hash = ?").run(torrent.name, torrent.infoHash);
                });

                torrent.on('download', () => {
                    this.updateDbProgress(torrent);
                });

                torrent.on('done', () => {
                    console.log(`✅ [TorrentService] Torrent complete: ${torrent.name}`);
                    this.updateDbProgress(torrent, 'completed');
                    this.processCompletedTorrent(torrent, ownerId || 1);
                });

                torrent.on('error', (err) => {
                    console.error(`❌ [TorrentService] Torrent ${torrent.infoHash} error:`, err);
                    this.updateDbProgress(torrent, 'error');
                });

                resolve(torrent.infoHash);
            });
        });
    }

    public async removeTorrent(infoHash: string) {
        if (!this.client) throw new Error("Torrent client not initialized");
        const torrent = this.client.get(infoHash) as any;
        if (torrent) {
            if (typeof torrent.destroy === 'function') torrent.destroy();
        }
        this.database.deleteTorrent(infoHash);
    }

    private updateDbProgress(torrent: WebTorrent.Torrent, overrideStatus?: TorrentStatus) {
        const status = overrideStatus || (torrent.done ? 'completed' : 'downloading');
        this.database.updateTorrentProgress(
            torrent.infoHash,
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
        const torrentRecord = this.database.getTorrent(infoHash);
        if (!torrentRecord) throw new Error("Torrent not found in database");

        // 1. If active in client, process now
        const active = (this.client?.get(infoHash) as any);
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
                            await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, torrentRecord.owner_id || 0, undefined, undefined, { album: torrentRecord.name || "Torrent Download" });
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
        
        if (torrent.files) {
            for (const file of torrent.files) {
                const ext = path.extname(file.name).toLowerCase();
                if (AUDIO_EXTENSIONS.includes(ext)) {
                    const fullPath = path.join(torrent.path, file.path);
                    try {
                        console.log(`🎵 Importing track from torrent: ${file.name}`);
                        // Copy to library to keep the original for seeding
                        await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, ownerId, undefined, undefined, { album: torrent.name || "Torrent Download" });
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

            return status;
        } catch (err) {
            console.error("❌ Error getting torrent status:", err);
            return [];
        }
    }
}
