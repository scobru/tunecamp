#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'better-sqlite3';
import pLimit from 'p-limit';
import { loadConfig } from '../server/core/config.js';
import { StringUtils } from '../utils/stringUtils.js';

interface TrackRow {
    id: number;
    title: string;
    file_path: string | null;
    lossless_path: string | null;
}

async function main() {
    const args = process.argv.slice(2);
    const dbArgIdx = args.indexOf('--db');
    const dbOverride = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;

    const config = loadConfig();
    const dbPath = dbOverride || config.dbPath;
    const musicDir = path.resolve(config.musicDir);

    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database not found at: ${dbPath}`);
        process.exit(1);
    }

    const db = new sqlite3(dbPath);
    console.log(`📂 Music Directory: ${musicDir}`);
    console.log(`🗄️  Database: ${dbPath}`);

    const tracks = db.prepare("SELECT id, title, file_path, lossless_path FROM tracks").all() as TrackRow[];
    console.log(`🔍 Checking ${tracks.length} tracks...`);

    let fixedCount = 0;
    let verifiedCount = 0;
    let missingCount = 0;

    const updates: { id: number, file_path: string, lossless_path: string | null }[] = [];

    const limit = pLimit(200);

    // Phase 1: Concurrently execute all I/O checks with Promise.all
    const results = await Promise.all(tracks.map(track => limit(async () => {
        let changed = false;
        let newPath = track.file_path;
        let newLossless = track.lossless_path;

        const cleanedPath = StringUtils.cleanPath(track.file_path);
        const cleanedLossless = StringUtils.cleanPath(track.lossless_path);

        if (cleanedPath !== track.file_path || cleanedLossless !== track.lossless_path) {
            newPath = cleanedPath;
            newLossless = cleanedLossless;
            changed = true;
        }

        let exists = false;
        let altExists = false;
        let tracksAltPath = '';

        // Verify existence
        if (newPath) {
            const fullPath = path.join(musicDir, newPath);
            try {
                await fs.promises.stat(fullPath);
                exists = true;
            } catch {
                exists = false;
            }

            if (!exists) {
                // If it's still missing, maybe it's in tracks/ but the DB says downloads/
                const fileName = path.basename(newPath);
                tracksAltPath = path.join('tracks', fileName);
                const fullAltPath = path.join(musicDir, tracksAltPath);

                try {
                    await fs.promises.stat(fullAltPath);
                    altExists = true;
                } catch {
                    altExists = false;
                }
            }
        }
        return { track, exists, altExists, tracksAltPath, changed, newPath, newLossless };
    })));

    // Phase 2: Process results sequentially
    for (const { track, exists, altExists, tracksAltPath, changed, newPath, newLossless } of results) {
        if (newPath) {
            if (exists) {
                verifiedCount++;
                if (changed) {
                    updates.push({ id: track.id, file_path: newPath!, lossless_path: newLossless });
                    fixedCount++;
                }
            } else {
                missingCount++;
                if (altExists) {
                    console.log(`  [Found Alt] ID ${track.id} (${track.title}) found in tracks/: ${tracksAltPath}`);
                    updates.push({ id: track.id, file_path: tracksAltPath, lossless_path: newLossless });
                    fixedCount++;
                    verifiedCount++;
                    missingCount--;
                }
            }
        }
    }

    if (updates.length > 0) {
        console.log(`\n🚀 Applying ${updates.length} path fixes...`);
        const updateStmt = db.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?");
        
        const transaction = db.transaction((items) => {
            for (const item of items) {
                updateStmt.run(item.file_path, item.lossless_path, item.id);
            }
        });

        transaction(updates);
        console.log(`✅ Success: ${updates.length} database records updated.`);
    } else {
        console.log(`\n✨ No corrupted paths found needing update.`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Fixed:    ${fixedCount}`);
    console.log(`  Verified: ${verifiedCount}`);
    console.log(`  Missing:  ${missingCount} (Disk mismatch)`);

    db.close();
    console.log(`\nDone.`);
}

main().catch(err => {
    console.error(`\n💥 Fatal error:`, err);
    process.exit(1);
});
