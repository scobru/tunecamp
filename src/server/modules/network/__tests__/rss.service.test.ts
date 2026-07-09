import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../core/database.types.js';

// Setup ESM mock for isSafeUrl before importing rss.service
jest.unstable_mockModule('../../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn().mockResolvedValue(true),
}));

// Now import after mocking
const { createRssService } = await import('../rss.service.js');
const { isSafeUrl } = await import('../../../../utils/networkUtils.js');

describe('createRssService', () => {
    let mockDb: jest.Mocked<DatabaseService>;
    let rssService: ReturnType<typeof createRssService>;
    let globalFetchBackup: typeof global.fetch;

    beforeEach(() => {
        mockDb = {
            upsertRemoteActor: jest.fn(),
            upsertRemoteContent: jest.fn(),
            upsertRemoteContentsBatch: jest.fn(),
            transaction: jest.fn((fn) => fn()),
            getFollowedActors: jest.fn().mockReturnValue([]),
            unfollowActor: jest.fn(),
        } as unknown as jest.Mocked<DatabaseService>;

        rssService = createRssService(mockDb);

        globalFetchBackup = global.fetch;
        global.fetch = jest.fn();

        // Reset the mock
        (isSafeUrl as jest.Mock).mockReset();
        (isSafeUrl as jest.Mock).mockResolvedValue(true);
    });

    afterEach(() => {
        global.fetch = globalFetchBackup;
        jest.clearAllMocks();
    });

    describe('addFeed', () => {
        it('should validate feed URL starts with http(s)://', async () => {
            await expect(rssService.addFeed('ftp://invalid.com/feed')).rejects.toThrow('Feed URL must start with http(s)://');
        });

        it('should handle unsafe URLs gracefully', async () => {
            (isSafeUrl as jest.Mock).mockResolvedValue(false);

            await expect(rssService.addFeed('https://example.com/feed.xml')).rejects.toThrow('Could not fetch the feed');
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should parse a valid RSS feed and save channel and items', async () => {
            const mockRss = `
                <rss version="2.0">
                    <channel>
                        <title>My Cool Podcast</title>
                        <description>A great show</description>
                        <item>
                            <title>Episode 1</title>
                            <link>https://example.com/ep1</link>
                            <guid>guid-1</guid>
                            <enclosure url="https://example.com/audio.mp3" type="audio/mpeg" />
                        </item>
                        <item>
                            <title>Episode 2</title>
                            <link>https://example.com/ep2</link>
                            <guid>guid-2</guid>
                        </item>
                    </channel>
                </rss>
            `;

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(mockRss)
            });

            const result = await rssService.addFeed('https://example.com/feed.xml');

            expect(result).toEqual({ name: 'My Cool Podcast', items: 2 });
            expect(mockDb.upsertRemoteActor).toHaveBeenCalledWith({
                uri: 'https://example.com/feed.xml',
                type: 'rss',
                username: null,
                name: 'My Cool Podcast',
                summary: 'A great show',
                icon_url: null,
                inbox_url: null,
                outbox_url: 'https://example.com/feed.xml',
                is_followed: true,
            });

            expect(mockDb.upsertRemoteContentsBatch).toHaveBeenCalledTimes(1);
            expect(mockDb.upsertRemoteContentsBatch).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        ap_id: 'guid-1',
                        type: 'release',
                        title: 'Episode 1',
                        stream_url: 'https://example.com/audio.mp3'
                    }),
                    expect.objectContaining({
                        ap_id: 'guid-2',
                        type: 'post',
                        title: 'Episode 2',
                        stream_url: null
                    })
                ])
            );
        });

        it('should perform autodiscovery if URL returns HTML', async () => {
            const mockHtml = `
                <html>
                    <head>
                        <link rel="alternate" type="application/rss+xml" href="/real-feed.xml">
                    </head>
                </html>
            `;
            const mockRss = `
                <rss version="2.0">
                    <channel>
                        <title>Discovered Podcast</title>
                        <item><guid>discovered-1</guid></item>
                    </channel>
                </rss>
            `;

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(mockHtml) })
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(mockRss) });

            const result = await rssService.addFeed('https://example.com/blog');

            expect(result).toEqual({ name: 'Discovered Podcast', items: 1 });
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://example.com/real-feed.xml');

            expect(mockDb.upsertRemoteActor).toHaveBeenCalledWith(expect.objectContaining({
                uri: 'https://example.com/real-feed.xml',
                name: 'Discovered Podcast'
            }));
        });

        it('should throw an error if no valid feed is found', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('<html><body>No feed here</body></html>')
            });

            await expect(rssService.addFeed('https://example.com/blog')).rejects.toThrow('The URL did not return a valid RSS or Atom feed');
        });

        it('should handle fetch failures', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(rssService.addFeed('https://example.com/feed')).rejects.toThrow('Could not fetch the feed');
        });
    });

    describe('refreshFeed', () => {
        it('should fetch and update metadata without changing follow state', async () => {
            const mockAtom = `
                <feed xmlns="http://www.w3.org/2005/Atom">
                    <title>Atom Feed</title>
                    <entry>
                        <id>atom-1</id>
                        <title>Entry 1</title>
                    </entry>
                </feed>
            `;

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(mockAtom)
            });

            const count = await rssService.refreshFeed('https://example.com/atom');

            expect(count).toBe(1);
            expect(mockDb.upsertRemoteActor).toHaveBeenCalledWith({
                uri: 'https://example.com/atom',
                type: 'rss',
                username: null,
                name: 'Atom Feed',
                summary: null,
                icon_url: null,
                inbox_url: null,
                outbox_url: 'https://example.com/atom',
                // is_followed is omitted
            });
            expect(mockDb.upsertRemoteContentsBatch).toHaveBeenCalledTimes(1);
            expect(mockDb.upsertRemoteContentsBatch).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ ap_id: 'atom-1' })
                ])
            );
        });

        it('should return 0 if fetch fails', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

            const count = await rssService.refreshFeed('https://example.com/missing');

            expect(count).toBe(0);
            expect(mockDb.upsertRemoteActor).not.toHaveBeenCalled();
        });

        it('should return 0 if parse fails', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('not xml') });

            const count = await rssService.refreshFeed('https://example.com/badxml');

            expect(count).toBe(0);
            expect(mockDb.upsertRemoteActor).not.toHaveBeenCalled();
        });
    });

    describe('refreshAll', () => {
        it('should refresh all followed RSS feeds', async () => {
            mockDb.getFollowedActors.mockReturnValue([
                { uri: 'https://example.com/feed1', type: 'rss' },
                { uri: 'https://example.com/notrss', type: 'ap' },
                { uri: 'https://example.com/feed2', type: 'rss' },
            ] as any[]);

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue('<rss><channel><item><guid>1</guid></item></channel></rss>') })
                .mockResolvedValueOnce({ ok: false, status: 500 });

            await rssService.refreshAll();

            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://example.com/feed1');
            expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://example.com/feed2');

            // Should have parsed the first one
            expect(mockDb.upsertRemoteContentsBatch).toHaveBeenCalledTimes(1);
        });

        it('should not throw if a refresh fails', async () => {
            mockDb.getFollowedActors.mockReturnValue([
                { uri: 'https://example.com/feed1', type: 'rss' },
            ] as any[]);

            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(rssService.refreshAll()).resolves.not.toThrow();
        });
    });

    describe('removeFeed', () => {
        it('should call db.unfollowActor with trimmed URL', () => {
            rssService.removeFeed('  https://example.com/feed  ');

            expect(mockDb.unfollowActor).toHaveBeenCalledWith('https://example.com/feed');
        });
    });
});
