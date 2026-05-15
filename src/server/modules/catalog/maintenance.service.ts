import type { DatabaseService, Track } from "../../core/database.js";
import { metadataService } from "./metadata.service.js";
import type { CatalogService } from "./catalog.service.js";
import type { OpenRouterService } from "../ai/openrouter.service.js";

import type { ZenDBService } from "../network/zendb.service.js";
import type { FingerprintService } from "../media/fingerprint.service.js";
import type { AutoTaggerService, AutoTaggerStatus } from "./autotagger.service.js";

export class MaintenanceService {
    constructor(
        private db: DatabaseService,
        private catalogService: CatalogService,
        private openRouter: OpenRouterService,
        private fingerprinting: FingerprintService,
        private zendb: ZenDBService,
        private autotagger: AutoTaggerService
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
    getTracksWithMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist') {
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
     * Applies specific metadata to an album.
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
        const albums = this.db.getAlbumsByIds(albumIds);

        for (const album of albums) {
            try {
                console.log(`[Maintenance] AI Magic for album: ${album.title}`);
                const tracks = this.db.getTracksByAlbum(album.id);
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
     * Look up metadata for a track using its audio fingerprint via ZenDB.
     */
    async fingerprintLookup(trackId: number): Promise<any | null> {
        const track = this.db.getTrack(trackId);
        if (!track) return null;

        let fingerprint = track.fingerprint;
        if (!fingerprint) {
            fingerprint = await this.catalogService.analyzeFingerprint(trackId);
        }

        if (!fingerprint) return null;

        console.log(`[Maintenance] Zen lookup for fingerprint: ${fingerprint.substring(0, 16)}...`);
        const metadata = await this.zendb.getFingerprintMetadata(fingerprint);
        
        if (metadata) {
            console.log(`✨ Found Zen metadata for fingerprint! "${metadata.title}" by ${metadata.artist}`);
            return metadata;
        }

        return null;
    }

    /**
     * Shares a track's metadata and fingerprint with the TuneCamp community.
     */
    async shareFingerprint(trackId: number): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track || !track.title) return;

        let fingerprint = track.fingerprint;
        if (!fingerprint) {
            fingerprint = await this.catalogService.analyzeFingerprint(trackId);
        }

        if (!fingerprint) return;

        console.log(`[Maintenance] Sharing fingerprint to Zen: ${track.title}`);
        await this.zendb.shareFingerprint(fingerprint, track);
    }

    /**
     * Scans all tracks in the database that don't have a fingerprint yet
     * and attempts to identify them via the community registry.
     */
    async batchIdentifyTracks(onProgress?: (processed: number, total: number) => void): Promise<any> {
        const allTracks = this.db.getTracks();
        const pendingTracks = allTracks.filter(t => !t.fingerprint && t.file_path);
        
        console.log(`[Maintenance] Starting batch identification for ${pendingTracks.length} tracks...`);
        
        let successCount = 0;
        let matchCount = 0;
        let errorCount = 0;

        // Process in chunks to avoid blocking the event loop or overwhelming disk I/O
        const CHUNK_SIZE = 5;
        for (let i = 0; i < pendingTracks.length; i += CHUNK_SIZE) {
            const chunk = pendingTracks.slice(i, i + CHUNK_SIZE);
            
            await Promise.all(chunk.map(async (track) => {
                try {
                    // 1. Generate fingerprint
                    const fingerprint = await this.catalogService.analyzeFingerprint(track.id);
                    if (!fingerprint) {
                        errorCount++;
                        return;
                    }
                    successCount++;

                    // 2. Try lookup
                    const metadata = await this.zendb.getFingerprintMetadata(fingerprint);
                    if (metadata) {
                        // 3. Auto-apply missing fields
                        const updates: any = {};
                        if (!track.genre && metadata.genre) updates.genre = metadata.genre;
                        if (!track.year && metadata.year) updates.year = metadata.year;
                        if (!track.album_id && metadata.album) updates.album = metadata.album;

                        if (Object.keys(updates).length > 0) {
                            await this.catalogService.updateTrack(track.id, updates);
                            matchCount++;
                        }
                    }
                } catch (e) {
                    console.error(`[Maintenance] Error identifying track ${track.id}:`, e);
                    errorCount++;
                }
            }));

            if (onProgress) {
                onProgress(i + chunk.length, pendingTracks.length);
            }
        }

        return {
            total: pendingTracks.length,
            processed: successCount,
            matched: matchCount,
            errors: errorCount
        };
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
    async syncAllTagsFromDb(): Promise<{ success: number, failed: number }> {
        const tracks = this.db.getTracks();
        let success = 0;
        let failed = 0;
        console.log(`[Maintenance] Starting full tag sync for ${tracks.length} tracks...`);

        for (const track of tracks) {
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
        }

        return { success, failed };
    }
}
