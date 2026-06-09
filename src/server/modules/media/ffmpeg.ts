import path from "path";
import fs from "fs-extra";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import os from "os";

// Set ffmpeg path
// Logic: Try ffmpeg-static first, then check common system paths (helpful for Docker/Alpine)
let finalFfmpegPath = ffmpegPath;
let finalFfprobePath = ffprobePath?.path || null;

// Validation function
const isValidPath = (p: string | null) => p && fs.existsSync(p);

if (!isValidPath(finalFfmpegPath)) {
    // Fallback for Alpine/Docker system path
    const fallbacks = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg', // macOS
        'C:\\ffmpeg\\bin\\ffmpeg.exe' // Windows manual install
    ];
    for (const f of fallbacks) {
        if (isValidPath(f)) {
            finalFfmpegPath = f;
            break;
        }
    }
}

// Set global environment variable for other modules (like play-dl / ytdl-core fallbacks)
if (finalFfmpegPath) {
    process.env.FFMPEG_PATH = finalFfmpegPath;
}

if (!isValidPath(finalFfprobePath)) {
    const fallbacks = [
        '/usr/bin/ffprobe',
        '/usr/local/bin/ffprobe',
        '/opt/homebrew/bin/ffprobe'
    ];
    for (const f of fallbacks) {
        if (isValidPath(f)) {
            finalFfprobePath = f;
            break;
        }
    }
}

if (finalFfmpegPath) {
    console.log(`🚀 [FFmpeg] Path set to: ${finalFfmpegPath}`);
    ffmpeg.setFfmpegPath(finalFfmpegPath);
} else {
    console.warn("⚠️ [FFmpeg] COULD NOT FIND FFMPEG EXECUTABLE! Conversion and waveforms will fail.");
}

if (finalFfprobePath) {
    ffmpeg.setFfprobePath(finalFfprobePath);
}

// FFmpeg Concurrency Control - Dynamic based on CPU cores
const cpuCount = os.cpus().length;
const MAX_CONCURRENT_TASKS = Math.min(Math.max(cpuCount - 1, 2), 4);
console.log(`🚀 [FFmpeg] Concurrency limit set to ${MAX_CONCURRENT_TASKS} (Cores: ${cpuCount})`);
let activeTasks = 0;
const taskQueue: (() => void)[] = [];

// Live (latency-sensitive) transcodes are bursty and back-pressured by a slow
// client, so they don't fit the CPU-bound `acquireTaskSlot` queue. We cap their
// COUNT instead to stop a flood of requests (e.g. rapid timeline seeks) from
// spawning unbounded ffmpeg processes that saturate every core and stall the
// Node event loop — the failure mode that turns into gateway 504s.
const MAX_LIVE_TRANSCODES = Math.max(
    Number(process.env.TUNECAMP_MAX_LIVE_TRANSCODES) || MAX_CONCURRENT_TASKS * 8,
    MAX_CONCURRENT_TASKS
);
let activeLiveTranscodes = 0;

export async function acquireTaskSlot(): Promise<void> {
    if (activeTasks < MAX_CONCURRENT_TASKS) {
        activeTasks++;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        taskQueue.push(resolve);
    });
}

export function releaseTaskSlot(): void {
    activeTasks--;
    if (taskQueue.length > 0) {
        const nextTask = taskQueue.shift();
        if (nextTask) {
            activeTasks++;
            nextTask();
        }
    }
}

/**
 * Non-blocking admission control for live transcodes. Returns false immediately
 * when the live-transcode ceiling is reached so the caller can shed load (503)
 * rather than queue or spawn an unbounded ffmpeg process.
 */
export function tryAcquireLiveSlot(): boolean {
    if (activeLiveTranscodes >= MAX_LIVE_TRANSCODES) return false;
    activeLiveTranscodes++;
    return true;
}

export function releaseLiveSlot(): void {
    if (activeLiveTranscodes > 0) activeLiveTranscodes--;
}

/**
 * Get duration of an audio file using ffprobe
 * Returns the path to the new MP3 file
 */
export async function getDurationFromFfmpeg(filePath: string): Promise<number | null> {
    // ffprobe is fast, usually doesn't need strict queueing but we include it for safety
    await acquireTaskSlot();
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            releaseTaskSlot();
            if (err) {
                console.warn(`    [FFmpeg] ffprobe failed for ${path.basename(filePath)}: ${err.message}`);
                resolve(null);
            } else {
                const duration = metadata.format.duration;
                resolve(duration ? parseFloat(duration as any) : null);
            }
        });
    });
}

/**
 * Convert a Lossless file (WAV/FLAC) to MP3 using ffmpeg
 * Returns the path to the new MP3 file
 */
export async function convertWavToMp3(inputPath: string, bitrate: string = '320k'): Promise<string> {
    await acquireTaskSlot();
    return new Promise((resolve, reject) => {
        // Safe extension replacement
        const parse = path.parse(inputPath);
        const mp3Path = path.join(parse.dir, `${parse.name}.mp3`);

        if (mp3Path === inputPath) {
             releaseTaskSlot();
             return reject(new Error("Output path same as input path (not a supported lossless extension?)"));
        }

        const startTime = Date.now();
        const startSize = fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 0;
        console.log(`    [FFmpeg] Converting to MP3: ${path.basename(inputPath)} (${(startSize / 1024 / 1024).toFixed(2)} MB)`);

        ffmpeg(inputPath)
            .audioBitrate(bitrate)
            .audioCodec('libmp3lame')
            .format('mp3')
            .outputOptions('-map_metadata', '0', '-id3v2_version', '3')
            .on('end', () => {
                releaseTaskSlot();
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`    [FFmpeg] Converted to: ${path.basename(mp3Path)} in ${duration}s`);
                resolve(mp3Path);
            })
            .on('error', (err) => {
                releaseTaskSlot();
                console.error(`    [FFmpeg] Conversion failed: ${err.message}`);
                reject(err);
            })
            .save(mp3Path);
    });
}

/**
 * Transcode an audio file on-the-fly to a specific format and bitrate
 * Returns a readable stream
 * NOTE: Live transcoding bypasses the queue to ensure immediate playback
 */
export function transcode(inputPath: string, format: string = 'mp3', bitrate?: number, seek?: number): any {
    const command = ffmpeg(inputPath);

    if (seek) {
        command.seekInput(seek);
    }

    if (format === 'mp3') {
        command.toFormat('mp3').audioCodec('libmp3lame');
    } else if (format === 'flac') {
        command.toFormat('flac');
    } else if (format === 'ogg') {
        command.toFormat('ogg').audioCodec('libvorbis');
    } else if (format === 'wav') {
        command.toFormat('wav');
    } else if (format === 'aac') {
        command.toFormat('adts').audioCodec('aac');
    } else if (format === 'opus') {
        command.toFormat('opus').audioCodec('libopus');
    }

    if (bitrate) {
        command.audioBitrate(`${bitrate}k`);
    }

    // Optimization: for Subsonic streaming, we want it to be fast and streamable
    command.outputOptions('-map_metadata', '0');

    return command;
}

/**
 * Transcode an audio file to a destination file on disk.
 * Unlike live `transcode()`, this respects the concurrency queue (it is a full
 * encode, not a latency-sensitive live stream) and is used to populate the
 * transcode cache so subsequent requests can be served as plain file reads.
 */
export async function transcodeToFile(inputPath: string, outputPath: string, format: string = 'mp3', bitrate?: number): Promise<void> {
    // Hard ceiling so a stuck/zombie ffmpeg can never hold a concurrency slot
    // forever — that would permanently starve the queue after a few hangs.
    const timeoutMs = Number(process.env.TUNECAMP_TRANSCODE_TIMEOUT_MS) || 5 * 60_000;

    await acquireTaskSlot();
    return new Promise<void>((resolve, reject) => {
        const command = transcode(inputPath, format, bitrate);
        let settled = false;
        const finish = (err?: any) => {
            if (settled) return;          // guarantee the slot is released exactly once
            settled = true;
            clearTimeout(timer);
            releaseTaskSlot();
            if (err) reject(err); else resolve();
        };
        const timer = setTimeout(() => {
            try { command.kill('SIGKILL'); } catch { /* already gone */ }
            finish(new Error(`Transcode timed out after ${timeoutMs}ms: ${inputPath}`));
        }, timeoutMs);

        command
            .on('end', () => finish())
            .on('error', (err: any) => finish(err))
            .save(outputPath);
    });
}

/**
 * Update metadata for audio files (FLAC, OGG, M4A, etc.) using ffmpeg
 * Copies audio stream without re-encoding
 */
export async function writeMetadata(filePath: string, metadata: { title?: string, artist?: string, album?: string, track?: string, genre?: string, year?: string | number }): Promise<void> {
    await acquireTaskSlot();
    return new Promise((resolve, reject) => {
        const ext = path.extname(filePath);
        // Create a temp file path next to original
        const tempPath = path.join(path.dirname(filePath), `${path.basename(filePath, ext)}.temp${ext}`);

        const command = ffmpeg(filePath)
            .outputOptions('-c', 'copy') // Copy streams (no re-encode)
            .outputOptions('-map_metadata', '0'); // Copy existing metadata

        // Set new metadata
        if (metadata.title) command.outputOptions('-metadata', `title=${metadata.title}`);
        if (metadata.artist) command.outputOptions('-metadata', `artist=${metadata.artist}`);
        if (metadata.album) command.outputOptions('-metadata', `album=${metadata.album}`);
        if (metadata.track) command.outputOptions('-metadata', `track=${metadata.track}`);
        if (metadata.genre) command.outputOptions('-metadata', `genre=${metadata.genre}`);
        if (metadata.year) command.outputOptions('-metadata', `date=${metadata.year}`);

        command
            .save(tempPath)
            .on('end', async () => {
                releaseTaskSlot();
                try {
                    await fs.move(tempPath, filePath, { overwrite: true });
                    resolve();
                } catch (e) {
                    await fs.remove(tempPath).catch(() => {});
                    reject(e);
                }
            })
            .on('error', (err) => {
                releaseTaskSlot();
                fs.remove(tempPath).catch(() => {});
                console.error(`    [FFmpeg] Metadata update failed for ${path.basename(filePath)}: ${err.message}`);
                reject(err);
            });
    });
}
