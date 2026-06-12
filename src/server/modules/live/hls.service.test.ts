import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { HlsLiveService } from './hls.service.js';

const ROOM = 'room-abc123';

describe('HlsLiveService', () => {
    let service: HlsLiveService;
    let baseDir: string;
    let savedFfmpegPath: string | undefined;

    beforeEach(() => {
        baseDir = path.join(os.tmpdir(), `tunecamp-hls-test-${Date.now()}`);
        service = new HlsLiveService(baseDir);
        savedFfmpegPath = process.env.FFMPEG_PATH;
    });

    afterEach(async () => {
        await service.stopAll();
        if (savedFfmpegPath === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = savedFfmpegPath;
        await fs.remove(baseDir).catch(() => {});
    });

    test('start throws when ffmpeg is not available', async () => {
        delete process.env.FFMPEG_PATH;
        await expect(service.start(ROOM)).rejects.toThrow(/FFmpeg not available/);
        expect(service.isActive(ROOM)).toBe(false);
    });

    describe('with a spawned pipeline', () => {
        beforeEach(async () => {
            // Any spawnable binary works for lifecycle tests; node ignores the
            // ffmpeg args and exits, which the service tolerates by design.
            process.env.FFMPEG_PATH = process.execPath;
            await service.start(ROOM);
        });

        test('start registers the room and creates its directory', async () => {
            expect(service.isActive(ROOM)).toBe(true);
            expect(await fs.pathExists(path.join(baseDir, ROOM))).toBe(true);
        });

        test('resolveFile accepts ffmpeg-shaped names only', () => {
            expect(service.resolveFile(ROOM, 'live.m3u8')).toContain(ROOM);
            expect(service.resolveFile(ROOM, 'live3.ts')).toContain(ROOM);
            expect(service.resolveFile(ROOM, '../../../etc/passwd')).toBeNull();
            expect(service.resolveFile(ROOM, 'live.m3u8/../x.ts')).toBeNull();
            expect(service.resolveFile(ROOM, 'evil.exe')).toBeNull();
            expect(service.resolveFile('unknown-room', 'live.m3u8')).toBeNull();
        });

        test('listener tracking counts distinct clients within the window', () => {
            expect(service.getListenerCount(ROOM)).toBe(0);
            service.trackListener(ROOM, '1.2.3.4');
            service.trackListener(ROOM, '5.6.7.8');
            service.trackListener(ROOM, '1.2.3.4'); // same client polls again
            expect(service.getListenerCount(ROOM)).toBe(2);
            expect(service.getListenerCount('unknown-room')).toBe(0);
        });

        test('stop removes the room directory and deactivates it', async () => {
            await service.stop(ROOM);
            expect(service.isActive(ROOM)).toBe(false);
            expect(await fs.pathExists(path.join(baseDir, ROOM))).toBe(false);
        });
    });

    test('ingest returns false for inactive rooms', () => {
        expect(service.ingest('nope', Buffer.from('data'))).toBe(false);
    });
});
