import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../core/database.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";
import type { MetadataService } from "./metadata.service.js";
import { VisibilityGuardian, VisibilityProfile, UserRole, Capability, type ViewerContext } from "../../common/visibility.js";
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

    async getAiRecommendations(trackId: number, limit: number = 5, context?: ViewerContext) {
        const targetTrack = this.database.getTrack(trackId);
        if (!targetTrack) throw new Error("Track not found");

        if (!this.openRouter.isEnabled()) {
            return [];
        }

        const effectiveContext = context || { role: UserRole.GUEST };
        const allVisibleTracks = this.database.getTracks(undefined, effectiveContext);
        const filtered = allVisibleTracks.filter(t => t.id !== trackId);

        const shuffled = filtered.sort(() => 0.5 - Math.random());
        const candidates = shuffled.slice(0, 50);

        const recommendedIds = await this.openRouter.suggestRelatedTracks(targetTrack, candidates);
        
        if (recommendedIds.length === 0) {
            return candidates
                .filter(t => t.genre === targetTrack.genre)
                .slice(0, limit)
                .map(t => mapTrackDTO(t, this.database));
        }

        const recommendedTracks = this.database.getTracksByIds(recommendedIds);
        const allowedIds = new Set(filtered.map(t => t.id));
        const safeRecommendedTracks = recommendedTracks.filter(t => allowedIds.has(t.id));

        return safeRecommendedTracks.map(t => mapTrackDTO(t, this.database));
    }

    /** Maps a release row to a DTO with its tracks attached. */
    private mapReleaseWithTracks(r: Release, profile: VisibilityProfile, username?: string) {
        const mapped = mapAlbumDTO(r, this.database, username);
        let tracks: any[] = this.database.getReleaseTracks(r.id).map((t: any) => ({
            ...t,
            // A track with no artwork of its own inherits the album cover. The
            // /api/tracks/:id/cover endpoint already resolves track-art → album-cover
            // → placeholder, so attaching it here gives every release track a usable
            // cover both locally (overview/Network) and over HTTP federation, where
            // the consuming instance resolves this relative URL against the peer base.
            coverUrl: t.coverUrl || (t.id != null ? `/api/tracks/${t.id}/cover` : ((mapped as any).coverImage || null)),
        }));
        // Some releases keep their audio linked only by album_id, with no rows in
        // release_tracks (e.g. promoted library albums). The release detail page
        // (getAlbumForUser) falls back to the album's tracks in that case; mirror
        // that here so federation/overview expose the SAME tracks the release shows
        // locally, instead of federating an empty (and therefore invisible) release.
        if (!tracks || tracks.length === 0) {
            tracks = this.database.getTracksByAlbum(r.id, profile).map(t => mapTrackDTO(t, this.database, username));
        }
        (mapped as any).tracks = tracks;
        return mapped;
    }

    /**
     * Full public catalog for instance-to-instance federation.
     *
     * Unlike getOverview (which truncates to a handful of "recent" items for the
     * homepage), this returns EVERY visible release with its tracks so a peer's
     * Network page mirrors this instance's catalog exactly. Serving the truncated
     * overview here caused remote instances to only ever see the 10 newest
     * releases, producing a track discrepancy between instances.
     */
    getFederationCatalog(isAdmin: boolean, username?: string) {
        const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
        const allReleases = this.database.getReleases(profile);
        const releases = allReleases.map(r => this.mapReleaseWithTracks(r, profile, username));
        return { releases };
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
        const recentReleases = allReleases.slice(0, 10).map(r => this.mapReleaseWithTracks(r, profile, username));

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

        const username = user.username;
        let tracks: Track[] = [];

        if (options.mineOnly) {
            const owned = context.userId != null
                ? this.database.getTracksByOwner(context.userId, context)
                : [];

            // For admin users: also include tracks owned by the primary system admin
            // (Telegram, torrent, and scanner-based imports always assign to primaryAdminId,
            // which may differ from the currently logged-in admin's userId)
            const isAdmin = [UserRole.ROOT_ADMIN, UserRole.ADMIN, UserRole.SUPER_USER].includes(context.role);
            let systemOwned: Track[] = [];
            if (isAdmin && context.userId != null) {
                const primaryAdminId = this.database.getPrimaryAdminId();
                if (primaryAdminId != null && primaryAdminId !== context.userId) {
                    systemOwned = this.database.getTracksByOwner(primaryAdminId, context);
                }
            }

            const byArtist = user.artistId
                ? this.database.getTracksByArtist(user.artistId, context)
                : [];
            const merged = new Map<number, Track>();
            for (const t of [...owned, ...systemOwned, ...byArtist]) merged.set(t.id, t);
            tracks = Array.from(merged.values());
        } else {
            tracks = this.database.getTracks(undefined, context);
        }

        // Exclude non-audio files (images, PDFs, etc.) from the tracks listing
        const audioTracks = tracks.filter(t => !t.mime_type || t.mime_type.startsWith('audio/'));
        return audioTracks.map(t => mapTrackDTO(t, this.database, username));
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

        const owners = this.database.getAlbumOwners(album.id);
        const isOwner = context.userId !== undefined && context.userId !== null && (album.owner_id === context.userId || owners.includes(context.userId));
        const isArtistOwner = context.artistId !== undefined && context.artistId !== null && album.artist_id === context.artistId;
        const canSeePrivate = VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY);
        const username = user.username;
        const isStarred = username ? this.database.isStarred(username, 'album', String(album.id)) : false;

        const effectiveIsOwner = isOwner || isArtistOwner;

        if (!canSeePrivate && !effectiveIsOwner && !isStarred) {
            if (!album.is_release) throw new Error("Access denied");
            if (album.visibility === 'private') throw new Error("Release not found");
        }

        const profile = (effectiveIsOwner || canSeePrivate || isStarred) ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
        
        let tracks: Track[] = [];
        if (album.is_release) {
            // For releases, authoritative tracks are in release_tracks
            tracks = this.database.getTracksByReleaseId(album.id);
            
            // Fallback to library tracks if release tracks are missing for some reason
            if (tracks.length === 0) {
                tracks = this.database.getTracksByAlbum(album.id, profile);
            }
        } else {
            tracks = this.database.getTracksByAlbum(album.id, profile);
        }

        const audioTracks = tracks.filter(t => !t.mime_type || t.mime_type.startsWith('audio/'));
        return {
            ...mapAlbumDTO(album, this.database, username),
            tracks: audioTracks.map(t => mapTrackDTO(t, this.database, username))
        };
    }
}
