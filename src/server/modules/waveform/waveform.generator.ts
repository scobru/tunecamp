import { max, min } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { area } from 'd3-shape';
import fs from 'fs-extra';
import WaveformData from 'waveform-data';
import { getDurationFromFfmpeg } from '../../ffmpeg.js';
import { WaveformPeakService } from '../../waveform.js';
import path from 'path';

// Simplified interface for Waveform
export class WaveformGenerator {

    async svg(filename: string, width: number = 2000): Promise<string> {
        const data = await this.json(filename);
        return this.buildSvg(data, width);
    }

    async json(filename: string): Promise<any> {
        const wf = await this.generateWaveform(filename);
        return wf.toJSON();
    }

    private async generateWaveform(filename: string): Promise<WaveformData> {
        if (!fs.existsSync(filename)) {
            throw new Error(`File not found: ${filename}`);
        }

        // 1. Get duration for proper scaling
        const duration = await getDurationFromFfmpeg(filename) || 180; // Fallback to 3 mins

        // 2. Generate peaks using our FFmpeg-based service
        // 2000 samples is plenty for both SVGs and fingerprints
        const samples = 2000;
        const peaks = await WaveformPeakService.generateWaveform(filename, samples, duration);

        // 3. Construct a WaveformData object that the rest of the app expects.
        // waveform-data expects min/max pairs. Since we use absolute peaks, min is 0.
        // We scale 0.0-1.0 to 0-127 (8-bit signed range for max)
        const data = new Int8Array(samples * 2);
        for (let i = 0; i < samples; i++) {
            const val = Math.floor(peaks[i] * 127);
            data[i * 2] = -val; // min
            data[i * 2 + 1] = val; // max
        }

        return WaveformData.create({
            version: 2,
            channels: 1,
            sample_rate: 44100,
            samples_per_pixel: Math.floor((duration * 44100) / samples),
            bits: 8,
            length: samples,
            data: Array.from(data)
        });
    }

    private buildSvg(data: any, w = 2000): string {
        const height = 100;
        const x = scaleLinear();
        const y = scaleLinear();
        const wfd = WaveformData.create(data);
        const channel = wfd.channel(0);
        const minArray = channel.min_array();
        const maxArray = channel.max_array();

        x.domain([0, wfd.length]).rangeRound([0, w]);
        // @ts-ignore
        y.domain([min(minArray), max(maxArray)]).rangeRound([0, height]);

        const waveArea = area<number>()
            .x((_a, index) => x(index))
            // @ts-ignore
            .y0((_b, index) => y(minArray[index]))
            // @ts-ignore
            .y1(c => y(c));

        const d = waveArea(maxArray) ?? '';

        // Return optimized SVG
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none">` +
            `<path fill="currentColor" d="${d}"/></svg>`;
    }
}
