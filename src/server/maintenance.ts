import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';
import { glob } from 'glob';
import type { DatabaseService } from './database.js';
import type { ServerConfig } from './config.js';
import { StringUtils } from '../utils/stringUtils.js';

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
                const releaseFix = database.db.prepare("UPDATE releases SET owner_id = ? WHERE owner_id IS NULL").run(adminId);
                
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

                const invalidReleaseFix = database.db.prepare(`
                    UPDATE releases 
                    SET owner_id = ? 
                    WHERE owner_id NOT IN (SELECT id FROM admin)
                `).run(adminId);

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
            })();
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
            })();
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
                const tracks = database.db.prepare("SELECT id, album_id, duration FROM tracks WHERE file_path = ?").all(dup.file_path) as any[];
                // Sort by: 1. has album_id, 2. has duration, 3. lowest ID (oldest)
                tracks.sort((a, b) => {
                    if (a.album_id && !b.album_id) return -1;
                    if (!a.album_id && b.album_id) return 1;
                    if (a.duration && !b.duration) return -1;
                    if (!a.duration && b.duration) return 1;
                    return a.id - b.id;
                });
                // Keep the first one, delete others
                const keepId = tracks[0].id;
                const deleteIds = tracks.slice(1).map(t => t.id);
                for (const id of deleteIds) {
                    database.db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
                    removedCount++;
                }
            }
            console.log(`✅ [Maintenance] Removed ${removedCount} duplicate track records.`);
        }

        // 2. Relink Orphaned Files (Restore Lost Tracks)
        console.log(`📦 [Maintenance] Scanning for orphaned music files in ${musicDir}...`);
        const files = await glob("**/*.{mp3,flac,wav,m4a,ogg}", { cwd: musicDir, posix: true });
        
        const dbPaths = new Set<string>();
        // Use a selective query for paths only, and iterate
        const pathIterator = database.db.prepare("SELECT file_path FROM tracks WHERE file_path IS NOT NULL").iterate() as IterableIterator<{file_path: string}>;
        for (const t of pathIterator) {
            // Normalize path to forward slashes for consistent comparison
            const normalizedPath = t.file_path.replace(/\\/g, '/').toLowerCase();
            dbPaths.add(normalizedPath);
        }

        const orphans = files.filter(f => {
            const normalizedFile = f.replace(/\\/g, '/').toLowerCase();
            return !dbPaths.has(normalizedFile);
        });

        if (orphans.length > 0) {
            console.log(`📦 [Maintenance] Found ${orphans.length} orphaned files on disk. Restoring...`);
            let restored = 0;

            // Pre-cache artists for faster lookup
            const artists = database.db.prepare("SELECT id, name FROM artists").all() as any[];
            const artistMap = new Map(artists.map(a => [a.name.toLowerCase(), a.id]));

            for (const file of orphans) {
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

                    const hash = await getFastFileHash(fullPath);

                    database.createTrack({
                        title: common.title || path.basename(file, path.extname(file)),
                        album_id: null, // Scanned later by main scanner
                        artist_id: artistId,
                        owner_id: primaryAdmin ? primaryAdmin.id : null,
                        track_num: common.track.no || null,
                        duration: format.duration || null,
                        file_path: file,
                        format: format.codec || path.extname(file).substring(1),
                        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
                        sample_rate: format.sampleRate || null,
                        price: 0,
                        price_usdc: 0,
                        currency: 'ETH',
                        lossless_path: null,
                        waveform: null,
                        url: null,
                        service: null,
                        external_artwork: null,
                        hash: hash
                    });
                    restored++;
                } catch (e) {
                    console.error(`❌ [Maintenance] Failed to restore orphan: ${file}`, e);
                }
            }
            console.log(`✅ [Maintenance] Restored ${restored} tracks to the library.`);
        } else {
            console.log(`✨ [Maintenance] Library is clean. No orphans found.`);
        }

        // 3. Cleanup Fragmented Torrent Remnants
        await cleanupTorrentFragments(database, config);

    } catch (error) {
        console.error(`❌ [Maintenance] Error during startup maintenance:`, error);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📦 [Maintenance] Phase complete (${duration}s).\n`);
}

/**
 * 🧹 Torrent Fragment Cleanup
 * Identifies and removes partial downloads left over from old torrent implementations.
 * (e.g., "Song_864.mp3" -> merged into "Song.mp3")
 */
async function cleanupTorrentFragments(database: DatabaseService, config: ServerConfig) {
    console.log(`📦 [Maintenance] Analyzing library for fragmented torrent remains...`);
    const fragmentPattern = /_(\d*)\.(mp3|flac|wav|m4a|ogg)$/i;
    const musicDir = path.resolve(config.musicDir).replace(/\\/g, '/');

    let fragmentCount = 0;
    let savingsBytes = 0;
    
    // Grouping structure: Map<"artistId|normalizedTitle", Track[]>
    const groups = new Map<string, any[]>();

    try {
        const tracks = database.getAllTracks();
        for (const track of tracks) {
            if (!track.file_path) continue;
            
            const fileName = path.basename(track.file_path);
            const isFragment = fragmentPattern.test(fileName);
            
            // Normalize title for grouping (lowercase, trim)
            const baseTitle = track.title.toLowerCase().trim();
            
            const groupKey = `${track.artist_id}|${baseTitle}`;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey)!.push({ ...track, isFragment });
        }

        for (const [key, tracks] of groups.entries()) {
            if (tracks.length <= 1) continue;

            // 1. Find the "Canonical" track (largest file size or clean name)
            let canonical = tracks[0];
            let maxBytes = -1;
            const trackStats = [];

            for (const t of tracks) {
                const fullPath = path.join(musicDir, t.file_path);
                try {
                    const stats = await fs.stat(fullPath);
                    trackStats.push({ track: t, bytes: stats.size, path: fullPath });
                    if (stats.size > maxBytes) {
                        maxBytes = stats.size;
                        canonical = t;
                    }
                } catch (e) {
                    trackStats.push({ track: t, bytes: 0, path: fullPath });
                }
            }

            // 2. Consolidate fragments into canonical
            for (const item of trackStats) {
                if (item.track.id === canonical.id) continue;

                try {
                    // Defensive check: Ensure both tracks still exist before attempting merge
                    const checkFrom = database.getTrack(item.track.id);
                    const checkTo = database.getTrack(canonical.id);
                    
                    if (!checkFrom || !checkTo) {
                        console.warn(`⚠️ [Maintenance] Skipping fragment cleanup: One of the tracks disappeared (From: ${item.track.id}, To: ${canonical.id})`);
                        continue;
                    }

                    // Merge DB references (ownership, release placement)
                    try {
                        database.mergeTracks(item.track.id, canonical.id);
                    } catch (mergeErr) {
                        // Specifically catch "no such table: tracks_old" or similar schema artifacts
                        console.error(`❌ [Maintenance] DB Merge failed for fragment ${item.path}:`, mergeErr);
                        continue; // Skip the rest for this item but continue the loop
                    }

                    // Delete file from disk
                    if (fs.existsSync(item.path)) {
                        try {
                            await fs.remove(item.path);
                            savingsBytes += item.bytes;
                            fragmentCount++;
                        } catch (fsErr) {
                            console.warn(`⚠️ [Maintenance] Failed to remove file ${item.path}:`, fsErr);
                        }
                    }

                    // Delete track from database
                    try {
                        database.deleteTrack(item.track.id);
                    } catch (delErr) {
                        console.error(`❌ [Maintenance] Failed to delete track record ${item.track.id}:`, delErr);
                    }
                } catch (err) {
                    console.error(`❌ [Maintenance] Failed to cleanup fragment ${item.path}:`, err);
                }
            }
        }

        if (fragmentCount > 0) {
            const savingsMB = (savingsBytes / (1024 * 1024)).toFixed(2);
            console.log(`✅ [Maintenance] Cleaned up ${fragmentCount} fragments, saved ${savingsMB} MB of storage.`);
        } else {
            console.log(`✨ [Maintenance] No torrent fragments found.`);
        }
    } catch (err) {
        console.error(`❌ [Maintenance] Torrent cleanup failed:`, err);
    }
}
