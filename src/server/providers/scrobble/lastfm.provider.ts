import crypto from "crypto";
import type { ScrobbleProvider } from "../../core/provider.js";
import type { DatabaseService } from "../../core/database.js";

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

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

    private getApiKey(): string | null {
        return process.env.LASTFM_API_KEY || this.database.getSetting("lastfm_api_key") || null;
    }

    private getApiSecret(): string | null {
        return process.env.LASTFM_API_SECRET || this.database.getSetting("lastfm_api_secret") || null;
    }

    async isAvailable(): Promise<boolean> {
        return !!this.getApiKey() && !!this.getApiSecret();
    }

    async isConfigured(): Promise<boolean> {
        return !!this.getSessionKey() && !!this.getApiKey() && !!this.getApiSecret();
    }

    private createSignature(params: Record<string, string>, apiSecret: string): string {
        const sortedKeys = Object.keys(params).sort();
        let s = "";
        for (const key of sortedKeys) {
            s += key + params[key];
        }
        s += apiSecret;
        return crypto.createHash("md5").update(s).digest("hex");
    }

    private async post(params: Record<string, string>): Promise<any> {
        const apiKey = this.getApiKey();
        const apiSecret = this.getApiSecret();

        if (!apiKey || !apiSecret) {
            throw new Error("Last.fm API key or secret not configured");
        }

        const baseParams = {
            ...params,
            api_key: apiKey,
        };
        const api_sig = this.createSignature(baseParams, apiSecret);
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
