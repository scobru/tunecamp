import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../utils/fs.js', () => ({
    default: {
        existsSync: jest.fn()
    }
}));

jest.unstable_mockModule('../../media/ffmpeg.js', () => ({
    getDurationFromFfmpeg: jest.fn()
}));

jest.unstable_mockModule('../waveform-peak.service.js', () => ({
    WaveformPeakService: {
        generateWaveform: jest.fn()
    }
}));

const fsMock = await import('../../../../utils/fs.js');
const ffmpegMock = await import('../../media/ffmpeg.js');
const peakServiceMock = await import('../waveform-peak.service.js');
const { WaveformGenerator } = await import('../waveform.generator.js');

describe('WaveformGenerator', () => {
    let generator: any;

    beforeEach(() => {
        jest.clearAllMocks();
        generator = new WaveformGenerator();
    });

    it('should throw if file does not exist', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(false);

        await expect(generator.json('nonexistent.mp3')).rejects.toThrow('File not found: nonexistent.mp3');
        expect(fsMock.default.existsSync).toHaveBeenCalledWith('nonexistent.mp3');
    });

    it('should generate JSON waveform data successfully', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);
        (ffmpegMock.getDurationFromFfmpeg as jest.Mock).mockResolvedValue(100);

        // Mock 2000 samples for peaks
        const mockPeaks = new Array(2000).fill(0.5);
        (peakServiceMock.WaveformPeakService.generateWaveform as jest.Mock).mockResolvedValue(mockPeaks);

        const result = await generator.json('test.mp3');

        expect(fsMock.default.existsSync).toHaveBeenCalledWith('test.mp3');
        expect(ffmpegMock.getDurationFromFfmpeg).toHaveBeenCalledWith('test.mp3');
        expect(peakServiceMock.WaveformPeakService.generateWaveform).toHaveBeenCalledWith('test.mp3', 2000, 100);

        expect(result).toHaveProperty('version', 2);
        expect(result).toHaveProperty('channels', 1);
        expect(result).toHaveProperty('sample_rate', 44100);
        expect(result).toHaveProperty('samples_per_pixel');
        expect(result).toHaveProperty('bits', 8);
        expect(result).toHaveProperty('length', 2000);
        expect(result).toHaveProperty('data');
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(4000); // 2000 * 2 (min/max pairs)
    });

    it('should fallback to 180s duration if ffmpeg returns null', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);
        (ffmpegMock.getDurationFromFfmpeg as jest.Mock).mockResolvedValue(null);

        const mockPeaks = new Array(2000).fill(0.1);
        (peakServiceMock.WaveformPeakService.generateWaveform as jest.Mock).mockResolvedValue(mockPeaks);

        await generator.json('test2.mp3');

        expect(peakServiceMock.WaveformPeakService.generateWaveform).toHaveBeenCalledWith('test2.mp3', 2000, 180);
    });

    it('should generate an SVG waveform', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);
        (ffmpegMock.getDurationFromFfmpeg as jest.Mock).mockResolvedValue(60);

        const mockPeaks = new Array(2000).fill(0.8);
        (peakServiceMock.WaveformPeakService.generateWaveform as jest.Mock).mockResolvedValue(mockPeaks);

        const svg = await generator.svg('test3.mp3', 1000);

        expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('viewBox="0 0 1000 100"');
        expect(svg).toContain('<path fill="currentColor"');
    });
});
