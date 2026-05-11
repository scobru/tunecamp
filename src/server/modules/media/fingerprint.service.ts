import WaveformData from 'waveform-data';
import fs from 'fs-extra';
import { WaveformGenerator } from '../waveform/waveform.generator.js';

export interface FingerprintData {
    fingerprint: string;
    duration: number;
}

export class FingerprintService {
    private generator: WaveformGenerator;

    constructor() {
        this.generator = new WaveformGenerator();
    }

    /**
     * Generates a perceptual fingerprint based on the audio envelope (waveform).
     * This is robust to transcoding and slight volume changes.
     */
    async generate(filePath: string): Promise<FingerprintData> {
        try {
            // 1. Generate full waveform data
            const json = await this.generator.json(filePath);
            const wfd = WaveformData.create(json);
            
            const channel = wfd.channel(0);
            const maxArray = channel.max_array();
            const duration = wfd.duration;

            // 2. Normalize to a fixed number of buckets (e.g. 512)
            const buckets = 512;
            const fingerprint = this.normalizeEnvelope(maxArray, buckets);

            return {
                fingerprint,
                duration
            };
        } catch (error) {
            console.error(`[FingerprintService] Failed to generate fingerprint for ${filePath}:`, error);
            throw error;
        }
    }

    private normalizeEnvelope(data: Int8Array | number[], targetLength: number): string {
        const result = new Uint8Array(targetLength);
        const factor = data.length / targetLength;

        // Find global max for normalization
        let globalMax = 0;
        for (let i = 0; i < data.length; i++) {
            const val = Math.abs(data[i]);
            if (val > globalMax) globalMax = val;
        }

        if (globalMax === 0) globalMax = 1;

        for (let i = 0; i < targetLength; i++) {
            const start = Math.floor(i * factor);
            const end = Math.floor((i + 1) * factor);
            
            let sum = 0;
            let count = 0;
            for (let j = start; j < end && j < data.length; j++) {
                sum += Math.abs(data[j]);
                count++;
            }
            
            const avg = count > 0 ? sum / count : 0;
            // Normalize to 0-255
            result[i] = Math.min(255, Math.floor((avg / globalMax) * 255));
        }

        // Convert to hex string for easy storage and comparison
        return Buffer.from(result).toString('hex');
    }

    /**
     * Compares two fingerprints and returns a similarity score (0 to 1).
     */
    compare(fp1: string, fp2: string): number {
        if (!fp1 || !fp2 || fp1.length !== fp2.length) return 0;

        const b1 = Buffer.from(fp1, 'hex');
        const b2 = Buffer.from(fp2, 'hex');

        let diff = 0;
        for (let i = 0; i < b1.length; i++) {
            diff += Math.abs(b1[i] - b2[i]);
        }

        // Max possible diff is length * 255
        const maxDiff = b1.length * 255;
        return 1 - (diff / maxDiff);
    }
}
