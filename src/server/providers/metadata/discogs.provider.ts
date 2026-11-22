import { TuneCampProvider, MetadataProvider, MetadataMatch, USER_AGENT, ArtistMetadata, ExternalReleaseDetails, ExternalTrack } from "../../core/provider.js";
// @ts-ignore
import pkg from "disconnect";
const { Client: DiscogsClient } = pkg;

import type { ConfigField } from "../../core/provider.js";

export class DiscogsProvider implements TuneCampProvider, MetadataProvider {
    id = "discogs";
    name = "Discogs";
    version = "1.0.0";
    description = "Pulls high-quality release data and genres from the Discogs database";
    pluginUrl = "https://discogs.com";
    icon = "💿";
    type = "metadata" as const;
    
    configSchema: ConfigField[] = [
        {
            key: "discogs_token",
            label: "Discogs Personal Access Token",
            type: "password",
            placeholder: "Enter your personal access token..."
        }
    ];
    
    private dbSettings: any;
    private client: any;

    constructor() {
        this.initClient();
    }

    public setSettings(dbSettings: any) {
        this.dbSettings = dbSettings;
        this.initClient();
    }

    private initClient() {
        const token = this.dbSettings?.getSetting("discogs_token") || process.env.DISCOGS_TOKEN;
        this.client = new DiscogsClient(USER_AGENT, token ? { userToken: token } : undefined);
    }

    private getClient() {
        // Refresh client if token might have changed
        this.initClient();
        return this.client;
    }

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        try {
            const db = this.getClient().database();
            const results = await new Promise<any[]>((resolve, reject) => {
                try {
                    db.search({ q: query, type: 'release' }, (err: any, data: any) => {
                        if (err) {
                            // Discogs sometimes returns HTML on error which causes SyntaxError in disconnect
                            if (err.message && (err.message.includes('Unexpected token') || err.message.includes('Unexpected non-whitespace'))) {
                                resolve([]);
                            } else {
                                reject(err);
                            }
                        }
                        else resolve(data?.results || []);
                    });
                } catch (e) {
                    reject(e);
                }
            });

            return results.map(r => ({
                id: r.id.toString(),
                title: r.title.split(' - ')[1] || r.title,
                artist: r.title.split(' - ')[0] || "Unknown",
                date: r.year || "",
                year: r.year ? parseInt(r.year) : undefined,
                genre: r.genre?.[0] || r.style?.[0] || undefined,
                coverUrl: r.cover_image || r.thumb,
                source: "discogs"
            }));
        } catch (error) {
            console.error("Error searching Discogs:", error);
            return [];
        }
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        // Discogs doesn't have a "recording" entity in the same way, but we can search for tracks
        // or just reuse release search for better compatibility with current UI expectation
        return this.searchRelease(query);
    }

    async getCoverUrl(id: string): Promise<string | null> {
        try {
            const db = this.getClient().database();
            const data = await new Promise<any>((resolve, reject) => {
                try {
                    db.getRelease(id, (err: any, data: any) => {
                        if (err) {
                            if (err.message && (err.message.includes('Unexpected token') || err.message.includes('Unexpected non-whitespace'))) {
                                resolve(null);
                            } else {
                                reject(err);
                            }
                        }
                        else resolve(data);
                    });
                } catch (e) {
                    reject(e);
                }
            });
            return data.images?.[0]?.resource_url || null;
        } catch (error) {
            console.error("Error fetching Discogs cover:", error);
            return null;
        }
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        try {
            const db = this.getClient().database();
            const results = await new Promise<any[]>((resolve, reject) => {
                try {
                    db.search({ q: query, type: 'artist' }, (err: any, data: any) => {
                        if (err) {
                            if (err.message && (err.message.includes('Unexpected token') || err.message.includes('Unexpected non-whitespace'))) {
                                resolve([]);
                            } else {
                                reject(err);
                            }
                        }
                        else resolve(data?.results || []);
                    });
                } catch (e) {
                    reject(e);
                }
            });

            return results.map(r => ({
                id: r.id.toString(),
                name: r.title,
                avatarUrl: r.cover_image || r.thumb || undefined,
                source: "discogs"
            }));
        } catch (error) {
            console.error("Error searching Discogs artists:", error);
            return [];
        }
    }

    async getReleaseDetails(id: string): Promise<ExternalReleaseDetails | null> {
        try {
            const db = this.getClient().database();
            const data = await new Promise<any>((resolve, reject) => {
                try {
                    db.getRelease(id, (err: any, releaseData: any) => {
                        if (err) {
                            if (err.message && (err.message.includes('Unexpected token') || err.message.includes('Unexpected non-whitespace'))) {
                                resolve(null);
                            } else {
                                reject(err);
                            }
                        } else {
                            resolve(releaseData);
                        }
                    });
                } catch (e) {
                    reject(e);
                }
            });

            if (!data) return null;

            const rawTracks = (data.tracklist || []).filter((t: any) => !t.type_ || t.type_ === "track");
            const tracks: ExternalTrack[] = rawTracks.map((t: any, idx: number) => {
                const posMatch = typeof t.position === "string" ? t.position.match(/\d+/) : null;
                const position = posMatch ? parseInt(posMatch[0], 10) : idx + 1;
                let duration: number | undefined;
                if (typeof t.duration === "string" && t.duration.trim()) {
                    const parts = t.duration.trim().split(":").map(Number);
                    if (parts.every((n: number) => Number.isFinite(n))) {
                        if (parts.length === 2) duration = parts[0] * 60 + parts[1];
                        else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    }
                }
                return {
                    position,
                    title: t.title || "",
                    artist: t.artists?.[0]?.name || undefined,
                    duration
                };
            });

            return {
                id: String(data.id || id),
                source: "discogs",
                title: data.title || "",
                artist: data.artists_sort || data.artists?.[0]?.name || "Unknown",
                date: data.released || (data.year ? String(data.year) : ""),
                year: typeof data.year === "number" && data.year > 0 ? data.year : undefined,
                genre: data.genres?.[0] || data.styles?.[0] || undefined,
                coverUrl: data.images?.[0]?.resource_url || undefined,
                tracks
            };
        } catch (error) {
            console.error("Error fetching Discogs release details:", error);
            return null;
        }
    }
}
