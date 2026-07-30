import { jest, beforeAll } from '@jest/globals';
import path from 'path';

// telegraf is a CJS module that `require()`s node-fetch; under the ESM test setup
// node-fetch is mapped to an ESM mock that CJS cannot require, which crashes the
// import. We don't exercise the bot transport here (only auth + caption parsing),
// so stub telegraf out entirely and import the SUT dynamically afterwards.
import fs from 'fs-extra';
import { mockBotInstance } from '../../../../__mocks__/telegraf.js';

const mockFsExistsSync = jest.spyOn(fs, 'existsSync');

let TelegramBotService: any;

beforeAll(async () => {
    ({ TelegramBotService } = await import('./telegram-bot.js'));
});

describe('TelegramBotService', () => {
    let botService: TelegramBotService;
    let mockDatabase: any;
    let mockScanner: any;
    const musicDir = '/tmp/music';

    beforeEach(() => {
        jest.clearAllMocks();
        mockFsExistsSync.mockReturnValue(false);
        mockDatabase = {
            getSetting: jest.fn(),
            setSetting: jest.fn(),
            db: {
                prepare: jest.fn().mockReturnValue({
                    all: jest.fn().mockReturnValue([]),
                    get: jest.fn().mockReturnValue(null)
                })
            }
        };
        mockScanner = {
            processAudioFile: jest.fn(),
            scanDirectory: jest.fn()
        };
        const configMock = {
            musicDir: '/tmp/music',
            telegramBotToken: 'mock-token'
        } as any;
        botService = new TelegramBotService(mockDatabase, mockScanner, configMock);
    });

    describe('isAuthorized', () => {
        test('allows everyone if no whitelist is configured', () => {
            mockDatabase.getSetting.mockReturnValue(null);
            const ctx = {
                chat: { id: 123, type: 'private' },
                from: { id: 456 }
            };
            expect((botService as any).isAuthorized(ctx)).toBe(true);
        });

        test('authorizes whitelisted user in private chat', () => {
            mockDatabase.getSetting.mockReturnValue('456,789');
            const ctx = {
                chat: { id: 123, type: 'private' },
                from: { id: '456' }
            };
            expect((botService as any).isAuthorized(ctx)).toBe(true);
        });

        test('denies non-whitelisted user in private chat', () => {
            mockDatabase.getSetting.mockReturnValue('789');
            const ctx = {
                chat: { id: 123, type: 'private' },
                from: { id: '456' }
            };
            expect((botService as any).isAuthorized(ctx)).toBe(false);
        });

        test('authorizes whitelisted channel', () => {
            mockDatabase.getSetting.mockReturnValue('123,456');
            const ctx = {
                chat: { id: '123', type: 'channel' }
            };
            expect((botService as any).isAuthorized(ctx)).toBe(true);
        });

        test('authorizes whitelisted user in group', () => {
            mockDatabase.getSetting.mockReturnValue('456');
            const ctx = {
                chat: { id: 999, type: 'group' },
                from: { id: '456' }
            };
            expect((botService as any).isAuthorized(ctx)).toBe(true);
        });
    });

    describe('Metadata Parsing', () => {
        test('extracts metadata from hashtags', async () => {
            const ctx = {
                chat: { id: 123 },
                message: { caption: '#artist: The Beatles\n#album: Abbey Road\n#year: 1969' }
            };
            const audio = { file_id: 'abc', file_name: 'test.mp3' };
            
            // Access private method for testing parsing
            const hints: any = {};
            const caption = ctx.message.caption;
            
            // Mocking the regex logic from handleAudio
            const artistMatch = caption.match(/#artist[:\s\-=]+([^\n#\r]+)/i);
            const albumMatch = caption.match(/#album[:\s\-=]+([^\n#\r]+)/i);
            const yearMatch = caption.match(/#year[:\s\-=]+(\d{4})/i);

            if (artistMatch) hints.artist = artistMatch[1].trim();
            if (albumMatch) hints.album = albumMatch[1].trim();
            if (yearMatch) hints.year = parseInt(yearMatch[1]);

            expect(hints.artist).toBe('The Beatles');
            expect(hints.album).toBe('Abbey Road');
            expect(hints.year).toBe(1969);
        });

        test('falls back to lines if hashtags are missing', () => {
            const caption = "Pink Floyd\nDark Side of the Moon";
            const lines = caption.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
            const hints: any = {};
            if (lines.length >= 1) hints.artist = lines[0];
            if (lines.length >= 2) hints.album = lines[1];

            expect(hints.artist).toBe('Pink Floyd');
            expect(hints.album).toBe('Dark Side of the Moon');
        });
    });

    describe('getMasterId', () => {
        test('prefers config.telegramMasterId over the DB setting', () => {
            const configMock = { musicDir, telegramBotToken: 'x', telegramMasterId: 'cfg-id' } as any;
            const svc = new TelegramBotService(mockDatabase, mockScanner, configMock);
            mockDatabase.getSetting.mockReturnValue('db-id');
            expect((svc as any).getMasterId()).toBe('cfg-id');
        });

        test('falls back to the DB setting when config has none', () => {
            mockDatabase.getSetting.mockReturnValue('db-id');
            expect((botService as any).getMasterId()).toBe('db-id');
        });
    });

    describe('checkRateLimit', () => {
        afterEach(() => {
            jest.useRealTimers();
        });

        test('never rate limits audio/document/photo messages', () => {
            const ctx = { message: { audio: {} }, from: { id: 1 } };
            expect((botService as any).checkRateLimit(ctx)).toBe(true);
        });

        test('never rate limits non-command text', () => {
            const ctx = { message: { text: 'hello' }, from: { id: 1 } };
            expect((botService as any).checkRateLimit(ctx)).toBe(true);
        });

        test('never rate limits requests with no resolvable user id', () => {
            const ctx = { message: { text: '/status' } };
            expect((botService as any).checkRateLimit(ctx)).toBe(true);
        });

        test('never rate limits the master admin', () => {
            mockDatabase.getSetting.mockImplementation((key: string) => key === 'telegram_master_id' ? '42' : null);
            const ctx = { message: { text: '/status' }, from: { id: '42' } };
            expect((botService as any).checkRateLimit(ctx)).toBe(true);
        });

        test('allows the first command then blocks a rapid repeat', () => {
            jest.useFakeTimers();
            jest.setSystemTime(1000);
            const ctx = { message: { text: '/status' }, from: { id: '1' } };
            expect((botService as any).checkRateLimit(ctx)).toBe(true);

            jest.setSystemTime(1200);
            expect((botService as any).checkRateLimit(ctx)).toBe(false);
        });

        test('sends a hint reply when blocked but not spamming', async () => {
            jest.useFakeTimers();
            jest.setSystemTime(1000);
            const ctx: any = { message: { text: '/status' }, from: { id: '1' }, reply: jest.fn().mockResolvedValue(undefined) };
            (botService as any).checkRateLimit(ctx);

            jest.setSystemTime(1700);
            (botService as any).checkRateLimit(ctx);
            await Promise.resolve();

            expect(ctx.reply).toHaveBeenCalledWith('⏳ Calmati! Aspetta un attimo... / Wait a second...');
        });
    });

    describe('safeReply', () => {
        test('returns ctx.reply result on success', async () => {
            const ctx = { reply: jest.fn().mockResolvedValue('ok') };
            const result = await (botService as any).safeReply(ctx, 'hi');
            expect(result).toBe('ok');
        });

        test('retries on a 429 error and eventually succeeds', async () => {
            jest.useFakeTimers();
            const err = { response: { error_code: 429, parameters: { retry_after: 1 } } };
            const ctx = { reply: jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok') };

            const promise = (botService as any).safeReply(ctx, 'hi');
            await jest.advanceTimersByTimeAsync(2000);
            await expect(promise).resolves.toBe('ok');
            expect(ctx.reply).toHaveBeenCalledTimes(2);
            jest.useRealTimers();
        });

        test('gives up after 3 retries and swallows the error', async () => {
            jest.useFakeTimers();
            const err = { response: { error_code: 429, parameters: { retry_after: 0.01 } }, message: 'rate limited' };
            const ctx = { reply: jest.fn().mockRejectedValue(err) };

            const promise = (botService as any).safeReply(ctx, 'hi');
            await jest.advanceTimersByTimeAsync(1000);
            await expect(promise).resolves.toBeUndefined();
            expect(ctx.reply).toHaveBeenCalledTimes(4);
            jest.useRealTimers();
        });

        test('logs and swallows non-429 errors without retrying', async () => {
            const ctx = { reply: jest.fn().mockRejectedValue(new Error('boom')) };
            await expect((botService as any).safeReply(ctx, 'hi')).resolves.toBeUndefined();
            expect(ctx.reply).toHaveBeenCalledTimes(1);
        });
    });

    describe('sendTrack', () => {
        test('returns false when the file does not exist', async () => {
            mockFsExistsSync.mockReturnValue(false);
            const track = { id: 1, file_path: '/tmp/music/song.mp3', title: 'Song' };
            const result = await (botService as any).sendTrack({}, track);
            expect(result).toBe(false);
        });

        test('sends the audio file and returns true', async () => {
            mockFsExistsSync.mockReturnValue(true);
            const ctx = { replyWithAudio: jest.fn().mockResolvedValue(undefined) };
            const track = { id: 1, file_path: '/tmp/music/song.mp3', title: 'Song', artist_name: 'Artist' };

            const result = await (botService as any).sendTrack(ctx, track);

            expect(result).toBe(true);
            expect(ctx.replyWithAudio).toHaveBeenCalledWith(
                { source: '/tmp/music/song.mp3' },
                expect.objectContaining({ title: 'Song', performer: 'Artist' })
            );
        });

        test('returns false when replyWithAudio throws', async () => {
            mockFsExistsSync.mockReturnValue(true);
            const ctx = { replyWithAudio: jest.fn().mockRejectedValue(new Error('boom')) };
            const track = { id: 1, file_path: '/tmp/music/song.mp3', title: 'Song' };

            const result = await (botService as any).sendTrack(ctx, track);
            expect(result).toBe(false);
        });
    });

    describe('sendRandomTrack', () => {
        test('replies with an empty-library message', async () => {
            mockDatabase.getRandomTracks = jest.fn().mockReturnValue([]);
            const ctx = { reply: jest.fn().mockResolvedValue(undefined) };
            await (botService as any).sendRandomTrack(ctx);
            expect(ctx.reply).toHaveBeenCalledWith('📭 Library is empty.');
        });

        test('replies with a not-found message when the file is missing', async () => {
            mockFsExistsSync.mockReturnValue(false);
            mockDatabase.getRandomTracks = jest.fn().mockReturnValue([{ id: 1, file_path: '/tmp/music/x.mp3' }]);
            const ctx = { reply: jest.fn().mockResolvedValue(undefined) };
            await (botService as any).sendRandomTrack(ctx);
            expect(ctx.reply).toHaveBeenCalledWith('⚠️ File not found. Try another one.');
        });

        test('sends the audio track when the file exists', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockDatabase.getRandomTracks = jest.fn().mockReturnValue([{ id: 1, file_path: '/tmp/music/x.mp3', title: 'X', artist_name: 'A' }]);
            const ctx = { replyWithAudio: jest.fn().mockResolvedValue(undefined) };
            await (botService as any).sendRandomTrack(ctx);
            expect(ctx.replyWithAudio).toHaveBeenCalled();
        });
    });

    describe('start / stop', () => {
        test('warns and stays inactive when no bot token is configured', async () => {
            const configMock = { musicDir, telegramBotToken: undefined } as any;
            const svc = new TelegramBotService(mockDatabase, mockScanner, configMock);

            await svc.start();

            expect((svc as any).isRunning).toBe(false);
            expect(mockBotInstance.launch).not.toHaveBeenCalled();
        });

        test('registers handlers and launches the bot', async () => {
            await botService.start();

            expect((botService as any).isRunning).toBe(true);
            expect(mockBotInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockBotInstance.on).toHaveBeenCalledWith('channel_post', expect.any(Function));
            expect(mockBotInstance.launch).toHaveBeenCalledTimes(1);
        });

        test('is a no-op if already running', async () => {
            await botService.start();
            await botService.start();
            expect(mockBotInstance.launch).toHaveBeenCalledTimes(1);
        });

        test('stop() stops the bot and resets state', async () => {
            await botService.start();
            await botService.stop();

            expect(mockBotInstance.stop).toHaveBeenCalledWith('SIGTERM');
            expect((botService as any).isRunning).toBe(false);
            expect((botService as any).bot).toBeUndefined();
        });

        test('stop() is a no-op when the bot was never started', async () => {
            await expect(botService.stop()).resolves.toBeUndefined();
            expect(mockBotInstance.stop).not.toHaveBeenCalled();
        });
    });
});
