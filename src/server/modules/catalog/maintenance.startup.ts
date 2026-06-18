import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';
import { glob } from 'glob';
import type { DatabaseService } from '../../core/database.js';
import type { ServerConfig } from '../../core/config.js';
import { StringUtils } from '../../../utils/stringUtils.js';

/**
 * 🛠️ TuneCamp Startup Maintenance
 * Automatically repairs corrupted paths and restores "lost" tracks found on disk.
 */

async function getFastFileHash(filePath: string): Promise<string> {
    try {
        const stats = await fs.stat(filePath);
        const size = stats.size;
        const buffer = Buffer.alloc(16384);
        const fd = await fs.open(filePath, 'r');
        
        // Read first 8KB
        await fs.read(fd, buffer, 0, 8192, 0);
        // Read last 8KB
        await fs.read(fd, buffer, 8192, 8192, Math.max(0, size - 8192));
        await fs.close(fd);
        
        return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (e) {
        return "";
    }
}

export async function runStartupMaintenance(database: DatabaseService, config: ServerConfig) {
    console.log(`\n📦 [Maintenance] Starting startup maintenance phase...`);
    const startTime = Date.now();

    const musicDir = path.resolve(config.musicDir).replace(/\\/g, '/');

    try {
        // Remove polluted image files scanned as tracks
        console.log(`📦 [Maintenance] Cleaning up invalid image tracks from database...`);
        const deleteImagesRes = database.db.prepare(`
            DELETE FROM tracks 
            WHERE file_path LIKE '%.png' 
               OR file_path LIKE '%.jpg' 
               OR file_path LIKE '%.jpeg'
               OR file_path LIKE '%.webp'
               OR file_path LIKE '%.gif'
               OR lossless_path LIKE '%.png'
               OR lossless_path LIKE '%.jpg'
               OR lossless_path LIKE '%.jpeg'
               OR lossless_path LIKE '%.webp'
               OR lossless_path LIKE '%.gif'
        `).run();
        if (deleteImagesRes.changes > 0) {
            console.log(`✅ [Maintenance] Removed ${deleteImagesRes.changes} polluted image track records from database.`);
        }

        // 0. Repair Ownership Gaps (Claim orphans for primary admin)
        console.log(`📦 [Maintenance] Repairing ownership gaps...`);
        const primaryAdmin = database.db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
        
        if (primaryAdmin) {
            const adminId = primaryAdmin.id;
            
            // Temporarily disable FK checks to fix legacy corrupted data or schema inconsistencies
            database.db.exec("PRAGMA foreign_keys = OFF");

            try {
                // 0.1 Fix Missing Ownership
                const trackFix = database.db.prepare("UPDATE tracks SET owner_id = ? WHERE owner_id IS NULL").run(adminId);
                const albumFix = database.db.prepare("UPDATE albums SET owner_id = ? WHERE owner_id IS NULL").run(adminId);
                const releaseFix = { changes: 0 };
                
                // 0.2 Fix Invalid Ownership (Foreign Key leaks)
                const invalidTrackFix = database.db.prepare(`
                    UPDATE tracks 
                    SET owner_id = ? 
                    WHERE owner_id NOT IN (SELECT id FROM admin)
                `).run(adminId);
                
                const invalidAlbumFix = database.db.prepare(`
                    UPDATE albums 
                    SET owner_id = ? 
                    WHERE owner_id NOT IN (SELECT id FROM admin)
                `).run(adminId);

                const invalidReleaseFix = { changes: 0 };

                // 0.3 Clean up redundant/corrupted ownership tables
                const cleanTrackOwnership = database.db.prepare(`DELETE FROM track_ownership WHERE owner_id NOT IN (SELECT id FROM admin)`).run();
                const cleanAlbumOwnership = database.db.prepare(`DELETE FROM album_ownership WHERE owner_id NOT IN (SELECT id FROM admin)`).run();

                const totalChanges = trackFix.changes + albumFix.changes + releaseFix.changes + invalidTrackFix.changes + invalidAlbumFix.changes + invalidReleaseFix.changes + cleanTrackOwnership.changes + cleanAlbumOwnership.changes;
                if (totalChanges > 0) {
                    console.log(`✅ [Maintenance] Ownership repair complete:`);
                    if (trackFix.changes > 0) console.log(`   - Claimed ${trackFix.changes} orphan tracks`);
                    if (invalidTrackFix.changes > 0) console.log(`   - Repaired ${invalidTrackFix.changes} tracks with invalid owner IDs`);
                    if (albumFix.changes + releaseFix.changes > 0) console.log(`   - Claimed ${albumFix.changes + releaseFix.changes} orphan albums/releases`);
                    if (invalidAlbumFix.changes + invalidReleaseFix.changes > 0) console.log(`   - Repaired ${invalidAlbumFix.changes + invalidReleaseFix.changes} albums/releases with invalid owner IDs`);
                    if (cleanTrackOwnership.changes + cleanAlbumOwnership.changes > 0) console.log(`   - Removed ${cleanTrackOwnership.changes + cleanAlbumOwnership.changes} corrupted secondary ownership records`);
                }

                // 0.4 Fix Visibility and Orphaned Releases
                const fixOrphanedAlbums = database.db.prepare(`UPDATE albums SET is_release = 0 WHERE (is_release = 1 OR is_release IS NULL) AND id NOT IN (SELECT id FROM releases)`).run();
                if (fixOrphanedAlbums.changes > 0) {
                    console.log(`✅ [Maintenance] Restored ${fixOrphanedAlbums.changes} orphaned albums to library (were stuck in release limbo).`);
                }

                // 0.5 Fix missing artist_id on albums based on track associations
                let fixedArtistsCount = 0;
                const orphanAlbums = database.db.prepare(`SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL AND artist_id IS NOT NULL`).all() as any[];
                for (const { album_id } of orphanAlbums) {
                    const tracks = database.db.prepare(`SELECT DISTINCT artist_id FROM tracks WHERE album_id = ? AND artist_id IS NOT NULL`).all(album_id) as any[];
                    // If all tracks in this album belong to exactly one artist, assign the album to that artist
                    if (tracks.length === 1) {
                        const artistId = tracks[0].artist_id;
                        const album = database.db.prepare(`SELECT artist_id FROM albums WHERE id = ?`).get(album_id) as any;
                        if (album && album.artist_id !== artistId) {
                            database.db.prepare(`UPDATE albums SET artist_id = ? WHERE id = ?`).run(artistId, album_id);
                            fixedArtistsCount++;
                        }
                    }
                }
                if (fixedArtistsCount > 0) {
                    console.log(`✅ [Maintenance] Auto-assigned ${fixedArtistsCount} albums to their track artists.`);
                }

                // 0.6 Auto-create and link artist profile for admins without one
                const adminsWithoutArtist = database.db.prepare("SELECT id, username FROM admin WHERE artist_id IS NULL AND COALESCE(artist_unlinked, 0) = 0").all() as { id: number, username: string }[];
                for (const adm of adminsWithoutArtist) {
                    const artistName = adm.username;
                    let existingArtist = database.getArtistByName(artistName);
                    if (!existingArtist) {
                        const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
                        let finalSlug = slug;
                        let attempt = 0;
                        while (attempt < 100) {
                            try {
                                const result = database.db.prepare("INSERT INTO artists (name, slug, visibility) VALUES (?, ?, 'public')").run(artistName, finalSlug);
                                existingArtist = { id: Number(result.lastInsertRowid), name: artistName, slug: finalSlug } as any;
                                break;
                            } catch (e: any) {
                                if (e.message && e.message.includes('UNIQUE constraint failed: artists.slug')) {
                                    attempt++;
                                    finalSlug = `${slug}-${attempt}`;
                                    continue;
                                }
                                break;
                            }
                        }
                    }
                    if (existingArtist) {
                        database.db.prepare("UPDATE admin SET artist_id = ? WHERE id = ?").run(existingArtist.id, adm.id);
                        console.log(`✅ [Maintenance] Automatically linked admin '${adm.username}' to artist profile '${artistName}'.`);
                    }
                }
            } finally {
                database.db.exec("PRAGMA foreign_keys = ON");
            }
        }

        // 1. Repair Corrupted Paths in Database
        console.log(`📦 [Maintenance] Repairing corrupted paths in database...`);
        let repairCount = 0;

        const tracks = database.getAllTracks();
        const repairs: {id: number, path: string, lossless: string}[] = [];

        for (const track of tracks) {
            const newPath = StringUtils.cleanPath(track.file_path);
            const newLossless = StringUtils.cleanPath(track.lossless_path);
            if (newPath !== track.file_path || newLossless !== track.lossless_path) {
                repairs.push({ id: track.id, path: newPath!, lossless: newLossless! });
            }
        }

        if (repairs.length > 0) {
            database.db.transaction(() => {
                const updateStmt = database.db.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?");
                for (const r of repairs) {
                    updateStmt.run(r.path, r.lossless, r.id);
                    repairCount++;
                }
            });
        }

        if (repairCount > 0) {
            console.log(`✅ [Maintenance] Repaired ${repairCount} track paths.`);
        }
        
        // 1.5 Repair URL-Encoded Paths (Soulseek Fix)
        console.log(`📦 [Maintenance] Checking for URL-encoded paths that need repair...`);
        let encodedRepairCount = 0;
        const encodedRepairs: {id: number, path: string, lossless: string | null}[] = [];
        
        for (const track of tracks) {
            if (track.file_path && track.file_path.includes('%')) {
                try {
                    const decoded = decodeURIComponent(track.file_path);
                    if (decoded !== track.file_path && await fs.pathExists(path.join(musicDir, decoded))) {
                        let decodedLossless = track.lossless_path;
                        if (track.lossless_path && track.lossless_path.includes('%')) {
                            const dl = decodeURIComponent(track.lossless_path);
                            if (await fs.pathExists(path.join(musicDir, dl))) decodedLossless = dl;
                        }
                        encodedRepairs.push({ id: track.id, path: decoded, lossless: decodedLossless });
                    }
                } catch (e) {}
            }
        }
        
        if (encodedRepairs.length > 0) {
            database.db.transaction(() => {
                const updateStmt = database.db.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?");
                for (const r of encodedRepairs) {
                    updateStmt.run(r.path, r.lossless, r.id);
                    encodedRepairCount++;
                }
            });
            console.log(`✅ [Maintenance] Repaired ${encodedRepairCount} URL-encoded track paths.`);
        }

        // 1.5. Deduplicate tracks by file_path
        console.log(`📦 [Maintenance] Checking for duplicate tracks by file path...`);
        const duplicates = database.db.prepare(`
            SELECT file_path, COUNT(*) as count
            FROM tracks
            WHERE file_path IS NOT NULL
            GROUP BY file_path
            HAVING count > 1
        `).all() as { file_path: string, count: number }[];

        if (duplicates.length > 0) {
            console.log(`📦 [Maintenance] Found ${duplicates.length} duplicate file paths. Cleaning up...`);
            let removedCount = 0;
            for (const dup of duplicates) {
                const tracks = database.db.prepare(`
                    SELECT id, album_id, duration, fingerprint, external_id, lyrics, lossless_path
                    FROM tracks WHERE file_path = ?
                `).all(dup.file_path) as any[];
                // Sort by richness — prefer tracks with album, duration, fingerprint, external_id, lyrics
                tracks.sort((a, b) => {
                    const score = (t: any) =>
                        (t.album_id ? 8 : 0) +
                        (t.duration ? 4 : 0) +
                        (t.fingerprint ? 2 : 0) +
                        (t.external_id ? 1 : 0) +
                        (t.lyrics ? 1 : 0) +
                        (t.lossless_path ? 1 : 0);
                    const diff = score(b) - score(a);
                    if (diff !== 0) return diff;
                    return a.id - b.id;
                });
                const keepId = tracks[0].id;
                const mergeIds = tracks.slice(1).map(t => t.id);
                for (const id of mergeIds) {
                    try {
                        // Use mergeTracks so ownership/plays/bookmarks/ratings get transferred
                        // and missing metadata gets carried over to the keeper.
                        database.mergeTracks(id, keepId);
                        removedCount++;
                    } catch (err) {
                        console.error(`❌ [Maintenance] Failed to merge duplicate track ${id} -> ${keepId}:`, err);
                    }
                }
            }
            console.log(`✅ [Maintenance] Merged ${removedCount} duplicate track records.`);
        }

        // 1.6. Merge bare tracks (no artist, no album) into rich duplicates with same title
        console.log(`📦 [Maintenance] Checking for bare tracks duplicating titled tracks...`);
        const bareTracks = database.db.prepare(`
            SELECT t.id, LOWER(TRIM(t.title)) as norm_title
            FROM tracks t
            WHERE (t.artist_id IS NULL OR t.artist_id = 0)
              AND (t.artist_name IS NULL OR t.artist_name = '')
              AND (t.album_id IS NULL OR t.album_id = 0)
              AND t.title IS NOT NULL AND TRIM(t.title) != ''
        `).all() as { id: number, norm_title: string }[];

        if (bareTracks.length > 0) {
            let mergedBareCount = 0;
            for (const bare of bareTracks) {
                const richMatch = database.db.prepare(`
                    SELECT id, album_id, duration, fingerprint, external_id, lyrics, lossless_path, artist_id, artist_name
                    FROM tracks
                    WHERE LOWER(TRIM(title)) = ?
                      AND id != ?
                      AND (artist_id IS NOT NULL AND artist_id != 0 OR (artist_name IS NOT NULL AND artist_name != ''))
                    ORDER BY
                        (CASE WHEN album_id IS NOT NULL AND album_id != 0 THEN 8 ELSE 0 END) +
                        (CASE WHEN duration IS NOT NULL AND duration != 0 THEN 4 ELSE 0 END) +
                        (CASE WHEN fingerprint IS NOT NULL THEN 2 ELSE 0 END) +
                        (CASE WHEN external_id IS NOT NULL THEN 1 ELSE 0 END) +
                        (CASE WHEN lyrics IS NOT NULL THEN 1 ELSE 0 END) DESC
                    LIMIT 1
                `).get(bare.norm_title, bare.id) as any;

                if (richMatch) {
                    try {
                        database.mergeTracks(bare.id, richMatch.id);
                        mergedBareCount++;
                    } catch (err) {
                        console.error(`❌ [Maintenance] Failed to merge bare track ${bare.id} -> ${richMatch.id}:`, err);
                    }
                }
            }
            if (mergedBareCount > 0) {
                console.log(`✅ [Maintenance] Merged ${mergedBareCount} bare track records into their rich counterparts.`);
            }
        }

        // 2. Relink Orphaned Files (Restore Lost Tracks)
        console.log(`📦 [Maintenance] Scanning for orphaned music files in ${musicDir}...`);
        const files = await glob("**/*.{mp3,flac,wav,m4a,ogg}", { cwd: musicDir, posix: true });
        
        const dbPaths = new Set<string>();
        // Include BOTH file_path AND lossless_path so FLAC/WAV files referenced
        // only as a lossless companion are not mistakenly treated as orphans.
        const pathIterator = database.db.prepare(
            "SELECT file_path, lossless_path FROM tracks WHERE file_path IS NOT NULL OR lossless_path IS NOT NULL"
        ).iterate() as IterableIterator<{file_path: string | null, lossless_path: string | null}>;
        for (const t of pathIterator) {
            if (t.file_path) dbPaths.add(t.file_path.replace(/\\/g, '/').toLowerCase());
            if (t.lossless_path) dbPaths.add(t.lossless_path.replace(/\\/g, '/').toLowerCase());
        }

        const orphans = files.filter(f => {
            const normalizedFile = f.replace(/\\/g, '/').toLowerCase();
            return !dbPaths.has(normalizedFile);
        });

        if (orphans.length > 0) {
            console.log(`📦 [Maintenance] Found ${orphans.length} orphaned files on disk. Filtering duplicates...`);

            // Phase A: Delete obvious filesystem duplicates (e.g. "song (1).mp3", "track (2).flac")
            // These are created by download managers or OS copy operations and cause the
            // infinite scan/dedup/restore loop when re-imported as new tracks.
            const genuineOrphans: string[] = [];
            const DUPE_PATTERN = /^(.+?)\s*\(\d+\)(\.[^.]+)$/;
            let physicalDupesDeleted = 0;

            for (const file of orphans) {
                const basename = path.basename(file);
                const dir = path.dirname(file);
                const match = basename.match(DUPE_PATTERN);
                if (match) {
                    const originalBasename = match[1].trimEnd() + match[2];
                    const originalPath = dir ? `${dir}/${originalBasename}` : originalBasename;
                    // If the original file (without suffix) exists in the DB, this is a true duplicate
                    if (dbPaths.has(originalPath.toLowerCase())) {
                        const fullPath = path.join(musicDir, file);
                        try {
                            await fs.unlink(fullPath);
                            physicalDupesDeleted++;
                            console.log(`🗑️ [Maintenance] Deleted filesystem duplicate: ${file}`);
                        } catch (e) {
                            console.warn(`[Maintenance] Could not delete duplicate ${file}:`, (e as any).message);
                        }
                        continue;
                    }
                }
                genuineOrphans.push(file);
            }
            if (physicalDupesDeleted > 0) {
                console.log(`🧹 [Maintenance] Removed ${physicalDupesDeleted} filesystem duplicate files.`);
            }

            // Phase B: Restore genuine orphans (files that are truly missing from the DB)
            if (genuineOrphans.length > 0) {
                console.log(`📦 [Maintenance] Restoring ${genuineOrphans.length} genuine orphaned files...`);
                let restored = 0;

                // Pre-cache artists for faster lookup
                const artists = database.db.prepare("SELECT id, name FROM artists").all() as any[];
                const artistMap = new Map(artists.map(a => [a.name.toLowerCase(), a.id]));

                for (const file of genuineOrphans) {
                    const fullPath = path.join(musicDir, file);
                    try {
                        const metadata = await mm.parseFile(fullPath);
                        const common = metadata.common;
                        const format = metadata.format;
                        const artistName = common.artist || "Unknown Artist";
                        
                        let artistId = artistMap.get(artistName.toLowerCase());
                        if (!artistId) {
                            artistId = database.createArtist(artistName);
                            artistMap.set(artistName.toLowerCase(), artistId);
                        }

                        const normalizedPath = file.replace(/\\/g, '/');
                        const hash = await getFastFileHash(fullPath);

                        console.log(`📂 [Maintenance] Restoring orphan: ${path.basename(file)} -> Artist: ${artistName || 'Unknown'}`);
                        database.createTrack({
                            title: common.title || path.basename(file, path.extname(file)),
                            album_id: null, // Scanned later by main scanner
                            artist_id: artistId,
                            owner_id: primaryAdmin ? primaryAdmin.id : null,
                            track_num: common.track?.no || null,
                            duration: format.duration || 0,
                            file_path: normalizedPath,
                            format: format.codec || path.extname(file).substring(1),
                            bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                            sample_rate: format.sampleRate || null,
                            lossless_path: ['.wav', '.flac'].includes(path.extname(file).toLowerCase()) ? normalizedPath : null,
                            waveform: null,
                            url: null,
                            service: null,
                            external_artwork: null,
                            hash: hash,
                            price: 0,
                            price_usdc: 0,
                            currency: 'ETH'
                        });
                        restored++;

                    } catch (e) {
                        console.error(`❌ [Maintenance] Failed to restore orphan: ${file}`, e);
                    }
                }
                console.log(`✅ [Maintenance] Restored ${restored} tracks to the library.`);
            } else {
                console.log(`✨ [Maintenance] All orphans were filesystem duplicates. Library is clean.`);
            }
        } else {
            console.log(`✨ [Maintenance] Library is clean. No orphans found.`);
        }

        // 2.5. Repair Database Associations (Artist propagation)
        console.log(`📦 [Maintenance] Repairing artist associations...`);
        try {
            // A. Fix tracks that have an artist_name but null artist_id
            const orphanTracks = database.db.prepare("SELECT DISTINCT artist_name FROM tracks WHERE artist_id IS NULL AND artist_name IS NOT NULL").all() as { artist_name: string }[];
            let trackFixCount = 0;
            for (const ot of orphanTracks) {
                const artist = database.getArtistByName(ot.artist_name);
                if (artist) {
                    const res = database.db.prepare("UPDATE tracks SET artist_id = ? WHERE artist_id IS NULL AND artist_name = ?").run(artist.id, ot.artist_name);
                    trackFixCount += res.changes;
                }
            }

            // B. Fix albums that have an album_artist but null artist_id
            const orphanAlbums = database.db.prepare("SELECT DISTINCT album_artist FROM albums WHERE artist_id IS NULL AND album_artist IS NOT NULL AND album_artist != ''").all() as { album_artist: string }[];
            let albumFixByNameCount = 0;
            for (const oa of orphanAlbums) {
                const artist = database.getArtistByName(oa.album_artist);
                if (artist) {
                    const res = database.db.prepare("UPDATE albums SET artist_id = ? WHERE artist_id IS NULL AND album_artist = ?").run(artist.id, oa.album_artist);
                    albumFixByNameCount += res.changes;
                }
            }

            // C. Propagate artist_id from tracks to albums where missing
            const albumFix = database.db.prepare(`
                UPDATE albums 
                SET artist_id = (SELECT artist_id FROM tracks WHERE album_id = albums.id AND artist_id IS NOT NULL LIMIT 1)
                WHERE artist_id IS NULL AND id IN (SELECT DISTINCT album_id FROM tracks WHERE artist_id IS NOT NULL)
            `).run();

            // D. Propagate artist_id from tracks to releases where missing (handled by albums since releases is a view)
            const releaseFix = { changes: 0 };

            if (albumFix.changes > 0 || albumFixByNameCount > 0 || releaseFix.changes > 0 || trackFixCount > 0) {
                console.log(`✅ [Maintenance] Association repair complete:`);
                if (albumFix.changes > 0) console.log(`   - Fixed ${albumFix.changes} albums with missing artist_id via track propagation`);
                if (albumFixByNameCount > 0) console.log(`   - Fixed ${albumFixByNameCount} albums with missing artist_id via album_artist match`);
                if (releaseFix.changes > 0) console.log(`   - Fixed ${releaseFix.changes} releases with missing artist_id`);
                if (trackFixCount > 0) console.log(`   - Fixed ${trackFixCount} tracks with missing artist_id`);
            }

            // D. Deduplicate Artists (Case-insensitive)
            console.log(`📦 [Maintenance] Checking for duplicate artists...`);
            const allArtists = database.db.prepare("SELECT id, name FROM artists").all() as { id: number, name: string }[];
            const artistMap = new Map<string, number[]>(); // name.toLowerCase() -> [ids]
            
            for (const a of allArtists) {
                const key = a.name.toLowerCase().trim();
                if (!artistMap.has(key)) artistMap.set(key, []);
                artistMap.get(key)!.push(a.id);
            }

            let mergeCount = 0;
            // Discover all tables with an artist_id column so the migration doesn't
            // leave dangling references when the schema grows (posts, ap_notes,
            // followers, assets, etc.). 'artists' is excluded as it's the target table.
            const tablesWithArtistId = (database.db.prepare(
                "SELECT m.name as tbl FROM sqlite_master m WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'"
            ).all() as { tbl: string }[])
                .filter(r => {
                    // 'artists' is the target table. 'admin' holds USER accounts: their
                    // artist_id must be re-pointed (handled separately below) but the row
                    // must NEVER be deleted by the generic sweep, or merging two same-named
                    // artists would delete the linked user account.
                    if (r.tbl === 'artists' || r.tbl === 'admin') return false;
                    try {
                        const cols = database.db.prepare(`PRAGMA table_info(${r.tbl})`).all() as { name: string }[];
                        return cols.some(c => c.name === 'artist_id');
                    } catch { return false; }
                })
                .map(r => r.tbl);

            for (const [, ids] of artistMap.entries()) {
                if (ids.length > 1) {
                    const keepId = Math.min(...ids);
                    const mergeIds = ids.filter(id => id !== keepId);

                    for (const fromId of mergeIds) {
                        try {
                            database.db.transaction(() => {
                                // Re-point every artist_id reference across the schema.
                                // followers/ap_notes have UNIQUE constraints — use UPDATE OR IGNORE then sweep leftovers.
                                for (const tbl of tablesWithArtistId) {
                                    try {
                                        database.db.prepare(`UPDATE OR IGNORE ${tbl} SET artist_id = ? WHERE artist_id = ?`).run(keepId, fromId);
                                        database.db.prepare(`DELETE FROM ${tbl} WHERE artist_id = ?`).run(fromId);
                                    } catch (e) {
                                        console.warn(`⚠️ [Maintenance] Could not re-point artist_id in ${tbl}:`, (e as any).message);
                                    }
                                }
                                // Re-point linked user accounts to the surviving artist —
                                // never delete the admin row.
                                database.db.prepare("UPDATE admin SET artist_id = ? WHERE artist_id = ?").run(keepId, fromId);
                                database.db.prepare("DELETE FROM artists WHERE id = ?").run(fromId);
                            })();
                            mergeCount++;
                        } catch (err) {
                            console.error(`❌ [Maintenance] Failed to merge artist ${fromId} into ${keepId}:`, err);
                        }
                    }
                }
            }
            if (mergeCount > 0) {
                console.log(`✅ [Maintenance] Deduplicated ${mergeCount} artists across ${tablesWithArtistId.length} tables.`);
            }

        } catch (e: any) {
            console.error(`❌ [Maintenance] Failed to repair associations:`, e.stack || e);
        }

    } catch (error: any) {
        console.error(`❌ [Maintenance] Error during startup maintenance:`, error.stack || error);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📦 [Maintenance] Phase complete (${duration}s).\n`);
}
