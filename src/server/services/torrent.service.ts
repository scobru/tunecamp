import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs-extra';
import { DatabaseService, Torrent, TorrentStatus } from '../database.types.js';
import { Scanner } from '../scanner.js';

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
        this.client = new WebTorrent();

        // Ensure download directory exists
        fs.ensureDirSync(this.torrentDir);

        // Resume active torrents from DB on startup
        setTimeout(() => this.resumeTorrents(), 5000); // Wait a bit for other services

        // Periodic status update to DB
        this.startStatusUpdates();
        
        console.log("🧲 TorrentService initialized. Downloads in:", this.torrentDir);
    }

    private async resumeTorrents() {
        try {
            const torrents = this.db.getTorrents();
            let resumedCount = 0;
            for (const t of torrents) {
                if (t.status === 'downloading' || t.status === 'metadata') {
                    this.addTorrent(t.magnet_uri, t.owner_id || 0);
                    resumedCount++;
                }
            }
            if (resumedCount > 0) {
                console.log(`🧲 Resumed ${resumedCount} torrent downloads.`);
            }
        } catch (err) {
            console.error("❌ Failed to resume torrents:", err);
        }
    }

    private startStatusUpdates() {
        this.updateInterval = setInterval(() => {
            for (const torrent of this.client.torrents) {
                this.db.updateTorrentProgress(
                    torrent.infoHash,
                    torrent.progress,
                    torrent.done ? 'completed' : 'downloading',
                    torrent.downloadSpeed,
                    torrent.uploadSpeed,
                    torrent.numPeers,
                    torrent.length,
                    torrent.path
                );
            }
        }, 5000);
    }

    public addTorrent(magnetUri: string, ownerId: number) {
        try {
            this.client.add(magnetUri, { path: this.torrentDir }, (torrent) => {
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
                        size: torrent.length,
                        path: torrent.path
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
                        torrent.length,
                        torrent.path
                    );
                    this.processCompletedTorrent(torrent, ownerId);
                });

                torrent.on('error', (err) => {
                    console.error(`❌ Torrent error (${torrent.name}):`, err);
                    this.db.updateTorrentProgress(
                        torrent.infoHash,
                        torrent.progress,
                        'failed',
                        0,
                        0,
                        0,
                        torrent.length,
                        torrent.path
                    );
                });
                
                // Immediate update
                this.db.updateTorrentProgress(
                    torrent.infoHash,
                    torrent.progress,
                    torrent.done ? 'completed' : 'downloading',
                    torrent.downloadSpeed,
                    torrent.uploadSpeed,
                    torrent.numPeers,
                    torrent.length,
                    torrent.path
                );
            });
        } catch (err) {
            console.error("❌ Failed to add torrent:", err);
            throw err;
        }
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
                    await this.scanner.processAudioFile(fullPath, this.musicDir, undefined, ownerId);
                } catch (err) {
                    console.error(`❌ Failed to import torrent file ${file.name}:`, err);
                }
            }
        }
    }

    public getStatus(): TorrentStatus[] {
        return this.client.torrents.map(t => ({
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
            files: t.files.map(f => ({
                name: f.name,
                path: f.path,
                progress: f.progress,
                length: f.length,
                downloaded: f.downloaded
            }))
        }));
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
