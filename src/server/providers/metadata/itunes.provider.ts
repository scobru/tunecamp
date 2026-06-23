import { TuneCampProvider, MetadataProvider, MetadataMatch, ArtistMetadata, USER_AGENT } from "../../core/provider.js";
import { drainResponse } from "../../common/network.js";

export class ITunesProvider implements TuneCampProvider, MetadataProvider {
    id = "itunes";
    name = "iTunes";
    version = "1.0.0";
    description = "Metadata from the Apple iTunes Search API";

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
