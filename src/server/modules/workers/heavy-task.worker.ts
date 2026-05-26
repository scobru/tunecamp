/**
 * Heavy Task Worker — Runs CPU-intensive operations off the main thread.
 * 
 * Supports:
 * - parse-metadata: Parse audio file metadata (music-metadata)
 * - hash-file: SHA-256 hash of a file
 * - generate-waveform-peaks: Generate waveform peak data from audio
 */
import { parentPort, workerData } from 'worker_threads';
import { createHash } from 'crypto';
import fs from 'fs';

interface WorkerTask {
    type: 'parse-metadata' | 'hash-file';
    filePath: string;
}

async function run() {
    const task = workerData as WorkerTask;

    switch (task.type) {
        case 'parse-metadata': {
            // Dynamic import to avoid loading music-metadata in main thread
            const { parseFile } = await import('music-metadata');
            const metadata = await parseFile(task.filePath, { skipCovers: true });
            
            // Serialize only what we need (metadata objects can have circular refs)
            parentPort?.postMessage({
                success: true,
                data: {
                    format: metadata.format,
                    common: {
                        title: metadata.common.title,
                        artist: metadata.common.artist,
                        album: metadata.common.album,
                        albumartist: metadata.common.albumartist,
                        year: metadata.common.year,
                        track: metadata.common.track,
                        disk: metadata.common.disk,
                        genre: metadata.common.genre,
                        comment: metadata.common.comment,
                        composer: metadata.common.composer,
                        lyrics: metadata.common.lyrics,
                        date: metadata.common.date,
                        encodedby: metadata.common.encodedby,
                        bpm: metadata.common.bpm,
                        isrc: metadata.common.isrc,
                        barcode: metadata.common.barcode,
                        musicbrainz_trackid: metadata.common.musicbrainz_trackid,
                        musicbrainz_albumid: metadata.common.musicbrainz_albumid,
                        musicbrainz_artistid: metadata.common.musicbrainz_artistid,
                    }
                }
            });
            break;
        }

        case 'hash-file': {
            const hash = createHash('sha256');
            const stream = fs.createReadStream(task.filePath);
            
            for await (const chunk of stream) {
                hash.update(chunk);
            }
            
            parentPort?.postMessage({
                success: true,
                hash: hash.digest('hex')
            });
            break;
        }

        default:
            parentPort?.postMessage({
                success: false,
                error: `Unknown task type: ${(task as any).type}`
            });
    }
}

run().catch(err => {
    parentPort?.postMessage({
        success: false,
        error: err?.message || String(err)
    });
});
