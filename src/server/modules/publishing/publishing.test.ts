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
    let originalFetch: any;
    let mockFetch: any;

    beforeEach(() => {
        // Setup DB
        db = createDatabase(TEST_DB_PATH);

        // Setup Mock FederatedDiscovery
        federatedDiscoveryMock = {
            getCommunitySites: jest.fn<any>().mockReturnValue([]),
        } as unknown as FederatedDiscoveryService;

        // Setup Mock ActivityPub
        apMock = {
            broadcastRelease: jest.fn().mockReturnValue(Promise.resolve()),
            broadcastDelete: jest.fn().mockReturnValue(Promise.resolve()),
            announceToRelay: jest.fn().mockReturnValue(Promise.resolve()),
            generateNote: jest.fn().mockReturnValue('mock-note'),
            broadcastPost: jest.fn().mockReturnValue(Promise.resolve()),
            broadcastPostDelete: jest.fn().mockReturnValue(Promise.resolve()),
        } as unknown as ActivityPubService;

        // Mock global fetch
        originalFetch = global.fetch;
        mockFetch = jest.fn().mockImplementation(() => Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('ok')
        }));
        global.fetch = mockFetch;

        // Setup Mock Storage
        storageMock = {
            ensureDir: jest.fn().mockReturnValue(Promise.resolve()),
            writeFile: jest.fn().mockReturnValue(Promise.resolve()),
            pathExists: jest.fn().mockReturnValue(Promise.resolve(true)),
            readFile: jest.fn().mockReturnValue(Promise.resolve('')),
        };

        // Setup Config
        configMock = {
            publicUrl: 'https://test.tunecamp.org',
            siteName: 'Test Site',
            musicDir: '/tmp/music'
        } as any;

        // Create Service
        publishingService = new PublishingService(db, federatedDiscoveryMock, apMock, configMock, storageMock);

        // Populate minimal data
        db.createArtist('Test Artist');
        // Create an admin user for ownership
        (db as any).db.prepare("INSERT INTO admin (username, password_hash, role) VALUES (?, ?, ?)").run('admin', 'hash', 'admin');
        
        db.setSetting('publicUrl', 'https://test.tunecamp.org');
        db.setSetting('siteName', 'Test Site');
        db.setSetting('artistName', 'Test Artist');
    });

    afterEach(() => {
        global.fetch = originalFetch;
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

    test('should call ap.broadcastRelease when album is public and published_to_ap', async () => {
        const albumId = db.createAlbum({
            title: 'Test Album',
            slug: 'test-album',
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

        expect(apMock.broadcastRelease).toHaveBeenCalled();
    });

    test('should NOT federate a public release that is not yet released (draft)', async () => {
        const albumId = db.createAlbum({
            title: 'Draft Album',
            slug: 'draft-album',
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
            status: 'draft',
            license: null,
            is_public: true,
            is_release: false,
            use_nft: true,
            album_artist: null
        });

        createFullTrack(albumId);
        db.promoteToRelease(albumId); // sets is_release=1 (and status=released)...
        db.updateAlbumStatus(albumId, 'draft'); // ...but this release isn't released yet

        await publishingService.syncRelease(albumId);

        // Public visibility alone must not federate: the site catalog needs
        // status='released', so AP must match — otherwise it's "in AP, not on site".
        expect(apMock.broadcastRelease).not.toHaveBeenCalled();
        // It was marked published_to_ap, so it self-heals: Delete + clear flag.
        expect(apMock.broadcastDelete).toHaveBeenCalled();
        expect(db.getRelease(albumId)?.published_to_ap).toBeFalsy();
    });

    test('should call ap.broadcastDelete when album visibility changes to private', async () => {
        const albumId = db.createAlbum({
            title: 'Test Album',
            slug: 'test-album',
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

        // First sync as public
        await publishingService.syncRelease(albumId);
        expect(apMock.broadcastRelease).toHaveBeenCalled();

        // Change to private
        db.updateAlbumVisibility(albumId, 'private');
        
        // Second sync as private
        await publishingService.syncRelease(albumId);

        expect(apMock.broadcastDelete).toHaveBeenCalled();
    });

    test('should cross-post a public post to Mastodon when credentials are set', async () => {
        // Configure Mastodon credentials for Artist ID 1
        (db as any).db.prepare("UPDATE artists SET post_params = ? WHERE id = ?").run(
            JSON.stringify({ instance: 'https://livellosegreto.it/', token: 'my-secret-token' }),
            1
        );

        const postId = db.createPost(1, '<p>This is a <strong>cool</strong> test post!</p>', 'public', 'Hello Mastodon');
        const post = db.getPost(postId)!;

        await publishingService.publishPostToAP(post);

        expect(apMock.broadcastPost).toHaveBeenCalledWith(post);
        expect(mockFetch).toHaveBeenCalled();
        
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[0]).toBe('https://livellosegreto.it/api/v1/statuses');
        expect(callArgs[1].method).toBe('POST');
        expect(callArgs[1].headers['Authorization']).toBe('Bearer my-secret-token');
        
        const body = JSON.parse(callArgs[1].body);
        expect(body.status).toContain('Hello Mastodon');
        expect(body.status).toContain('This is a cool test post!');
        expect(body.status).toContain('https://test.tunecamp.org/post/');
    });

    test('should cross-post a public release to Mastodon when credentials are set', async () => {
        (db as any).db.prepare("UPDATE artists SET post_params = ? WHERE id = ?").run(
            JSON.stringify({ instance: 'livellosegreto.it', token: 'release-token' }),
            1
        );

        const albumId = db.createAlbum({
            title: 'Test Album',
            slug: 'test-album',
            artist_id: 1,
            date: '2023-01-01',
            visibility: 'public',
            published_to_gundb: true,
            published_to_ap: true,
            cover_path: null,
            genre: null,
            description: '<p>Release description here</p>',
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

        expect(apMock.broadcastRelease).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalled();

        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[0]).toBe('https://livellosegreto.it/api/v1/statuses');
        expect(callArgs[1].method).toBe('POST');
        expect(callArgs[1].headers['Authorization']).toBe('Bearer release-token');

        const body = JSON.parse(callArgs[1].body);
        expect(body.status).toContain('New release: "Test Album"');
        expect(body.status).toContain('Release description here');
        expect(body.status).toContain('https://test.tunecamp.org/releases/test-album');
    });

    test('should gracefully handle Mastodon API failures and not crash the process', async () => {
        (db as any).db.prepare("UPDATE artists SET post_params = ? WHERE id = ?").run(
            JSON.stringify({ instance: 'http://error-mastodon.com', token: 'error-token' }),
            1
        );

        // Mock fetch to return 500 error
        mockFetch.mockImplementationOnce(() => Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () => Promise.resolve('Error details')
        }));

        const postId = db.createPost(1, 'Post that fails mirroring', 'public');
        const post = db.getPost(postId)!;

        // This should not throw an error
        await expect(publishingService.publishPostToAP(post)).resolves.not.toThrow();
        expect(apMock.broadcastPost).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalled();
    });
});
