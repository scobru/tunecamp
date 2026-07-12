import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PublishingService } from './publishing.service.js';
import { createDatabase } from '../../core/database.js';
import type { FederatedDiscoveryService } from '../network/federated-discovery.service.js';
import type { ActivityPubService } from '../activitypub/activitypub.service.js';
import type { ServerConfig } from '../../core/config.js';

const TEST_DB_PATH = ':memory:';

describe('PublishingService', () => {
    let db: ReturnType<typeof createDatabase>;
    let federatedDiscoveryMock: FederatedDiscoveryService;
    let apMock: ActivityPubService;
    let configMock: ServerConfig;
    let storageMock: any;
    let publishingService: PublishingService;

    beforeEach(() => {
        db = createDatabase(TEST_DB_PATH);

        federatedDiscoveryMock = {
            getCommunitySites: jest.fn<any>().mockReturnValue([]),
        } as unknown as FederatedDiscoveryService;

        apMock = {
            broadcastRelease: jest.fn<any>().mockResolvedValue(undefined),
            broadcastDelete: jest.fn<any>().mockResolvedValue(undefined),
            broadcastPost: jest.fn<any>().mockResolvedValue(undefined),
            broadcastPostDelete: jest.fn<any>().mockResolvedValue(undefined),
            generateNote: jest.fn<any>().mockReturnValue({}),
            announceToRelay: jest.fn<any>().mockResolvedValue(undefined),
            followRemoteActor: jest.fn<any>().mockResolvedValue(undefined),
        } as unknown as ActivityPubService;

        configMock = {
            publicUrl: 'https://test.tunecamp.org',
            musicDir: '/tmp/music',
            siteName: 'Test Site',
        } as unknown as ServerConfig;

        storageMock = {
            ensureDir: jest.fn<any>().mockResolvedValue(undefined),
            writeFile: jest.fn<any>().mockResolvedValue(undefined),
        };

        publishingService = new PublishingService(db, federatedDiscoveryMock, apMock, configMock, storageMock);

        db.setSetting('publicUrl', 'https://test.tunecamp.org/');
        db.setSetting('siteName', 'Test Site');
        db.setSetting('artistName', 'Test Artist');
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    function createFullTrack(albumId: number) {
        return db.createTrack({
            title: 'Test Track',
            album_id: albumId,
            artist_id: 1,
            track_num: 1,
            duration: 100,
            file_path: 'test.mp3',
            owner_id: 1,
            price: 0,
            price_usdc: 0,
            price_usdt: 0,
            currency: 'USD',
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            lossless_path: null,
            url: null,
            service: null,
            external_artwork: null,
            lyrics: null,
            hash: null,
            waveform: null,
            external_id: null
        });
    }

    describe('setTorrentService', () => {
        test('should allow setting torrent service and using it for seeding', async () => {
            const torrentServiceMock = {
                seedFiles: jest.fn<any>().mockResolvedValue('magnet:?xt=urn:btih:testmagnet')
            };

            publishingService.setTorrentService(torrentServiceMock);

            db.createUser('testuser10', 'hash');
db.createArtist('Test Artist 10', 'bio', 'photo', [], null, null, 'public', 'external');
const albumId = db.createAlbum({
                title: 'Torrent Album',
                slug: 'torrent-album',
                artist_id: 1,
                date: '2023-01-01',
                visibility: 'public',
                published_to_gundb: true,
                published_to_ap: true,
                cover_path: null,
                genre: null,
                description: null,
                download: 'free',
                external_links: null,
                published_at: null,
                type: 'album',
                year: 2023,
                owner_id: 1,
                price: 0,
                price_usdc: 0,
                currency: 'USD',
                status: 'released',
                license: null,
                is_public: true,
                is_release: false,
                use_nft: true,
                album_artist: null
            });
            createFullTrack(albumId);
            db.promoteToRelease(albumId);

            await publishingService.syncRelease(albumId);

            expect(torrentServiceMock.seedFiles).toHaveBeenCalled();
        });
    });

    describe('syncCommunityFollows', () => {
        test('should discover and follow new community sites', async () => {
            federatedDiscoveryMock.getCommunitySites = jest.fn<any>().mockReturnValue([
                { url: 'https://othercamp.org', name: 'Other Camp' },
                { url: 'https://test.tunecamp.org/', name: 'My Own Camp' },
                { url: 'http://localhost:8080', name: 'Local' }
            ]);

            db.getRemoteActors = jest.fn<any>().mockReturnValue([{ uri: 'https://existingcamp.org/users/site' }]);

            federatedDiscoveryMock.getCommunitySites = jest.fn<any>().mockReturnValue([
                { url: 'https://othercamp.org', name: 'Other Camp' },
                { url: 'https://existingcamp.org', name: 'Existing Camp' },
            ]);

            const result = await publishingService.syncCommunityFollows();

            expect(result.discovered).toBe(2);
            expect(result.followed).toBe(1);

            expect(apMock.followRemoteActor).toHaveBeenCalledWith(
                'https://othercamp.org/users/site',
                expect.any(String)
            );
        });

        test('should return 0 when publicUrl is missing', async () => {
            db.setSetting('publicUrl', '');
            (publishingService as any).config.publicUrl = '';

            const result = await publishingService.syncCommunityFollows();
            expect(result).toEqual({ discovered: 0, followed: 0 });
        });

        test('should handle discovery errors gracefully', async () => {
            federatedDiscoveryMock.getCommunitySites = jest.fn<any>().mockImplementation(() => {
                throw new Error('Discovery Failed');
            });

            const result = await publishingService.syncCommunityFollows();
            expect(result).toEqual({ discovered: 0, followed: 0 });
        });
    });

    describe('syncPost', () => {
        test('should publish post to AP if public', async () => {
            db.createUser('testuser1', 'hash');
            const postId = db.createPost(db.createArtist('Test Artist 1', 'bio', 'photo', [], null, null, 'public', 'external'), 'Public Post Content', 'public', 'Public Post');
            await publishingService.syncPost(postId);
            expect(apMock.broadcastPost).toHaveBeenCalled();
        });

        test('should unpublish post from AP if not public', async () => {
            db.createUser('testuser2', 'hash');
            const postId = db.createPost(db.createArtist('Test Artist 2', 'bio', 'photo', [], null, null, 'public', 'external'), 'Private Post Content', 'private', 'Private Post');
            await publishingService.syncPost(postId);
            expect(apMock.broadcastPostDelete).toHaveBeenCalled();
        });
    });
});
