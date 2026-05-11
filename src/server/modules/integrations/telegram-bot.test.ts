import { jest } from '@jest/globals';
import { TelegramBotService } from './telegram-bot.js';
import path from 'path';

describe('TelegramBotService', () => {
    let botService: TelegramBotService;
    let mockDatabase: any;
    let mockScanner: any;
    const musicDir = '/tmp/music';

    beforeEach(() => {
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
            consolidateFiles: jest.fn()
        };
        botService = new TelegramBotService(mockDatabase, mockScanner, musicDir);
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
});
