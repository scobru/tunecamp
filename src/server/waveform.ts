import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs-extra";
// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
export class WaveformPeakService {
    /**
     * Generates a waveform data array from an audio file.
     * Returns an array of numbers representing audio peaks.
     * @param inputPath Path to the audio file
     * @param samples Number of samples to generate (default 100)
     */
    /**
     * Generates a waveform data array from an audio file using streaming.
     * Returns an array of numbers representing audio peaks.
     * @param inputPath Path to the audio file
     * @param samples Number of samples to generate (default 100)
     * @param duration Optional duration in seconds for better precision
     */
    static async generateWaveform(inputPath: string, samples = 100, duration?: number): Promise<number[]> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(inputPath)) {
                return reject(new Error(`File not found: ${inputPath}`));
            }
            // We'll calculate peaks by dividing the stream into 'samples' number of buckets.
            const peaks = new Array(samples).fill(0);
            // Configuration for raw PCM extraction
            const sampleRate = 4000;
            const command = ffmpeg(inputPath)
                .audioFrequency(sampleRate)
                .audioChannels(1)
                .format('s16le'); // Signed 16-bit Little Endian PCM

            const stream = command.pipe() as any;
            // If we have duration, we can calculate the exact bucket size
            // totalSamples = duration * sampleRate
            // bucketSize = totalSamples / samples
            let bucketSize = duration ? Math.max(1, Math.floor((duration * sampleRate) / samples)) : 0;
            let totalProcessedSamples = 0;
            let bytesRead = 0;
            const MAX_PCM_TOTAL = 100 * 1024 * 1024; // 100MB safety limit (~3.5 hours of 4kHz mono)

            // Buffer for partial samples (int16 is 2 bytes)
            let remaining: Buffer | null = null;
            stream.on('data', (chunk: Buffer) => {
                bytesRead += chunk.length;
                if (bytesRead > MAX_PCM_TOTAL) {
                    console.warn(`[Waveform] Track too large, truncating: ${inputPath}`);
                    stream.destroy();
                    // Return what we have so far instead of hanging. We'll normalize it at the end.
                    return;
                }
                let data = chunk;
                if (remaining) {
                    data = Buffer.concat([remaining, chunk]);
                    remaining = null;
                }
                // If we don't have enough for a single sample, wait for next chunk
                if (data.length < 2) {
                    remaining = data;
                    return;
                }
                // Check for trailing byte
                if (data.length % 2 !== 0) {
                    remaining = Buffer.from(data.subarray(data.length - 1));
                    data = data.subarray(0, data.length - 1);
                }
                if (bucketSize === 0) {
                    const estimatedDuration = 300; // 5 mins fallback
                    bucketSize = Math.max(1, Math.floor((estimatedDuration * sampleRate) / samples));
                }
                // Optimization: Keep track of current bucket and how many samples processed in it
                let bucketIndex = Math.floor(totalProcessedSamples / bucketSize);
                for (let i = 0; i < data.length; i += 2) {
                    const val = Math.abs(data.readInt16LE(i));
                    // We store raw 16-bit values and normalize at the very end
                    const currentBucket = Math.floor(totalProcessedSamples / bucketSize);
                    if (currentBucket < samples) {
                        if (val > peaks[currentBucket]) {
                            peaks[currentBucket] = val;
                        }
                    }
                    else if (duration) {
                        // Cap at last bucket
                        if (val > peaks[samples - 1]) {
                            peaks[samples - 1] = val;
                        }
                    }
                    totalProcessedSamples++;
                }
            });
            stream.on('end', () => {
                // Final Pass: Normalize 16-bit values to 0.0 - 1.0 range with 4 decimal precision
                const normalizedPeaks = peaks.map(val => parseFloat((val / 32768).toFixed(4)));
                resolve(normalizedPeaks);
            });
            stream.on('error', (err: Error) => {
                console.error("FFmpeg error during waveform streaming:", err);
                try {
                    command.kill('SIGKILL');
                }
                catch (e) { }
                // Return empty peaks rather than crashing
                resolve(new Array(samples).fill(0));
            });
        });
    }
}
