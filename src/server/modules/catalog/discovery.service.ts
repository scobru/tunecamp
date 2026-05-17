import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../core/database.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";
import type { MetadataService } from "./metadata.service.js";
import { VisibilityGuardian, VisibilityProfile, UserRole, Capability } from "../../common/visibility.js";
import { mapTrackDTO, mapAlbumDTO } from "./catalog.mappers.js";

/**
 * Discovery Engine — Deep module for read-side catalog exploration.
 * Handles search, recommendations, overview statistics, and user-scoped views.
 */
export class DiscoveryService {
    constructor(
        private database: DatabaseService,
        private openRouter: OpenRouterService,
        private metadataService: MetadataService
    ) {}

    // --- Query & Recommendation Operations ---

    async getAiRecommendations(trackId: number, limit: number = 5) {
        const targetTrack = this.database.getTrack(trackId);
        if (!targetTrack) throw new Error("Track not found");

        const candidates = this.database.getRandomTracks(50).filter(t => t.id !== trackId);

        const recommendedIds = await this.openRouter.suggestRelatedTracks(targetTrack, candidates);
        
        if (recommendedIds.length === 0) {
            return candidates
                .filter(t => t.genre === targetTrack.genre)
                .slice(0, limit)
                .map(t => mapTrackDTO(t, this.database));
        }

        const recommendedTracks = this.database.getTracksByIds(recommendedIds);
        return recommendedTracks.map(t => mapTrackDTO(t, this.database));
    }

    async getOverview(isAdmin: boolean, username?: string) {
        const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
        const stats = await this.database.getStats();
        const allAlbums = this.database.getAlbums(profile);
        const allReleases = this.database.getReleases(profile);

        const recentAlbums = allAlbums.slice(0, 20).map(a => {
            const mapped = mapAlbumDTO(a, this.database, username);
            (mapped as any).tracks = this.database.getTracksByAlbum(a.id, profile).map(t => mapTrackDTO(t, this.database, username));
            return mapped;
        });
        const recentReleases = allReleases.slice(0, 10).map(r => {
            const mapped = mapAlbumDTO(r, this.database, username);
            (mapped as any).tracks = this.database.getReleaseTracks(r.id).map(rt => rt);
            return mapped;
        });

        let publicStats = { ...stats };
        if (!isAdmin) {
            publicStats.albums = allAlbums.length;
            publicStats.tracks = this.database.getPublicTracksCount();
            publicStats.totalTracks = publicStats.tracks;
            publicStats.genres = this.database.getGenres(profile);
            publicStats.genresCount = publicStats.genres.length;
        }

        return {
            stats: publicStats,
            releases: recentReleases,
            recentReleases,
            recentAlbums
        };
    }

    getGenres(isAdmin: boolean) {
        const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
        return this.database.getGenres(profile);
    }

    async search(query: string, isAdmin: boolean, username?: string) {
        if (!query) return { artists: [], albums: [], tracks: [] };
        
        const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
        const results = this.database.search(query, profile);
        
        return {
            artists: results.artists.map(a => ({
                ...a,
                coverImage: `/api/artists/${a.id}/cover`
            })),
            albums: results.albums.map(a => mapAlbumDTO(a, this.database, username)),
            tracks: results.tracks.map(t => mapTrackDTO(t, this.database, username))
        };
    }

    // --- User-Scoped Retrieval ---

    async getTracksForUser(user: { userId?: number, artistId?: number | null, role?: string, isActive?: boolean, username?: string }, options: { mineOnly?: boolean } = {}): Promise<TrackDTO[]> {
        const context = VisibilityGuardian.deriveContext({
            userId: user.userId,
            artistId: user.artistId || undefined,
            role: (user.role as UserRole) || UserRole.GUEST,
            isActive: user.isActive
        });

        const profile = VisibilityGuardian.getProfile(context);
        const username = user.username;
        let tracks: Track[] = [];

        if (profile === VisibilityProfile.ALL_ACCESS) {
            if (options.mineOnly && context.userId !== undefined && context.userId !== null) {
                tracks = this.database.getTracksByOwner(context.userId, profile);
            } else {
                tracks = this.database.getTracks(undefined, profile);
            }
        } else if (profile === VisibilityProfile.OWNER_SCOPED && context.userId) {
            const publicTracks = this.database.getTracks(undefined, VisibilityProfile.PUBLIC_STAGE);
            const myTracks = this.database.getTracksByOwner(context.userId, VisibilityProfile.ALL_ACCESS);
            
            const seen = new Set();
            tracks = [...publicTracks, ...myTracks].filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
        } else {
            const publicTracks = this.database.getTracks(undefined, VisibilityProfile.PUBLIC_STAGE);
            let starredTracks: Track[] = [];
            
            if (username) {
                const starredIds = this.database.getStarredItems(username, 'track').map(i => i.item_id);
                const validIds = starredIds.filter(id => /^\d+$/.test(id)).map(id => parseInt(id, 10));
                if (validIds.length > 0) {
                    starredTracks = this.database.getTracksByIds(validIds);
                }
            }

            const seen = new Set();
            tracks = [...publicTracks, ...starredTracks].filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
        }

        return tracks.map(t => mapTrackDTO(t, this.database, username));
    }

    async getAlbumForUser(albumIdOrSlug: string | number, user: { userId?: number, artistId?: number | null, role?: string, isActive?: boolean, username?: string }): Promise<AlbumDTO> {
        const context = VisibilityGuardian.deriveContext({
            userId: user.userId,
            artistId: user.artistId || undefined,
            role: (user.role as UserRole) || UserRole.GUEST,
            isActive: user.isActive
        });

        let album: Album | undefined;
        if (typeof albumIdOrSlug === 'number' || /^\d+$/.test(albumIdOrSlug as string)) {
            album = this.database.getAlbum(Number(albumIdOrSlug));
        } else if (String(albumIdOrSlug).startsWith("ext:")) {
            album = this.database.db.prepare("SELECT * FROM albums WHERE external_id = ?").get(albumIdOrSlug) as any;
        } else {
            album = this.database.getAlbumBySlug(albumIdOrSlug as string);
        }

        if (!album && typeof albumIdOrSlug === 'string' && !/^\d+$/.test(albumIdOrSlug)) {
             const results = await this.metadataService.searchRelease(albumIdOrSlug);
             if (results && results.length > 0) {
                 const match = results[0];
                 const extId = `ext:search:${match.source}:${match.id}`;
                 return {
                     id: extId,
                     title: match.title,
                     artist_name: match.artist,
                     artistName: match.artist,
                     coverImage: match.coverUrl,
                     isExternal: true,
                     is_release: false,
                     is_public: true,
                     tracks: [],
                     starred: user.username ? this.database.isStarred(user.username, 'album', extId) : false
                 } as any;
             }
        }

        if (!album) throw new Error("Album not found");

        const isOwner = context.userId !== undefined && album.owner_id === context.userId;
        const canSeePrivate = VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY);
        const username = user.username;
        const isStarred = username ? this.database.isStarred(username, 'album', String(album.id)) : false;

        if (!canSeePrivate && !isOwner && !isStarred) {
            if (!album.is_release) throw new Error("Access denied");
            if (album.visibility === 'private') throw new Error("Release not found");
        }

        const tracks = this.database.getTracksByAlbum(album.id);

        return {
            ...mapAlbumDTO(album, this.database, username),
            tracks: tracks.map(t => mapTrackDTO(t, this.database, username))
        };
    }
}
