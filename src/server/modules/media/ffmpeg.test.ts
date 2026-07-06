import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockFfmpegInstance } from '../../../../__mocks__/fluent-ffmpeg.js';
import mockFfmpeg from '../../../../__mocks__/fluent-ffmpeg.js';
import fsExtra from 'fs-extra';
import { writeMetadata, transcode, tryAcquireLiveSlot, releaseLiveSlot } from './ffmpeg.js';

jest.spyOn(fsExtra, 'move' as any).mockResolvedValue(undefined as any);
jest.spyOn(fsExtra, 'remove' as any).mockResolvedValue(undefined as any);
jest.spyOn(fsExtra, 'existsSync' as any).mockReturnValue(true as any);
jest.spyOn(fsExtra, 'statSync' as any).mockReturnValue({ size: 1000 } as any);

describe('ffmpeg.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFfmpegInstance.on.mockImplementation(function(event: any, callback: any) {
            if (event === 'end') {
                setTimeout(callback, 10);
            }
            return mockFfmpegInstance;
        });
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

    describe('Live Slots Admission Control', () => {
        beforeEach(() => {
            // Ensure slots are completely empty before each test
            for (let i = 0; i < 100; i++) {
                releaseLiveSlot();
            }
        });

        it('should acquire a slot successfully when available', () => {
            expect(tryAcquireLiveSlot()).toBe(true);
            releaseLiveSlot(); // Cleanup
        });

        it('should return false when max slots are reached', () => {
            let acquiredCount = 0;
            // Exhaust all available slots
            while (tryAcquireLiveSlot()) {
                acquiredCount++;
                if (acquiredCount > 1000) {
                    throw new Error('Infinite loop detected or MAX_LIVE_TRANSCODES is too high');
                }
            }

            expect(acquiredCount).toBeGreaterThan(0);

            // Should be false now
            expect(tryAcquireLiveSlot()).toBe(false);
        });

        it('should allow acquiring again after releasing a slot', () => {
            // Exhaust all available slots
            while (tryAcquireLiveSlot()) {}

            expect(tryAcquireLiveSlot()).toBe(false);

            // Release one slot
            releaseLiveSlot();

            // Should be able to acquire exactly one slot
            expect(tryAcquireLiveSlot()).toBe(true);
            expect(tryAcquireLiveSlot()).toBe(false);
        });

        it('should verify tryAcquireLiveSlot and releaseLiveSlot in isolation', () => {
            // Reset state (ensure starting from 0)
            while (tryAcquireLiveSlot()) {} // Exhaust
            for (let i = 0; i < 1000; i++) releaseLiveSlot(); // Fully empty

            // 1) Test tryAcquireLiveSlot success
            const acquired = tryAcquireLiveSlot();
            expect(acquired).toBe(true);

            // 2) Test releaseLiveSlot impact (can re-acquire)
            releaseLiveSlot();
            const reacquired = tryAcquireLiveSlot();
            expect(reacquired).toBe(true);

            // Clean up the slot we just acquired
            releaseLiveSlot();

            // 3) Test releaseLiveSlot bounds (cannot release past 0)
            releaseLiveSlot(); // Try to release extra
            releaseLiveSlot(); // Try to release extra

            // It should still only allow up to max, we check this by just ensuring we can still acquire
            expect(tryAcquireLiveSlot()).toBe(true);
            releaseLiveSlot();
        });

        it('should not allow activeLiveTranscodes to drop below 0', () => {
            // Start from 0 slots
            // Try to release slots when already at 0
            releaseLiveSlot();
            releaseLiveSlot();

            let acquiredCount = 0;
            while (tryAcquireLiveSlot()) {
                acquiredCount++;
            }

            const maxCapacity = acquiredCount;

            // Release all of them
            for (let i = 0; i < maxCapacity; i++) {
                releaseLiveSlot();
            }

            // Try to release extra
            releaseLiveSlot();
            releaseLiveSlot();

            // Re-acquire and check if the count matches maxCapacity
            let newAcquiredCount = 0;
            while (tryAcquireLiveSlot()) {
                newAcquiredCount++;
            }

            expect(newAcquiredCount).toBe(maxCapacity);
        });
    });
});
