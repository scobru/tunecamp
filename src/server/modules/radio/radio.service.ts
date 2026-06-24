import { spawn, type ChildProcess } from "child_process";
import path from "path";
import os from "os";
import fs from "fs-extra";
import type { DatabaseService } from "../../core/database.js";

export interface RadioConfig {
    name: string;
    playlistId?: number | null;
    trackIds?: number[];
    /**
     * Mix of sources to union into the queue. Each entry is either a numeric
     * playlist id (as a string) or a dynamic genre playlist `genre:<name>`
     * (same id format the /api/playlists endpoint emits). When set, this takes
     * precedence over playlistId/trackIds.
     */
    sources?: string[];
    shuffle?: boolean;
}

/**
 * Concatenate row groups preserving first-seen order, dropping duplicate ids.
 * Pure + exported so the union/dedup logic is unit-testable without a DB.
 */
export function mergeUniqueById<T extends { id: number }>(groups: T[][]): T[] {
    const seen = new Set<number>();
    const out: T[] = [];
    for (const group of groups) {
        for (const row of group) {
            if (!seen.has(row.id)) {
                seen.add(row.id);
                out.push(row);
            }
        }
    }
    return out;
}

export interface RadioTrack {
    id: number;
    title: string;
    artist_name?: string;
    duration?: number;
    file_path: string;
}

export interface RadioStatus {
    active: boolean;
    name: string;
    playlistId?: number | null;
    sources?: string[];
    shuffle: boolean;
    startedAt?: string;
    currentTrack?: Omit<RadioTrack, "file_path"> | null;
    listenerCount: number;
    hlsUrl: string;
}

const SEGMENT_SECONDS = 6;
const PLAYLIST_SIZE = 8;
const LISTENER_WINDOW_MS = 30_000;

export class RadioService {
    private process: ChildProcess | null = null;
    private hlsDir: string;
    private tracks: RadioTrack[] = [];
    private startedAt?: Date;
    private config: RadioConfig = { name: "Radio" };
    private listeners = new Map<string, number>();
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private database: DatabaseService;
    private musicDir: string;
    private stopping = false;

    constructor(database: DatabaseService, musicDir: string) {
        this.database = database;
        this.musicDir = musicDir;
        this.hlsDir = path.join(os.tmpdir(), "tunecamp-radio");
    }

    /**
     * Track file paths are stored relative to the music directory (the same
     * convention the streaming routes use, e.g. path.join(musicDir, file_path)).
     * Resolve them to an absolute path so FFmpeg and existence checks work
     * regardless of the process working directory.
     */
    private _resolvePath(filePath: string): string {
        return path.isAbsolute(filePath) ? filePath : path.join(this.musicDir, filePath);
    }

    isActive(): boolean {
        return this.process !== null;
    }

    async start(config: RadioConfig): Promise<void> {
        await this.stop();

        this.config = { shuffle: false, ...config };
        this.tracks = this._loadTracks(config);

        if (this.tracks.length === 0) {
            throw new Error("No playable tracks found — the radio can only broadcast tracks with a local audio file on the server. Cloud, external, and network tracks (no local file) can't be streamed to the radio.");
        }

        if (this.config.shuffle) {
            this._shuffle(this.tracks);
        }

        await fs.ensureDir(this.hlsDir);

        await this._writeConcat();
        await this._spawnFfmpeg();

        this.startedAt = new Date();
        this._persistState(true);
    }

    async stop(): Promise<void> {
        this.stopping = true;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        if (!this.process) {
            this.stopping = false;
            return;
        }

        const proc = this.process;
        this.process = null;

        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            const killTimer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} finish(); }, 5000);
            proc.once("exit", () => { clearTimeout(killTimer); finish(); });
            try { proc.kill("SIGTERM"); } catch { finish(); }
        });

        try { await fs.emptyDir(this.hlsDir); } catch {}

        this.tracks = [];
        this.startedAt = undefined;
        this.listeners.clear();
        this._persistState(false);
        this.stopping = false;
    }

    getStatus(): RadioStatus {
        return {
            active: this.isActive(),
            name: this.config.name || "Radio",
            playlistId: this.config.playlistId ?? null,
            sources: this.config.sources ?? undefined,
            shuffle: this.config.shuffle ?? false,
            startedAt: this.startedAt?.toISOString(),
            currentTrack: this.isActive() ? this._currentTrack() : null,
            listenerCount: this._listenerCount(),
            hlsUrl: "/api/radio/hls/stream.m3u8",
        };
    }

    trackListener(clientKey: string): void {
        this.listeners.set(clientKey, Date.now());
    }

    resolveFile(fileName: string): string | null {
        if (!/^[\w.-]+\.(m3u8|ts)$/.test(fileName)) return null;
        const full = path.resolve(this.hlsDir, fileName);
        if (!full.startsWith(path.resolve(this.hlsDir) + path.sep)) return null;
        return full;
    }

    async resumeIfActive(): Promise<void> {
        const enabled = this.database.getSetting("radio_enabled");
        if (enabled !== "true") return;

        const name = this.database.getSetting("radio_name") || "Radio";
        const playlistId = this.database.getSetting("radio_playlist_id");
        const trackIdsRaw = this.database.getSetting("radio_track_ids");
        const sourcesRaw = this.database.getSetting("radio_sources");
        const shuffle = this.database.getSetting("radio_shuffle") === "true";

        const config: RadioConfig = {
            name,
            playlistId: playlistId ? Number(playlistId) : null,
            trackIds: trackIdsRaw ? JSON.parse(trackIdsRaw) : undefined,
            sources: sourcesRaw ? JSON.parse(sourcesRaw) : undefined,
            shuffle,
        };

        try {
            await this.start(config);
            console.log(`📻 [Radio] Resumed after restart`);
        } catch (e) {
            console.error("📻 [Radio] Failed to resume:", e);
        }
    }

    private async _writeConcat(): Promise<void> {
        const lines = ["ffconcat version 1.0"];
        for (const t of this.tracks) {
            const escaped = t.file_path.replace(/'/g, "'\\''");
            lines.push(`file '${escaped}'`);
        }
        await fs.writeFile(path.join(this.hlsDir, "playlist.txt"), lines.join("\n") + "\n", "utf8");
    }

    private async _spawnFfmpeg(): Promise<void> {
        const ffmpegBin = process.env.FFMPEG_PATH;
        if (!ffmpegBin) throw new Error("FFmpeg not available");

        const concatFile = path.join(this.hlsDir, "playlist.txt");
        const m3u8 = path.join(this.hlsDir, "stream.m3u8");

        const args = [
            "-hide_banner", "-loglevel", "error",
            "-stream_loop", "-1",
            "-re",
            "-f", "concat", "-safe", "0",
            "-i", concatFile,
            "-vn",
            "-c:a", "aac", "-b:a", "192k", "-ac", "2",
            "-f", "hls",
            "-hls_time", String(SEGMENT_SECONDS),
            "-hls_list_size", String(PLAYLIST_SIZE),
            "-hls_flags", "delete_segments+omit_endlist",
            "-hls_segment_filename", path.join(this.hlsDir, "seg%06d.ts"),
            m3u8,
        ];

        const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });

        proc.stderr?.on("data", (d: Buffer) => {
            const msg = d.toString().trim();
            if (msg) console.error(`📻 [Radio] ffmpeg: ${msg}`);
        });

        proc.on("exit", (code) => {
            if (this.process !== proc) return;
            this.process = null;
            if (!this.stopping && code !== 0 && code !== null) {
                console.warn(`📻 [Radio] ffmpeg exited with code ${code}, restarting in 2s...`);
                this.restartTimer = setTimeout(() => this._restart(), 2000);
            }
        });

        this.process = proc;
        console.log(`📻 [Radio] Stream started — ${this.tracks.length} track(s) in queue`);
    }

    private async _restart(): Promise<void> {
        if (this.stopping || !this.config.name) return;
        try {
            this.tracks = this._loadTracks(this.config);
            if (this.config.shuffle) this._shuffle(this.tracks);
            if (this.tracks.length === 0) { this._persistState(false); return; }
            await this._writeConcat();
            await this._spawnFfmpeg();
        } catch (e) {
            console.error("📻 [Radio] Restart failed:", e);
        }
    }

    /**
     * Resolve the union of selected sources (playlists + genre mixes) into
     * track rows, deduped, preserving the order sources were listed in.
     */
    private _loadFromSources(sources: string[]): any[] {
        const db = this.database.db;
        const groups = sources.map((src) => {
            if (src.startsWith("genre:")) {
                const genre = src.slice("genre:".length);
                return db.prepare(`
                    SELECT id, title, artist_name, duration, file_path
                    FROM tracks
                    WHERE LOWER(genre) = LOWER(?)
                      AND file_path IS NOT NULL AND file_path != ''
                `).all(genre) as any[];
            }
            const pid = Number(src);
            if (!Number.isFinite(pid)) return [];
            return db.prepare(`
                SELECT t.id, t.title, t.artist_name, t.duration, t.file_path
                FROM tracks t
                JOIN playlist_tracks pt ON pt.track_id = t.id
                WHERE pt.playlist_id = ?
                  AND t.file_path IS NOT NULL AND t.file_path != ''
                ORDER BY pt.position ASC
            `).all(pid) as any[];
        });
        return mergeUniqueById(groups);
    }

    private _loadTracks(config: RadioConfig): RadioTrack[] {
        const db = this.database.db;
        let rows: any[] = [];

        if (config.sources && config.sources.length > 0) {
            rows = this._loadFromSources(config.sources);
        } else if (config.playlistId) {
            rows = db.prepare(`
                SELECT t.id, t.title, t.artist_name, t.duration, t.file_path
                FROM tracks t
                JOIN playlist_tracks pt ON pt.track_id = t.id
                WHERE pt.playlist_id = ?
                  AND t.file_path IS NOT NULL AND t.file_path != ''
                ORDER BY pt.position ASC
            `).all(config.playlistId);
        } else if (config.trackIds && config.trackIds.length > 0) {
            const placeholders = config.trackIds.map(() => "?").join(",");
            rows = db.prepare(`
                SELECT id, title, artist_name, duration, file_path
                FROM tracks
                WHERE id IN (${placeholders})
                  AND file_path IS NOT NULL AND file_path != ''
            `).all(...config.trackIds);
            const idOrder = new Map(config.trackIds.map((id, i) => [id, i]));
            rows.sort((a: any, b: any) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
        }

        return rows
            .map((r: any) => ({ ...r, file_path: this._resolvePath(r.file_path) }))
            .filter((r: RadioTrack) => {
                try { return fs.existsSync(r.file_path); } catch { return false; }
            }) as RadioTrack[];
    }

    private _shuffle(arr: RadioTrack[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    private _currentTrack(): Omit<RadioTrack, "file_path"> | null {
        if (!this.tracks.length || !this.startedAt) return null;
        const elapsedSec = (Date.now() - this.startedAt.getTime()) / 1000;
        const totalSec = this.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
        if (totalSec === 0) return this.tracks[0] ? { id: this.tracks[0].id, title: this.tracks[0].title, artist_name: this.tracks[0].artist_name, duration: this.tracks[0].duration } : null;

        let pos = elapsedSec % totalSec;
        for (const t of this.tracks) {
            const dur = t.duration || 0;
            if (pos < dur) return { id: t.id, title: t.title, artist_name: t.artist_name, duration: t.duration };
            pos -= dur;
        }
        const last = this.tracks[this.tracks.length - 1];
        return { id: last.id, title: last.title, artist_name: last.artist_name, duration: last.duration };
    }

    private _listenerCount(): number {
        const cutoff = Date.now() - LISTENER_WINDOW_MS;
        for (const [k, t] of this.listeners) {
            if (t < cutoff) this.listeners.delete(k);
        }
        return this.listeners.size;
    }

    private _persistState(active: boolean): void {
        try {
            this.database.setSetting("radio_enabled", active ? "true" : "false");
            if (active) {
                this.database.setSetting("radio_name", this.config.name || "Radio");
                this.database.setSetting("radio_playlist_id", this.config.playlistId ? String(this.config.playlistId) : "");
                this.database.setSetting("radio_track_ids", this.config.trackIds ? JSON.stringify(this.config.trackIds) : "[]");
                this.database.setSetting("radio_sources", this.config.sources ? JSON.stringify(this.config.sources) : "[]");
                this.database.setSetting("radio_shuffle", this.config.shuffle ? "true" : "false");
            }
        } catch (e) {
            console.error("📻 [Radio] Failed to persist state:", e);
        }
    }
}
