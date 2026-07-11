import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createTelegramCommands, TelegramBotContext } from '../telegram-commands.js';

describe('TelegramCommands', () => {
    let mockBotCtx: jest.Mocked<TelegramBotContext>;
    let commands: Record<string, (ctx: any) => any>;

    beforeEach(() => {
        mockBotCtx = {
            safeReply: jest.fn(),
            isAuthorized: jest.fn(),
            sendTrack: jest.fn(),
            sendRandomTrack: jest.fn(),
            database: {
                db: { name: 'mock-db.sqlite' },
                search: jest.fn(),
                getTracksByArtist: jest.fn(),
                getPlaylists: jest.fn(),
                getSetting: jest.fn(),
                setSetting: jest.fn(),
            } as any,
            telegramRepo: {
                getRecentArtists: jest.fn(),
                getRecentAlbums: jest.fn(),
                getRecentReleases: jest.fn(),
                getDatabaseStats: jest.fn(),
                getRecentTracks: jest.fn(),
                searchReleaseTracks: jest.fn(),
            } as any,
            scanner: {
                scanDirectory: jest.fn(),
            } as any,
            musicDir: '/mock/music',
        } as unknown as jest.Mocked<TelegramBotContext>;

        commands = createTelegramCommands(mockBotCtx);
    });

    it('should handle start command', async () => {
        const ctx = { chat: { id: 123 } };
        await commands['start'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('123'));
    });

    it('should handle status command', async () => {
        const ctx = { chat: { id: 123 } };
        await commands['status'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('123'));
    });

    it('should handle artists command (empty)', async () => {
        (mockBotCtx.telegramRepo.getRecentArtists as jest.Mock).mockReturnValue([]);
        await commands['artists']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No artists found in library.');
    });

    it('should handle artists command (populated)', async () => {
        (mockBotCtx.telegramRepo.getRecentArtists as jest.Mock).mockReturnValue([{ name: 'Artist1' }]);
        await commands['artists']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Artist1'));
    });

    it('should handle search command (empty query)', async () => {
        const ctx = { message: { text: '/search' } };
        await commands['search'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('Please provide a search query'));
    });

    it('should handle search command (with query, no results)', async () => {
        const ctx = { message: { text: '/search query' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({ tracks: [], artists: [] });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);

        await commands['search'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('No results found for "query"'));
    });

    it('should handle search command (with results)', async () => {
        const ctx = { message: { text: '/search track1' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: [{ file_path: '/path/to/track1.mp3' }],
            artists: []
        });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(true);

        await commands['search'](ctx);
        expect(mockBotCtx.sendTrack).toHaveBeenCalledWith(ctx, { file_path: '/path/to/track1.mp3' });
    });

    it('should handle play command', async () => {
        const ctx = { message: { text: '/play track1' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: [{ file_path: '/path/to/track1.mp3' }],
            artists: []
        });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(true);

        await commands['play'](ctx);
        expect(mockBotCtx.sendTrack).toHaveBeenCalledWith(ctx, { file_path: '/path/to/track1.mp3' });
    });

    it('should handle debug_db command (unauthorized)', async () => {
        const ctx = {};
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(false);
        await commands['debug_db'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, '⚠️ Unauthorized.');
    });

    it('should handle debug_db command (authorized)', async () => {
        const ctx = {};
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.telegramRepo.getDatabaseStats as jest.Mock).mockReturnValue({ artists: 1, tracks: 2, albums: 3, releases: 4 });
        (mockBotCtx.telegramRepo.getRecentTracks as jest.Mock).mockReturnValue([]);

        await commands['debug_db'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('Database Debug Info'));
    });

    it('should handle albums command (empty)', async () => {
        (mockBotCtx.telegramRepo.getRecentAlbums as jest.Mock).mockReturnValue([]);
        await commands['albums']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No albums found in library.');
    });

    it('should handle album command (empty)', async () => {
        (mockBotCtx.telegramRepo.getRecentAlbums as jest.Mock).mockReturnValue([]);
        await commands['album']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No albums found in library.');
    });

    it('should handle releases command (empty)', async () => {
        (mockBotCtx.telegramRepo.getRecentReleases as jest.Mock).mockReturnValue([]);
        await commands['releases']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No releases found.');
    });

    it('should handle release command (empty)', async () => {
        (mockBotCtx.telegramRepo.getRecentReleases as jest.Mock).mockReturnValue([]);
        await commands['release']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No releases found.');
    });

    it('should handle playlists command (empty)', async () => {
        (mockBotCtx.database.getPlaylists as jest.Mock).mockReturnValue([]);
        const ctx = { reply: jest.fn() };
        await commands['playlists'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No playlists found.');
    });

    it('should handle help command', async () => {
        await commands['help']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Tunecamp Bot Help'));
    });

    it('should handle rescan command (unauthorized)', async () => {
        const ctx = {};
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(false);
        await commands['rescan'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('Unauthorized'));
    });

    it('should handle rescan command (authorized, success)', async () => {
        const ctx = {};
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.scanner.scanDirectory as jest.Mock).mockResolvedValue({ successful: [1], failed: [] } as any);
        await commands['rescan'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('Rescan complete'));
    });

    it('should handle radio command', async () => {
        const ctx = {};
        await commands['radio'](ctx);
        expect(mockBotCtx.sendRandomTrack).toHaveBeenCalledWith(ctx);
    });

    it('should handle debug command (unauthorized)', async () => {
        const ctx = {};
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(false);
        await commands['debug'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, '⚠️ Unauthorized.');
    });

    it('should handle debug command (turn on)', async () => {
        const ctx = { message: { text: 'on' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        await commands['debug'](ctx);
        expect(mockBotCtx.database.setSetting).toHaveBeenCalledWith('telegram_debug', 'true');
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('ON'));
    });
});
