import { TuneCampProvider, MetadataProvider, MetadataMatch } from "../../core/provider.js";
import { USER_AGENT } from "../../modules/catalog/metadata.service.js";
// @ts-ignore
import pkg from "disconnect";
const { Client: DiscogsClient } = pkg;

export class DiscogsProvider implements TuneCampProvider, MetadataProvider {
    id = "discogs";
    name = "Discogs";
    version = "1.0.0";
    description = "Metadata from the Discogs community database";
    
    private client: any;

    constructor() {
        const token = process.env.DISCOGS_TOKEN;
        this.client = new DiscogsClient(USER_AGENT, token ? { userToken: token } : undefined);
    }

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        try {
            const db = this.client.database();
            const results = await new Promise<any[]>((resolve, reject) => {
                db.search({ q: query, type: 'release' }, (err: any, data: any) => {
                    if (err) reject(err);
                    else resolve(data.results || []);
                });
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
            const db = this.client.database();
            const data = await new Promise<any>((resolve, reject) => {
                db.getRelease(id, (err: any, data: any) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
            return data.images?.[0]?.resource_url || null;
        } catch (error) {
            console.error("Error fetching Discogs cover:", error);
            return null;
        }
    }
}
