import type { DatabaseService, Track } from "../database.js";
import { metadataService } from "../metadata.js";
import type { LibraryService } from "./library.service.js";

export class MaintenanceService {
    constructor(
        private db: DatabaseService,
        private libraryService: LibraryService
    ) {}

    /**
     * Gets tracks missing specific metadata fields.
     */
    getTracksWithMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album') {
        return this.db.getTracksMissingMetadata(filter);
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
     * Applies specific metadata to a track.
     */
    async applyMetadataToTrack(trackId: number, metadata: any): Promise<void> {
        const updateData: any = {};
        if (metadata.genre) updateData.genre = metadata.genre;
        if (metadata.year) updateData.year = metadata.year;
        if (metadata.coverUrl) updateData.externalArtwork = metadata.coverUrl;
        
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
        
        await this.libraryService.updateTrack(trackId, updateData);
    }

    /**
     * Attempts to automatically fill missing metadata for a list of tracks.
     */
    async autofillMetadata(trackIds: number[], options: { force?: boolean, fields: ('genre' | 'year' | 'cover')[] }): Promise<any> {
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

                // 5. Apply update via LibraryService (handles DB + ID3 tags)
                if (updated) {
                    await this.libraryService.updateTrack(track.id, updateData);
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
}
