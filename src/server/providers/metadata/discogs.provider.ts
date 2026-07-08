import { TuneCampProvider, MetadataProvider, MetadataMatch, USER_AGENT, ArtistMetadata } from "../../core/provider.js";
// @ts-ignore
import pkg from "disconnect";
const { Client: DiscogsClient } = pkg;

export class DiscogsProvider implements TuneCampProvider, MetadataProvider {
    id = "discogs";
    name = "Discogs";
    version = "1.0.0";
    description = "Metadata from the Discogs community database";
    
    configSchema = [
        {
            key: "discogs_token",
            label: "Discogs Personal Access Token",
            type: "password",
            placeholder: "Enter token from Discogs Developer Settings",
            secret: true,
            required: false
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
}
