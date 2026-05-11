import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../database.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";
import type { PublishingService } from "../publishing/publishing.service.js";
import type { ZenDBService, SiteInfo } from "../network/zendb.service.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import type { FingerprintService } from "../media/fingerprint.service.js";
import { VisibilityGuardian, Capability } from "../../common/visibility.js";
import path from "path";
import NodeID3 from "node-id3";
import { writeMetadata } from "../media/ffmpeg.js";


export class CatalogService {
    constructor(
        private database: DatabaseService,
        private publishing: PublishingService,
        private zendb: ZenDBService,
        private storage: StorageEngine,
        private musicDir: string,
        private fingerprinting: FingerprintService,
        private openRouter: OpenRouterService
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
                .map(t => this.mapTrackDTO(t));
        }

        const recommendedTracks = this.database.getTracksByIds(recommendedIds);
        return recommendedTracks.map(t => this.mapTrackDTO(t));
    }

    async getOverview(isAdmin: boolean, username?: string) {
        const stats = await this.database.getStats();
        const allAlbums = this.database.getAlbums(!isAdmin);
        const allReleases = this.database.getReleases(!isAdmin);

        const recentAlbums = allAlbums.slice(0, 20).map(a => {
            const mapped = this.mapAlbumDTO(a, username);
            (mapped as any).tracks = this.database.getTracksByAlbum(a.id).map(t => this.mapTrackDTO(t, username));
            return mapped;
        });
        const recentReleases = allReleases.slice(0, 10).map(r => {
            const mapped = this.mapAlbumDTO(r, username);
            (mapped as any).tracks = this.database.getReleaseTracks(r.id).map(rt => rt); // Release tracks are a bit different
            return mapped;
        });

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
            releases: recentReleases,
            recentReleases,
            recentAlbums
        };
    }

    getGenres(isAdmin: boolean) {
        return this.database.getGenres(!isAdmin);
    }

    async search(query: string, isAdmin: boolean, username?: string) {
        if (!query) return { artists: [], albums: [], tracks: [] };
        
        const results = this.database.search(query, !isAdmin);
        
        return {
            artists: results.artists.map(a => ({
                ...a,
                coverImage: `/api/artists/${a.id}/cover`
            })),
            albums: results.albums.map(a => this.mapAlbumDTO(a, username)),
            tracks: results.tracks.map(t => this.mapTrackDTO(t, username))
        };
    }

    // --- Library Operations (Migrated from LibraryService) ---

    async getTracksForUser(user: { userId?: number, artistId?: number | null, role?: string, isActive?: boolean, username?: string }, options: { mineOnly?: boolean } = {}): Promise<TrackDTO[]> {
        const context = VisibilityGuardian.deriveContext({
            userId: user.userId,
            artistId: user.artistId || undefined,
            role: user.role || 'guest',
            isActive: user.isActive
        });

        const username = user.username;
        let tracks: Track[] = [];

        const canSeePrivate = VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY);

        if (canSeePrivate) {
            if (options.mineOnly && context.userId !== undefined && context.userId !== null) {
                tracks = this.database.getTracksByOwner(context.userId);
            } else {
                tracks = this.database.getTracks();
            }
        } else {
            tracks = this.database.getTracks(undefined, true);
        }

        return tracks.map(t => this.mapTrackDTO(t, username));
    }

    async getAlbumForUser(albumIdOrSlug: string | number, user: { userId?: number, artistId?: number | null, role?: string, isActive?: boolean, username?: string }): Promise<AlbumDTO> {
        const context = VisibilityGuardian.deriveContext({
            userId: user.userId,
            artistId: user.artistId || undefined,
            role: user.role || 'guest',
            isActive: user.isActive
        });

        let album: Album | undefined;
        if (typeof albumIdOrSlug === 'number' || /^\d+$/.test(albumIdOrSlug as string)) {
            album = this.database.getAlbum(Number(albumIdOrSlug));
        } else {
            album = this.database.getAlbumBySlug(albumIdOrSlug as string);
        }

        if (!album) throw new Error("Album not found");

        const isOwner = context.userId !== undefined && album.owner_id === context.userId;
        const canSeePrivate = VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY);

        if (!canSeePrivate && !isOwner) {
            if (!album.is_release) throw new Error("Access denied");
            if (album.visibility === 'private') throw new Error("Release not found");
        }

        const tracks = this.database.getTracksByAlbum(album.id);
        const username = user.username;

        return {
            ...this.mapAlbumDTO(album, username),
            tracks: tracks.map(t => this.mapTrackDTO(t, username))
        };
    }

    async promoteToRelease(albumId: number): Promise<void> {
        const album = this.database.getAlbum(albumId);
        if (!album) throw new Error("Album not found");
        if (album.is_release) return;

        console.log(`🚀 Promoting library album "${album.title}" to release...`);
        this.database.promoteToRelease(albumId);

        const release = this.database.getRelease(albumId);
        if (release && (release.visibility === 'public' || release.visibility === 'unlisted')) {
            await this.publishing.syncRelease(albumId);
        }
    }

    async setVisibility(albumId: number, visibility: 'public' | 'private' | 'unlisted'): Promise<void> {
        const album = this.database.getAlbum(albumId) || this.database.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        if (album.visibility === visibility) return;

        console.log(`👁️ Setting visibility of "${album.title}" to ${visibility}...`);
        this.database.updateAlbumVisibility(albumId, visibility);

        const isRelease = 'is_release' in album ? album.is_release : true;
        if (isRelease) {
            await this.publishing.syncRelease(albumId);
        }
    }

    async deleteAlbum(albumId: number, keepTracks: boolean = false): Promise<void> {
        const album = this.database.getAlbum(albumId) || this.database.getRelease(albumId);
        if (!album) return;

        console.log(`🗑️ Deleting album/release "${album.title}"...`);

        const isRelease = 'is_release' in album ? album.is_release : true;
        if (isRelease && (album as Release).published_to_ap) {
            await this.publishing.unpublishReleaseFromAP(album as Release);
        }

        if ((album as any).published_to_gundb) {
            await this.zendb.unpublishRelease(album.id);
        }

        this.database.deleteAlbum(albumId, keepTracks);
    }

    async updateTrack(trackId: number, data: any, options?: { skipSync?: boolean, skipTagWrite?: boolean }): Promise<Track | undefined> {
        const track = this.database.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        const { title, artistId, artist, albumId, album, ownerId, trackNumber, genre, year, price, priceUsdc, currency, lyrics, externalArtwork, fileName, duration } = data;

        let finalArtistId = artistId !== undefined ? artistId : undefined;
        if (typeof artist === 'string' && artist.trim() !== "") {
            const artistName = artist.trim();
            const existingArtist = this.database.getArtistByName(artistName);
            finalArtistId = existingArtist ? existingArtist.id : this.database.createArtist(artistName);
        }

        let finalOwnerId = ownerId !== undefined ? ownerId : track.owner_id;
        if (finalOwnerId) {
            const isValidAdmin = (this.database as any).db.prepare("SELECT 1 FROM admin WHERE id = ?").get(finalOwnerId);
            if (!isValidAdmin) {
                finalOwnerId = this.database.getPrimaryAdminId();
            }
        } else {
            finalOwnerId = this.database.getPrimaryAdminId();
        }

        let finalAlbumId = albumId !== undefined ? albumId : undefined;
        if (finalAlbumId === null && typeof album === 'string' && album.trim() !== "") {
            const albumName = album.trim();
            const slug = "lib-" + albumName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const existingAlbum = this.database.getAlbumBySlug(slug);
            finalAlbumId = existingAlbum ? existingAlbum.id : this.database.createAlbum({
                title: albumName, slug, artist_id: finalArtistId || track.artist_id, owner_id: finalOwnerId,
                date: null, cover_path: null, genre: "Library", description: "",
                type: 'album', year: null, download: null, price: 0, price_usdc: 0, currency: 'ETH',
                external_links: null, is_public: false, visibility: 'private', is_release: false,
                published_at: null, published_to_gundb: false, published_to_ap: false, license: null,
                status: 'draft',
            });
        }

        if (track.file_path && fileName && typeof fileName === 'string') {
            const oldPath = track.file_path;
            const oldDir = path.dirname(oldPath);
            const oldExt = path.extname(oldPath);
            let sanitizedName = path.parse(fileName).name.replace(/[^a-z0-9_\-]/gi, '_');
            const newPath = path.posix.join(oldDir, sanitizedName + oldExt);

            if (newPath !== oldPath) {
                const fullOldPath = path.join(this.musicDir, oldPath);
                const fullNewPath = path.join(this.musicDir, newPath);
                try {
                    if (await this.storage.pathExists(fullOldPath)) {
                        await this.storage.move(fullOldPath, fullNewPath);
                        this.database.updateTrackPath(trackId, newPath, track.album_id);
                    }
                    if (track.lossless_path) {
                        const losslessExt = path.extname(track.lossless_path);
                        const newLosslessPath = path.posix.join(path.dirname(track.lossless_path), sanitizedName + losslessExt);
                        const fullOldLossless = path.join(this.musicDir, track.lossless_path);
                        const fullNewLossless = path.join(this.musicDir, newLosslessPath);
                        if (await this.storage.pathExists(fullOldLossless)) {
                            await this.storage.move(fullOldLossless, fullNewLossless);
                            this.database.updateTrackLosslessPath(trackId, newLosslessPath);
                        }
                    }
                } catch (err: any) {
                    console.error(`[CatalogService] Rename failed for track ${trackId}:`, err.message);
                }
            }
        }

        if (title !== undefined) this.database.updateTrackTitle(trackId, title);
        if (finalArtistId !== undefined) {
            const artistChanged = finalArtistId !== track.artist_id;
            this.database.updateTrackArtist(trackId, finalArtistId);
            if (artistChanged && track.album_id) {
                const tracksInAlbum = this.database.getTracksByAlbum(track.album_id);
                if (tracksInAlbum.length === 1) {
                    this.database.updateAlbumArtist(track.album_id, finalArtistId);
                    const release = this.database.getRelease(track.album_id);
                    if (release) this.database.updateRelease(track.album_id, { artist_id: finalArtistId });
                }
            }
        } else if (artist === undefined && (artist === null || artist === "")) {
            this.database.updateTrackArtist(trackId, null);
        }

        if (finalAlbumId !== undefined) this.database.updateTrackAlbum(trackId, finalAlbumId);
        if (ownerId !== undefined) this.database.updateTrackOwner(trackId, finalOwnerId);
        if (trackNumber !== undefined) this.database.updateTrackNumber(trackId, trackNumber);
        if (duration !== undefined) this.database.updateTrackDuration(trackId, parseFloat(duration));
        if (price !== undefined || priceUsdc !== undefined) this.database.updateTrackPrice(trackId, price ?? track.price, priceUsdc ?? track.price_usdc, currency ?? track.currency);
        if (lyrics !== undefined) this.database.updateTrackLyrics(trackId, lyrics);
        if (genre !== undefined) this.database.updateTrackGenre(trackId, genre);
        if (year !== undefined) this.database.updateTrackYear(trackId, year ? Number(year) : null);
        if (externalArtwork !== undefined) this.database.updateTrackExternalArtwork(trackId, externalArtwork);
        if (data.external_id !== undefined || data.externalId !== undefined) {
            (this.database as any).db.prepare("UPDATE tracks SET external_id = ? WHERE id = ?").run(data.external_id ?? data.externalId, trackId);
        }

        const updatedTrack = this.database.getTrack(trackId);
        if (!options?.skipTagWrite && updatedTrack && updatedTrack.file_path) {
            await this.writeTrackTags(updatedTrack);
        }
        if (!options?.skipSync && updatedTrack && updatedTrack.album_id) {
            await this.publishing.syncRelease(updatedTrack.album_id).catch(e => console.error(`[CatalogService] Sync failed:`, e));
        }
        return updatedTrack;
    }

    async batchUpdateTracks(trackIds: number[], data: any, user: { userId?: number, artistId?: number, isAdmin: boolean, username?: string }): Promise<any> {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const affectedAlbums = new Set<number>();
        const updatedTracks: Track[] = [];
        const tracks = this.database.getTracksByIds(trackIds);
        const trackMap = new Map(tracks.map(t => [t.id, t]));

        for (const id of trackIds) {
            try {
                const track = trackMap.get(id);
                if (!track) { results.failed++; results.errors.push(`Track ${id} not found`); continue; }
                const isOwner = track.owner_id === user.userId || (track.owner_id === null && track.artist_id === user.artistId);
                if (!user.isAdmin && !isOwner) { results.failed++; results.errors.push(`Track ${id}: Access denied`); continue; }

                const updated = await this.updateTrack(id, data, { skipSync: true, skipTagWrite: true });
                if (updated) {
                    results.success++;
                    updatedTracks.push(updated);
                    if (updated.album_id) affectedAlbums.add(updated.album_id);
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${id}: ${err.message}`);
            }
        }

        if (updatedTracks.length > 0) {
            await Promise.all(updatedTracks.map(t => this.writeTrackTags(t)));
            for (const albumId of affectedAlbums) {
                await this.publishing.syncRelease(albumId).catch(e => console.error(`[CatalogService] Batch sync failed:`, e));
            }
        }
        return results;
    }

    async deleteTrack(trackId: number, deleteFile: boolean = false): Promise<void> {
        const track = this.database.getTrack(trackId);
        if (!track) return;
        if (deleteFile && track.file_path) {
            const fullPath = path.join(this.musicDir, track.file_path);
            try {
                if (await this.storage.pathExists(fullPath)) {
                    await this.storage.remove(fullPath);
                    const ext = path.extname(fullPath).toLowerCase();
                    if (ext === '.mp3') {
                        const wavPath = fullPath.replace(/\.mp3$/i, '.wav');
                        if (await this.storage.pathExists(wavPath)) await this.storage.remove(wavPath);
                    }
                }
            } catch (err: any) {
                console.error(`[CatalogService] Failed to delete file:`, err.message);
            }
        }
        this.database.deleteTrack(trackId);
        if (track.album_id) {
            await this.publishing.syncRelease(track.album_id).catch(e => console.error(`[CatalogService] Sync failed after track delete:`, e));
        }
    }

    async batchDeleteTracks(trackIds: number[], deleteFiles: boolean, user: { userId?: number, artistId?: number, isAdmin: boolean }): Promise<any> {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const tracks = this.database.getTracksByIds(trackIds);
        for (const track of tracks) {
            try {
                const isOwner = track.owner_id === user.userId || (track.owner_id === null && track.artist_id === user.artistId);
                if (!user.isAdmin && !isOwner) { results.failed++; results.errors.push(`Track ${track.id}: Access denied`); continue; }
                await this.deleteTrack(track.id, deleteFiles);
                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${track.id}: ${err.message}`);
            }
        }
        return results;
    }

    async starTrack(username: string, trackId: number): Promise<void> {
        const track = this.database.getTrack(trackId);
        if (!track) throw new Error("Track not found");
        this.database.starItem(username, 'track', String(trackId));
        if (track.album_id) {
            const album = this.database.getAlbum(track.album_id) || this.database.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.incrementTrackLikeCount(album.slug, String(trackId));
            }
        }
    }

    async unstarTrack(username: string, trackId: number): Promise<void> {
        const track = this.database.getTrack(trackId);
        if (!track) return;
        this.database.unstarItem(username, 'track', String(trackId));
        if (track.album_id) {
            const album = this.database.getAlbum(track.album_id) || this.database.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.decrementTrackLikeCount(album.slug, String(trackId));
            }
        }
    }

    async setTrackRating(username: string, trackId: number, rating: number): Promise<void> {
        const track = this.database.getTrack(trackId);
        if (!track) throw new Error("Track not found");
        this.database.setItemRating(username, 'track', String(trackId), rating);
        if (track.album_id) {
            const album = this.database.getAlbum(track.album_id) || this.database.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.setTrackRating(album.slug, String(trackId), rating);
            }
        }
    }

    async starAlbum(username: string, albumId: number): Promise<void> {
        const album = this.database.getAlbum(albumId) || this.database.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        this.database.starItem(username, 'album', String(albumId));
    }

    async unstarAlbum(username: string, albumId: number): Promise<void> {
        this.database.unstarItem(username, 'album', String(albumId));
    }

    async setAlbumRating(username: string, albumId: number, rating: number): Promise<void> {
        const album = this.database.getAlbum(albumId) || this.database.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        this.database.setItemRating(username, 'album', String(albumId), rating);
    }

    async localizeTrack(trackId: number, gdriveService: any): Promise<Track> {
        const track = this.database.getTrack(trackId);
        if (!track) throw new Error("Track not found");
        if (!track.file_path || !track.file_path.startsWith("gdrive://")) throw new Error("Track is not cloud-linked");

        const fileId = track.file_path.substring(9);
        const ownerId = track.owner_id || this.database.getPrimaryAdminId() || 1;
        const { stream, headers } = await gdriveService.getFileStream(ownerId, fileId);
        const ext = headers['content-type'] === 'audio/flac' ? '.flac' : (headers['content-type'] === 'audio/mpeg' ? '.mp3' : (headers['content-type'] === 'audio/wav' ? '.wav' : '.mp3'));
        const sanitizedTitle = (track.title || "Untitled").replace(/[^a-z0-9_\-]/gi, '_');
        const sanitizedArtist = (track.artist_name || "Unknown").replace(/[^a-z0-9_\-]/gi, '_');
        const relativePath = path.posix.join("cloud_imports", `${sanitizedArtist} - ${sanitizedTitle}${ext}`);
        const fullPath = path.join(this.musicDir, relativePath);

        await this.storage.ensureDir(path.dirname(fullPath));
        await this.storage.writeFileStream(fullPath, stream);
        this.database.updateTrackPath(trackId, relativePath, track.album_id);
        
        const updatedTrack = this.database.getTrack(trackId);
        if (updatedTrack) {
            this.autoIdentify(trackId).catch(err => console.error(`[CatalogService] autoIdentify failed:`, err));
            return updatedTrack;
        }
        throw new Error("Failed to localize track");
    }

    async analyzeFingerprint(trackId: number): Promise<string> {
        const track = this.database.getTrack(trackId);
        if (!track || !track.file_path) throw new Error("Track not found");
        const fullPath = path.join(this.musicDir, track.file_path);
        if (!(await this.storage.pathExists(fullPath))) throw new Error("File not found");
        const { fingerprint } = await this.fingerprinting.generate(fullPath);
        this.database.updateTrackFingerprint(trackId, fingerprint);
        return fingerprint;
    }

    async autoIdentify(trackId: number): Promise<void> {
        try {
            const track = this.database.getTrack(trackId);
            if (!track) return;
            let fingerprint = track.fingerprint;
            if (!fingerprint) fingerprint = await this.analyzeFingerprint(trackId);
            const metadata = await this.zendb.getFingerprintMetadata(fingerprint);
            if (metadata) {
                const updates: any = {};
                if (!track.genre && metadata.genre) updates.genre = metadata.genre;
                if (!track.year && metadata.year) updates.year = metadata.year;
                if (!track.album_id && metadata.album) updates.album = metadata.album;
                if (Object.keys(updates).length > 0) await this.updateTrack(trackId, updates);
            }
        } catch (err) { console.error(`[CatalogService] autoIdentify failed:`, err); }
    }

    // --- Helpers & Settings ---

    getSettings() {
        const settings = ["siteName", "siteDescription", "donationLinks", "backgroundImage", "coverImage", "mode", "siteId", "zenPeers", "web3_checkout_address", "web3_nft_address"];
        const res: any = {};
        settings.forEach(k => {
            const v = this.database.getSetting(k);
            if (k === 'donationLinks' && v) res[k] = JSON.parse(v);
            else res[k] = v || (k === 'siteName' ? 'TuneCamp' : (k === 'mode' ? 'label' : ''));
        });
        return res;
    }

    getRemoteTracks() {
        return this.database.getRemoteTracks().map(t => ({
            ...t,
            artistName: t.artist_name,
            albumName: t.album_name,
            audioUrl: t.stream_url || t.url,
            coverUrl: t.cover_url,
            addedAt: t.published_at || t.received_at
        }));
    }

    getRemotePosts() { return this.database.getRemotePosts(); }

    getRandomTracks(limit: number, _isAdmin: boolean) {
        return this.database.getRandomTracks(limit).map(t => this.mapTrackDTO(t));
    }

    // --- DTO Mapping ---

    mapTrackDTO(t: Track, username?: string): TrackDTO {
        return {
            ...t,
            albumId: t.album_id,
            artistId: t.artist_id,
            losslessPath: t.lossless_path,
            externalArtwork: t.external_artwork,
            albumName: t.album_title,
            albumDownload: t.album_download,
            albumVisibility: t.album_visibility,
            albumPrice: t.album_price,
            artistName: t.artist_name,
            path: t.file_path,
            filename: t.file_path ? path.basename(t.file_path) : undefined,
            coverUrl: t.external_artwork ? `/api/tracks/${t.id}/cover` : (t.album_id ? `/api/albums/${t.album_id}/cover` : null),
            waveform: t.waveform || (t.file_path ? `/api/waveform/${t.id}` : null),
            starred: username ? this.database.isStarred(username, 'track', String(t.id)) : false,
            rating: username ? this.database.getItemRating(username, 'track', String(t.id)) : 0
        };
    }

    mapAlbumDTO(a: Album | Release, username?: string): AlbumDTO {
        const is_public = 'is_public' in a ? !!a.is_public : (a.visibility === 'public' || a.visibility === 'unlisted');
        return {
            ...a,
            is_public,
            is_release: 'is_release' in a ? !!a.is_release : true,
            coverImage: a.cover_path,
            starred: username ? this.database.isStarred(username, 'album', String(a.id)) : false,
            rating: username ? this.database.getItemRating(username, 'album', String(a.id)) : 0
        } as AlbumDTO;
    }

    async updateAlbum(id: number, data: any): Promise<void> {
        this.database.updateAlbum(id, data);
        await this.publishing.syncRelease(id).catch(e => console.error(`[CatalogService] Sync failed for album update:`, e));
    }

    private async writeTrackTags(track: Track): Promise<void> {
        const fullPath = path.join(this.musicDir, track.file_path!);
        if (!(await this.storage.pathExists(fullPath))) return;
        const ext = path.extname(fullPath).toLowerCase();
        const tags = {
            title: track.title,
            artist: track.artist_name || undefined,
            album: track.album_title || undefined,
            trackNumber: track.track_num?.toString() || undefined,
            genre: track.genre || undefined,
            year: track.year?.toString() || undefined
        };
        try {
            if (ext === '.mp3') NodeID3.update(tags as any, fullPath);
            else if (['.flac', '.ogg', '.m4a', '.wav'].includes(ext)) {
                await writeMetadata(fullPath, {
                    title: tags.title, artist: tags.artist, album: tags.album,
                    track: tags.trackNumber, genre: tags.genre, year: tags.year
                });
            }
        } catch (err) { console.error(`[CatalogService] Tag write failed for ${track.id}:`, err); }
    }
}
