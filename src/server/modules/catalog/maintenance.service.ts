import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';
import { glob } from 'glob';
import pLimit from 'p-limit';
import type { DatabaseService, Track } from "../../core/database.js";
import { metadataService } from "./metadata.service.js";
import type { CatalogService } from "./catalog.service.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";
import type { AutoTaggerService, AutoTaggerStatus } from "./autotagger.service.js";
import type { MaintenanceRepository } from "../../repositories/maintenance.repository.js";
import { StringUtils } from "../../../utils/stringUtils.js";

async function getFastFileHash(filePath: string): Promise<string> {
    try {
        const stats = await fs.stat(filePath);
        const size = stats.size;
        const buffer = Buffer.alloc(16384);
        const fd = await fs.open(filePath, 'r');
        await fs.read(fd, buffer, 0, 8192, 0);
        await fs.read(fd, buffer, 8192, 8192, Math.max(0, size - 8192));
        await fs.close(fd);
        return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (e) {
        return "";
    }
}

export class MaintenanceService {
    constructor(
        private repo: MaintenanceRepository,
        private db: DatabaseService,
        private catalogService: CatalogService,
        private openRouter: OpenRouterService,
        private autotagger: AutoTaggerService,
        private musicDir: string
    ) {}

    /**
     * Attempts to automatically fill missing metadata for a list of tracks using AI.
     */
    async aiAutofillMetadata(trackIds: number[], options: { force?: boolean }): Promise<any> {
        const results = { success: 0, failed: 0, skipped: 0, errors: [] as string[] };
        const tracks = this.db.getTracksByIds(trackIds);

        for (const track of tracks) {
            try {
                if (!options.force && track.genre && track.year && track.genre !== 'Library') {
                    results.skipped++;
                    continue;
                }

                console.log(`[Maintenance] Attempting AI autofill for: ${track.artist_name} - ${track.title}`);
                const aiData = await this.openRouter.enrichMetadata(track.title, track.artist_name || 'Unknown Artist');

                if (!aiData) {
                    results.skipped++;
                    continue;
                }

                const updateData: any = {};
                if (aiData.genre) updateData.genre = aiData.genre;
                if (aiData.year) updateData.year = aiData.year;
                if (aiData.description) {
                    // We might want to save the description somewhere. 
                    // Tracks don't have a dedicated description field in DB yet, 
                    // but we could use it for future features or logs.
                }

                if (Object.keys(updateData).length > 0) {
                    await this.catalogService.updateTrack(track.id, updateData);
                    results.success++;
                } else {
                    results.skipped++;
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${track.id}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Gets tracks missing specific metadata fields.
     */
    getTracksWithMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist' | 'external') {
        return this.db.getTracksMissingMetadata(filter);
    }

    /**
     * Gets albums missing specific metadata fields.
     */
    getAlbumsWithMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'description' | 'artist') {
        return this.db.getAlbumsMissingMetadata(filter);
    }

    /**
     * Gets all potential metadata candidates for a track.
     */
    async getMetadataCandidates(trackId: number): Promise<any[]> {
        const track = this.db.getTrack(trackId);
        if (!track) throw new Error("Track not found");

        const query = `${track.artist_name} - ${track.title}`;
        return await metadataService.searchRecording(query);
    }

    /**
     * Gets all potential metadata candidates for an album.
     */
    async getAlbumMetadataCandidates(albumId: number): Promise<any[]> {
        const album = this.db.getAlbum(albumId);
        if (!album) throw new Error("Album not found");

        const query = `${album.artist_name} - ${album.title}`;
        return await metadataService.searchRelease(query);
    }

    /**
     * Applies specific metadata to a track.
     */
    async applyMetadataToTrack(trackId: number, metadata: any): Promise<void> {
        const updateData: any = {};
        if (metadata.genre) updateData.genre = metadata.genre;
        if (metadata.year) updateData.year = metadata.year;
        if (metadata.coverUrl) updateData.externalArtwork = metadata.coverUrl;
        if (metadata.mbid || metadata.id) updateData.external_id = metadata.mbid || metadata.id;
        if (metadata.artist) updateData.artist = metadata.artist;
        
        // Handle Album matching/creation
        if (metadata.albumTitle) {
            const track = this.db.getTrack(trackId);
            if (track) {
                // Find or create album
                let album = this.db.getAlbumByTitle(metadata.albumTitle, track.artist_id || undefined);
                if (!album) {
                    const albumId = this.db.createAlbum({
                        title: metadata.albumTitle,
                        slug: metadata.albumTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "album",
                        artist_id: track.artist_id || null,
                        owner_id: track.owner_id || null,
                        genre: metadata.genre || null,
                        year: metadata.year || null,
                        date: metadata.date || null,
                        description: null,
                        cover_path: metadata.coverUrl || null,
                        type: 'album',
                        download: null,
                        price: 0,
                        price_usdc: 0,
                        currency: 'ETH',
                        external_links: null,
                        is_public: false,
                        visibility: 'private',
                        is_release: false,
                        status: 'draft',
                        published_to_gundb: false,
                        published_to_ap: false,
                        published_at: null
                    });
                    updateData.albumId = albumId;
                } else {
                    updateData.albumId = album.id;
                }
            }
        }
        
        await this.catalogService.updateTrack(trackId, updateData);
    }

    /**
     * Propagates album-level genre/year to linked tracks that are missing those fields.
     * Only overwrites track fields that are null/empty, unless force=true.
     */
    async propagateAlbumMetadataToTracks(
        albumId: number,
        albumData: { genre?: string | null; year?: number | null },
        force = false
    ): Promise<void> {
        const tracks = this.db.getTracksByAlbum(albumId);
        if (!tracks.length) return;

        for (const track of tracks) {
            const trackUpdate: any = {};

            if (albumData.genre && (force || !track.genre || track.genre === 'Library')) {
                trackUpdate.genre = albumData.genre;
            }
            if (albumData.year && (force || !track.year || track.year === 0)) {
                trackUpdate.year = albumData.year;
            }

            if (Object.keys(trackUpdate).length > 0) {
                await this.catalogService.updateTrack(track.id, trackUpdate);
            }
        }
    }

    /**
     * Applies specific metadata to an album and propagates genre/year to its tracks.
     */
    async applyMetadataToAlbum(albumId: number, metadata: any): Promise<void> {
        const updateData: any = {};
        if (metadata.genre) updateData.genre = metadata.genre;
        if (metadata.year) updateData.year = metadata.year;
        if (metadata.date) updateData.date = metadata.date;
        if (metadata.coverUrl) updateData.cover_path = metadata.coverUrl;
        if (metadata.description) updateData.description = metadata.description;
        if (metadata.artist) updateData.artist = metadata.artist;
        if (metadata.mbid) updateData.external_id = metadata.mbid;

        await this.catalogService.updateAlbum(albumId, updateData);

        await this.propagateAlbumMetadataToTracks(albumId, {
            genre: updateData.genre,
            year: updateData.year
        });
    }

    /**
     * Attempts to automatically fill missing metadata for a list of tracks.
     */
    async autofillMetadata(trackIds: number[], options: { force?: boolean, fields: ('genre' | 'year' | 'cover' | 'artist' | 'album')[] }): Promise<any> {
        const results = { success: 0, failed: 0, skipped: 0, errors: [] as string[] };
        const tracks = this.db.getTracksByIds(trackIds);

        for (const track of tracks) {
            try {
                // 1. Determine search query
                const query = `${track.artist_name} - ${track.title}`;
                console.log(`[Maintenance] Attempting autofill for: ${query}`);

                // 2. Search online
                const matches = await metadataService.searchRecording(query);
                
                // 3. Find best match (exact title/artist match preferred)
                const bestMatch = matches.find(m => 
                    m.title.toLowerCase() === track.title.toLowerCase() && 
                    m.artist.toLowerCase() === track.artist_name?.toLowerCase()
                ) || matches[0];

                if (!bestMatch) {
                    results.skipped++;
                    continue;
                }

                // 4. Prepare update data
                const updateData: any = {};
                let updated = false;

                if (options.fields.includes('genre') && bestMatch.genre) {
                    if (options.force || !track.genre || track.genre === 'Library') {
                        updateData.genre = bestMatch.genre;
                        updated = true;
                    }
                }

                if (options.fields.includes('year') && bestMatch.year) {
                    if (options.force || !track.year || track.year === 0) {
                        updateData.year = bestMatch.year;
                        updated = true;
                    }
                }

                if (options.fields.includes('cover') && bestMatch.coverUrl) {
                    if (options.force || !track.external_artwork) {
                        updateData.externalArtwork = bestMatch.coverUrl;
                        updated = true;
                    }
                }

                if (options.fields.includes('artist') && bestMatch.artist) {
                    if (options.force || !track.artist_id || track.artist_name === 'Unknown Artist' || track.artist_name === '') {
                        updateData.artist = bestMatch.artist;
                        updated = true;
                    }
                }

                if (options.fields.includes('album') && bestMatch.albumTitle) {
                    if (options.force || !track.album_id) {
                        updateData.album = bestMatch.albumTitle;
                        updated = true;
                    }
                }

                // Always update external_id if found
                if (bestMatch.id && (!track.external_id || options.force)) {
                    updateData.external_id = bestMatch.id;
                    updated = true;
                }

                // 5. Apply update via LibraryService (handles DB + ID3 tags)
                if (updated) {
                    await this.catalogService.updateTrack(track.id, updateData);
                    results.success++;
                } else {
                    results.skipped++;
                }

            } catch (err: any) {
                results.failed++;
                results.errors.push(`Track ${track.id}: ${err.message}`);
            }
        }

        return results;
    }
    /**
     * Gets artists missing specific metadata fields.
     */
    async getArtistsWithMissingPhotos(): Promise<any[]> {
        return this.db.getArtistsMissingMetadata('photo');
    }

    /**
     * Gets artist metadata candidates using AI to disambiguate.
     */
    async getArtistPhotoCandidates(artistId: number): Promise<any[]> {
        const artist = this.db.getArtist(artistId);
        if (!artist) throw new Error("Artist not found");

        const albums = this.db.getAlbumsByArtist(artistId);
        const releaseTitles = albums.map(a => a.title);

        // 1. AI help for better search query
        const identity = await this.openRouter.identifyArtist(artist.name, releaseTitles);
        const query = identity?.searchQuery || artist.name;

        // 2. Search providers
        const candidates = await metadataService.searchArtist(query);
        
        // Add the AI bio to help user decide
        if (identity?.bio) {
            candidates.forEach(c => {
                if (!c.bio) (c as any).aiBio = identity.bio;
            });
        }

        return candidates;
    }

    /**
     * Applies metadata to an artist.
     */
    async applyMetadataToArtist(artistId: number, metadata: any): Promise<void> {
        // Update basic info if provided
        this.db.updateArtist(
            artistId,
            metadata.name || undefined,
            metadata.bio || undefined,
            metadata.avatarUrl || undefined, // URL for now, will be downloaded if route uses download logic
            metadata.links ? metadata.links : undefined
        );
    }

    /**
     * Attempts to automatically fill missing metadata for a list of albums.
     */
    async autofillAlbumMetadata(albumIds: number[], options: { force?: boolean, fields: ('genre' | 'year' | 'cover' | 'description' | 'artist')[] }): Promise<any> {
        const results = { success: 0, failed: 0, skipped: 0, errors: [] as string[] };
        const albums = this.db.getAlbumsByIds(albumIds);

        for (const album of albums) {
            try {
                const query = `${album.artist_name} - ${album.title}`;
                console.log(`[Maintenance] Attempting album autofill for: ${query}`);

                const matches = await metadataService.searchRelease(query);
                
                const bestMatch = matches.find(m => 
                    m.title.toLowerCase() === album.title.toLowerCase() && 
                    m.artist.toLowerCase() === album.artist_name?.toLowerCase()
                ) || matches[0];

                if (!bestMatch) {
                    results.skipped++;
                    continue;
                }

                const updateData: any = {};
                let updated = false;

                if (options.fields.includes('genre') && bestMatch.genre) {
                    if (options.force || !album.genre || album.genre === 'Library') {
                        updateData.genre = bestMatch.genre;
                        updated = true;
                    }
                }

                if (options.fields.includes('year') && bestMatch.year) {
                    if (options.force || !album.year || album.year === 0) {
                        updateData.year = bestMatch.year;
                        updated = true;
                    }
                }

                if (options.fields.includes('cover') && bestMatch.coverUrl) {
                    if (options.force || !album.cover_path) {
                        updateData.cover_path = bestMatch.coverUrl;
                        updated = true;
                    }
                }

                if (options.fields.includes('description') && bestMatch.description) {
                    if (options.force || !album.description) {
                        updateData.description = bestMatch.description;
                        updated = true;
                    }
                }

                if (options.fields.includes('artist') && bestMatch.artist) {
                    if (options.force || !album.artist_id || album.artist_name === 'Unknown Artist' || album.artist_name === '') {
                        updateData.artist = bestMatch.artist;
                        updated = true;
                    }
                }

                // Always update external_id if found
                if (bestMatch.id && (!album.external_id || options.force)) {
                    updateData.external_id = bestMatch.id;
                    updated = true;
                }

                if (updated) {
                    await this.catalogService.updateAlbum(album.id, updateData);
                    await this.propagateAlbumMetadataToTracks(album.id, {
                        genre: updateData.genre,
                        year: updateData.year
                    }, options.force);
                    results.success++;
                } else {
                    results.skipped++;
                }

            } catch (err: any) {
                results.failed++;
                results.errors.push(`Album ${album.id}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * AI Magic Autofill for albums.
     */
    async aiAutofillAlbumsMetadata(albumIds: number[], options: { force?: boolean }): Promise<any> {
        const results = { success: 0, failed: 0, skipped: 0, errors: [] as string[] };
        const deduplicatedIds = [...new Set(albumIds)];
        const albums = this.db.getAlbumsByIds(deduplicatedIds);

        const validAlbumIds = albums.map(a => a.id);
        const allTracks = this.db.getTracksByAlbumIds(validAlbumIds);

        const albumTracksMap = new Map<number, Track[]>();
        for (const track of allTracks) {
            if (track.album_id) {
                if (!albumTracksMap.has(track.album_id)) {
                    albumTracksMap.set(track.album_id, []);
                }
                albumTracksMap.get(track.album_id)!.push(track);
            }
        }

        for (const album of albums) {
            try {
                console.log(`[Maintenance] AI Magic for album: ${album.title}`);
                const tracks = albumTracksMap.get(album.id) || [];
                const trackTitles = tracks.map(t => t.title);

                const metadata = await this.openRouter.identifyAlbum(album.title, album.artist_name || 'Unknown', trackTitles);
                
                if (!metadata) {
                    results.skipped++;
                    continue;
                }

                const updateData: any = {};
                let updated = false;

                if (metadata.genre && (options.force || !album.genre || album.genre === 'Library')) {
                    updateData.genre = metadata.genre;
                    updated = true;
                }
                if (metadata.year && (options.force || !album.year || album.year === 0)) {
                    updateData.year = metadata.year;
                    updated = true;
                }
                if (metadata.description && (options.force || !album.description)) {
                    updateData.description = metadata.description;
                    updated = true;
                }
                if (metadata.mbid && (options.force || !album.external_id)) {
                    updateData.external_id = metadata.mbid;
                    updated = true;
                }

                if (updated) {
                    await this.catalogService.updateAlbum(album.id, updateData);
                    await this.propagateAlbumMetadataToTracks(album.id, {
                        genre: updateData.genre,
                        year: updateData.year
                    }, options.force);
                    results.success++;
                } else {
                    results.skipped++;
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Album ${album.id}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Starts the background library audit/repair process.
     */
    async startLibraryAudit(options: { forceRepair?: boolean, useAI?: boolean } = {}): Promise<void> {
        return this.autotagger.startAudit(options);
    }

    /**
     * Gets the current status of the library audit.
     */
    getAuditStatus(): AutoTaggerStatus {
        return this.autotagger.getStatus();
    }

    /**
     * Stops the running library audit.
     */
    stopLibraryAudit(): void {
        this.autotagger.stopAudit();
    }

    /**
     * Synchronizes all track tags in the filesystem with the current database metadata.
     * This makes the database the source of truth for file tags.
     */
    async syncAllTagsFromDb(onProgress?: (processed: number, total: number) => void): Promise<{ success: number, failed: number }> {
        const tracks = this.db.getTracks();
        let success = 0;
        let failed = 0;
        console.log(`[Maintenance] Starting full tag sync for ${tracks.length} tracks...`);

        // Process in chunks to avoid EMFILE and overwhelming the system
        const CHUNK_SIZE = 10;
        for (let i = 0; i < tracks.length; i += CHUNK_SIZE) {
            const chunk = tracks.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async (track) => {
                try {
                    if (track.file_path) {
                        // Calling updateTrack with empty data triggers a tag write from current DB state
                        await this.catalogService.updateTrack(track.id, {}, { skipSync: true });
                        success++;
                    }
                } catch (e) {
                    console.error(`[Maintenance] Failed to sync tags for track ${track.id}:`, e);
                    failed++;
                }
            }));
            
            if (onProgress) {
                onProgress(Math.min(i + CHUNK_SIZE, tracks.length), tracks.length);
            }

            if (i % 100 === 0 && i > 0) {
                console.log(`[Maintenance] Synced ${i}/${tracks.length} tracks...`);
            }
        }

        return { success, failed };
    }

    async runStartupRepairs(): Promise<void> {
        console.log(`\n📦 [Maintenance] Starting startup maintenance phase...`);
        const startTime = Date.now();

        try {
            // Remove polluted image files
            const deletedImages = this.repo.removePollutedImageTracks();
            if (deletedImages > 0) {
                console.log(`✅ [Maintenance] Removed ${deletedImages} polluted image track records.`);
            }

            const primaryAdminId = this.repo.getPrimaryAdminId();
            if (primaryAdminId) {
                const ownershipRepairs = this.repo.repairOwnershipGaps(primaryAdminId);
                const totalChanges = Object.values(ownershipRepairs).reduce((a, b) => a + (b as number), 0);
                if (totalChanges > 0) {
                    console.log(`✅ [Maintenance] Ownership repair complete.`);
                }

                const orphanedAlbums = this.repo.fixOrphanedAlbums();
                if (orphanedAlbums > 0) console.log(`✅ [Maintenance] Restored ${orphanedAlbums} orphaned albums.`);

                const publicLeakFixes = this.repo.fixPublicLeak();
                if (publicLeakFixes.sealed > 0) console.log(`✅ [Maintenance] Sealed ${publicLeakFixes.sealed} private releases.`);
                if (publicLeakFixes.unsealed > 0) console.log(`✅ [Maintenance] Re-flagged ${publicLeakFixes.unsealed} public releases.`);

                let fixedArtistsCount = 0;
                const orphanAlbumsWithTracks = this.repo.getOrphanAlbumsWithTracks();
                const albumIds = [...new Set(orphanAlbumsWithTracks.map(row => row.album_id))];

                if (albumIds.length > 0) {
                    const tracksByAlbum = new Map<number, number[]>();
                    const trackArtists = this.repo.getTrackArtistsForAlbums(albumIds);
                    for (const { album_id, artist_id } of trackArtists) {
                        if (!tracksByAlbum.has(album_id)) tracksByAlbum.set(album_id, []);
                        tracksByAlbum.get(album_id)!.push(artist_id);
                    }

                    const albumArtistsMap = new Map<number, number | null>();
                    const albumsData = this.repo.getAlbumArtists(albumIds);
                    for (const { id, artist_id } of albumsData) {
                        albumArtistsMap.set(id, artist_id);
                    }

                    for (const albumId of albumIds) {
                        const tracks = tracksByAlbum.get(albumId) || [];
                        if (tracks.length === 1) {
                            const artistId = tracks[0];
                            const albumArtistId = albumArtistsMap.get(albumId) ?? null;
                            if (albumArtistId !== artistId) {
                                this.repo.setAlbumArtist(albumId, artistId);
                                fixedArtistsCount++;
                            }
                        }
                    }
                }
                if (fixedArtistsCount > 0) console.log(`✅ [Maintenance] Auto-assigned ${fixedArtistsCount} albums to their track artists.`);

                const adminsWithoutArtist = this.repo.getAdminsWithoutArtist();
                const artistNames = adminsWithoutArtist.map(adm => adm.username);
                const uniqueArtistNames = [...new Set(artistNames)];
                const artistsList = this.db.getArtistsByNames(uniqueArtistNames);

                const artistsMap = new Map<string, any>();
                for (const artist of artistsList) {
                    artistsMap.set(artist.name.toLowerCase(), artist);
                }

                for (const adm of adminsWithoutArtist) {
                    const artistName = adm.username;
                    const normalizedName = artistName.toLowerCase();
                    let existingArtist = artistsMap.get(normalizedName);

                    if (!existingArtist) {
                        const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
                        try {
                            const artistId = this.db.createArtist(artistName);
                            existingArtist = { id: artistId, name: artistName, slug } as any;
                            artistsMap.set(normalizedName, existingArtist);
                        } catch (e) {
                            console.warn(`[Maintenance] Could not create artist for admin: ${adm.username}`);
                        }
                    }
                    if (existingArtist) {
                        this.repo.linkAdminToArtist(adm.id, existingArtist.id);
                    }
                }
            }

            console.log(`📦 [Maintenance] Repairing corrupted paths in database...`);
            const tracks = this.db.getAllTracks();
            const pathRepairs: any[] = [];
            for (const track of tracks) {
                const newPath = StringUtils.cleanPath(track.file_path);
                const newLossless = StringUtils.cleanPath(track.lossless_path);
                if (newPath !== track.file_path || newLossless !== track.lossless_path) {
                    pathRepairs.push({ id: track.id, path: newPath, lossless: newLossless });
                }
            }
            if (pathRepairs.length > 0) {
                const count = this.repo.updateTrackPaths(pathRepairs);
                console.log(`✅ [Maintenance] Repaired ${count} track paths.`);
            }

            const encodedRepairs: any[] = [];
            for (const track of tracks) {
                if (track.file_path && track.file_path.includes('%')) {
                    try {
                        const decoded = decodeURIComponent(track.file_path);
                        if (decoded !== track.file_path && await fs.pathExists(path.join(this.musicDir, decoded))) {
                            let decodedLossless = track.lossless_path;
                            if (track.lossless_path && track.lossless_path.includes('%')) {
                                const dl = decodeURIComponent(track.lossless_path);
                                if (await fs.pathExists(path.join(this.musicDir, dl))) decodedLossless = dl;
                            }
                            encodedRepairs.push({ id: track.id, path: decoded, lossless: decodedLossless });
                        }
                    } catch (e) {}
                }
            }
            if (encodedRepairs.length > 0) {
                this.repo.updateTrackPaths(encodedRepairs);
                console.log(`✅ [Maintenance] Repaired ${encodedRepairs.length} URL-encoded track paths.`);
            }

            const duplicates = this.repo.getDuplicatePaths();
            let mergedCount = 0;

            if (duplicates.length > 0) {
                const filePaths = duplicates.map(d => d.file_path);
                const allDupTracks = this.repo.getTracksByPaths(filePaths);

                const tracksByPath = new Map<string, any[]>();
                for (const t of allDupTracks) {
                    if (!tracksByPath.has(t.file_path)) {
                        tracksByPath.set(t.file_path, []);
                    }
                    tracksByPath.get(t.file_path)!.push(t);
                }

                for (const dup of duplicates) {
                    const dupTracks = tracksByPath.get(dup.file_path) || [];
                    if (dupTracks.length < 2) continue;

                    dupTracks.sort((a, b) => {
                        const score = (t: any) => (t.album_id ? 8 : 0) + (t.duration ? 4 : 0) + (t.fingerprint ? 2 : 0) + (t.external_id ? 1 : 0) + (t.lyrics ? 1 : 0) + (t.lossless_path ? 1 : 0);
                        const diff = score(b) - score(a);
                        if (diff !== 0) return diff;
                        return a.id - b.id;
                    });
                    const keepId = dupTracks[0].id;
                    for (const t of dupTracks.slice(1)) {
                        try {
                            this.db.mergeTracks(t.id, keepId);
                            mergedCount++;
                        } catch (err) {}
                    }
                }
            }
            if (mergedCount > 0) console.log(`✅ [Maintenance] Merged ${mergedCount} duplicate track records.`);

            const bareTracks = this.repo.getBareTracks();
            let mergedBareCount = 0;
            for (const bare of bareTracks) {
                const richMatch = this.repo.findRichMatchForBareTrack(bare.norm_title, bare.id);
                if (richMatch) {
                    try {
                        this.db.mergeTracks(bare.id, richMatch.id);
                        mergedBareCount++;
                    } catch (err) {}
                }
            }
            if (mergedBareCount > 0) console.log(`✅ [Maintenance] Merged ${mergedBareCount} bare track records.`);

            const files = await glob("**/*.{mp3,flac,wav,m4a,ogg}", { cwd: this.musicDir, posix: true });
            const dbPathsSet = new Set<string>();
            const allPaths = this.repo.getAllTrackPaths();
            for (const t of allPaths) {
                if (t.file_path) dbPathsSet.add(t.file_path.replace(/\\/g, '/').toLowerCase());
                if (t.lossless_path) dbPathsSet.add(t.lossless_path.replace(/\\/g, '/').toLowerCase());
            }

            const orphans = files.filter(f => !dbPathsSet.has(f.replace(/\\/g, '/').toLowerCase()));
            if (orphans.length > 0) {
                const genuineOrphans: string[] = [];
                const DUPE_PATTERN = /^(.+?)\s*\(\d+\)(\.[^.]+)$/;
                for (const file of orphans) {
                    const basename = path.basename(file);
                    const dir = path.dirname(file);
                    const match = basename.match(DUPE_PATTERN);
                    if (match) {
                        const originalBasename = match[1].trimEnd() + match[2];
                        const originalPath = dir && dir !== '.' ? `${dir}/${originalBasename}` : originalBasename;
                        if (dbPathsSet.has(originalPath.toLowerCase())) {
                            await fs.unlink(path.join(this.musicDir, file)).catch(() => {});
                            continue;
                        }
                    }
                    genuineOrphans.push(file);
                }

                if (genuineOrphans.length > 0) {
                    const artists = this.repo.getAllArtists();
                    const artistMap = new Map(artists.map(a => [a.name.toLowerCase(), a.id]));
                    const limit = pLimit(10);
                    const chunkSize = 50;

                    for (let i = 0; i < genuineOrphans.length; i += chunkSize) {
                        const chunk = genuineOrphans.slice(i, i + chunkSize);

                        // Phase 1: Parallel Async I/O
                        const parsedChunk = await Promise.all(chunk.map(file => limit(async () => {
                            try {
                                const fullPath = path.join(this.musicDir, file);
                                const metadata = await mm.parseFile(fullPath);
                                const hash = await getFastFileHash(fullPath);
                                return { file, metadata, hash };
                            } catch (e) {
                                return null;
                            }
                        })));

                        // Phase 2: Synchronous Database Insertions
                        this.db.transaction(() => {
                            for (const data of parsedChunk) {
                                if (!data) continue;
                                const { file, metadata, hash } = data;
                                const artistName = metadata.common.artist || "Unknown Artist";
                                let artistId = artistMap.get(artistName.toLowerCase());
                                if (!artistId) {
                                    artistId = this.db.createArtist(artistName);
                                    artistMap.set(artistName.toLowerCase(), artistId);
                                }
                                this.db.createTrack({
                                    title: metadata.common.title || path.basename(file, path.extname(file)),
                                    album_id: null,
                                    artist_id: artistId,
                                    owner_id: primaryAdminId || null,
                                    track_num: metadata.common.track?.no || null,
                                    duration: metadata.format.duration || 0,
                                    file_path: file.replace(/\\/g, '/'),
                                    format: metadata.format.codec || path.extname(file).substring(1),
                                    bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
                                    sample_rate: metadata.format.sampleRate || null,
                                    lossless_path: ['.wav', '.flac'].includes(path.extname(file).toLowerCase()) ? file.replace(/\\/g, '/') : null,
                                    waveform: null,
                                    url: null,
                                    service: null,
                                    external_artwork: null,
                                    hash: hash,
                                    price: 0,
                                    price_usdc: 0,
                                    currency: 'ETH'
                                });
                            }
                        });
                    }
                }
            }

            this.repo.repairArtistAssociations();
            
            const allArtistsForDedupe = this.repo.getAllArtists();
            const artistDupeMap = new Map<string, number[]>();
            for (const a of allArtistsForDedupe) {
                const key = a.name.toLowerCase().trim();
                if (!artistDupeMap.has(key)) artistDupeMap.set(key, []);
                artistDupeMap.get(key)!.push(a.id);
            }
            const tablesWithArtistId = this.repo.getTablesWithArtistId();
            let mergeArtistCount = 0;
            for (const [, ids] of artistDupeMap.entries()) {
                if (ids.length > 1) {
                    const keepId = Math.min(...ids);
                    const mergeIds = ids.filter(id => id !== keepId);
                    for (const fromId of mergeIds) {
                        this.repo.mergeArtists(fromId, keepId, tablesWithArtistId);
                        mergeArtistCount++;
                    }
                }
            }
            if (mergeArtistCount > 0) console.log(`✅ [Maintenance] Deduplicated ${mergeArtistCount} artists.`);

        } catch (error: any) {
            console.error(`❌ [Maintenance] Error during startup maintenance:`, error.stack || error);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`📦 [Maintenance] Phase complete (${duration}s).\n`);
    }
}
