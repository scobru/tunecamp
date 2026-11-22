import fs from 'fs-extra';
import path from 'path';
import * as mm from 'music-metadata';
import { glob } from 'glob';
import pLimit from 'p-limit';
import type { DatabaseService, Track } from "../../core/database.js";
import type { CatalogService } from "./catalog.service.js";
import type { MaintenanceRepository } from "../../repositories/maintenance.repository.js";
import { StringUtils } from "../../../utils/stringUtils.js";
import { getFastFileHash } from "../../../utils/fileUtils.js";

const GENERIC_TITLE_REGEX = /^(?:(?:audio\s*)?track\s*#?\d+|untitled(?:\s*\d+)?|pista\s*\d+|traccia\s*\d+|\d{1,3})$/i;

export class MaintenanceService {
    constructor(
        private repo: MaintenanceRepository,
        private db: DatabaseService,
        private catalogService: CatalogService,
        private musicDir: string
    ) {}

    /**
     * Gets tracks missing specific metadata fields.
     */
    getTracksWithMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist' | 'external') {
        return this.db.getTracksMissingMetadata(filter);
    }

    /**
     * Gets tracks whose title matches generic rip/import placeholders
     * (e.g. "AudioTrack 01", "Track 16", "Untitled", or bare track numbers).
     */
    getTracksWithGenericTitles(): Track[] {
        const tracks = this.db.getTracks();
        return tracks.filter(t => !t.title || GENERIC_TITLE_REGEX.test(t.title.trim()));
    }

    /**
     * Gets albums missing specific metadata fields.
     */
    getAlbumsWithMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'description' | 'artist') {
        return this.db.getAlbumsMissingMetadata(filter);
    }

    /**
     * Gets artists missing photos.
     */
    async getArtistsWithMissingPhotos(): Promise<any[]> {
        return this.db.getArtistsMissingMetadata('photo');
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
            let repairedCount = 0;
            const CHUNK_SIZE = 900;

            this.db.transaction(() => {
                for (const track of tracks) {
                    const newPath = StringUtils.cleanPath(track.file_path);
                    const newLossless = StringUtils.cleanPath(track.lossless_path);
                    if (newPath !== track.file_path || newLossless !== track.lossless_path) {
                        pathRepairs.push({ id: track.id, path: newPath, lossless: newLossless });
                        if (pathRepairs.length >= CHUNK_SIZE) {
                            repairedCount += this.repo.updateTrackPaths(pathRepairs);
                            pathRepairs.length = 0;
                        }
                    }
                }
                if (pathRepairs.length > 0) {
                    repairedCount += this.repo.updateTrackPaths(pathRepairs);
                }
            });

            if (repairedCount > 0) {
                console.log(`✅ [Maintenance] Repaired ${repairedCount} track paths.`);
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

            // Broken local references: file_path points at a file that no longer
            // exists on disk (e.g. legacy importers wrote mangled names like
            // `..._wav_wav.wav` that never matched a real file). Files are never
            // moved or renamed, so this is report-only: the real file, if present
            // under another name, is picked up by the orphan scan below as its own
            // track — the broken row is then a duplicate to remove manually.
            const missingLimit = pLimit(20);
            const missingChecks = await Promise.all(tracks.map(t => missingLimit(async () => {
                const p = t.file_path;
                if (!p || p.startsWith('http')) return null;
                const abs = path.isAbsolute(p) ? p : path.join(this.musicDir, p);
                return (await fs.pathExists(abs)) ? null : t;
            })));
            const missingTracks = missingChecks.filter((t): t is Track => t !== null);
            if (missingTracks.length > 0) {
                console.warn(`⚠️ [Maintenance] ${missingTracks.length} track(s) reference files missing from disk (report-only, review manually):`);
                for (const t of missingTracks) {
                    console.warn(`   #${t.id} "${t.title}" → ${t.file_path}`);
                }
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

                this.db.transaction(() => {
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
                        const mergeIds = dupTracks.slice(1).map((t: any) => Number(t.id));
                        try {
                            if (mergeIds.length > 0) {
                                const CHUNK_SIZE = 900;
                                for (let i = 0; i < mergeIds.length; i += CHUNK_SIZE) {
                                    this.db.mergeTracks(mergeIds.slice(i, i + CHUNK_SIZE), keepId);
                                }
                            }
                            mergedCount += mergeIds.length;
                        } catch (err) {}
                    }
                });
            }
            if (mergedCount > 0) console.log(`✅ [Maintenance] Merged ${mergedCount} duplicate track records.`);

            const bareTracks = this.repo.getBareTracks();
            let mergedBareCount = 0;
            this.db.transaction(() => {
                const barePairs = new Map<number, number[]>();
                for (const bare of bareTracks) {
                    const richMatch = this.repo.findRichMatchForBareTrack(bare.norm_title, bare.id);
                    if (richMatch) {
                        const existing = barePairs.get(richMatch.id) || [];
                        existing.push(bare.id);
                        barePairs.set(richMatch.id, existing);
                    }
                }
                for (const [keepId, mergeIds] of barePairs.entries()) {
                    try {
                        const CHUNK_SIZE = 900;
                        for (let i = 0; i < mergeIds.length; i += CHUNK_SIZE) {
                            this.db.mergeTracks(mergeIds.slice(i, i + CHUNK_SIZE), keepId);
                        }
                        mergedBareCount += mergeIds.length;
                    } catch (err) {}
                }
            });
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
                            const tracksToInsert: any[] = [];
                            for (const data of parsedChunk) {
                                if (!data) continue;
                                const { file, metadata, hash } = data;
                                const artistName = metadata.common.artist || "Unknown Artist";
                                let artistId = artistMap.get(artistName.toLowerCase());
                                if (!artistId) {
                                    artistId = this.db.createArtist(artistName);
                                    artistMap.set(artistName.toLowerCase(), artistId);
                                }
                                tracksToInsert.push({
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
                            if (tracksToInsert.length > 0) {
                                this.db.createTracks(tracksToInsert);
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
