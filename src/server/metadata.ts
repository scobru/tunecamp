import fetch from "node-fetch";
import { drainResponse } from "./utils.js";
// @ts-ignore
import pkg from "disconnect";
const { Client: DiscogsClient } = pkg;

const USER_AGENT = "TuneCamp/1.0.0 ( contact@tunecamp.app )";

export interface MetadataMatch {
    id: string; // Provider specific ID
    title: string;
    artist: string;
    date: string;
    year?: number;
    genre?: string;
    coverUrl?: string;
    albumTitle?: string;
    description?: string;
    source: "musicbrainz" | "discogs" | "theaudiodb" | "itunes";
}

export interface LyricsResult {
    lyrics: string;
    source: string;
}

export interface ArtistMetadata {
    id: string;
    name: string;
    bio?: string;
    avatarUrl?: string;
    links?: any;
    source: string;
}

export interface MetadataProvider {
    name: string;
    searchRelease(query: string): Promise<MetadataMatch[]>;
    searchRecording(query: string): Promise<MetadataMatch[]>;
    getCoverUrl(id: string): Promise<string | null>;
    searchArtist?(query: string): Promise<ArtistMetadata[]>;
}

class ITunesProvider implements MetadataProvider {
    name = "itunes";

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=10`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                await drainResponse(response);
                return [];
            }

            const data = await response.json() as any;
            const results = (data.results || []);

            return results.map((r: any) => ({
                id: r.collectionId.toString(),
                title: r.collectionName,
                artist: r.artistName,
                date: r.releaseDate || "",
                year: r.releaseDate ? parseInt(r.releaseDate.substring(0, 4)) : undefined,
                genre: r.primaryGenreName,
                // Replace 100x100 with 1400x1400 for high quality
                coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "1400x1400bb") : undefined,
                source: "itunes"
            }));
        } catch (error) {
            console.error("Error searching iTunes:", error);
            return [];
        }
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                await drainResponse(response);
                return [];
            }

            const data = await response.json() as any;
            const results = (data.results || []);

            return results.map((r: any) => ({
                id: r.trackId.toString(),
                title: r.trackName,
                artist: r.artistName,
                date: r.releaseDate || "",
                year: r.releaseDate ? parseInt(r.releaseDate.substring(0, 4)) : undefined,
                genre: r.primaryGenreName,
                coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "1400x1400bb") : undefined,
                albumTitle: r.collectionName,
                source: "itunes"
            }));
        } catch (error) {
            console.error("Error searching iTunes songs:", error);
            return [];
        }
    }

    async getCoverUrl(id: string): Promise<string | null> {
        const url = `https://itunes.apple.com/lookup?id=${id}`;
        try {
            const response = await fetch(url);
            const data = await response.json() as any;
            const result = data.results?.[0];
            return result?.artworkUrl100 ? result.artworkUrl100.replace("100x100bb", "1400x1400bb") : null;
        } catch {
            return null;
        }
    }
}

class MusicBrainzProvider implements MetadataProvider {
    name = "musicbrainz";
    private static lastRequestTime = 0;
    private static minRequestInterval = 1100; // 1.1s for safety (limit is 1/s)

    private async waitIfNecessary() {
        const now = Date.now();
        const timeSinceLast = now - MusicBrainzProvider.lastRequestTime;
        if (timeSinceLast < MusicBrainzProvider.minRequestInterval) {
            const delay = MusicBrainzProvider.minRequestInterval - timeSinceLast;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        MusicBrainzProvider.lastRequestTime = Date.now();
    }

    private buildQuery(query: string, type: 'artist' | 'release' | 'recording'): string {
        if (!query.includes(" - ")) return query;
        const [part1, part2] = query.split(" - ").map(s => s.trim());
        
        if (type === 'release') {
            return `artist:"${part1}" AND release:"${part2}"`;
        } else if (type === 'recording') {
            return `artist:"${part1}" AND recording:"${part2}"`;
        }
        return query;
    }

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        await this.waitIfNecessary();
        const mbQuery = this.buildQuery(query, 'release');
        const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(mbQuery)}&fmt=json`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                if (response.status === 429 || response.status === 503) {
                    console.warn(`[MusicBrainz] Rate limited or overloaded (status ${response.status}). Retrying once after delay...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.searchRelease(query);
                }
                console.error(`MusicBrainz API error: ${response.status}`);
                await drainResponse(response);
                return [];
            }

            const data = await response.json() as any;
            const releases = (data.releases || []);

            return releases.map((r: any) => ({
                id: r.id,
                title: r.title,
                artist: r["artist-credit"]?.[0]?.name || "Unknown",
                date: r.date || "",
                year: r.date ? parseInt(r.date.substring(0, 4)) : undefined,
                genre: r.genres?.[0]?.name || r.tags?.[0]?.name || undefined,
                coverUrl: `https://coverartarchive.org/release/${r.id}/front-250`,
                source: "musicbrainz"
            }));
        } catch (error) {
            console.error("Error searching MusicBrainz:", error);
            return [];
        }
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        await this.waitIfNecessary();
        const mbQuery = this.buildQuery(query, 'recording');
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(mbQuery)}&fmt=json`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                if (response.status === 429 || response.status === 503) {
                    console.warn(`[MusicBrainz] Rate limited or overloaded (status ${response.status}). Retrying once...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.searchRecording(query);
                }
                console.error(`MusicBrainz API error: ${response.status}`);
                await drainResponse(response);
                return [];
            }

            const data = await response.json() as any;
            const recordings = (data.recordings || []);

            return recordings.map((r: any) => {
                const release = r.releases?.[0];
                return {
                    id: r.id,
                    title: r.title,
                    artist: r["artist-credit"]?.[0]?.name || "Unknown",
                    date: "",
                    year: release?.date ? parseInt(release.date.substring(0, 4)) : undefined,
                    genre: r.genres?.[0]?.name || r.tags?.[0]?.name || undefined,
                    coverUrl: release ? `https://coverartarchive.org/release/${release.id}/front-250` : undefined,
                    albumTitle: release?.title,
                    source: "musicbrainz"
                };
            });
        } catch (error) {
            console.error("Error searching MusicBrainz recordings:", error);
            return [];
        }
    }

    async getCoverUrl(mbid: string): Promise<string | null> {
        return `https://coverartarchive.org/release/${mbid}/front`;
    }
}

class DiscogsProvider implements MetadataProvider {
    name = "discogs";
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

class TheAudioDBProvider implements MetadataProvider {
    name = "theaudiodb";
    private apiKey = "2"; // Use free public key

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        // TheAudioDB is better for artists/albums than individual releases, 
        // but we could implement if needed. For now focused on artists.
        return [];
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        return [];
    }

    async getCoverUrl(id: string): Promise<string | null> {
        return null;
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        const url = `https://www.theaudiodb.com/api/v1/json/${this.apiKey}/search.php?s=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                console.error(`TheAudioDB API error: ${response.status}`);
                await drainResponse(response);
                return [];
            }

            const data = await response.json() as any;
            const artists = (data.artists || []);

            return artists.map((a: any) => {
                const links: any[] = [];
                if (a.strWebsite) links.push({ platform: 'website', url: a.strWebsite.startsWith('http') ? a.strWebsite : `https://${a.strWebsite}`, type: 'music' });
                if (a.strFacebook) links.push({ platform: 'facebook', url: a.strFacebook.startsWith('http') ? a.strFacebook : `https://${a.strFacebook}`, type: 'social' });
                if (a.strTwitter) links.push({ platform: 'twitter', url: a.strTwitter.startsWith('http') ? a.strTwitter : `https://${a.strTwitter}`, type: 'social' });
                
                return {
                    id: a.idArtist,
                    name: a.strArtist,
                    bio: a.strBiographyEN,
                    bioIT: a.strBiographyIT,
                    avatarUrl: a.strArtistThumb || a.strArtistFanart,
                    links,
                    source: "theaudiodb"
                };
            });
        } catch (error) {
            console.error("Error searching TheAudioDB:", error);
            return [];
        }
    }
}

export class MetadataService {
    private providers: MetadataProvider[] = [
        new ITunesProvider(),
        new MusicBrainzProvider(),
        new DiscogsProvider(),
        new TheAudioDBProvider()
    ];

    async searchRelease(query: string): Promise<MetadataMatch[]> {
        const results = await Promise.all(this.providers.map(p => p.searchRelease(query)));
        return results.flat();
    }

    async searchRecording(query: string): Promise<MetadataMatch[]> {
        const results = await Promise.all(this.providers.map(p => p.searchRecording(query)));
        return results.flat();
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        const results = await Promise.all(this.providers.map(p => {
            if (p.searchArtist) return p.searchArtist(query);
            return Promise.resolve([]);
        }));
        return results.flat();
    }

    async getCoverUrl(id: string, source: string = "musicbrainz"): Promise<string | null> {
        const provider = this.providers.find(p => p.name === source);
        if (provider) {
            return provider.getCoverUrl(id);
        }
        return null;
    }

    async getLyrics(artist: string, title: string): Promise<LyricsResult | null> {
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                await drainResponse(response);
                return null;
            }
            const data = await response.json() as any;
            if (data.lyrics) {
                return {
                    lyrics: data.lyrics,
                    source: "lyrics.ovh"
                };
            }
            return null;
        } catch (error) {
            console.error("Error fetching lyrics from lyrics.ovh:", error);
            return null;
        }
    }
}

export const metadataService = new MetadataService();
