import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createTelegramCommands, TelegramBotContext } from '../telegram-commands.js';
import { VisibilityProfile } from '../../../../common/visibility.js';

describe('createTelegramCommands', () => {
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

    it('should handle search command (with public visibility when unauthorized)', async () => {
        const ctx = { message: { text: '/search track1' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(false);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: [{ file_path: '/path/to/track1.mp3' }],
            artists: []
        });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(true);

        await commands['search'](ctx);
        expect(mockBotCtx.database.search).toHaveBeenCalledWith('track1', VisibilityProfile.PUBLIC_STAGE);
        expect(mockBotCtx.sendTrack).toHaveBeenCalledWith(ctx, { file_path: '/path/to/track1.mp3' });
    });

    it('should fetch artist tracks if no direct tracks match in search', async () => {
        const ctx = { message: { text: '/search artistName' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: [],
            artists: [{ id: 1, name: 'artistName' }]
        });
        (mockBotCtx.database.getTracksByArtist as jest.Mock).mockReturnValue([{ file_path: '/path/to/artistTrack.mp3' }]);
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(true);

        await commands['search'](ctx);

        expect(mockBotCtx.database.getTracksByArtist).toHaveBeenCalledWith(1, VisibilityProfile.ALL_ACCESS);
        expect(mockBotCtx.sendTrack).toHaveBeenCalledWith(ctx, { file_path: '/path/to/artistTrack.mp3' });
    });

    it('should limit search results to 5 and send message', async () => {
        const ctx = { message: { text: '/search pop' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);

        const sixTracks = Array.from({ length: 6 }).map((_, i) => ({ file_path: `/path/to/track${i}.mp3` }));
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: sixTracks,
            artists: []
        });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(true);

        await commands['search'](ctx);

        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('Found 6 results. Sending the top 5'));
        expect(mockBotCtx.sendTrack).toHaveBeenCalledTimes(5);
    });

    it('should reply when files are missing on server', async () => {
        const ctx = { message: { text: '/search missing' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: [{ file_path: '/path/to/missing.mp3' }],
            artists: []
        });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(false); // sending failed

        await commands['search'](ctx);

        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('physical files are missing'));
    });

    it('should handle search command (merge release tracks)', async () => {
        const ctx = { message: { text: '/search both' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.search as jest.Mock).mockReturnValue({
            tracks: [{ file_path: '/path/to/track1.mp3' }],
            artists: []
        });
        (mockBotCtx.telegramRepo.searchReleaseTracks as jest.Mock).mockReturnValue([
            { file_path: '/path/to/track1.mp3' }, // Duplicate
            { file_path: '/path/to/releaseTrack.mp3' } // New
        ]);
        (mockBotCtx.sendTrack as jest.Mock).mockResolvedValue(true);

        await commands['search'](ctx);
        expect(mockBotCtx.sendTrack).toHaveBeenCalledTimes(2);
        expect(mockBotCtx.sendTrack).toHaveBeenCalledWith(ctx, { file_path: '/path/to/track1.mp3' });
        expect(mockBotCtx.sendTrack).toHaveBeenCalledWith(ctx, { file_path: '/path/to/releaseTrack.mp3' });
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

    it('should handle albums command (populated)', async () => {
        (mockBotCtx.telegramRepo.getRecentAlbums as jest.Mock).mockReturnValue([{ title: 'Album1', artist_name: 'Artist1' }, { title: 'Album2' }]);
        await commands['albums']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Artist1 - Album1'));
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Album2'));
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

    it('should handle releases command (populated)', async () => {
        (mockBotCtx.telegramRepo.getRecentReleases as jest.Mock).mockReturnValue([{ title: 'Release1', artist_name: 'Artist1' }]);
        await commands['releases']({});
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Artist1 - Release1'));
    });

    it('should handle playlists command (empty)', async () => {
        (mockBotCtx.database.getPlaylists as jest.Mock).mockReturnValue([]);
        const ctx = { reply: jest.fn() };
        await commands['playlists'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(expect.anything(), 'No playlists found.');
    });

    it('should handle playlists command (populated)', async () => {
        (mockBotCtx.database.getPlaylists as jest.Mock).mockReturnValue([{ id: 1, name: 'Playlist1' }]);
        const ctx = { reply: jest.fn() };
        await commands['playlists'](ctx);
        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Your Playlists'), expect.objectContaining({
            reply_markup: {
                inline_keyboard: [[{ text: '📂 Playlist1', callback_data: 'pl_view_1' }]]
            }
        }));
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

    it('should handle rescan command (authorized, failure)', async () => {
        const ctx = {};
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.scanner.scanDirectory as jest.Mock).mockRejectedValue(new Error('Scan failed'));
        await commands['rescan'](ctx);
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('Rescan failed'));
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

    it('should handle debug command (turn off)', async () => {
        const ctx = { message: { text: 'off' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        await commands['debug'](ctx);
        expect(mockBotCtx.database.setSetting).toHaveBeenCalledWith('telegram_debug', 'false');
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('OFF'));
    });

    it('should handle debug command (toggle)', async () => {
        const ctx = { message: { text: 'toggle' } };
        (mockBotCtx.isAuthorized as jest.Mock).mockReturnValue(true);
        (mockBotCtx.database.getSetting as jest.Mock).mockReturnValue('true');
        await commands['debug'](ctx);
        expect(mockBotCtx.database.setSetting).toHaveBeenCalledWith('telegram_debug', 'false');
        expect(mockBotCtx.safeReply).toHaveBeenCalledWith(ctx, expect.stringContaining('OFF'));
    });
});
