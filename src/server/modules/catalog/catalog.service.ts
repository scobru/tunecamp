import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../core/database.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";
import type { MetadataService } from "./metadata.service.js";
import type { PublishingService } from "../publishing/publishing.service.js";
import type { ZenDBService, SiteInfo } from "../network/zendb.service.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import type { FingerprintService } from "../media/fingerprint.service.js";
import { VisibilityGuardian, Capability, VisibilityProfile, UserRole } from "../../common/visibility.js";
import path from "path";
import { mapTrackDTO, mapAlbumDTO } from "./catalog.mappers.js";


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
        private fingerprinting: FingerprintService,
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
        const track = this.database.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        // Normalize input data to handle both DTO (camelCase) and DB (snake_case) formats
        const title = data.title;
        const artistName = data.artistName ?? data.artist_name ?? data.artist;
        const artistId = data.artistId ?? data.artist_id;
        const albumName = data.albumName ?? data.album_name ?? data.album;
        const albumId = data.albumId ?? data.album_id;
        const ownerId = data.ownerId ?? data.owner_id;
        const trackNumber = data.trackNumber ?? data.track_num ?? data.track_number;
        const genre = data.genre;
        const year = data.year;
        const price = data.price;
        const priceUsdc = data.priceUsdc ?? data.price_usdc;
        const priceUsdt = data.priceUsdt ?? data.price_usdt;
        const currency = data.currency;
        const lyrics = data.lyrics;
        const externalArtwork = data.externalArtwork ?? data.external_artwork;
        const fileName = data.fileName ?? data.filename ?? data.file_path;
        const duration = data.duration;

        // Resolve Owner
        let finalOwnerId = ownerId !== undefined ? ownerId : track.owner_id;
        if (finalOwnerId) {
            const isValidAdmin = (this.database as any).db.prepare("SELECT 1 FROM admin WHERE id = ?").get(finalOwnerId);
            if (!isValidAdmin) {
                finalOwnerId = this.database.getPrimaryAdminId();
            }
        } else {
            finalOwnerId = this.database.getPrimaryAdminId();
        }

        // Resolve Artist
        let finalArtistId = artistId !== undefined ? artistId : track.artist_id;
        let finalArtistName = typeof artistName === 'string' ? artistName.trim() : (track.artist_name || null);

        if (typeof artistName === 'string' && artistName.trim() !== "") {
            const trimmedName = artistName.trim();
            const existingArtist = this.database.getArtistByName(trimmedName);
            if (existingArtist) {
                finalArtistId = existingArtist.id;
                finalArtistName = existingArtist.name;
            } else {
                finalArtistId = this.database.createArtist(trimmedName);
                finalArtistName = trimmedName;
            }
        } else if (artistName === null || artistName === "") {
            finalArtistId = null;
            finalArtistName = null;
        }

        // Resolve Album
        let finalAlbumId = albumId !== undefined ? albumId : track.album_id;
        if ((finalAlbumId === null || finalAlbumId === undefined) && typeof albumName === "string" && albumName.trim() !== "") {
            const trimmedAlbum = albumName.trim();
            const slug = "lib-" + trimmedAlbum.toLowerCase().replace(/[^a-z0-9]/g, "-");
            const existingAlbum = this.database.getAlbumBySlug(slug);
            finalAlbumId = existingAlbum
                ? existingAlbum.id
                : this.database.createAlbum({
                      title: trimmedAlbum,
                      slug,
                      artist_id: finalArtistId || track.artist_id,
                      owner_id: finalOwnerId,
                      date: null,
                      cover_path: null,
                      genre: "Library",
                      description: "",
                      type: "album",
                      year: null,
                      download: null,
                      price: 0,
                      price_usdc: 0,
                      currency: "ETH",
                      external_links: null,
                      is_public: false,
                      visibility: "private",
                      is_release: false,
                      published_at: null,
                      published_to_gundb: false,
                      published_to_ap: false,
                      license: null,
                      status: "draft",
                  });
        }

        // Handle File Rename
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

        // Apply Updates to DB
        if (title !== undefined) this.database.updateTrackTitle(trackId, title);
        
        // Sync artist name and ID
        this.database.updateTrackArtistInfo(trackId, finalArtistId, finalArtistName);

        if (finalAlbumId !== undefined) this.database.updateTrackAlbum(trackId, finalAlbumId);
        if (ownerId !== undefined) this.database.updateTrackOwner(trackId, finalOwnerId);
        if (trackNumber !== undefined) this.database.updateTrackNumber(trackId, trackNumber);
        if (duration !== undefined) this.database.updateTrackDuration(trackId, parseFloat(duration));
        
        if (price !== undefined || priceUsdc !== undefined || priceUsdt !== undefined) {
            this.database.updateTrackPrice(trackId, price ?? track.price, priceUsdc ?? track.price_usdc, currency ?? track.currency);
            if (priceUsdt !== undefined) {
                (this.database as any).db.prepare("UPDATE tracks SET price_usdt = ? WHERE id = ?").run(priceUsdt, trackId);
            }
        }
        
        if (lyrics !== undefined) this.database.updateTrackLyrics(trackId, lyrics);
        if (genre !== undefined) this.database.updateTrackGenre(trackId, genre);
        if (year !== undefined) this.database.updateTrackYear(trackId, year ? Number(year) : null);
        if (externalArtwork !== undefined) this.database.updateTrackExternalArtwork(trackId, externalArtwork);
        
        if (data.service !== undefined) this.database.updateTrackService(trackId, data.service);
        if (data.url !== undefined) this.database.updateTrackUrl(trackId, data.url);
        if (data.external_id !== undefined || data.externalId !== undefined) {
            this.database.updateTrackExternalId(trackId, data.external_id ?? data.externalId);
        }

        const updatedTrack = this.database.getTrack(trackId);
        if (!options?.skipTagWrite && updatedTrack && updatedTrack.file_path) {
            await this.metadataService.syncPhysicalTags(updatedTrack, this.database, this.storage, this.musicDir);
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
        this.database.updateTrack(trackId, { 
            file_path: relativePath, 
            service: 'local' 
        });
        
        const updatedTrack = this.database.getTrack(trackId);
        if (updatedTrack) {
            this.autoIdentify(trackId).catch(err => console.error(`[CatalogService] autoIdentify failed:`, err));
            return updatedTrack;
        }
        throw new Error("Failed to localize track");
    }

    async analyzeFingerprint(trackId: number): Promise<string | null> {
        const track = this.database.getTrack(trackId);
        if (!track || !track.file_path) return null;
        const fullPath = path.join(this.musicDir, track.file_path);
        if (!(await this.storage.pathExists(fullPath))) {
            console.warn(`[CatalogService] Cannot analyze fingerprint: File not found at ${fullPath}`);
            return null;
        }
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
            if (!fingerprint) return;
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
        return this.database.getRandomTracks(limit).map(t => mapTrackDTO(t, this.database));
    }

    async updateAlbum(id: number, data: any): Promise<void> {
        const album = this.database.getAlbum(id) || this.database.getRelease(id);
        if (!album) throw new Error("Album not found");

        const { artist, artistId, ...rest } = data;
        let finalArtistId = artistId !== undefined ? artistId : undefined;

        if (typeof artist === 'string' && artist.trim() !== "") {
            const artistName = artist.trim();
            const existingArtist = this.database.getArtistByName(artistName);
            finalArtistId = existingArtist ? existingArtist.id : this.database.createArtist(artistName);
        }

        const updateData = { ...rest };
        if (finalArtistId !== undefined) {
            updateData.artist_id = finalArtistId;
        }

        this.database.updateAlbum(id, updateData);
        await this.publishing.syncRelease(id).catch(e => console.error(`[CatalogService] Sync failed for album update:`, e));
    }
}
