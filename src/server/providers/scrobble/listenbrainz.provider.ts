import fetch from "node-fetch";
import type { ScrobbleProvider } from "../../core/provider.js";
import type { DatabaseService } from "../../database.js";

const LISTENBRAINZ_API_BASE = 'https://api.listenbrainz.org/1';

export class ListenBrainzProvider implements ScrobbleProvider {
    readonly id = "listenbrainz";
    readonly name = "ListenBrainz";
    readonly version = "1.0.0";
    readonly description = "Scrobble your plays to ListenBrainz (MetaBrainz)";

    private database: DatabaseService;

    constructor(database: DatabaseService) {
        this.database = database;
    }

    private getUserToken(): string | null {
        return this.database.getSetting("listenbrainz_token") || null;
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }

    async isConfigured(): Promise<boolean> {
        return !!this.getUserToken();
    }

    private async post(endpoint: string, body: any): Promise<any> {
        const ut = this.getUserToken();
        if (!ut) return;

        const res = await fetch(`${LISTENBRAINZ_API_BASE}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${ut}`
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ListenBrainz error ${res.status}: ${text}`);
        }

        return res.json();
    }

    async scrobble(track: { artist: string; title: string; album?: string; duration?: number }): Promise<void> {
        await this.post("/submit-listens", {
            listen_type: "single",
            payload: [
                {
                    listened_at: Math.floor(Date.now() / 1000),
                    track_metadata: {
                        artist_name: track.artist,
                        track_name: track.title,
                        release_name: track.album || undefined,
                        additional_info: {
                            duration: track.duration ? Math.round(track.duration) : undefined,
                            submission_client: "TuneCamp",
                            submission_client_version: "1.0.0"
                        }
                    }
                }
            ]
        });
    }

    async nowPlaying(track: { artist: string; title: string; album?: string }): Promise<void> {
        await this.post("/submit-listens", {
            listen_type: "playing_now",
            payload: [
                {
                    track_metadata: {
                        artist_name: track.artist,
                        track_name: track.title,
                        release_name: track.album || undefined
                    }
                }
            ]
        });
    }

}
