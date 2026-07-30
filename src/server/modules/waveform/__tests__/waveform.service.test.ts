import { describe, test, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import path from 'path';
import fsExtra from 'fs-extra';

// Mock path for tests
const dataDir = '/tmp/data';
const cacheDir = path.join(dataDir, 'cache', 'waveforms');

// Spy on real fs-extra methods (module object is shared/mutable across imports)
const mockEnsureDirSync = jest.spyOn(fsExtra, 'ensureDirSync').mockImplementation(() => {});
const mockPathExists = jest.spyOn(fsExtra, 'pathExists').mockImplementation(async () => false);
const mockReadFile = jest.spyOn(fsExtra, 'readFile').mockImplementation(async () => '' as any);
const mockWriteFile = jest.spyOn(fsExtra, 'writeFile').mockImplementation(async () => undefined as any);
const mockSvg = jest.fn();

const mockWaveformGenerator = jest.fn().mockImplementation(() => ({
    svg: mockSvg
}));

// Apply mocks before importing target module
jest.unstable_mockModule('../waveform.generator.js', () => ({
    WaveformGenerator: mockWaveformGenerator
}));

// Import target module dynamically after mocking
let WaveformService: any;
beforeAll(async () => {
    ({ WaveformService } = await import('../waveform.service.js'));
});

describe('WaveformService', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // Set up default behavior
        mockSvg.mockResolvedValue('<svg>mock</svg>' as never);
        mockPathExists.mockResolvedValue(false as never);

        service = new WaveformService(dataDir);
    });

    test('constructor should create cache directory', () => {
        expect(mockEnsureDirSync).toHaveBeenCalledWith(cacheDir);
        expect(mockWaveformGenerator).toHaveBeenCalled();
    });

    test('getWaveformSVG should return cached SVG if it exists', async () => {
        const trackId = 123;
        const filePath = '/tmp/audio.mp3';
        const expectedCachePath = path.join(cacheDir, `${trackId}.svg`);
        const cachedSvg = '<svg>cached</svg>';

        mockPathExists.mockResolvedValueOnce(true as never);
        mockReadFile.mockResolvedValueOnce(cachedSvg as never);

        const result = await service.getWaveformSVG(trackId, filePath);

        expect(mockPathExists).toHaveBeenCalledWith(expectedCachePath);
        expect(mockReadFile).toHaveBeenCalledWith(expectedCachePath, 'utf8');
        expect(mockSvg).not.toHaveBeenCalled();
        expect(result).toBe(cachedSvg);
    });

    test('getWaveformSVG should generate and cache SVG if it does not exist', async () => {
        const trackId = 456;
        const filePath = '/tmp/audio2.mp3';
        const expectedCachePath = path.join(cacheDir, `${trackId}.svg`);
        const generatedSvg = '<svg>generated</svg>';

        mockPathExists.mockResolvedValueOnce(false as never);
        mockSvg.mockResolvedValueOnce(generatedSvg as never);

        const result = await service.getWaveformSVG(trackId, filePath);

        expect(mockPathExists).toHaveBeenCalledWith(expectedCachePath);
        expect(mockSvg).toHaveBeenCalledWith(filePath, 4000);
        expect(mockWriteFile).toHaveBeenCalledWith(expectedCachePath, generatedSvg);
        expect(result).toBe(generatedSvg);
    });

    test('getWaveformSVG should throw error if generation fails', async () => {
        const trackId = 789;
        const filePath = '/tmp/audio3.mp3';
        const error = new Error('Generation failed');

        // Suppress console.error for this test to keep output clean
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockPathExists.mockResolvedValueOnce(false as never);
        mockSvg.mockRejectedValueOnce(error as never);

        await expect(service.getWaveformSVG(trackId, filePath)).rejects.toThrow(error);
        expect(consoleSpy).toHaveBeenCalledWith(`Failed to generate waveform for ${trackId}:`, error);

        consoleSpy.mockRestore();
    });
});
