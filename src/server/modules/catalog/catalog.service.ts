import type { DatabaseService } from "../../database.js";
import type { OpenRouterService } from "../../services/openrouter.service.js";

export class CatalogService {
    constructor(
        private database: DatabaseService,
        private openRouter: OpenRouterService
    ) {}

    async getAiRecommendations(trackId: number, limit: number = 5) {
        const targetTrack = this.database.getTrack(trackId);
        if (!targetTrack) throw new Error("Track not found");

        // Fetch a sample of other tracks (candidates)
        // We pick a larger sample (e.g., 50 random tracks or tracks from same genre) to let AI choose
        const candidates = this.database.getRandomTracks(50).filter(t => t.id !== trackId);

        const recommendedIds = await this.openRouter.suggestRelatedTracks(targetTrack, candidates);
        
        if (recommendedIds.length === 0) {
            // Fallback to simple genre matching if AI fails or is not configured
            return candidates
                .filter(t => t.genre === targetTrack.genre)
                .slice(0, limit)
                .map(t => ({
                    ...t,
                    coverImage: t.album_id ? `/api/albums/${t.album_id}/cover` : undefined
                }));
        }

        const recommendedTracks = this.database.getTracksByIds(recommendedIds);
        return recommendedTracks.map(t => ({
            ...t,
            coverImage: t.album_id ? `/api/albums/${t.album_id}/cover` : undefined
        }));
    }

    async getOverview(isAdmin: boolean) {
        const stats = await this.database.getStats();
        const allAlbums = this.database.getAlbums(!isAdmin);
        const allReleases = this.database.getReleases(!isAdmin);

        // Map results to frontend format
        const mapItem = (item: any, type: 'albums' | 'releases' | 'artists') => ({
            ...item,
            artistId: item.artist_id,
            artistName: item.artist_name,
            coverImage: `/api/${type}/${item.id}/cover`
        });

        const recentAlbums = allAlbums.slice(0, 20).map(a => mapItem(a, 'albums'));
        const recentReleases = allReleases.slice(0, 10).map(r => {
            const mapped = mapItem(r, 'releases');
            mapped.tracks = this.database.getReleaseTracks(r.id);
            return mapped;
        });

        // If not admin, adjust stats to only show public counts
        let publicStats = { ...stats };
        if (!isAdmin) {
            publicStats.albums = allAlbums.length;
            publicStats.tracks = this.database.getPublicTracksCount();
            publicStats.totalTracks = publicStats.tracks;
            publicStats.genres = this.database.getGenres(true);
            publicStats.genresCount = publicStats.genres.length;
        }

        return {
            stats: publicStats,
            releases: recentReleases, // Compatibility
            recentReleases,
            recentAlbums
        };
    }

    getGenres(isAdmin: boolean) {
        return this.database.getGenres(!isAdmin);
    }

    async search(query: string, isAdmin: boolean) {
        if (!query) return [];
        
        const results = this.database.search(query, !isAdmin);
        
        return {
            artists: results.artists.map(a => ({
                ...a,
                coverImage: `/api/artists/${a.id}/cover`
            })),
            albums: results.albums.map(a => ({
                ...a,
                coverImage: `/api/albums/${a.id}/cover`
            })),
            tracks: results.tracks.map(t => ({
                ...t,
                coverImage: t.album_id ? `/api/albums/${t.album_id}/cover` : undefined
            }))
        };
    }

    getSettings() {
        const siteName = this.database.getSetting("siteName") || "TuneCamp";
        const siteDescription = this.database.getSetting("siteDescription") || "";
        const donationLinksRaw = this.database.getSetting("donationLinks");
        const donationLinks = donationLinksRaw ? JSON.parse(donationLinksRaw) : null;
        const backgroundImage = this.database.getSetting("backgroundImage");
        const coverImage = this.database.getSetting("coverImage");
        const mode = this.database.getSetting("mode") || "label";
        const siteId = this.database.getSetting("siteId") || "";
        const zenPeers = this.database.getSetting("zenPeers") || "";
        const web3_checkout_address = this.database.getSetting("web3_checkout_address") || "";
        const web3_nft_address = this.database.getSetting("web3_nft_address") || "";

        return {
            siteName,
            siteDescription,
            donationLinks,
            backgroundImage,
            coverImage,
            mode,
            siteId,
            zenPeers,
            web3_checkout_address,
            web3_nft_address
        };
    }

    getRemoteTracks() {
        return this.database.getRemoteTracks();
    }

    getRemotePosts() {
        return this.database.getRemotePosts();
    }

    getRandomTracks(limit: number, isAdmin: boolean) {
        const tracks = this.database.getRandomTracks(limit);
        return tracks.map(t => ({
            ...t,
            coverImage: t.album_id ? `/api/albums/${t.album_id}/cover` : undefined
        }));
    }
}
