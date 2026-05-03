import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PublishingService } from './publishing.js';
import { createDatabase } from './database.js';
import type { ZenDBService } from './zendb.js';
import type { ActivityPubService } from './activitypub.js';
import type { ServerConfig } from './config.js';

const TEST_DB_PATH = ':memory:';

describe('PublishingService', () => {
    let db: ReturnType<typeof createDatabase>;
    let zendbMock: ZenDBService;
    let apMock: ActivityPubService;
    let configMock: ServerConfig;
    let storageMock: any;
    let publishingService: PublishingService;

    beforeEach(() => {
        // Setup DB
        db = createDatabase(TEST_DB_PATH);

        // Setup Mock ZenDB
        zendbMock = {
            registerSite: jest.fn().mockReturnValue(Promise.resolve()),
        } as unknown as ZenDBService;

        // Setup Mock ActivityPub
        apMock = {
            broadcastRelease: jest.fn().mockReturnValue(Promise.resolve()),
            broadcastDelete: jest.fn().mockReturnValue(Promise.resolve()),
            announceToRelay: jest.fn().mockReturnValue(Promise.resolve()),
            generateNote: jest.fn().mockReturnValue('mock-note'),
        } as unknown as ActivityPubService;

        // Setup Mock Storage
        storageMock = {
            ensureDir: jest.fn().mockReturnValue(Promise.resolve()),
            writeFile: jest.fn().mockReturnValue(Promise.resolve()),
            pathExists: jest.fn().mockReturnValue(Promise.resolve(true)),
        };

        // Setup Config
        configMock = {
            publicUrl: 'https://test.tunecamp.org',
            siteName: 'Test Site',
            musicDir: '/tmp/music'
        } as any;

        // Create Service
        publishingService = new PublishingService(db, zendbMock, apMock, configMock, storageMock);

        // Populate minimal data
        db.createArtist('Test Artist');
        // We need settings for site info
        db.setSetting('publicUrl', 'https://test.tunecamp.org');
        db.setSetting('siteName', 'Test Site');
        db.setSetting('artistName', 'Test Artist');
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    test('should call zendb.registerSite and ap.broadcastRelease when album is public and published_to_ap', async () => {
        // 1. Create an album (initially public)
        const albumId = db.createRelease({
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
            download: null,
            external_links: null,
            published_at: null,
            type: 'album',
            year: 2023,
            owner_id: null,
            price: 0,
            price_usdc: 0,
            currency: 'USD',
            status: 'released',
            license: null,
        });

        // Add a track
        db.createTrack({
            title: 'Test Track',
            album_id: albumId,
            artist_id: 1,
            track_num: 1,
            duration: 100,
            file_path: 'test.mp3',
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            lossless_path: null,
            waveform: null,
            url: null,
            service: null,
            external_artwork: null,
            owner_id: null,
            price: 0,
            price_usdc: 0,
            currency: 'USD'
        });

        await publishingService.syncRelease(albumId);

        expect(zendbMock.registerSite).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://test.tunecamp.org',
            title: 'Test Site',
            artistName: 'Test Artist'
        }));
        expect(apMock.broadcastRelease).toHaveBeenCalled();
        expect(apMock.broadcastDelete).not.toHaveBeenCalled();
    });

    test('should call ap.broadcastDelete when album visibility changes to private', async () => {
        const albumId = db.createRelease({
            title: 'Test Album',
            slug: 'test-album',
            artist_id: 1,
            date: '2023-01-01',
            visibility: 'private',
            published_to_gundb: true,
            published_to_ap: true,
            cover_path: null,
            genre: null,
            description: null,
            download: null,
            external_links: null,
            published_at: null,
            type: 'album',
            year: 2023,
            owner_id: null,
            price: 0,
            price_usdc: 0,
            currency: 'USD',
            status: 'released',
            license: null,
        });

        await publishingService.syncRelease(albumId);

        expect(zendbMock.registerSite).toHaveBeenCalled();
        expect(apMock.broadcastDelete).toHaveBeenCalled();
        expect(apMock.broadcastRelease).not.toHaveBeenCalled();
    });
});
