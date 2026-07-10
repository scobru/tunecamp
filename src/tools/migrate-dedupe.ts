#!/usr/bin/env node

/**
 * Tunecamp Audio Deduplication & Migration Tool (VM-Ready)
 * 
 * Consolidates audio files into a central directory, updates the database,
 * and removes redundant physical copies to save storage space.
 * 
 * Usage:
 *   npx tsx src/tools/migrate-dedupe.ts [options]
 * 
 * Options:
 *   --dry-run      Report what would be changed without actually moving/deleting files
 *   --music-dir <p> Override music directory (default: read from config or /music)
 *   --db <p>        Override database path (default: read from config or tunecamp.db)
 *   --help         Show this help
 */

import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'better-sqlite3';
import { loadConfig } from '../server/core/config.js';
import { getFastFileHash, getFileHash, findAudioFiles } from '../utils/fileUtils.js';

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const help = args.includes('--help');
    
    // Path overrides
    const musicDirArgIdx = args.indexOf('--music-dir');
    const musicDirArg = musicDirArgIdx !== -1 ? args[musicDirArgIdx + 1] : null;
    
    const dbArgIdx = args.indexOf('--db');
    const dbArg = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;

    if (help) {
        console.log(`
Tunecamp Audio Deduplication & Migration Tool

Usage:
  npx tsx src/tools/migrate-dedupe.ts [options]

Options:
  --dry-run          Report potential savings without modifying files or database
  --music-dir <path> Override music directory path
  --db <path>        Override database path
  --help             Show this help
`);
        process.exit(0);
    }

    console.log(`\n🔊 Tunecamp Migration: Audio Deduplication`);
    console.log(`========================================`);
    if (isDryRun) console.log(`🧪 DRY RUN - No changes will be saved\n`);

    const config = await loadConfig();
    const dbPath = dbArg || config.dbPath;
    const musicPathRaw = musicDirArg || config.musicDir;
    const musicDir = path.resolve(musicPathRaw);
    const tracksDir = path.join(musicDir, 'tracks');

    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database not found at: ${dbPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(musicDir)) {
        console.error(`❌ Music directory not found at: ${musicDir}`);
        process.exit(1);
    }

    const db = new sqlite3(dbPath);
    await fs.ensureDir(tracksDir);

    console.log(`📂 Music Directory: ${musicDir}`);
    console.log(`🗄️  Database: ${dbPath}`);

    // 1. Find all audio files
    console.log(`\n🔍 Scanning for audio files...`);
    const allRelativePaths = await findAudioFiles(musicDir);
    console.log(`✨ Found ${allRelativePaths.length} audio files in directory.`);

    if (allRelativePaths.length === 0) {
        console.warn(`⚠️  No audio files found in ${musicDir}. Please verify the path.`);
        
        // Let's check the database to see if we're missing something
        const dbTracks = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
        console.log(`📊 Database has ${dbTracks.count} track entries.`);
        
        if (dbTracks.count > 0) {
            const sample = db.prepare("SELECT file_path FROM tracks LIMIT 3").all() as { file_path: string }[];
            console.log(`   Sample paths in DB:`, sample.map(s => s.file_path));
        }
        
        db.close();
        process.exit(0);
    }

    // 2. Hash files to find duplicates in batches to manage memory
    console.log(`\n🧮 Calculating hashes...`);
    const hashToPaths = new Map<string, string[]>();
    let processedFiles = 0;
    const HASH_BATCH_SIZE = 50;

    for (let i = 0; i < allRelativePaths.length; i += HASH_BATCH_SIZE) {
        const batch = allRelativePaths.slice(i, i + HASH_BATCH_SIZE);
        
        for (const relPath of batch) {
            const absPath = path.join(musicDir, relPath);
            
            try {
                const hash = await getFastFileHash(absPath);
                if (!hashToPaths.has(hash)) {
                    hashToPaths.set(hash, []);
                }
                hashToPaths.get(hash)!.push(relPath);
                
                processedFiles++;
                if (processedFiles % 20 === 0 || processedFiles === allRelativePaths.length) {
                    process.stdout.write(`\r  Progress: ${processedFiles}/${allRelativePaths.length} files hashed`);
                }
            } catch (err) {
                console.error(`\n❌ Failed to process ${relPath}:`, err);
            }
        }
        // Yield to GC/event loop
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    console.log(`\n✅ Hashing complete.`);

    // 3. Identify duplicates and canonical paths
    let duplicateCount = 0;
    let savingsBytes = 0;
    const migrationPlan: { hash: string, canonical: string, duplicates: string[] }[] = [];

    for (const [hash, paths] of hashToPaths.entries()) {
        // Files need migration if:
        // - There are multiple files with the same hash
        // - OR the only version is not in the /tracks/ folder
        const existsInTracks = paths.find(p => p.startsWith('tracks/') || p.startsWith('tracks\\'));
        
        if (paths.length > 1 || !existsInTracks) {
            const canonical = existsInTracks || paths[0];
            const duplicates = paths.filter(p => p !== canonical);
            
            // Stats
            try {
                const stats = await fs.stat(path.join(musicDir, canonical));
                savingsBytes += stats.size * (paths.length - 1);
            } catch (e) {}
            
            duplicateCount += duplicates.length;
            migrationPlan.push({ hash, canonical, duplicates });
        }
    }

    console.log(`\n📊 Analysis Results:`);
    console.log(`  Total uniquely hashed files: ${hashToPaths.size}`);
    console.log(`  Items needing migration/deduplication: ${migrationPlan.length}`);
    console.log(`  Total redundant files to remove: ${duplicateCount}`);
    console.log(`  Potential storage savings: ${(savingsBytes / (1024 * 1024)).toFixed(2)} MB`);

    if (migrationPlan.length === 0) {
        console.log(`\n🎉 No duplicates or items needing migration found. Your library is clean!`);
        db.close();
        process.exit(0);
    }

    // 4. Prepare and execute migration
    console.log(`\n🚀 Starting migration...`);
    let updatedTracks = 0;
    let updatedReleaseTracks = 0;
    let movedFiles = 0;
    let removedFiles = 0;

    const migrationActions: { oldPath: string, newPath: string, isCanonical: boolean, isRedundant: boolean }[] = [];

    for (const item of migrationPlan) {
        const finalRelPath = item.canonical.replace(/\\/g, '/');
        let targetRelPath = finalRelPath;
        // Track whether the canonical source still exists after this loop —
        // if the destination already had a matching file, the source becomes redundant.
        let canonicalAbsorbed = false;

        // Ensure the canonical file is in tracks/ if it wasn't already
        if (!finalRelPath.startsWith('tracks/')) {
            const fileName = path.basename(item.canonical);
            targetRelPath = `tracks/${fileName}`;

            // Collision handling in tracks/
            if (!isDryRun) {
                let counter = 1;
                const nameParts = path.parse(fileName);
                while (fs.existsSync(path.join(musicDir, targetRelPath))) {
                    try {
                        const existingHash = await getFileHash(path.join(musicDir, targetRelPath));
                        if (existingHash === item.hash) {
                            // Target already holds an identical file — keep target, source is now redundant.
                            canonicalAbsorbed = true;
                            break;
                        }
                    } catch (e) {}

                    targetRelPath = `tracks/${nameParts.name}_${counter}${nameParts.ext}`;
                    counter++;
                }

                const oldAbs = path.join(musicDir, item.canonical);
                const newAbs = path.join(musicDir, targetRelPath);

                if (oldAbs !== newAbs && !fs.existsSync(newAbs)) {
                    fs.moveSync(oldAbs, newAbs, { overwrite: false });
                    movedFiles++;
                }
            } else {
                movedFiles++;
            }
        }

        // Add actions for all paths sharing this hash. If the source was absorbed
        // (target already had identical content), mark the canonical as redundant
        // so its file gets removed from disk and not left as an orphan.
        const allOldPaths = [item.canonical, ...item.duplicates];
        for (const oldPath of allOldPaths) {
            const isCanonical = oldPath === item.canonical;
            migrationActions.push({
                oldPath,
                newPath: targetRelPath,
                isCanonical,
                isRedundant: !isCanonical || canonicalAbsorbed
            });
        }
    }

    // Now execute DB updates in a sync transaction
    const executeDbUpdates = db.transaction((actions: typeof migrationActions) => {
        const updateTracksStmt = db.prepare("UPDATE tracks SET file_path = ? WHERE file_path = ? OR file_path = ?");
        const updateReleaseTracksStmt = db.prepare("UPDATE release_tracks SET file_path = ? WHERE file_path = ? OR file_path = ?");

        for (const action of actions) {
            const normalizedOldPath = action.oldPath.replace(/\\/g, '/');
            
            // Update tracks table
            const trackResult = updateTracksStmt.run(action.newPath, normalizedOldPath, action.oldPath);
            updatedTracks += trackResult.changes;

            // Update release_tracks table
            const rtResult = updateReleaseTracksStmt.run(action.newPath, normalizedOldPath, action.oldPath);
            updatedReleaseTracks += rtResult.changes;

            // Delete redundant physical files
            if (action.isRedundant && !isDryRun) {
                try {
                    const delPath = path.join(musicDir, action.oldPath);
                    if (fs.existsSync(delPath)) {
                        fs.removeSync(delPath);
                        removedFiles++;
                    }
                } catch (err) {
                    // console.error(`  Warning: Could not delete ${action.oldPath}:`, err);
                }
            } else if (action.isRedundant && isDryRun) {
                removedFiles++;
            }
        }
    });

    try {
        if (!isDryRun) {
            executeDbUpdates(migrationActions);
        } else {
            // Just simulate for counts
            const CHUNK_SIZE = 900;
            for (let i = 0; i < migrationActions.length; i += CHUNK_SIZE) {
                const chunk = migrationActions.slice(i, i + CHUNK_SIZE);
                const paths = chunk.map(action => action.oldPath);

                if (paths.length > 0) {
                    const placeholders = paths.map(() => '?').join(',');

                    const trackCountRes = db.prepare(`SELECT COUNT(*) as count FROM tracks WHERE file_path IN (${placeholders})`).get(...paths) as { count: number };
                    updatedTracks += (trackCountRes?.count || 0);

                    const releaseTrackCountRes = db.prepare(`SELECT COUNT(*) as count FROM release_tracks WHERE file_path IN (${placeholders})`).get(...paths) as { count: number };
                    updatedReleaseTracks += (releaseTrackCountRes?.count || 0);
                }
            }
        }

        console.log(`\n✅ Migration summary:`);
        console.log(`  Files consolidated to tracks/: ${movedFiles}`);
        console.log(`  Duplicate files removed: ${removedFiles}`);
        console.log(`  Tracks updated in DB: ${updatedTracks}`);
        console.log(`  Release tracks updated in DB: ${updatedReleaseTracks}`);

        if (isDryRun) {
            console.log(`\n💡 This was a dry run. Run without --dry-run to apply changes.`);
        } else {
            console.log(`\n🎉 Migration completed successfully!`);
        }
    } catch (err) {
        console.error(`\n❌ Migration failed:`, err);
    } finally {
        db.close();
    }
}

main().catch(err => {
    console.error(`\n💥 Fatal error:`, err);
    process.exit(1);
});
