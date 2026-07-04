import { jest } from '@jest/globals';

jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn(),
    Response: class {},
    Request: class {},
    Headers: class {},
    Blob: class {},
}));

const mockClientAdd = jest.fn();
const mockClientGet = jest.fn();
const mockClientSeed = jest.fn();
const mockOn = jest.fn();

jest.unstable_mockModule('webtorrent', () => ({
    default: class MockWebTorrent {
        on = mockOn;
        torrents = [];
        seed = mockClientSeed;
        add = mockClientAdd;
        get = mockClientGet;
        destroy = jest.fn();
    }
}));

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
let TorrentService: any;

describe('TorrentService', () => {
    let service: any;
    let mockDb: any;
    let mockScanner: any;

    beforeEach(async () => {
        const mod = await import('../torrent.service.js');
        TorrentService = mod.TorrentService;

        mockDb = {
            getTorrents: jest.fn().mockReturnValue([]),
            getTorrent: jest.fn(),
            createTorrent: jest.fn(),
            updateTorrentStatus: jest.fn(),
            deleteTorrent: jest.fn(),
            updateTorrentProgress: jest.fn(),
            db: {
                prepare: jest.fn().mockReturnValue({ run: jest.fn() })
            }
        };
        mockScanner = {
            processAudioFile: jest.fn()
        };

        jest.useFakeTimers();

        service = new TorrentService(mockDb, mockScanner, '/mock/music/dir');
    });

    afterEach(() => {
        service.shutdown();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('parseInfoHashFromMagnet', () => {
        it('should correctly extract info hash from a valid magnet URI', () => {
            const hash = service.parseInfoHashFromMagnet('magnet:?xt=urn:btih:d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb&dn=Some+Release');
            expect(hash).toBe('d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb');
        });

        it('should return null for invalid or missing magnet URI', () => {
            expect(service.parseInfoHashFromMagnet('')).toBeNull();
            expect(service.parseInfoHashFromMagnet('not-a-magnet')).toBeNull();
        });
    });

    describe('addTorrent', () => {
        it('should add a new torrent and return the info hash', async () => {
            // Fast-forward so init() sets this.client
            jest.advanceTimersByTime(5000);

            const magnetUri = 'magnet:?xt=urn:btih:d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb&dn=Some+Release';
            mockClientGet.mockReturnValue(null);

            const mockTorrent = {
                infoHash: 'd1a938c35d92e85a6a66dc18395df3d2e9ccf0eb',
                name: 'Some Release',
                on: jest.fn()
            };
            mockClientAdd.mockReturnValue(mockTorrent);

            const hash = await service.addTorrent(magnetUri, 1);

            expect(hash).toBe('d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb');
            expect(mockClientAdd).toHaveBeenCalledWith(magnetUri, expect.any(Object));
            expect(mockDb.createTorrent).toHaveBeenCalledWith(expect.objectContaining({
                info_hash: 'd1a938c35d92e85a6a66dc18395df3d2e9ccf0eb',
                status: 'metadata'
            }));
            expect(service['metadataStartedAt'].has('d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb')).toBe(true);
        });

        it('should return existing info hash if torrent is already active', async () => {
            jest.advanceTimersByTime(5000);
            const magnetUri = 'magnet:?xt=urn:btih:d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb&dn=Some+Release';

            mockClientGet.mockReturnValue({
                infoHash: 'd1a938c35d92e85a6a66dc18395df3d2e9ccf0eb'
            });

            const hash = await service.addTorrent(magnetUri, 1);
            expect(hash).toBe('d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb');
            expect(mockClientAdd).not.toHaveBeenCalled();
            expect(mockDb.createTorrent).not.toHaveBeenCalled();
        });

        it('should throw an error if client is not initialized', async () => {
            // Note: client is initialized after 5 seconds, so we don't advance timers here
            const magnetUri = 'magnet:?xt=urn:btih:d1a938c35d92e85a6a66dc18395df3d2e9ccf0eb&dn=Some+Release';
            await expect(service.addTorrent(magnetUri, 1)).rejects.toThrow('Torrent client not initialized');
        });
    });

    describe('seedFiles', () => {
        const seedWith = async (name: string, artist?: string) => {
            jest.advanceTimersByTime(5000);
            const fs = (await import('../../../../utils/fs.js')).default;
            const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            mockClientSeed.mockImplementation((_files: any, opts: any, cb: any) => {
                cb({ infoHash: 'ABCDEF', magnetURI: 'magnet:?xt=urn:btih:abcdef', name: opts.name, on: jest.fn() });
            });
            await service.seedFiles(['/music/a.flac'], name, 1, artist);
            existsSpy.mockRestore();
            return mockClientSeed.mock.calls[0][1] as any;
        };

        it('should prefix torrent name with artist', async () => {
            const opts = await seedWith('Kind of Blue', 'Miles Davis');
            expect(opts.name).toBe('Miles Davis - Kind of Blue');
            expect(mockDb.createTorrent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Miles Davis - Kind of Blue', artist: 'Miles Davis' }));
        });

        it('should not double-prefix when caller already combined the name', async () => {
            const opts = await seedWith('Miles Davis - Kind of Blue', 'Miles Davis');
            expect(opts.name).toBe('Miles Davis - Kind of Blue');
        });

        it('should keep bare name when artist is missing', async () => {
            const opts = await seedWith('Kind of Blue');
            expect(opts.name).toBe('Kind of Blue');
        });
    });

    describe('sweepStuckMetadata', () => {
        it('should mark torrents as error if they have been stuck on metadata for too long', () => {
            jest.advanceTimersByTime(5000); // Initialize client

            service['metadataStartedAt'].set('hash1', Date.now() - (6 * 60 * 1000)); // 6 minutes ago
            service['metadataStartedAt'].set('hash2', Date.now()); // Just started

            // Need client to have `torrents` property
            service['client'].torrents = [];

            service.sweepStuckMetadata();

            expect(mockDb.updateTorrentStatus).toHaveBeenCalledWith('hash1', 'error');
            expect(mockDb.updateTorrentStatus).not.toHaveBeenCalledWith('hash2', 'error');
            expect(service['metadataStartedAt'].has('hash1')).toBe(false);
            expect(service['metadataStartedAt'].has('hash2')).toBe(true);
        });

        it('should delete from tracking if torrent is live and ready', () => {
            jest.advanceTimersByTime(5000); // Initialize client
            service['metadataStartedAt'].set('hash1', Date.now());
            service['client'].torrents = [{ infoHash: 'hash1', ready: true }];

            service.sweepStuckMetadata();

            expect(mockDb.updateTorrentStatus).not.toHaveBeenCalled();
            expect(service['metadataStartedAt'].has('hash1')).toBe(false);
        });
    });

    describe('removeTorrent', () => {
         it('should destroy torrent in client and delete from database', async () => {
            jest.advanceTimersByTime(5000);
            const mockDestroy = jest.fn((opts: any, cb?: any) => { if (typeof cb === "function") cb(); else if (typeof opts === "function") opts(); });
            mockClientGet.mockReturnValue({
                infoHash: 'hash1',
                destroy: mockDestroy
            });

            service['metadataStartedAt'].set('hash1', Date.now());

            await service.removeTorrent('hash1');

            expect(mockDestroy).toHaveBeenCalled();
            expect(mockDb.deleteTorrent).toHaveBeenCalledWith('hash1');
            expect(service['metadataStartedAt'].has('hash1')).toBe(false);
         });
    });
});
