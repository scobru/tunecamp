import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../core/database.js';
import { Scanner } from '../modules/catalog/scanner.js';
import { runStartupMaintenance } from '../modules/catalog/maintenance.startup.js';
import path from 'path';
import fs from 'fs-extra';

const TEST_DB_PATH = ':memory:';
const TEST_MUSIC_DIR = path.join(process.cwd(), 'test-music-orphan');

describe('Orphan Release Fix Verification', () => {
    let db: any;
    let scanner: any;

    const mockStorageEngine = {
        pathExists: jest.fn().mockResolvedValue(true as never),
        readdir: jest.fn().mockResolvedValue([] as never),
        readFile: jest.fn().mockResolvedValue('' as never),
        remove: jest.fn(),
        move: jest.fn(),
        ensureDir: jest.fn(),
        writeFile: jest.fn()
    };

    beforeEach(async () => {
        db = createDatabase(TEST_DB_PATH);
        scanner = new Scanner(db, mockStorageEngine as any);
        await fs.ensureDir(TEST_MUSIC_DIR);
    });

    afterEach(async () => {
        if (db && db.db) db.db.close();
        await fs.remove(TEST_MUSIC_DIR);
    });

    test('Scanner should fix orphan releases with tracks linked via release_tracks and set ownership', async () => {
        const artistId = db.createArtist('Orphan Master');

        const albumId = db.createAlbum({
            title: 'Orphaned Release',
            slug: 'orphaned-release',
            artist_id: null,
            date: '2023-01-01',
            is_public: true,
            visibility: 'public',
            published_to_gundb: true,
            published_to_ap: true,
            cover_path: null,
            genre: null,
            description: null,
            download: null,
            price: 0,
            currency: 'ETH',
            external_links: null,
            published_at: null,
            type: 'album',
            year: 2023,
            license: null
        });

        db.createTrack({
            title: 'Foundling Track',
            album_id: albumId,
            artist_id: artistId,
            track_num: 1,
            duration: 100,
            file_path: 'tracks/foundling.mp3',
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            price: 0,
            currency: 'ETH',
            lossless_path: null,
            waveform: null
        });

        let album = db.getAlbum(albumId);
        expect(album.artist_id).toBeNull();
        expect(album.owner_id).toBeNull();

        db.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash, role) VALUES (?, ?, ?)").run("admin", "admin", "admin");

        await runStartupMaintenance(db, { musicDir: TEST_MUSIC_DIR } as any);

        album = db.getAlbum(albumId);
        expect(album.artist_id).toBe(artistId);
    });

    test('Scanner should correctly determine artist from folder map if skiped in config', async () => {
        const artistId = db.createArtist('Folder Artist');
        const artistDir = path.join(TEST_MUSIC_DIR, 'folder-artist');
        await fs.ensureDir(artistDir);

        (scanner as any).folderToArtistMap.set(artistDir, artistId);

        const releaseDir = path.join(artistDir, 'some-release');
        await fs.ensureDir(releaseDir);

        mockStorageEngine.readFile.mockResolvedValue('title: New Release\ndate: 2023-01-01' as never);

        await (scanner as any).processReleaseConfig(path.join(releaseDir, 'release.yaml'), TEST_MUSIC_DIR);

        const album = db.getReleaseBySlug('new-release');
        expect(album).toBeDefined();
        expect(album.artist_id).toBe(artistId);
    });

    test('Scanner should delete empty implicit library albums', async () => {
        const albumId = db.createAlbum({
            title: 'Empty Library Folder',
            slug: 'empty-library-folder',
            artist_id: null,
            date: '2023-01-01',
            is_public: false,
            visibility: 'private',
            is_release: false,
            published_to_gundb: false,
            published_to_ap: false,
            cover_path: null,
            genre: null,
            description: null,
            download: null,
            price: 0,
            currency: 'ETH',
            external_links: null,
            published_at: null,
            type: 'album',
            year: 2023,
            license: null
        });

        let album = db.getAlbum(albumId);
        expect(album).toBeDefined();

        await (scanner as any).librarySync.cleanupEmptyEntities();

        album = db.getAlbum(albumId);
        expect(album).toBeUndefined();
    });
});
