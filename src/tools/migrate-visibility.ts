#!/usr/bin/env node

/**
 * Tunecamp Visibility Sync Migration Tool
 * 
 * Synchronizes visibility flags from the 'releases' table back to the 'albums' table
 * to ensure that tracks from public releases are correctly visible in the global library.
 */

import sqlite3 from 'better-sqlite3';
import { loadConfig } from '../server/core/config.js';
import path from 'path';
import fs from 'fs';

async function main() {
    const args = process.argv.slice(2);
    const dbArgIdx = args.indexOf('--db');
    const dbArg = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;

    const config = loadConfig();
    const dbPath = dbArg || config.dbPath;

    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database not found at: ${dbPath}`);
        process.exit(1);
    }

    console.log(`\n🛡️ Tunecamp Migration: Visibility Sync`);
    console.log(`========================================`);
    console.log(`🗄️  Database: ${dbPath}`);

    const db = new sqlite3(dbPath);

    try {
        console.log(`\n🔍 Syncing visibility from releases to albums...`);

        const sql = `
            UPDATE albums 
            SET is_public = 1 
            WHERE id IN (
                SELECT id FROM releases WHERE visibility IN ('public', 'unlisted')
            ) AND is_public = 0
        `;
        
        const result = db.prepare(sql).run();
        console.log(`✨ Successfully updated ${result.changes} albums to be public based on their release status.`);
        
        console.log(`\n🎉 Visibility sync completed successfully!`);
    } catch (err) {
        console.error(`\n❌ Visibility sync failed:`, err);
        process.exit(1);
    } finally {
        db.close();
    }
}

main().catch(err => {
    console.error(`\n💥 Fatal error:`, err);
    process.exit(1);
});
