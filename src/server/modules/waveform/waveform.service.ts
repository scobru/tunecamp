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
}
