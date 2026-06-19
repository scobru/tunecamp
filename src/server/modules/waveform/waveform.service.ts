import path from 'path';
import fs from 'fs-extra';
import { WaveformGenerator } from './waveform.generator.js';

export class WaveformService {
    private cacheDir: string;
    private generator: WaveformGenerator;

    constructor(dataDir: string) {
        this.cacheDir = path.join(dataDir, 'cache', 'waveforms');
        this.generator = new WaveformGenerator();
        fs.ensureDirSync(this.cacheDir);
    }

    async getWaveformSVG(trackId: number, filePath: string): Promise<string> {
        const cacheFile = path.join(this.cacheDir, `${trackId}.svg`);

        // Check cache first
        if (await fs.pathExists(cacheFile)) {
            // Optional: Check if cache is older than file? 
            // For now assume immutable unless explicitly cleared.
            return fs.readFile(cacheFile, 'utf8');
        }

        // Generate
        try {
            const svg = await this.generator.svg(filePath, 4000); // High res width

            // Save to cache
            await fs.writeFile(cacheFile, svg);
            return svg;
        } catch (error) {
            console.error(`Failed to generate waveform for ${trackId}:`, error);
            throw error;
        }
    }

    /**
     * Returns the track's waveform as a flat array of normalized peaks (0..1),
     * one per pixel-column, cached as JSON. This is what visual editors (e.g.
     * the DJ transition editor) need: the SVG endpoint only yields a vector
     * shape, not the underlying amplitudes.
     */
    async getWaveformPeaks(trackId: number, filePath: string): Promise<number[]> {
        const cacheFile = path.join(this.cacheDir, `${trackId}.peaks.json`);

        if (await fs.pathExists(cacheFile)) {
            try {
                const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
                if (Array.isArray(cached) && cached.length > 0) return cached;
            } catch {
                /* corrupt cache — regenerate below */
            }
        }

        // The generator emits waveform-data JSON with interleaved [min, max]
        // int8 pairs (-127..127). We keep the absolute peak per column.
        const wf = await this.generator.json(filePath);
        const length: number = wf.length || 0;
        const data: number[] = Array.isArray(wf.data) ? wf.data : [];
        const peaks = new Array<number>(length);
        for (let i = 0; i < length; i++) {
            const maxVal = data[i * 2 + 1] ?? 0;
            peaks[i] = Math.min(1, Math.abs(maxVal) / 127);
        }

        try {
            await fs.writeFile(cacheFile, JSON.stringify(peaks));
        } catch (e) {
            console.error(`Failed to cache waveform peaks for ${trackId}:`, e);
        }
        return peaks;
    }
}
