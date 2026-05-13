import { 
    scApiRequest, 
    resolveArtworkUrl, 
    SoundcloudTrack, 
    SoundcloudSearchResult,
    SoundcloudUser,
    SoundcloudUserSearchResult
} from "../../utils/soundcloud.js";
import type { MetadataProvider, MetadataResult, ArtistMetadata } from "../../core/provider.js";

/**
 * SoundCloudMetadataProvider — implements rich metadata search for tracks and artists.
 */
export class SoundCloudMetadataProvider implements MetadataProvider {
    readonly id = "soundcloud";
    readonly name = "SoundCloud";
    readonly version = "1.0.0";
    readonly description = "Extracts metadata for tracks and artists from SoundCloud";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Searches SoundCloud for recordings (tracks).
     */
    async searchRecording(query: string): Promise<MetadataResult[]> {
        try {
            const result = await scApiRequest<SoundcloudSearchResult>("search/tracks", {
                q: query,
                limit: "5",
            });

            return result.collection.map(track => ({
                id: String(track.id),
                title: track.title,
                artist: track.user?.username ?? "Unknown",
                albumTitle: undefined,
                date: track.created_at ? track.created_at.split("T")[0] : "",
                year: track.created_at ? new Date(track.created_at).getFullYear() : undefined,
                genre: track.genre,
                coverUrl: resolveArtworkUrl(track),
                description: track.description,
                source: "soundcloud"
            }));
        } catch (error) {
            console.error(`[SoundCloudMetadata] Search failed:`, error);
            return [];
        }
    }

    async searchRelease(query: string): Promise<MetadataResult[]> {
        // SoundCloud doesn't have a strict "release" concept like albums, 
        // but we can search for tracks as they are often singles.
        return this.searchRecording(query);
    }

    async getCoverUrl(id: string): Promise<string | null> {
        try {
            const trackId = Number(id);
            if (Number.isNaN(trackId)) return null;
            const track = await scApiRequest<SoundcloudTrack>(`tracks/${trackId}`);
            return resolveArtworkUrl(track) || null;
        } catch {
            return null;
        }
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        try {
            const result = await scApiRequest<SoundcloudUserSearchResult>("search/users", {
                q: query,
                limit: "5",
            });

            return result.collection.map(user => ({
                id: String(user.id),
                name: user.username,
                bio: user.description,
                avatarUrl: resolveArtworkUrl(user),
                links: { soundcloud: user.permalink_url },
                source: "soundcloud"
            }));
        } catch (error) {
            console.error(`[SoundCloudMetadata] Artist search failed:`, error);
            return [];
        }
    }
}
