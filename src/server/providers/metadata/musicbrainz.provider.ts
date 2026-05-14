import fetch from "node-fetch";
import { TuneCampProvider, MetadataProvider, MetadataMatch, ArtistMetadata, USER_AGENT } from "../../core/provider.js";

import { drainResponse } from "../../common/network.js";

export class MusicBrainzProvider implements TuneCampProvider, MetadataProvider {
    id = "musicbrainz";
    name = "MusicBrainz";
    version = "1.0.0";
    description = "Metadata from the MusicBrainz open database";

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
