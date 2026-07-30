import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import path from 'path';
import type { RadioService as RadioServiceType } from '../radio.service.js';
import type { createDatabase as createDatabaseType } from '../../../core/database.js';

import fs from 'fs-extra';

const MUSIC_DIR = path.resolve(process.cwd(), 'test-music');

let existingFiles: Set<string>;

jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
    const target = path.normalize(String(p)).toLowerCase();
    for (const file of existingFiles) {
        if (path.normalize(file).toLowerCase() === target) return true;
    }
    return false;
});
jest.spyOn(fs as any, 'ensureDir').mockImplementation(async () => {});
jest.spyOn(fs as any, 'emptyDir').mockImplementation(async () => {});
jest.spyOn(fs as any, 'writeFile').mockImplementation(async () => {});

function makeFakeProc(opts: { respondToTerm?: boolean } = {}) {
    const proc: any = new EventEmitter();
    proc.stderr = new EventEmitter();
    // A real ffmpeg process exits shortly after SIGTERM; simulate that so
    // RadioService.stop() doesn't have to fall back to the 5s SIGKILL timer.
    proc.kill = jest.fn((signal?: string) => {
        if (opts.respondToTerm !== false && signal !== 'SIGKILL') {
            queueMicrotask(() => proc.emit('exit'));
        }
        return true;
    });
    return proc;
}

import childProcess from 'child_process';
const mockSpawn = jest.spyOn(childProcess, 'spawn').mockImplementation(() => makeFakeProc() as any);

let RadioService: typeof RadioServiceType;
let createDatabase: typeof createDatabaseType;

describe('RadioService', () => {
    let db: ReturnType<typeof createDatabaseType>;
    let service: RadioServiceType;
    let originalFfmpegPath: string | undefined;

    beforeAll(async () => {
        ({ RadioService } = await import('../radio.service.js'));
        ({ createDatabase } = await import('../../../core/database.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        existingFiles = new Set();
        mockSpawn.mockImplementation(() => makeFakeProc());
        originalFfmpegPath = process.env.FFMPEG_PATH;
        db = createDatabase(':memory:');
        service = new RadioService(db, MUSIC_DIR);
    });

    afterEach(async () => {
        await service.stop();
        if (originalFfmpegPath === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = originalFfmpegPath;
    });

    function insertArtist(id: number, name = 'Artist'): void {
        db.db.prepare("INSERT INTO artists (id, name, slug) VALUES (?, ?, ?)").run(id, name, `${name.toLowerCase()}-${id}`);
    }

    function insertTrack(id: number, opts: { fileName?: string; artistId?: number; genre?: string; duration?: number; missingFile?: boolean } = {}): void {
        const fileName = opts.fileName ?? `track-${id}.mp3`;
        if (!opts.missingFile) existingFiles.add(path.join(MUSIC_DIR, fileName));
        db.db.prepare(
            "INSERT INTO tracks (id, title, artist_id, artist_name, file_path, duration, genre) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(id, `Track ${id}`, opts.artistId ?? null, 'Artist', fileName, opts.duration ?? 100, opts.genre ?? null);
    }

    describe('isActive / getStatus when idle', () => {
        test('reports inactive with defaults before start() is called', () => {
            expect(service.isActive()).toBe(false);
            const status = service.getStatus();
            expect(status.active).toBe(false);
            expect(status.currentTrack).toBeNull();
            expect(status.listenerCount).toBe(0);
            expect(status.hlsUrl).toBe('/api/radio/hls/stream.m3u8');
        });
    });

    describe('start()', () => {
        test('throws when no playable tracks are found', async () => {
            await expect(service.start({ name: 'Empty', trackIds: [999] })).rejects.toThrow(
                /No playable tracks found/
            );
            expect(service.isActive()).toBe(false);
        });

        test('excludes tracks whose local file is missing', async () => {
            insertArtist(1);
            insertTrack(1, { missingFile: true });
            await expect(service.start({ name: 'Ghost', trackIds: [1] })).rejects.toThrow(/No playable tracks found/);
        });

        test('throws "FFmpeg not available" when FFMPEG_PATH is not configured', async () => {
            delete process.env.FFMPEG_PATH;
            insertArtist(1);
            insertTrack(1);
            await expect(service.start({ name: 'Radio', trackIds: [1] })).rejects.toThrow('FFmpeg not available');
        });

        test('spawns ffmpeg and becomes active when a valid track is configured', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);

            await service.start({ name: 'My Radio', trackIds: [1] });

            expect(service.isActive()).toBe(true);
            expect(mockSpawn).toHaveBeenCalledWith('/fake/ffmpeg', expect.any(Array), expect.objectContaining({ shell: false }));
            const status = service.getStatus();
            expect(status.active).toBe(true);
            expect(status.name).toBe('My Radio');
        });

        test('persists radio settings so the session can be resumed later', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);

            await service.start({ name: 'Persisted', trackIds: [1], shuffle: true });

            expect(db.getSetting('radio_enabled')).toBe('true');
            expect(db.getSetting('radio_name')).toBe('Persisted');
            expect(db.getSetting('radio_track_ids')).toBe(JSON.stringify([1]));
            expect(db.getSetting('radio_shuffle')).toBe('true');
        });

        test('loads tracks from a playlist, ordered by playlist position', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);
            insertTrack(2);
            db.db.prepare("INSERT INTO playlists (id, name, username) VALUES (1, 'My Playlist', 'bob')").run();
            db.db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 2, 0), (1, 1, 1)").run();

            await service.start({ name: 'Playlist Radio', playlistId: 1 });

            expect((service as any).tracks.map((t: any) => t.id)).toEqual([2, 1]);
        });

        test('loads tracks from sources: dedupes playlists and genre mixes, preserving first-seen order', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1, { genre: 'techno' });
            insertTrack(2, { genre: 'techno' });
            insertTrack(3, { genre: 'house' });
            db.db.prepare("INSERT INTO playlists (id, name, username) VALUES (1, 'Mix', 'bob')").run();
            db.db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 1, 0)").run();

            await service.start({ name: 'Sources Radio', sources: ['1', 'genre:techno', 'genre:house'] });

            expect((service as any).tracks.map((t: any) => t.id)).toEqual([1, 2, 3]);
        });

        test('shuffle keeps the same set of tracks', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);
            insertTrack(2);
            insertTrack(3);

            await service.start({ name: 'Shuffled', trackIds: [1, 2, 3], shuffle: true });

            const ids = (service as any).tracks.map((t: any) => t.id).sort();
            expect(ids).toEqual([1, 2, 3]);
        });

        test('stops any previous session before starting a new one', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);
            insertTrack(2);

            await service.start({ name: 'First', trackIds: [1] });
            const firstProc = mockSpawn.mock.results[0].value;

            await service.start({ name: 'Second', trackIds: [2] });

            expect(firstProc.kill).toHaveBeenCalledWith('SIGTERM');
            expect(mockSpawn).toHaveBeenCalledTimes(2);
            expect(service.getStatus().name).toBe('Second');
        });
    });

    describe('stop()', () => {
        test('is a no-op when nothing is running', async () => {
            await expect(service.stop()).resolves.toBeUndefined();
            expect(service.isActive()).toBe(false);
        });

        test('kills the ffmpeg process and clears state once it exits', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);
            await service.start({ name: 'Radio', trackIds: [1] });

            const proc = mockSpawn.mock.results[0].value;
            const stopPromise = service.stop();
            proc.emit('exit');
            await stopPromise;

            expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
            expect(service.isActive()).toBe(false);
            expect(db.getSetting('radio_enabled')).toBe('false');
        });

        test('force-kills with SIGKILL if the process does not exit within 5s', async () => {
            jest.useFakeTimers();
            try {
                process.env.FFMPEG_PATH = '/fake/ffmpeg';
                insertArtist(1);
                insertTrack(1);
                mockSpawn.mockImplementationOnce(() => makeFakeProc({ respondToTerm: false }));
                await service.start({ name: 'Radio', trackIds: [1] });
                const proc = mockSpawn.mock.results[0].value;

                const stopPromise = service.stop();
                await jest.advanceTimersByTimeAsync(5000);
                await stopPromise;

                expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
                expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('resolveFile()', () => {
        beforeEach(async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);
            await service.start({ name: 'Radio', trackIds: [1] });
        });

        test('accepts valid hls segment and playlist filenames', () => {
            expect(service.resolveFile('stream.m3u8')).toBe(path.resolve((service as any).hlsDir, 'stream.m3u8'));
            expect(service.resolveFile('seg000001.ts')).toBe(path.resolve((service as any).hlsDir, 'seg000001.ts'));
        });

        test('rejects filenames with a disallowed extension', () => {
            expect(service.resolveFile('evil.sh')).toBeNull();
        });

        test('rejects path traversal attempts', () => {
            expect(service.resolveFile('../../etc/passwd.ts')).toBeNull();
            expect(service.resolveFile('..%2f..%2fetc%2fpasswd.ts')).toBeNull();
        });
    });

    describe('trackListener / listenerCount', () => {
        test('counts recently-seen listeners and expires stale ones', () => {
            const now = 1_700_000_000_000;
            jest.spyOn(Date, 'now').mockReturnValue(now);
            service.trackListener('client-a');
            service.trackListener('client-b');
            expect(service.getStatus().listenerCount).toBe(2);

            jest.spyOn(Date, 'now').mockReturnValue(now + 31_000);
            expect(service.getStatus().listenerCount).toBe(0);

            (Date.now as any).mockRestore();
        });
    });

    describe('resumeIfActive()', () => {
        test('does nothing when radio was not previously enabled', async () => {
            await service.resumeIfActive();
            expect(service.isActive()).toBe(false);
            expect(mockSpawn).not.toHaveBeenCalled();
        });

        test('restarts the previous session from persisted settings', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1);
            db.setSetting('radio_enabled', 'true');
            db.setSetting('radio_name', 'Resumed');
            db.setSetting('radio_track_ids', JSON.stringify([1]));
            db.setSetting('radio_shuffle', 'false');

            await service.resumeIfActive();

            expect(service.isActive()).toBe(true);
            expect(service.getStatus().name).toBe('Resumed');
        });
    });

    describe('ffmpeg auto-restart', () => {
        test('respawns ffmpeg 2s after an unexpected non-zero exit', async () => {
            jest.useFakeTimers();
            try {
                process.env.FFMPEG_PATH = '/fake/ffmpeg';
                insertArtist(1);
                insertTrack(1);
                await service.start({ name: 'Radio', trackIds: [1] });
                expect(mockSpawn).toHaveBeenCalledTimes(1);

                const proc = mockSpawn.mock.results[0].value;
                proc.emit('exit', 1);

                await jest.advanceTimersByTimeAsync(2000);
                expect(mockSpawn).toHaveBeenCalledTimes(2);
            } finally {
                jest.useRealTimers();
            }
        });

        test('does not restart on a clean exit (code 0)', async () => {
            jest.useFakeTimers();
            try {
                process.env.FFMPEG_PATH = '/fake/ffmpeg';
                insertArtist(1);
                insertTrack(1);
                await service.start({ name: 'Radio', trackIds: [1] });

                const proc = mockSpawn.mock.results[0].value;
                proc.emit('exit', 0);

                await jest.advanceTimersByTimeAsync(2000);
                expect(mockSpawn).toHaveBeenCalledTimes(1);
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('getStatus() currentTrack', () => {
        test('returns the single track when total duration is zero', async () => {
            process.env.FFMPEG_PATH = '/fake/ffmpeg';
            insertArtist(1);
            insertTrack(1, { duration: 0 });

            await service.start({ name: 'Radio', trackIds: [1] });

            expect(service.getStatus().currentTrack).toMatchObject({ id: 1, title: 'Track 1' });
        });

        test('advances to the next track once the current one has elapsed', async () => {
            jest.useFakeTimers();
            try {
                jest.setSystemTime(1_700_000_000_000);
                process.env.FFMPEG_PATH = '/fake/ffmpeg';
                insertArtist(1);
                insertTrack(1, { duration: 10 });
                insertTrack(2, { duration: 10 });

                await service.start({ name: 'Radio', trackIds: [1, 2] });

                jest.setSystemTime(1_700_000_000_000 + 12_000);
                expect(service.getStatus().currentTrack).toMatchObject({ id: 2 });
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
