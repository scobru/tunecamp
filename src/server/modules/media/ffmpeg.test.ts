import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fluent-ffmpeg
const mockFfmpegInstance: any = {
    outputOptions: jest.fn().mockReturnThis(),
    seekInput: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(((event: any, callback: any) => {
        if (event === 'end') {
            setTimeout(callback, 10);
        }
        return mockFfmpegInstance;
    }) as any),
};

const mockFfmpeg = jest.fn(() => mockFfmpegInstance);
// @ts-ignore
mockFfmpeg.setFfmpegPath = jest.fn();
// @ts-ignore
mockFfmpeg.setFfprobePath = jest.fn();
// @ts-ignore
mockFfmpeg.ffprobe = jest.fn();

jest.unstable_mockModule('fluent-ffmpeg', () => ({
    __esModule: true,
    default: mockFfmpeg,
}));

// Mock fs-extra
const mockFs = {
    move: jest.fn(),
    remove: jest.fn().mockImplementation(() => Promise.resolve()),
    existsSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1000 }),
};

jest.unstable_mockModule('fs-extra', () => ({
    __esModule: true,
    default: mockFs
}));

// @ts-ignore
const { writeMetadata, transcode } = await import('./ffmpeg.js');

describe('ffmpeg.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('writeMetadata', () => {
        it('should call ffmpeg with correct arguments for FLAC', async () => {
            const filePath = '/path/to/song.flac';
            const metadata = {
                title: 'Test Title',
                artist: 'Test Artist',
                album: 'Test Album',
                track: '1'
            };

            await writeMetadata(filePath, metadata);

            expect(mockFfmpeg).toHaveBeenCalledWith(filePath);

            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-c', 'copy');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-map_metadata', '0');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'title=Test Title');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'artist=Test Artist');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'album=Test Album');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'track=1');

            expect(mockFfmpegInstance.save).toHaveBeenCalled();
        });

        it('should handle partial metadata', async () => {
            const filePath = '/path/to/song.ogg';
            const metadata = {
                title: 'Just Title'
            };

            await writeMetadata(filePath, metadata);

            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'title=Just Title');

            const calls = mockFfmpegInstance.outputOptions.mock.calls;
            const artistCall = calls.find((call: any[]) => call[0] === '-metadata' && typeof call[1] === 'string' && call[1].startsWith('artist='));
            expect(artistCall).toBeUndefined();
        });
    });

    describe('transcode', () => {
        it('should transcode to mp3 by default', () => {
            const inputPath = '/path/to/input.flac';

            const result = transcode(inputPath);

            expect(mockFfmpeg).toHaveBeenCalledWith(inputPath);
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('mp3');
            expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('libmp3lame');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-map_metadata', '0');
            expect(result).toBe(mockFfmpegInstance);
        });

        it('should handle specific format: flac', () => {
            transcode('input.wav', 'flac');
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('flac');
            expect(mockFfmpegInstance.audioCodec).not.toHaveBeenCalled();
        });

        it('should handle specific format: ogg', () => {
            transcode('input.wav', 'ogg');
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('ogg');
            expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('libvorbis');
        });

        it('should handle specific format: wav', () => {
            transcode('input.flac', 'wav');
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('wav');
            expect(mockFfmpegInstance.audioCodec).not.toHaveBeenCalled();
        });

        it('should handle specific format: aac', () => {
            transcode('input.flac', 'aac');
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('adts');
            expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('aac');
        });

        it('should handle specific format: opus', () => {
            transcode('input.flac', 'opus');
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('opus');
            expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('libopus');
        });

        it('should handle seek if provided', () => {
            transcode('input.flac', 'mp3', undefined, 30);
            expect(mockFfmpegInstance.seekInput).toHaveBeenCalledWith(30);
        });

        it('should handle bitrate if provided', () => {
            transcode('input.flac', 'mp3', 320);
            expect(mockFfmpegInstance.audioBitrate).toHaveBeenCalledWith('320k');
        });

        it('should handle all parameters combined', () => {
            transcode('input.flac', 'ogg', 192, 45);
            expect(mockFfmpegInstance.seekInput).toHaveBeenCalledWith(45);
            expect(mockFfmpegInstance.toFormat).toHaveBeenCalledWith('ogg');
            expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('libvorbis');
            expect(mockFfmpegInstance.audioBitrate).toHaveBeenCalledWith('192k');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-map_metadata', '0');
        });
    });
});
