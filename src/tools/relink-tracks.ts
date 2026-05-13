#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'better-sqlite3';
import * as mm from 'music-metadata';
import crypto from 'crypto';
import { loadConfig } from '../server/core/config.js';
import { glob } from 'glob';

/**
 * 🛠️ Tunecamp Recovery Tool: Relink Missing Tracks
 * This tool finds all audio files on disk and ensures they exist in your database.
 */

async function getFastFileHash(filePath: string): Promise<string> {
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
}

async function main() {
    console.log(`\n🔊 Tunecamp Recovery: Relink Tracks`);
    console.log(`========================================`);

    const args = process.argv.slice(2);
    const dbArgIdx = args.indexOf('--db');
    const musicArgIdx = args.indexOf('--music');
    
    const dbOverride = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;
    const musicOverride = musicArgIdx !== -1 ? args[musicArgIdx + 1] : null;

    const config = loadConfig();
    const dbPath = dbOverride || config.dbPath;
    const musicDir = path.resolve(musicOverride || config.musicDir).replace(/\\/g, '/');

    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database not found at: ${dbPath}`);
        console.log(`Usage: npx tsx src/tools/relink-tracks.ts --db /data/tunecamp.db --music /music`);
        process.exit(1);
    }

    if (!fs.existsSync(musicDir)) {
        console.error(`❌ Music directory not found at: ${musicDir}`);
        console.log(`Usage: npx tsx src/tools/relink-tracks.ts --db /data/tunecamp.db --music /music`);
        process.exit(1);
    }

    const db = new sqlite3(dbPath);
    console.log(`📂 Music Directory: ${musicDir}`);
    console.log(`🗄️  Database: ${dbPath}`);

    // 1. Index current files in DB
    const dbTracks = db.prepare("SELECT file_path FROM tracks").all() as { file_path: string }[];
    const knownPaths = new Set(dbTracks.map(t => t.file_path.toLowerCase()));
    
    console.log(`🔍 Current DB has ${knownPaths.size} tracks.`);

    // 2. Scan Disk
    console.log(`🔎 Scanning disk for audio files...`);
    const files = await glob("**/*.{mp3,flac,wav,m4a,ogg}", { cwd: musicDir, posix: true });
    console.log(`✨ Found ${files.length} audio files on disk.`);

    const missingFiles = files.filter(f => !knownPaths.has(f.toLowerCase()));
    console.log(`❓ Found ${missingFiles.length} files missing from database.`);

    if (missingFiles.length === 0) {
        console.log(`\n🎉 Your database is perfectly in sync with your files!`);
        db.close();
        return;
    }

    console.log(`\n🚀 Starting restoration of ${missingFiles.length} tracks...`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    // We need some helping data from DB
    const artistStmt = db.prepare("SELECT id FROM artists WHERE name = ?");
    const createArtistStmt = db.prepare("INSERT INTO artists (name, slug) VALUES (?, ?)");
    const createTrackStmt = db.prepare(`
        INSERT INTO tracks (
            title, album_id, artist_id, owner_id, track_num, duration, 
            file_path, format, bitrate, sample_rate, 
            price, price_usdc, currency, lossless_path, 
            waveform, url, service, external_artwork, hash
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    `);

    // Helper to get or create artist
    const getArtistId = (name: string): number => {
        const existing = artistStmt.get(name) as { id: number };
        if (existing) return existing.id;
        
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const info = createArtistStmt.run(name, slug || 'unknown');
        return info.lastInsertRowid as number;
    };

    for (const file of missingFiles) {
        const fullPath = path.join(musicDir, file);
        try {
            const metadata = await mm.parseFile(fullPath);
            const common = metadata.common;
            const format = metadata.format;
            const artistName = common.artist || "Unknown Artist";
            const artistId = getArtistId(artistName);

            const hash = await getFastFileHash(fullPath);

            createTrackStmt.run(
                common.title || path.basename(file, path.extname(file)),
                null, // No album link for now, server scan will fix it
                artistId,
                null,
                common.track.no || null,
                format.duration || null,
                file,
                format.codec || path.extname(file).substring(1),
                format.bitrate ? Math.round(format.bitrate / 1000) : null,
                format.sampleRate || null,
                0, // price
                0, // price_usdc
                'ETH', // currency
                null, // lossless_path
                null, // waveform
                null, // url
                null, // service
                null, // external_artwork
                hash
            );

            success++;
            if (success % 20 === 0) process.stdout.write('.');
        } catch (err) {
            console.error(`\n❌ Failed to index ${file}:`, err);
            failed++;
        }
    }

    console.log(`\n\n📊 Restoration Finished:`);
    console.log(`  Restored: ${success}`);
    console.log(`  Failed:   ${failed}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`\n✅ Database updated. Please restart your server to re-scan albums and cover art.`);

    db.close();
}

main().catch(err => {
    console.error(`\n💥 Fatal error:`, err);
    process.exit(1);
});
