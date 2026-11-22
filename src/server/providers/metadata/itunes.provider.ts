import { TuneCampProvider, MetadataProvider, MetadataMatch, ArtistMetadata, ExternalReleaseDetails, ExternalTrack, USER_AGENT } from "../../core/provider.js";
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
                trackCount: typeof r.trackCount === "number" ? r.trackCount : undefined,
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

    async getReleaseDetails(id: string): Promise<ExternalReleaseDetails | null> {
        const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`;
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT }
            });
            if (!response.ok) {
                await drainResponse(response);
                return null;
            }
            const data = await response.json() as any;
            const results = (data.results || []) as any[];
            const collection = results.find(r => r.wrapperType === "collection");
            const songRows = results.filter(r => r.wrapperType === "track");
            if (!collection && songRows.length === 0) {
                return null;
            }

            songRows.sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0));
            const tracks: ExternalTrack[] = songRows.map((r, idx) => ({
                position: r.trackNumber || idx + 1,
                disc: r.discNumber || 1,
                title: r.trackName,
                artist: r.artistName,
                duration: typeof r.trackTimeMillis === "number" ? Math.round(r.trackTimeMillis / 1000) : undefined
            }));

            const base = collection || songRows[0];
            const releaseDate = base.releaseDate || "";
            const artwork = base.artworkUrl100 ? base.artworkUrl100.replace("100x100bb", "1400x1400bb") : undefined;

            return {
                id: String(collection?.collectionId || id),
                source: "itunes",
                title: collection?.collectionName || songRows[0]?.collectionName || "",
                artist: collection?.artistName || songRows[0]?.artistName || "Unknown",
                date: releaseDate,
                year: releaseDate ? parseInt(releaseDate.substring(0, 4)) : undefined,
                genre: base.primaryGenreName,
                coverUrl: artwork,
                tracks
            };
        } catch (error) {
            console.error("Error fetching iTunes release details:", error);
            return null;
        }
    }
}
