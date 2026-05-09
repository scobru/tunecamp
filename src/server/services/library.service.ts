import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../database.js";
import type { PublishingService } from "../publishing.js";
import type { ZenDBService } from "../zendb.js";
import type { StorageEngine } from "../modules/storage/storage.engine.js";
import { VisibilityGuardian, Capability, UserRole, ViewerContext } from "../common/visibility.js";
import path from "path";
import NodeID3 from "node-id3";
import { writeMetadata } from "../ffmpeg.js";

export class LibraryService {
    constructor(
        private db: DatabaseService,
        private publishing: PublishingService,
        private zendb: ZenDBService,
        private storage: StorageEngine,
        private musicDir: string
    ) {}

    // --- Query Operations ---

    /**
     * Retrieves tracks for a user, applying visibility rules and owner filters.
     * Deepened logic: leverages VisibilityGuardian to separate "Santuario" from "Arena".
     */
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
                tracks = this.db.getTracksByOwner(context.userId);
            } else {
                // Root Admin, Admin, and Super Users see the entire Santuario
                tracks = this.db.getTracks();
            }
        } else {
            // Normal Users and Guests only see the Arena (Public Releases)
            tracks = this.db.getTracks(undefined, true);
        }

        return tracks.map(t => this.mapTrackDTO(t, username));
    }

    /**
     * Retrieves a single album with its tracks and user-specific metadata.
     */
    async getAlbumForUser(albumIdOrSlug: string | number, user: { userId?: number, artistId?: number | null, role?: string, isActive?: boolean, username?: string }): Promise<AlbumDTO> {
        const context = VisibilityGuardian.deriveContext({
            userId: user.userId,
            artistId: user.artistId || undefined,
            role: user.role || 'guest',
            isActive: user.isActive
        });

        let album: Album | undefined;
        if (typeof albumIdOrSlug === 'number' || /^\d+$/.test(albumIdOrSlug as string)) {
            album = this.db.getAlbum(Number(albumIdOrSlug));
        } else {
            album = this.db.getAlbumBySlug(albumIdOrSlug as string);
        }

        if (!album) throw new Error("Album not found");

        const isOwner = context.userId !== undefined && album.owner_id === context.userId;
        const canSeePrivate = VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY);

        // Visibility / Ownership check
        if (!canSeePrivate && !isOwner) {
            // Normal users only see public releases that aren't private
            if (!album.is_release) throw new Error("Access denied");
            if (album.visibility === 'private') throw new Error("Release not found");
        }

        const tracks = this.db.getTracksByAlbum(album.id);
        const username = user.username;

        return {
            ...this.mapAlbumDTO(album, username),
            tracks: tracks.map(t => this.mapTrackDTO(t, username))
        };
    }

    /**
     * Map a raw database Track to a UI-friendly DTO.
     */
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
            starred: username ? this.db.isStarred(username, 'track', String(t.id)) : false,
            rating: username ? this.db.getItemRating(username, 'track', String(t.id)) : 0
        };
    }

    /**
     * Map a raw database Album to a UI-friendly DTO.
     */
    mapAlbumDTO(a: Album, username?: string): AlbumDTO {
        return {
            ...a,
            coverImage: a.cover_path,
            starred: username ? this.db.isStarred(username, 'album', String(a.id)) : false,
            rating: username ? this.db.getItemRating(username, 'album', String(a.id)) : 0
        };
    }

    // --- Album Operations ---

    /**
     * Promotes a library album to a formal release.
     * This moves metadata to the releases compartment and potentially triggers federation.
     */
    async promoteToRelease(albumId: number): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) {
            throw new Error("Album not found");
        }

        if (album.is_release) {
            return; // Already a release
        }

        console.log(`🚀 Promoting library album "${album.title}" to release...`);
        
        // 1. Database promotion (handles transfers to releases/release_tracks tables)
        this.db.promoteToRelease(albumId);

        // 2. Refresh release info after promotion
        const release = this.db.getRelease(albumId);
        if (release && (release.visibility === 'public' || release.visibility === 'unlisted')) {
            // 3. Trigger federation if it's immediately public
            await this.publishing.syncRelease(albumId);
        }
    }

    /**
     * Sets album visibility and handles the necessary federation sync.
     */
    async setVisibility(albumId: number, visibility: 'public' | 'private' | 'unlisted'): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) {
            throw new Error("Album not found");
        }

        if (album.visibility === visibility) return;

        console.log(`👁️ Setting visibility of "${album.title}" to ${visibility}...`);
        
        // 1. Update DB
        this.db.updateAlbumVisibility(albumId, visibility);

        // 2. Sync if it's a release (library albums aren't federated in the same way)
        const isRelease = 'is_release' in album ? album.is_release : true;
        if (isRelease) {
            await this.publishing.syncRelease(albumId);
        }
    }

    /**
     * Deletes an album or release from the system.
     */
    async deleteAlbum(albumId: number, keepTracks: boolean = false): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) return;

        console.log(`🗑️ Deleting album/release "${album.title}"...`);

        // 1. If it was federated via AP, we need to broadcast a delete
        const isRelease = 'is_release' in album ? album.is_release : true;
        if (isRelease && (album as Release).published_to_ap) {
            await this.publishing.unpublishReleaseFromAP(album as Release);
        }

        // 2. Remove from ZenDB cache
        if ((album as any).published_to_gundb) {
            await this.zendb.unpublishRelease(album.id);
        }

        // 3. Database deletion
        this.db.deleteAlbum(albumId, keepTracks);
    }

    // --- Track Operations ---

    /**
     * Stars a track (like) and syncs with decentralized mesh if public.
     */
    async starTrack(username: string, trackId: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        // 1. Local DB update
        this.db.starItem(username, 'track', String(trackId));

        // 2. Mesh sync for public tracks
        if (track.album_id) {
            const album = this.db.getAlbum(track.album_id) || this.db.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.incrementTrackLikeCount(album.slug, String(trackId));
            }
        }
    }

    /**
     * Unstars a track (unlike) and syncs with decentralized mesh if public.
     */
    async unstarTrack(username: string, trackId: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) return;

        // 1. Local DB update
        this.db.unstarItem(username, 'track', String(trackId));

        // 2. Mesh sync for public tracks
        if (track.album_id) {
            const album = this.db.getAlbum(track.album_id) || this.db.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.decrementTrackLikeCount(album.slug, String(trackId));
            }
        }
    }

    /**
     * Sets track rating and syncs with decentralized mesh if public.
     */
    async setTrackRating(username: string, trackId: number, rating: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        // 1. Local DB update
        this.db.setItemRating(username, 'track', String(trackId), rating);

        // 2. Mesh sync for public tracks
        if (track.album_id) {
            const album = this.db.getAlbum(track.album_id) || this.db.getRelease(track.album_id);
            if (album && (album.visibility === 'public' || album.visibility === 'unlisted')) {
                (this.publishing as any).gundbService?.setTrackRating(album.slug, String(trackId), rating);
            }
        }
    }

    /**
     * Localizes a track from a cloud provider (e.g. Google Drive) to the local server storage.
     */
    async localizeTrack(trackId: number, gdriveService: any): Promise<Track> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");
        if (!track.file_path || !track.file_path.startsWith("gdrive://")) {
            throw new Error("Track is not a cloud-linked track");
        }

        const fileId = track.file_path.substring(9);
        const ownerId = track.owner_id || this.db.getPrimaryAdminId() || 1;

        console.log(`[LibraryService] Localizing track ${trackId} from GDrive (${fileId})...`);

        // 1. Get stream from GDrive
        const { stream, headers } = await gdriveService.getFileStream(ownerId, fileId);
        
        // 2. Determine local path
        const ext = headers['content-type'] === 'audio/flac' ? '.flac' : 
                    headers['content-type'] === 'audio/mpeg' ? '.mp3' : 
                    headers['content-type'] === 'audio/wav' ? '.wav' : '.mp3';
        
        const sanitizedTitle = (track.title || "Untitled").replace(/[^a-z0-9_\-]/gi, '_');
        const sanitizedArtist = (track.artist_name || "Unknown").replace(/[^a-z0-9_\-]/gi, '_');
        const relativePath = path.posix.join("cloud_imports", `${sanitizedArtist} - ${sanitizedTitle}${ext}`);
        const fullPath = path.join(this.musicDir, relativePath);

        // Ensure directory exists
        await this.storage.ensureDir(path.dirname(fullPath));

        // 3. Save to disk
        await this.storage.writeFileStream(fullPath, stream);

        // 4. Update Database
        this.db.updateTrackPath(trackId, relativePath, track.album_id);
        
        // 5. Update metadata from file (optional but good)
        const updatedTrack = this.db.getTrack(trackId);
        if (updatedTrack) {
            console.log(`[LibraryService] Track ${trackId} localized to: ${relativePath}`);
            return updatedTrack;
        }
        
        throw new Error("Failed to retrieve updated track");
    }

    /**
     * Deletes a track from the database and optionally removes the physical file.
     */
    async deleteTrack(trackId: number, deleteFile: boolean = false): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track) return;

        // 1. Physical file deletion
        if (deleteFile && track.file_path) {
            const fullPath = path.join(this.musicDir, track.file_path);
            try {
                if (await this.storage.pathExists(fullPath)) {
                    await this.storage.remove(fullPath);
                    
                    // Also check for associated raw file (e.g. .wav if this is .mp3)
                    const ext = path.extname(fullPath).toLowerCase();
                    if (ext === '.mp3') {
                        const wavPath = fullPath.replace(/\.mp3$/i, '.wav');
                        if (await this.storage.pathExists(wavPath)) {
                            await this.storage.remove(wavPath);
                        }
                    }
                }
            } catch (err: any) {
                console.error(`[LibraryService] Failed to delete file for track ${trackId}:`, err.message);
            }
        }

        // 2. Database deletion
        this.db.deleteTrack(trackId);

        // 3. Federation sync (Notify that track is gone from album)
        if (track.album_id) {
            await this.publishing.syncRelease(track.album_id).catch(e => 
                console.error(`[LibraryService] Failed to sync release after track delete:`, e)
            );
        }
    }

    /**
     * Updates track metadata in DB and writes ID3 tags to disk if applicable.
     */
    async updateTrack(trackId: number, data: any, options?: { skipSync?: boolean, skipTagWrite?: boolean }): Promise<Track | undefined> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        const { title, artistId, artist, albumId, album, ownerId, trackNumber, genre, year, price, priceUsdc, currency, lyrics, externalArtwork, fileName, duration } = data;

        let finalArtistId = artistId !== undefined ? artistId : undefined;
        
        // If artist name string is provided, try to resolve it to an ID
        if (typeof artist === 'string' && artist.trim() !== "") {
            const artistName = artist.trim();
            const existingArtist = this.db.getArtistByName(artistName);
            finalArtistId = existingArtist ? existingArtist.id : this.db.createArtist(artistName);
        }

        let finalOwnerId = ownerId !== undefined ? ownerId : track.owner_id;
        
        // Safety check for owner_id integrity (especially if it was corrupted by the old artist_id bug)
        if (finalOwnerId) {
            const isValidAdmin = this.db.db.prepare("SELECT 1 FROM admin WHERE id = ?").get(finalOwnerId);
            if (!isValidAdmin) {
                console.warn(`[LibraryService] Invalid owner_id ${finalOwnerId} detected for track ${trackId}. Falling back to primary admin.`);
                finalOwnerId = this.db.getPrimaryAdminId();
            }
        } else {
            finalOwnerId = this.db.getPrimaryAdminId();
        }

        let finalAlbumId = albumId !== undefined ? albumId : undefined;
        if (finalAlbumId === null && typeof album === 'string' && album.trim() !== "") {
            const albumName = album.trim();
            const slug = "lib-" + albumName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const existingAlbum = this.db.getAlbumBySlug(slug);
            finalAlbumId = existingAlbum ? existingAlbum.id : this.db.createAlbum({
                title: albumName, slug, artist_id: finalArtistId || track.artist_id, owner_id: finalOwnerId,
                date: null, cover_path: null, genre: "Library", description: "",
                type: 'album', year: null, download: null, price: 0, price_usdc: 0, currency: 'ETH',
                external_links: null, is_public: false, visibility: 'private', is_release: false,
                published_at: null, published_to_gundb: false, published_to_ap: false, license: null,
                status: 'draft',
            });
        }

        // 1. Handle File Renaming
        if (track.file_path && fileName && typeof fileName === 'string') {
            const oldPath = track.file_path;
            const oldDir = path.dirname(oldPath);
            const oldExt = path.extname(oldPath);
            let sanitizedName = path.parse(fileName).name.replace(/[^a-z0-9_\-]/gi, '_');
            const newPath = path.posix.join(oldDir, sanitizedName + oldExt);

            if (newPath !== oldPath) {
                console.log(`[LibraryService] Renaming track file: ${oldPath} -> ${newPath}`);
                const fullOldPath = path.join(this.musicDir, oldPath);
                const fullNewPath = path.join(this.musicDir, newPath);

                try {
                    if (await this.storage.pathExists(fullOldPath)) {
                        await this.storage.move(fullOldPath, fullNewPath);
                        this.db.updateTrackPath(trackId, newPath, track.album_id);
                    }

                    if (track.lossless_path) {
                        const losslessExt = path.extname(track.lossless_path);
                        const newLosslessPath = path.posix.join(path.dirname(track.lossless_path), sanitizedName + losslessExt);
                        const fullOldLossless = path.join(this.musicDir, track.lossless_path);
                        const fullNewLossless = path.join(this.musicDir, newLosslessPath);
                        if (await this.storage.pathExists(fullOldLossless)) {
                            await this.storage.move(fullOldLossless, fullNewLossless);
                            this.db.updateTrackLosslessPath(trackId, newLosslessPath);
                        }
                    }
                } catch (err: any) {
                    console.error(`[LibraryService] Rename failed for track ${trackId}:`, err.message);
                }
            }
        }

        // 2. Database updates
        if (title !== undefined) this.db.updateTrackTitle(trackId, title);
        
        if (finalArtistId !== undefined) {
            const artistChanged = finalArtistId !== track.artist_id;
            this.db.updateTrackArtist(trackId, finalArtistId);
            
            // If the artist actually changed and this track is the ONLY track in its album/release, move the album/release too
            if (artistChanged && track.album_id) {
                const tracksInAlbum = this.db.getTracksByAlbum(track.album_id);
                if (tracksInAlbum.length === 1) {
                    console.log(`[LibraryService] Moving single-track album ${track.album_id} to artist ${finalArtistId}`);
                    this.db.updateAlbumArtist(track.album_id, finalArtistId);
                    
                    // Check if it's a formal release too
                    const release = this.db.getRelease(track.album_id);
                    if (release) {
                        this.db.updateRelease(track.album_id, { artist_id: finalArtistId });
                    }
                }
            }
        } else if (artist !== undefined && (artist === null || artist === "")) {
            // Explicitly clearing artist
            this.db.updateTrackArtist(trackId, null);
        }

        if (finalAlbumId !== undefined) this.db.updateTrackAlbum(trackId, finalAlbumId);
        if (ownerId !== undefined) {
            this.db.updateTrackOwner(trackId, finalOwnerId);
        }
        if (trackNumber !== undefined) {
            this.db.updateTrackNumber(trackId, trackNumber);
        }
        if (duration !== undefined) {
            this.db.updateTrackDuration(trackId, parseFloat(duration));
        }
        if (price !== undefined || priceUsdc !== undefined) {
            this.db.updateTrackPrice(trackId, price ?? track.price, priceUsdc ?? track.price_usdc, currency ?? track.currency);
        }
        if (lyrics !== undefined) this.db.updateTrackLyrics(trackId, lyrics);
        if (genre !== undefined) this.db.updateTrackGenre(trackId, genre);
        if (year !== undefined) this.db.updateTrackYear(trackId, year ? Number(year) : null);
        if (externalArtwork !== undefined) this.db.updateTrackExternalArtwork(trackId, externalArtwork);

        const updatedTrack = this.db.getTrack(trackId);

        // 3. Write Tags to disk
        if (!options?.skipTagWrite && updatedTrack && updatedTrack.file_path) {
            await this.writeTrackTags(updatedTrack);
        }

        // 4. Federation sync
        if (!options?.skipSync && updatedTrack && updatedTrack.album_id) {
            await this.publishing.syncRelease(updatedTrack.album_id).catch(e => 
                console.error(`[LibraryService] Sync failed for track update:`, e)
            );
        }

        return updatedTrack;
    }

    /**
     * Updates multiple tracks in batch.
     */
    async batchUpdateTracks(trackIds: number[], data: any, user: { userId?: number, artistId?: number, isAdmin: boolean, username?: string }): Promise<any> {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const affectedAlbums = new Set<number>();
        const updatedTracks: Track[] = [];

        const tracks = this.db.getTracksByIds(trackIds);
        const trackMap = new Map(tracks.map(t => [t.id, t]));

        for (const id of trackIds) {
            try {
                const track = trackMap.get(id);
                if (!track) {
                    results.failed++;
                    results.errors.push(`Track ${id} not found`);
                    continue;
                }

                // Ownership Check
                const isOwner = track.owner_id === user.userId || (track.owner_id === null && track.artist_id === user.artistId);
                if (!user.isAdmin && !isOwner) {
                    results.failed++;
                    results.errors.push(`Track ${id}: Access denied`);
                    continue;
                }

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

        // Batch Sync and Tag Write
        if (updatedTracks.length > 0) {
            console.log(`[LibraryService] Performing batch post-processing for ${updatedTracks.length} tracks across ${affectedAlbums.size} albums...`);
            
            // 1. Write tags in parallel (writeTrackTags uses acquireTaskSlot internal queue)
            await Promise.all(updatedTracks.map(t => this.writeTrackTags(t)));

            // 2. Sync albums
            for (const albumId of affectedAlbums) {
                await this.publishing.syncRelease(albumId).catch(e => 
                    console.error(`[LibraryService] Batch sync failed for album ${albumId}:`, e)
                );
            }
        }

        return results;
    }

    /**
     * Deletes multiple tracks in batch.
     */
    async batchDeleteTracks(trackIds: number[], deleteFiles: boolean, user: { userId?: number, artistId?: number, isAdmin: boolean }): Promise<any> {
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const affectedAlbums = new Set<number>();
        
        const tracks = this.db.getTracksByIds(trackIds);
        
        for (const track of tracks) {
            try {
                // Ownership Check
                const isOwner = track.owner_id === user.userId || (track.owner_id === null && track.artist_id === user.artistId);
                if (!user.isAdmin && !isOwner) {
                    results.failed++;
                    results.errors.push(`Track ${track.id}: Access denied`);
                    continue;
                }

                if (track.album_id) affectedAlbums.add(track.album_id);
                await this.deleteTrack(track.id, deleteFiles);
                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${track.id}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Stars an album.
     */
    async starAlbum(username: string, albumId: number): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        this.db.starItem(username, 'album', String(albumId));
    }

    /**
     * Unstars an album.
     */
    async unstarAlbum(username: string, albumId: number): Promise<void> {
        this.db.unstarItem(username, 'album', String(albumId));
    }

    /**
     * Sets album rating.
     */
    async setAlbumRating(username: string, albumId: number, rating: number): Promise<void> {
        const album = this.db.getAlbum(albumId) || this.db.getRelease(albumId);
        if (!album) throw new Error("Album not found");
        this.db.setItemRating(username, 'album', String(albumId), rating);
    }

    /**
     * Helper to write ID3/Vorbis/etc tags to the physical file.
     */
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
            if (ext === '.mp3') {
                NodeID3.update(tags as any, fullPath);
            } else if (['.flac', '.ogg', '.m4a', '.wav'].includes(ext)) {
                await writeMetadata(fullPath, {
                    title: tags.title,
                    artist: tags.artist,
                    album: tags.album,
                    track: tags.trackNumber,
                    genre: tags.genre,
                    year: tags.year
                });
            }
        } catch (err) {
            console.error(`[LibraryService] Failed to write tags for ${track.id}:`, err);
        }
    }

    /**
     * Updates an album's metadata in the database.
     */
    async updateAlbum(albumId: number, data: any): Promise<void> {
        this.db.updateAlbum(albumId, data);
    }
}
