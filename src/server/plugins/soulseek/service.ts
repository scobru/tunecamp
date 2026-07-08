// The package's "main" field points at dist/api.js (a single default-exported
// function), but the class we need is only exported from dist/index.js — a
// mismatch between its package.json and its own dist/index.d.ts. Import that
// file directly to sidestep the broken root entry point.
import { SoulseekDownloader } from "andrade-soulseek-downloader/dist/index.js";
import type { SoulseekDownloader as TSoulseekDownloader, SearchOptions, DownloadConfig, SoulseekSearchResult } from "andrade-soulseek-downloader";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";

export interface SoulseekResult {
    id: string;
    user: string;
    file: string;
    size: number;
    slots: boolean;
    bitrate?: number;
    speed?: number;
}

export class SoulseekService {
    private downloader?: TSoulseekDownloader;
    private musicDir: string;
    private downloadDir: string;
    private currentUsername: string | null = null;
    private searchCache: Map<string, SoulseekSearchResult> = new Map();

    constructor(musicDir: string, downloadDir: string) {
        this.musicDir = musicDir;
        this.downloadDir = downloadDir;

        // Cleanup cache every 10 minutes
        setInterval(() => {
            if (this.searchCache.size > 1000) {
                this.searchCache.clear();
            }
        }, 10 * 60 * 1000);
    }

    async connect(user?: string, pass?: string): Promise<boolean> {
        const username = user || process.env.SLSK_USER;
        const password = pass || process.env.SLSK_PASS;

        if (!username || !password) {
            console.warn("⚠️ Soulseek credentials missing. Service will be inactive.");
            return false;
        }

        if (this.currentUsername === username) {
            return true;
        }

        try {
            // Set environment variables for the library to pick up
            process.env.SOULSEEK_USER = username;
            process.env.SOULSEEK_PASSWORD = password;
            process.env.SOULSEEK_SHARED_MUSIC_DIR = this.musicDir;
            process.env.SOULSEEK_DOWNLOAD_DIR = this.downloadDir;

            const config: DownloadConfig = {
                maxAttempts: 10,
                downloadTimeout: 120000,
                searchTimeout: 10000,
                preferSlotsAvailable: true,
                minSpeed: 100000, // 100kb/s
                searchDelay: 3000,
                downloadDelay: 2000
            };

            const downloader = new SoulseekDownloader(config);
            await downloader.connect();
            this.downloader = downloader;
            
            console.log("✅ Soulseek Connected as", username);
            this.currentUsername = username;
            this.searchCache.clear();
            return true;
        } catch (err) {
            console.error("❌ Soulseek Connection Error:", err);
            return false;
        }
    }

    async search(query: string): Promise<SoulseekResult[]> {
        const downloader = this.downloader;
        if (!downloader) return [];

        try {
            // We'll use a broad search first
            const [artist, title] = query.split(" - ").map(s => s.trim());
            const options: SearchOptions = {
                artist: artist || query,
                title: title || "",
                minBitrate: 128,
                timeout: 10000,
                maxResults: 50,
                strictMatching: false
            };

            const results = await downloader.search(options);
            
            return results.map((r: SoulseekSearchResult) => {
                const id = crypto.randomUUID();
                this.searchCache.set(id, r);
                return {
                    id,
                    user: r.user,
                    file: r.file,
                    size: r.size,
                    slots: r.slots,
                    bitrate: r.bitrate,
                    speed: r.speed
                };
            });
        } catch (error) {
            console.error("❌ Soulseek Search Error:", error);
            return [];
        }
    }

    async download(result: SoulseekResult): Promise<string> {
        const downloader = this.downloader;
        if (!downloader) {
            throw new Error("Soulseek client not connected");
        }

        const originalResult = this.searchCache.get(result.id);
        
        // Use a generic name if no cache found (fallback scenario)
        const artist = result.file.split(/[/\\]/).slice(-2, -1)[0] || "Unknown Artist";
        const title = result.file.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "Unknown Title";

        try {
            if (originalResult) {
                const dl = await downloader.download(originalResult, artist, title);
                if (dl.path) return dl.path;
                if (dl.timeout) throw new Error("Download timed out");
            }

            // If manual selection fails or no result in cache, use the robust searchAndDownload (with fallbacks!)
            console.log(`⚠️ Manual selection failed or context missing, triggering robust searchAndDownload for ${artist} - ${title}`);
            const robustPath = await downloader.searchAndDownload(artist, title);
            
            if (robustPath) return robustPath;
            throw new Error("Download failed after all attempts and fallbacks");
        } catch (error: any) {
            console.error("❌ Soulseek Download Error:", error);
            throw error;
        }
    }

    disconnect(): void {
        if (this.downloader) {
            this.downloader = undefined;
            this.currentUsername = null;
            this.searchCache.clear();
            console.log('[Soulseek] Disconnected');
        }
    }

    async checkStatus(): Promise<{ connected: boolean; username: string | null }> {
        return {
            connected: !!this.downloader && !!this.currentUsername,
            username: this.currentUsername
        };
    }
}
