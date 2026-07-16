import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

const mockStream = new EventEmitter() as any;
mockStream.destroy = jest.fn();

const mockCommand = {
    audioFrequency: jest.fn().mockReturnThis(),
    audioChannels: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnValue(mockStream),
    kill: jest.fn()
};

const mockFfmpeg = jest.fn(() => mockCommand) as any;
mockFfmpeg.setFfmpegPath = jest.fn();

jest.unstable_mockModule('fluent-ffmpeg', () => ({
    default: mockFfmpeg
}));

jest.unstable_mockModule('ffmpeg-static', () => ({
    default: '/path/to/ffmpeg'
}));

jest.unstable_mockModule('fs-extra', () => ({
    default: {
        existsSync: jest.fn()
    }
}));

jest.unstable_mockModule('../../media/ffmpeg.js', () => ({
    acquireTaskSlot: jest.fn().mockResolvedValue(undefined),
    releaseTaskSlot: jest.fn()
}));

const fsMock = await import('fs-extra');
const ffmpegMediaMock = await import('../../media/ffmpeg.js');
const { WaveformPeakService } = await import('../waveform-peak.service.js');

describe('WaveformPeakService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStream.removeAllListeners();
        // Reset destroy to default behavior
        mockStream.destroy = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should throw if file does not exist', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(false);

        await expect(WaveformPeakService.generateWaveform('nonexistent.mp3')).rejects.toThrow('File not found: nonexistent.mp3');
        expect(fsMock.default.existsSync).toHaveBeenCalledWith('nonexistent.mp3');
        expect(ffmpegMediaMock.acquireTaskSlot).toHaveBeenCalled();
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should resolve empty array on ffmpeg error', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        const generatePromise = WaveformPeakService.generateWaveform('error.mp3', 10);

        // Wait a tick for promise to set up listeners
        await new Promise(resolve => process.nextTick(resolve));

        mockStream.emit('error', new Error('ffmpeg failed'));

        const result = await generatePromise;
        expect(result).toEqual(new Array(10).fill(0));
        expect(mockCommand.kill).toHaveBeenCalledWith('SIGKILL');
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should parse pcm stream correctly', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        const generatePromise = WaveformPeakService.generateWaveform('valid.mp3', 2, 1);

        await new Promise(resolve => process.nextTick(resolve));

        const buffer = Buffer.alloc(4);
        buffer.writeInt16LE(16384, 0); // half max volume
        buffer.writeInt16LE(8192, 2); // quarter max volume

        mockStream.emit('data', buffer);
        mockStream.emit('end');

        const result = await generatePromise;

        expect(result).toHaveLength(2);
        expect(result[0]).toBe(0.5);
        expect(result[1]).toBe(0);
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should handle partial chunks correctly', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        const generatePromise = WaveformPeakService.generateWaveform('partial.mp3', 2, 1);

        await new Promise(resolve => process.nextTick(resolve));

        const buffer1 = Buffer.alloc(3);
        buffer1.writeInt16LE(16384, 0);
        buffer1.writeUInt8(0, 2);

        const buffer2 = Buffer.alloc(1);
        buffer2.writeUInt8(64, 0);

        mockStream.emit('data', buffer1);
        mockStream.emit('data', buffer2);
        mockStream.emit('end');

        const result = await generatePromise;

        expect(result).toHaveLength(2);
        expect(result[0]).toBe(0.5);
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should terminate stream if it exceeds size limit', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        const generatePromise = WaveformPeakService.generateWaveform('large.mp3', 10);

        await new Promise(resolve => process.nextTick(resolve));

        mockStream.destroy = jest.fn(() => {
            mockStream.emit('end'); // Simulate end event for the test to resolve, or else it hangs
        });

        // Let's console spy to catch the warning
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const hugeBuffer = Buffer.alloc(100 * 1024 * 1024 + 1);
        mockStream.emit('data', hugeBuffer);

        const result = await generatePromise;
        expect(mockStream.destroy).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Track too large, truncating'));
        expect(result).toHaveLength(10);
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    it('should calculate bucketSize based on default fallback if size is 0 and no duration provided', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        // Call with only inputPath to trigger bucketSize=0 path with no duration
        const generatePromise = WaveformPeakService.generateWaveform('valid.mp3', 100);

        await new Promise(resolve => process.nextTick(resolve));

        const buffer = Buffer.alloc(4);
        buffer.writeInt16LE(16384, 0);
        buffer.writeInt16LE(8192, 2);

        mockStream.emit('data', buffer);
        mockStream.emit('end');

        const result = await generatePromise;
        expect(result).toHaveLength(100);
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should silently catch error if command.kill throws during error handling', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);
        mockCommand.kill.mockImplementationOnce(() => { throw new Error('kill failed'); });

        const generatePromise = WaveformPeakService.generateWaveform('error.mp3', 10);
        await new Promise(resolve => process.nextTick(resolve));

        mockStream.emit('error', new Error('ffmpeg failed'));

        const result = await generatePromise;
        expect(result).toEqual(new Array(10).fill(0));
        expect(mockCommand.kill).toHaveBeenCalledWith('SIGKILL');
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should cap at last bucket if samples exceed expected duration', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        const generatePromise = WaveformPeakService.generateWaveform('overflow.mp3', 1, 1);
        await new Promise(resolve => process.nextTick(resolve));

        const buffer = Buffer.alloc(8004); // 4002 samples
        buffer.writeInt16LE(16384, 8000); // Set value at index 4000 (overflow bucket)

        mockStream.emit('data', buffer);
        mockStream.emit('end');

        const result = await generatePromise;

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(0.5);
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });

    it('should wait for next chunk if data.length < 2', async () => {
        (fsMock.default.existsSync as jest.Mock).mockReturnValue(true);

        const generatePromise = WaveformPeakService.generateWaveform('short_chunk.mp3', 2, 1);
        await new Promise(resolve => process.nextTick(resolve));

        const buffer1 = Buffer.alloc(1);
        buffer1.writeUInt8(64, 0); // Just 1 byte

        const buffer2 = Buffer.alloc(1);
        buffer2.writeUInt8(0, 0); // Second byte

        mockStream.emit('data', buffer1);
        mockStream.emit('data', buffer2);
        mockStream.emit('end');

        const result = await generatePromise;

        expect(result).toHaveLength(2);
        expect(ffmpegMediaMock.releaseTaskSlot).toHaveBeenCalled();
    });
});
