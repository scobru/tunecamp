import { jest } from '@jest/globals';
import path from 'path';

const mockConnect = jest.fn();
const mockSearch = jest.fn();
const mockDownload = jest.fn();
const mockSearchAndDownload = jest.fn();

jest.unstable_mockModule('andrade-soulseek-downloader/dist/index.js', () => ({
    SoulseekDownloader: class {
        connect = mockConnect;
        search = mockSearch;
        download = mockDownload;
        searchAndDownload = mockSearchAndDownload;
    }
}));

let SoulseekService: any;

beforeAll(async () => {
    // Dynamic import to ensure the mock is picked up
    const module = await import('../soulseek.js');
    SoulseekService = module.SoulseekService;
});

describe('SoulseekService', () => {
    beforeAll(() => { jest.useFakeTimers(); });
    afterAll(() => { jest.useRealTimers(); });
    let service: any;

    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset environment variables for test isolation
        process.env = { ...originalEnv };
        service = new SoulseekService('/mock/music/dir', '/mock/download/dir');
    });

    afterEach(() => {
        process.env = originalEnv;
        service.disconnect();
    });

    describe('Connection Management', () => {
        it('should fail to connect if credentials are missing', async () => {
            delete process.env.SLSK_USER;
            delete process.env.SLSK_PASS;
            const result = await service.connect();
            expect(result).toBe(false);

            const status = await service.checkStatus();
            expect(status.connected).toBe(false);
            expect(status.username).toBeNull();
        });

        it('should connect successfully with provided credentials', async () => {
            mockConnect.mockResolvedValueOnce(undefined);

            const result = await service.connect('testuser', 'testpass');

            expect(result).toBe(true);
            expect(mockConnect).toHaveBeenCalled();
            expect(process.env.SOULSEEK_USER).toBe('testuser');
            expect(process.env.SOULSEEK_PASSWORD).toBe('testpass');
            expect(process.env.SOULSEEK_SHARED_MUSIC_DIR).toBe('/mock/music/dir');
            expect(process.env.SOULSEEK_DOWNLOAD_DIR).toBe('/mock/download/dir');

            const status = await service.checkStatus();
            expect(status.connected).toBe(true);
            expect(status.username).toBe('testuser');
        });

        it('should connect successfully using environment variables', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            process.env.SLSK_USER = 'envuser';
            process.env.SLSK_PASS = 'envpass';

            const result = await service.connect();

            expect(result).toBe(true);
            expect(process.env.SOULSEEK_USER).toBe('envuser');

            const status = await service.checkStatus();
            expect(status.username).toBe('envuser');
        });

        it('should return true if already connected with same username', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('reuseuser', 'pass');

            mockConnect.mockClear();
            const result2 = await service.connect('reuseuser', 'pass');

            expect(result2).toBe(true);
            expect(mockConnect).not.toHaveBeenCalled(); // Connection reuse
        });

        it('should handle connection errors gracefully', async () => {
            mockConnect.mockRejectedValueOnce(new Error('Connection timeout'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await service.connect('erruser', 'errpass');

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Soulseek Connection Error'), expect.any(Error));

            const status = await service.checkStatus();
            expect(status.connected).toBe(false);

            consoleSpy.mockRestore();
        });

        it('should clear state on disconnect', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            let status = await service.checkStatus();
            expect(status.connected).toBe(true);

            service.disconnect();

            status = await service.checkStatus();
            expect(status.connected).toBe(false);
            expect(status.username).toBeNull();
        });
    });

    describe('Search', () => {
        it('should return empty array if not connected', async () => {
            const results = await service.search('some query');
            expect(results).toEqual([]);
        });

        it('should return mapped results and populate cache on successful search', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            const mockSoulseekResults = [
                { user: 'user1', file: 'C:\\Music\\Artist - Title.mp3', size: 5000000, slots: true, bitrate: 320, speed: 1000 },
                { user: 'user2', file: '/home/music/Artist2 - Title2.flac', size: 25000000, slots: false }
            ];
            mockSearch.mockResolvedValueOnce(mockSoulseekResults);

            const results = await service.search('Artist - Title');

            expect(mockSearch).toHaveBeenCalledWith({
                artist: 'Artist',
                title: 'Title',
                minBitrate: 128,
                timeout: 10000,
                maxResults: 50,
                strictMatching: false
            });

            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({
                user: 'user1',
                file: 'C:\\Music\\Artist - Title.mp3',
                size: 5000000,
                slots: true,
                bitrate: 320,
                speed: 1000
            });
            expect(results[0].id).toBeDefined();

            // Verify cache hit
            const cachedResult = service['searchCache'].get(results[0].id);
            expect(cachedResult).toEqual(mockSoulseekResults[0]);
        });

        it('should handle search errors gracefully and return empty array', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            mockSearch.mockRejectedValueOnce(new Error('Search timeout'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const results = await service.search('Artist - Title');

            expect(results).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Soulseek Search Error'), expect.any(Error));

            consoleSpy.mockRestore();
        });

        it('should handle query parsing correctly without dash separator', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');
            mockSearch.mockResolvedValueOnce([]);

            await service.search('SingleQueryString');

            expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({
                artist: 'SingleQueryString',
                title: ''
            }));
        });
    });

    describe('Download', () => {
        const dummyResult = { id: 'dummy123', user: 'user1', file: 'C:\\Music\\Band\\Band - Song.mp3', size: 100, slots: true };

        it('should throw error if not connected', async () => {
            await expect(service.download(dummyResult)).rejects.toThrow('Soulseek client not connected');
        });

        it('should download successfully using cached result', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            const originalSearchResult = { user: 'user1', file: 'C:\\Music\\Band\\Band - Song.mp3' };
            service['searchCache'].set('dummy123', originalSearchResult);

            mockDownload.mockResolvedValueOnce({ path: '/downloads/Band - Song.mp3' });

            const path = await service.download(dummyResult);

            expect(path).toBe('/downloads/Band - Song.mp3');
            expect(mockDownload).toHaveBeenCalledWith(originalSearchResult, 'Band', 'Band - Song');
            expect(mockSearchAndDownload).not.toHaveBeenCalled();
        });

        it('should fall back to searchAndDownload if cache result is missing', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            // Cache is empty
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            mockSearchAndDownload.mockResolvedValueOnce('/downloads/robust.mp3');

            const path = await service.download(dummyResult);

            expect(path).toBe('/downloads/robust.mp3');
            expect(mockDownload).not.toHaveBeenCalled();
            expect(mockSearchAndDownload).toHaveBeenCalledWith('Band', 'Band - Song');
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('triggering robust searchAndDownload'));

            consoleSpy.mockRestore();
        });

        it('should fall back to searchAndDownload if direct download fails/times out (no path returned)', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            const originalSearchResult = { user: 'user1', file: 'C:\\Music\\Band\\Band - Song.mp3' };
            service['searchCache'].set('dummy123', originalSearchResult);

            // Return empty path (simulating failure without timeout flag)
            mockDownload.mockResolvedValueOnce({});
            mockSearchAndDownload.mockResolvedValueOnce('/downloads/fallback.mp3');
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            const path = await service.download(dummyResult);

            expect(path).toBe('/downloads/fallback.mp3');
            expect(mockDownload).toHaveBeenCalled();
            expect(mockSearchAndDownload).toHaveBeenCalledWith('Band', 'Band - Song');

            consoleSpy.mockRestore();
        });

        it('should throw error if fallback searchAndDownload fails', async () => {
            mockConnect.mockResolvedValueOnce(undefined);
            await service.connect('testuser', 'testpass');

            // Cache is empty
            mockSearchAndDownload.mockResolvedValueOnce(null); // No path found
            const consoleSpyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
            const consoleSpyErr = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(service.download(dummyResult)).rejects.toThrow('Download failed after all attempts and fallbacks');

            expect(consoleSpyErr).toHaveBeenCalledWith(expect.stringContaining('❌ Soulseek Download Error'), expect.any(Error));

            consoleSpyLog.mockRestore();
            consoleSpyErr.mockRestore();
        });

        it('should extract unknown artist and title gracefully if path format is weird', async () => {
             mockConnect.mockResolvedValueOnce(undefined);
             await service.connect('testuser', 'testpass');

             mockSearchAndDownload.mockResolvedValueOnce('/downloads/weird.mp3');
             const weirdResult = { id: 'dummy456', user: 'user1', file: 'weirdfile', size: 100, slots: true };
             const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

             await service.download(weirdResult);

             expect(mockSearchAndDownload).toHaveBeenCalledWith('Unknown Artist', 'weirdfile');

             consoleSpy.mockRestore();
        });
    });
});
