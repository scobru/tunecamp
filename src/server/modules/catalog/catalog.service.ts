import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../core/database.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";
import type { MetadataService } from "./metadata.service.js";
import type { PublishingService } from "../publishing/publishing.service.js";
import type { ZenDBService, SiteInfo } from "../network/zendb.service.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import { VisibilityGuardian, Capability, VisibilityProfile, UserRole } from "../../common/visibility.js";
import path from "path";
import { mapTrackDTO, mapAlbumDTO } from "./catalog.mappers.js";
import { fetchSafe, drainResponse } from "../../common/network.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";


/**
 * Catalog Service — Orchestrator for Library Management (Write/Core side).
 * Responsible for promoting releases, updating metadata, managing files, and ownership.
 */
export class CatalogService {
    constructor(
        private database: DatabaseService,
        private publishing: PublishingService,
        private zendb: ZenDBService,
        private storage: StorageEngine,
        private musicDir: string,
        private openRouter: OpenRouterService,
        private metadataService: MetadataService
    ) {}

    // --- Library Operations ---

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
        const skipSync = options?.skipSync ?? data.skipSync;
        const skipTagWrite = options?.skipTagWrite ?? data.skipTagWrite;
        
        // Execute atomic deep database transaction
        const primaryAdminId = this.database.getPrimaryAdminId();
        const result = this.database.library.updateTrackDeep(trackId, { ...data, skipSync, skipTagWrite }, primaryAdminId);
        
        const track = result.track;
        const fileChanges = result.fileChanges;
        
        // Post-transaction physical file renames
        if (fileChanges && track.file_path) {
            try {
                const fullOldPath = path.join(this.musicDir, fileChanges.oldPath);
                const fullNewPath = path.join(this.musicDir, fileChanges.newPath);
                if (await this.storage.pathExists(fullOldPath)) {
                    await this.storage.move(fullOldPath, fullNewPath);
                }
                if (fileChanges.oldLossless && fileChanges.newLossless) {
                    const fullOldLossless = path.join(this.musicDir, fileChanges.oldLossless);
                    const fullNewLossless = path.join(this.musicDir, fileChanges.newLossless);
                    if (await this.storage.pathExists(fullOldLossless)) {
                        await this.storage.move(fullOldLossless, fullNewLossless);
                    }
                }
            } catch (err: any) {
                console.error(`[CatalogService] Post-transaction physical rename failed for track ${trackId}:`, err.message);
            }
        }
        
        // Post-transaction remote artwork downloading (async)
        const externalArtwork = data.externalArtwork ?? data.external_artwork;
        if (externalArtwork && typeof externalArtwork === 'string' && externalArtwork.startsWith('http')) {
            try {
                const relDir = track.file_path ? path.dirname(track.file_path) : "artwork/tracks";
                const localPath = await this.downloadRemoteImage(externalArtwork, relDir, `artwork-tr${trackId}`);
                if (localPath) {
                    // Update database with downloaded local artwork
                    this.database.library.updateTrack(trackId, { external_artwork: localPath });
                    track.external_artwork = localPath;
                }
            } catch (err: any) {
                console.error(`[CatalogService] Remote artwork download failed for track ${trackId}:`, err.message);
            }
        }
        
        // Post-transaction metadata tag synchronization (audio files)
        if (result.requiresTagSync && track.file_path) {
            await this.metadataService.syncPhysicalTags(track, this.database, this.storage, this.musicDir);
        }
        
        // Post-transaction publishing synchronization (cloud)
        if (result.requiresPublishingSync && track.album_id) {
            await this.publishing.syncRelease(track.album_id).catch(e => console.error(`[CatalogService] Sync failed:`, e));
        }
        
        return track;
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
            await Promise.all(updatedTracks.map(async t => {
                await this.metadataService.syncPhysicalTags(t, this.database, this.storage, this.musicDir);
            }));
            for (const albumId of affectedAlbums) {
                await this.publishing.syncRelease(albumId).catch(e => console.error(`[CatalogService] Batch sync failed:`, e));
            }
        }
        return results;
    }

    async deleteTrack(trackId: number, deleteFile: boolean = false): Promise<void> {
        const track = this.database.getTrack(trackId);
        if (!track) return;
        if (deleteFile) {
            // 1. Delete main file
            if (track.file_path) {
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
                    console.error(`[CatalogService] Failed to delete main file:`, err.message);
                }
            }
            // 2. Delete lossless file if different
            if (track.lossless_path && track.lossless_path !== track.file_path) {
                const fullLosslessPath = path.join(this.musicDir, track.lossless_path);
                try {
                    if (await this.storage.pathExists(fullLosslessPath)) {
                        await this.storage.remove(fullLosslessPath);
                    }
                } catch (err: any) {
                    console.error(`[CatalogService] Failed to delete lossless file:`, err.message);
                }
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
                this.zendb?.incrementTrackLikeCount(album.slug, String(trackId));
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
                this.zendb?.decrementTrackLikeCount(album.slug, String(trackId));
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
                this.zendb?.setTrackRating(album.slug, String(trackId), rating);
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
        
        // Initial fallback extension and directory
        const ext = headers['content-type'] === 'audio/flac' ? '.flac' : (headers['content-type'] === 'audio/mpeg' ? '.mp3' : (headers['content-type'] === 'audio/wav' ? '.wav' : '.mp3'));
        
        const tempFilename = `temp-localize-${trackId}-${Date.now()}${ext}`;
        const tempPath = path.join(this.musicDir, "cloud_imports", tempFilename);

        await this.storage.ensureDir(path.dirname(tempPath));
        await this.storage.writeFileStream(tempPath, stream);

        // 1. Scan metadata from downloaded file
        let artistId = track.artist_id;
        let albumId = track.album_id;
        let title = track.title || "Untitled";
        let trackNum = track.track_num;
        let genre = track.genre;
        let year = track.year;
        let duration = track.duration;

        try {
            const { parseFile } = await import("music-metadata");
            const metadata = await parseFile(tempPath, { skipCovers: true });
            const common = metadata?.common || {};
            const format = metadata?.format || {};

            if (common.title) title = common.title.trim();
            if (common.track?.no) trackNum = common.track.no;
            if (common.genre) genre = common.genre.join(", ");
            if (common.year) year = common.year;
            if (format.duration) duration = format.duration;

            // Resolve Artist
            const artistName = (common.artist || "").trim();
            if (!artistId && artistName && artistName.toLowerCase() !== "unknown" && artistName.toLowerCase() !== "unknown artist") {
                const existingArtist = this.database.getArtistByName(artistName);
                artistId = existingArtist ? existingArtist.id : this.database.createArtist(artistName);
            }

            // Resolve Album
            const albumTitle = (common.album || "").trim();
            if (!albumId && albumTitle && albumTitle.toLowerCase() !== "unknown" && albumTitle.toLowerCase() !== "unknown album" && artistId) {
                let album = this.database.getAlbumByTitle(albumTitle, artistId);
                if (!album) {
                    const slug = "lib-" + artistId + "-" + albumTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
                    album = this.database.getAlbumBySlug(slug);
                    if (!album) {
                        albumId = this.database.createAlbum({
                            title: albumTitle,
                            slug: slug,
                            artist_id: artistId,
                            album_artist: common.albumartist || common.artist || null,
                            owner_id: ownerId,
                            date: common.year ? `${common.year}-01-01` : null,
                            year: common.year || null,
                            cover_path: null,
                            genre: common.genre ? common.genre.join(", ") : "Library",
                            description: `Imported from Google Drive tags`,
                            type: 'album',
                            download: null, price: 0, price_usdc: 0, currency: 'ETH', external_links: null,
                            is_public: false, visibility: 'private', is_release: false, published_at: new Date().toISOString(),
                            published_to_gundb: false, published_to_ap: false, license: null, status: 'draft',
                        });
                    } else {
                        albumId = album.id;
                    }
                } else {
                    albumId = album.id;
                }
            }
        } catch (e: any) {
            console.warn(`[CatalogService] music-metadata parse failed for localized track ${trackId}:`, e.message);
        }

        // 2. Build perfect path hierarchy Artist/Album/Track
        let finalArtistName = "Unknown";
        if (artistId) {
            const artistObj = this.database.getArtist(artistId);
            if (artistObj) finalArtistName = artistObj.name;
        } else if (track.artist_name) {
            finalArtistName = track.artist_name;
        }

        let finalAlbumTitle = "Unknown Album";
        if (albumId) {
            const albumObj = this.database.getAlbum(albumId);
            if (albumObj) finalAlbumTitle = albumObj.title;
        }

        const safeArtist = finalArtistName.replace(/[<>:"/\\|?*]/g, '_').trim();
        const safeAlbum = finalAlbumTitle.replace(/[<>:"/\\|?*]/g, '_').trim();
        const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_').trim();
        const trackPrefix = trackNum ? String(trackNum).padStart(2, '0') + " - " : "";

        const relativePath = path.posix.join("cloud_imports", safeArtist, safeAlbum, `${trackPrefix}${safeTitle}${ext}`);
        const finalPath = path.join(this.musicDir, relativePath);

        // Move from temp path to final hierarchy path
        await this.storage.ensureDir(path.dirname(finalPath));
        await this.storage.move(tempPath, finalPath, { overwrite: true });

        // Update database with final metadata, format, path, etc.
        this.database.updateTrack(trackId, { 
            title,
            artist_id: artistId,
            album_id: albumId,
            track_num: trackNum,
            duration,
            genre,
            year,
            file_path: relativePath, 
            service: 'local' 
        });
        
        const updatedTrack = this.database.getTrack(trackId);
        if (updatedTrack) {
            return updatedTrack;
        }
        throw new Error("Failed to localize track");
    }

    // --- Helpers & Settings ---

    getSettings() {
        const settings = [
            "siteName", "siteDescription", "donationLinks", "backgroundImage", "coverImage", 
            "siteLogo", "mode", "siteId", "zenPeers", "web3_checkout_address", "web3_nft_address",
            "themeFont", "themeBlur", "themeOverlayOpacity"
        ];
        const res: any = {};
        settings.forEach(k => {
            const v = this.database.getSetting(k);
            if (k === 'donationLinks' && v) {
                res[k] = JSON.parse(v);
            } else {
                if (v !== undefined && v !== null) {
                    res[k] = v;
                } else {
                    if (k === 'siteName') res[k] = 'TuneCamp';
                    else if (k === 'mode') res[k] = 'label';
                    else if (k === 'themeFont') res[k] = 'Outfit';
                    else if (k === 'themeBlur') res[k] = '10px';
                    else if (k === 'themeOverlayOpacity') res[k] = '0.85';
                    else res[k] = '';
                }
            }
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
        return this.database.getRandomTracks(limit).map(t => mapTrackDTO(t, this.database));
    }

    private async downloadRemoteImage(url: string, relativeDir: string, filenamePrefix: string): Promise<string | null> {
        try {
            if (!url || !url.startsWith('http')) return null;
            if (!(await isSafeUrl(url))) return null;

            const fullDir = path.join(this.musicDir, relativeDir);
            await this.storage.ensureDir(fullDir);

            const res = await fetchSafe(url, { size: 10 * 1024 * 1024 }); // 10MB limit
            if (!res.ok) {
                await drainResponse(res);
                return null;
            }

            const contentType = res.headers.get('content-type');
            const ext = contentType?.includes('png') ? '.png' : (contentType?.includes('webp') ? '.webp' : '.jpg');
            const filename = `${filenamePrefix}-${Date.now()}${ext}`;
            const fullPath = path.join(fullDir, filename);

            await this.storage.writeFileStream(fullPath, res.body);
            return path.posix.join(relativeDir, filename);
        } catch (err: any) {
            console.error(`[CatalogService] Failed to download remote image from ${url}:`, err.message);
            return null;
        }
    }

    async updateAlbum(id: number, data: any): Promise<void> {
        const album = this.database.getAlbum(id) || this.database.getRelease(id);
        if (!album) throw new Error("Album not found");

        const { artist, artistId, ...rest } = data;
        let finalArtistId = artistId !== undefined ? artistId : undefined;

        if (typeof artist === 'string') {
            const artistName = artist.trim();
            const lowerArtist = artistName.toLowerCase();
            if (artistName === "" || lowerArtist === "null" || lowerArtist === "undefined") {
                finalArtistId = null;
            } else {
                const existingArtist = this.database.getArtistByName(artistName);
                finalArtistId = existingArtist ? existingArtist.id : this.database.createArtist(artistName);
            }
        }

        const updateData = { ...rest };
        if (finalArtistId !== undefined) {
            updateData.artist_id = finalArtistId;
        }

        // Handle remote cover download
        if (updateData.cover_path && updateData.cover_path.startsWith('http')) {
            const tracks = this.database.getTracksByAlbum(id);
            let relDir = "artwork/albums";
            if (tracks.length > 0 && tracks[0].file_path) {
                relDir = path.dirname(tracks[0].file_path);
            } else if (album.cover_path && !album.cover_path.startsWith('http')) {
                relDir = path.dirname(album.cover_path);
            }

            const localPath = await this.downloadRemoteImage(updateData.cover_path, relDir, `cover-al${id}`);
            if (localPath) {
                updateData.cover_path = localPath;
            }
        }

        this.database.updateAlbum(id, updateData);
        await this.publishing.syncRelease(id).catch(e => console.error(`[CatalogService] Sync failed for album update:`, e));
    }
}
