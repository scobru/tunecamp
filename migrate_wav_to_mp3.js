/**
 * Migration Script: Convert WAV files to MP3
 * 
 * This script finds all WAV tracks in the database, converts them to MP3,
 * updates the database with new paths, and optionally deletes the original WAV files.
 * 
 * Usage: node migrate_wav_to_mp3.js [--delete-originals]
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const { execSync, spawn } = require('child_process');

// Configuration
const DB_PATH = path.join(__dirname, 'music/tunecamp.db');
const BITRATE = '320k'; // High quality MP3
const DELETE_ORIGINALS = process.argv.includes('--delete-originals');

async function main() {
    console.log('🎵 WAV to MP3 Migration Script');
    console.log('================================');
    console.log(`Database: ${DB_PATH}`);
    console.log(`Bitrate: ${BITRATE}`);
    console.log(`Delete originals: ${DELETE_ORIGINALS}`);
    console.log('');

    // Check if ffmpeg is available
    try {
        execSync('ffmpeg -version', { stdio: 'pipe' });
        console.log('✅ ffmpeg found');
    } catch (e) {
        console.error('❌ ffmpeg not found. Please install ffmpeg first.');
        process.exit(1);
    }

    // Open database
    if (!fs.existsSync(DB_PATH)) {
        console.error(`❌ Database not found: ${DB_PATH}`);
        process.exit(1);
    }

    const db = new Database(DB_PATH);

    // Find all WAV tracks
    const wavTracks = db.prepare(`
        SELECT id, file_path, title, artist_id, album_id, duration, waveform
        FROM tracks
        WHERE LOWER(file_path) LIKE '%.wav'
    `).all();

    console.log(`📁 Found ${wavTracks.length} WAV track(s) to convert`);
    console.log('');

    if (wavTracks.length === 0) {
        console.log('Nothing to do. Exiting.');
        db.close();
        return;
    }

    let converted = 0;
    let failed = 0;

    for (const track of wavTracks) {
        const wavPath = track.file_path;
        const mp3Path = wavPath.replace(/\.wav$/i, '.mp3');

        console.log(`🔄 Converting: ${path.basename(wavPath)}`);

        // Check if source exists
        if (!fs.existsSync(wavPath)) {
            console.log(`   ⚠️  Source file not found, skipping`);
            failed++;
            continue;
        }

        // Check if MP3 already exists
        if (fs.existsSync(mp3Path)) {
            console.log(`   ⚠️  MP3 already exists, updating database only`);
        } else {
            // Convert using ffmpeg
            try {
                await convertToMp3(wavPath, mp3Path, BITRATE);
                console.log(`   ✅ Converted to: ${path.basename(mp3Path)}`);
            } catch (err) {
                console.log(`   ❌ Conversion failed: ${err.message}`);
                failed++;
                continue;
            }
        }

        // Update database
        try {
            db.prepare(`
                UPDATE tracks SET file_path = ?, format = 'mp3'
                WHERE id = ?
            `).run(mp3Path, track.id);
            console.log(`   📝 Database updated`);
        } catch (err) {
            console.log(`   ❌ Database update failed: ${err.message}`);
            failed++;
            continue;
        }

        // Delete original if requested
        if (DELETE_ORIGINALS && fs.existsSync(wavPath)) {
            try {
                fs.removeSync(wavPath);
                console.log(`   🗑️  Original WAV deleted`);
            } catch (err) {
                console.log(`   ⚠️  Could not delete original: ${err.message}`);
            }
        }

        converted++;
    }

    console.log('');
    console.log('================================');
    console.log(`✅ Converted: ${converted}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('');

    db.close();
    console.log('Done!');
}

function convertToMp3(inputPath, outputPath, bitrate) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputPath,
            '-acodec', 'libmp3lame',
            '-ab', bitrate,
            '-y', // Overwrite output
            outputPath
        ];

        const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}

main().catch(console.error);
