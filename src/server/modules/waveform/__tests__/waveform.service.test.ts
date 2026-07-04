import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import path from 'path';

// Mock path for tests
const dataDir = '/tmp/data';
const cacheDir = path.join(dataDir, 'cache', 'waveforms');

// Create mock implementations
const mockEnsureDirSync = jest.fn();
const mockPathExists = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockSvg = jest.fn();

const mockFs = {
    ensureDirSync: mockEnsureDirSync,
    pathExists: mockPathExists,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
};

const mockWaveformGenerator = jest.fn().mockImplementation(() => ({
    svg: mockSvg
}));

// Apply mocks before importing target module
jest.unstable_mockModule('../../../../utils/fs.js', () => ({
    default: mockFs
}));

jest.unstable_mockModule('../waveform.generator.js', () => ({
    WaveformGenerator: mockWaveformGenerator
}));

// Import target module dynamically after mocking
const { WaveformService } = await import('../waveform.service.js');

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
