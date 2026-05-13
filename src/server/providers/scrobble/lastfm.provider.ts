import crypto from "crypto";
import type { ScrobbleProvider } from "../../core/provider.js";
import type { DatabaseService } from "../../database.js";

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_API_KEY = Buffer.from('MmI3NWRjYjI5MWUyYjBjOWEyYzk5NGFjYTUyMmFjMTQ=', 'base64').toString();
const LASTFM_API_SECRET = Buffer.from('MmVlNDllMzVmMDhiODM3ZDQzYjI4MjQxOTgxNzFmYzg=', 'base64').toString();

export class LastFmProvider implements ScrobbleProvider {
    readonly id = "lastfm";
    readonly name = "Last.fm";
    readonly version = "1.0.0";
    readonly description = "Scrobble your plays to Last.fm";

    private database: DatabaseService;

    constructor(database: DatabaseService) {
        this.database = database;
    }

    private getSessionKey(): string | null {
        return this.database.getSetting("lastfm_session_key") || null;
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }

    async isConfigured(): Promise<boolean> {
        return !!this.getSessionKey();
    }

    private createSignature(params: Record<string, string>): string {
        const sortedKeys = Object.keys(params).sort();
        let s = "";
        for (const key of sortedKeys) {
            s += key + params[key];
        }
        s += LASTFM_API_SECRET;
        return crypto.createHash("md5").update(s).digest("hex");
    }

    private async post(params: Record<string, string>): Promise<any> {
        const baseParams = {
            ...params,
            api_key: LASTFM_API_KEY,
        };
        const api_sig = this.createSignature(baseParams);
        const finalParams = {
            ...baseParams,
            api_sig,
            format: "json",
        };

        const res = await fetch(LASTFM_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(finalParams).toString(),
        });

        const data = (await res.json()) as any;
        if (data.error) {
            throw new Error(`Last.fm error ${data.error}: ${data.message}`);
        }
        return data;
    }

    async scrobble(track: { artist: string; title: string; album?: string; duration?: number }): Promise<void> {
        const sk = this.getSessionKey();
        if (!sk) return;

        await this.post({
            method: "track.scrobble",
            sk,
            artist: track.artist,
            track: track.title,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            album: track.album || "",
            duration: track.duration ? Math.round(track.duration).toString() : ""
        });
    }

    async nowPlaying(track: { artist: string; title: string; album?: string }): Promise<void> {
        const sk = this.getSessionKey();
        if (!sk) return;

        await this.post({
            method: "track.updateNowPlaying",
            sk,
            artist: track.artist,
            track: track.title,
            album: track.album || ""
        });
    }

}
