import { TuneCampProvider, MetadataProvider, MetadataMatch, ArtistMetadata, ExternalReleaseDetails, ExternalTrack, USER_AGENT } from "../../core/provider.js";

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
                trackCount: typeof r["track-count"] === "number" ? r["track-count"] : undefined,
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

    async getReleaseDetails(mbid: string, retried = false): Promise<ExternalReleaseDetails | null> {
        await this.waitIfNecessary();
        const url = `https://musicbrainz.org/ws/2/release/${encodeURIComponent(mbid)}?inc=recordings+artist-credits+genres+tags&fmt=json`;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });

            if (!response.ok) {
                if ((response.status === 429 || response.status === 503) && !retried) {
                    await drainResponse(response);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.getReleaseDetails(mbid, true);
                }
                await drainResponse(response);
                return null;
            }

            const data = await response.json() as any;
            const releaseId = data.id || mbid;
            const releaseArtist = data["artist-credit"]?.[0]?.name || "Unknown";
            const tracks: ExternalTrack[] = [];

            for (const medium of (data.media || [])) {
                const disc = medium.position || 1;
                const mediumTracks = medium.tracks || [];
                mediumTracks.forEach((t: any, idx: number) => {
                    const lengthMs = t.length ?? t.recording?.length;
                    const parsedNumber = Number(t.number);
                    const position = t.position || (Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : idx + 1);
                    tracks.push({
                        position,
                        disc,
                        title: t.title || t.recording?.title || "",
                        artist: t["artist-credit"]?.[0]?.name || releaseArtist,
                        duration: typeof lengthMs === "number" ? Math.round(lengthMs / 1000) : undefined
                    });
                });
            }

            return {
                id: releaseId,
                source: "musicbrainz",
                title: data.title || "",
                artist: releaseArtist,
                date: data.date || "",
                year: data.date ? parseInt(data.date.substring(0, 4)) : undefined,
                genre: data.genres?.[0]?.name || data.tags?.[0]?.name || undefined,
                coverUrl: `https://coverartarchive.org/release/${releaseId}/front-500`,
                tracks
            };
        } catch (error) {
            console.error("Error fetching MusicBrainz release details:", error);
            return null;
        }
    }
}
