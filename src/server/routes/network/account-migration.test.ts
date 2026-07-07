import { describe, test, expect } from '@jest/globals';
import { validateArchive, resolvePlaylists, ARCHIVE_VERSION } from './account-migration.js';

describe('account-migration archive', () => {
    test('validateArchive rejects wrong version and bad shape', () => {
        expect(() => validateArchive(null)).toThrow();
        expect(() => validateArchive({ version: 999, playlists: [] })).toThrow();
        expect(() => validateArchive({ version: ARCHIVE_VERSION, playlists: "nope" })).toThrow();
        expect(() => validateArchive({ version: ARCHIVE_VERSION, playlists: [{ name: 'x' }] })).toThrow();
        expect(validateArchive({ version: ARCHIVE_VERSION, playlists: [] })).toBeTruthy();
    });

    test('resolvePlaylists maps resolvable tracks and reports the rest', () => {
        // Local catalog: only "Song A" by "Artist" exists.
        const findTrack = (title: string, artist: string): number | null =>
            title.toLowerCase() === 'song a' && artist.toLowerCase() === 'artist' ? 42 : null;

        const { resolved, skipped } = resolvePlaylists([
            {
                name: 'Mix',
                is_public: true,
                tracks: [
                    { title: 'Song A', artist: 'Artist' },   // resolves -> 42
                    { title: 'Missing', artist: 'Nobody' },   // skipped
                ],
            },
        ], findTrack);

        expect(resolved).toHaveLength(1);
        expect(resolved[0]!.trackIds).toEqual([42]);
        expect(resolved[0]!.is_public).toBe(true);
        expect(skipped).toEqual([{ playlist: 'Mix', title: 'Missing', artist: 'Nobody' }]);
    });
});

import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createAccountMigrationRoutes } from './account-migration.js';
import { jest } from '@jest/globals';

describe('createAccountMigrationRoutes', () => {
    let app: express.Express;
    let mockLibrary: any;
    let mockApService: any;
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, also_known_as TEXT);
            CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT, artist_name TEXT, artist_id INTEGER);
        `);
        db.exec(`
            INSERT INTO artists (id, name, slug, also_known_as) VALUES (1, 'The Artist', 'the-artist', '[]');
            INSERT INTO artists (id, name, slug, also_known_as) VALUES (2, 'Linked Artist', 'linked-artist', '["https://old.example.com/users/old"]');
            INSERT INTO tracks (id, title, artist_name) VALUES (42, 'Song A', 'Artist');
            INSERT INTO tracks (id, title, artist_name) VALUES (43, 'No Artist Song', NULL);
        `);

        mockLibrary = {
            getPlaylists: jest.fn(),
            getPlaylistTracks: jest.fn(),
            createPlaylist: jest.fn(),
            addTrackToPlaylist: jest.fn(),
        };

        mockApService = {
            setAlsoKnownAs: jest.fn(),
        };

        const container: any = {
            library: mockLibrary,
            database: {
                db,
                getSetting: (k: string) => k === 'publicUrl' ? 'https://music.example.com/' : null,
                getArtist: (id: number) => {
                    const row = db.prepare('SELECT * FROM artists WHERE id = ?').get(id) as any;
                    if (!row) return null;
                    return { ...row, also_known_as: JSON.parse(row.also_known_as) };
                },
            },
            config: {},
            apService: mockApService,
        };

        app = express();

        // Mock authentication middleware
        app.use((req: any, res, next) => {
            if (req.headers['x-user']) {
                req.username = req.headers['x-user'];
                req.isActive = req.headers['x-active'] !== 'false';
                if (req.headers['x-artist-id']) {
                    req.artistId = Number(req.headers['x-artist-id']);
                }
            }
            next();
        });

        app.use('/api/account', createAccountMigrationRoutes(container));
    });

    afterEach(() => {
        db.close();
    });

    describe('GET /export', () => {
        test('returns 401 if unauthorized', async () => {
            const res = await request(app).get('/api/account/export');
            expect(res.status).toBe(401);
        });

        test('exports archive for plain user', async () => {
            mockLibrary.getPlaylists.mockReturnValue([
                { id: 1, name: 'My Mix', username: 'alice', isPublic: true },
                { id: 2, name: 'Other Mix', username: 'bob', isPublic: false }
            ]);
            mockLibrary.getPlaylistTracks.mockReturnValue([
                { title: 'Song A', artist_name: 'Artist', duration: 180 },
                { title: 'Song B', artist_id: 1 } // relies on getArtist fallback
            ]);

            const res = await request(app).get('/api/account/export').set('x-user', 'alice');
            expect(res.status).toBe(200);
            expect(res.header['content-disposition']).toBe('attachment; filename="tunecamp-account-alice.json"');

            const body = res.body;
            expect(body.version).toBe(1);
            expect(body.username).toBe('alice');
            expect(body.actor_uri).toBe('https://music.example.com/users/alice');
            expect(body.playlists).toHaveLength(1); // Only alice's
            expect(body.playlists[0].name).toBe('My Mix');
            expect(body.playlists[0].tracks).toHaveLength(2);
            expect(body.playlists[0].tracks[1].artist).toBe('The Artist');
        });

        test('exports archive with correct actor_uri for artist user', async () => {
            mockLibrary.getPlaylists.mockReturnValue([]);
            const res = await request(app).get('/api/account/export').set('x-user', 'artist').set('x-artist-id', '1');
            expect(res.status).toBe(200);
            expect(res.body.actor_uri).toBe('https://music.example.com/users/the-artist');
        });

        test('handles errors', async () => {
            mockLibrary.getPlaylists.mockImplementation(() => { throw new Error('DB Error'); });
            const res = await request(app).get('/api/account/export').set('x-user', 'alice');
            expect(res.status).toBe(500);
        });
    });

    describe('POST /import', () => {
        const validArchive = {
            version: 1,
            actor_uri: 'https://old.example.com/users/old',
            playlists: [
                {
                    name: 'Imported Mix',
                    tracks: [
                        { title: 'Song A', artist: 'Artist' },
                        { title: 'No Artist Song' },
                        { title: 'Missing', artist: 'Nobody' }
                    ]
                }
            ]
        };

        test('returns 401 if unauthorized', async () => {
            const res = await request(app).post('/api/account/import').send(validArchive);
            expect(res.status).toBe(401);
        });

        test('returns 403 if account inactive', async () => {
            const res = await request(app).post('/api/account/import').set('x-user', 'alice').set('x-active', 'false').send(validArchive);
            expect(res.status).toBe(403);
        });

        test('returns 400 for invalid archive', async () => {
            const res = await request(app).post('/api/account/import').set('x-user', 'alice').send({ version: 999 });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Unsupported archive version');
        });

        test('imports playlists, resolves tracks, links identity if artist', async () => {
            mockLibrary.createPlaylist.mockReturnValue(99);

            const res = await request(app)
                .post('/api/account/import')
                .set('x-user', 'artist')
                .set('x-artist-id', '1')
                .send(validArchive);

            expect(res.status).toBe(200);
            expect(res.body.imported_playlists).toBe(1);
            expect(res.body.imported_tracks).toBe(2);
            expect(res.body.skipped_tracks).toBe(1);
            expect(res.body.identity_linked).toBe(true);

            expect(mockLibrary.createPlaylist).toHaveBeenCalledWith('Imported Mix', 'artist', '', false);
            expect(mockLibrary.addTrackToPlaylist).toHaveBeenCalledTimes(2);
            expect(mockLibrary.addTrackToPlaylist).toHaveBeenCalledWith(99, 42); // Song A
            expect(mockLibrary.addTrackToPlaylist).toHaveBeenCalledWith(99, 43); // No Artist Song

            expect(mockApService.setAlsoKnownAs).toHaveBeenCalledWith(1, ['https://old.example.com/users/old']);
        });

        test('does not link identity if already present', async () => {
            mockLibrary.createPlaylist.mockReturnValue(99);

            const res = await request(app)
                .post('/api/account/import')
                .set('x-user', 'artist')
                .set('x-artist-id', '2') // Artist 2 already has this alias
                .send(validArchive);

            expect(res.status).toBe(200);
            expect(res.body.identity_linked).toBe(true);
            expect(mockApService.setAlsoKnownAs).not.toHaveBeenCalled();
        });

        test('provides identity_note if plain user with actor_uri', async () => {
            mockLibrary.createPlaylist.mockReturnValue(99);

            const res = await request(app)
                .post('/api/account/import')
                .set('x-user', 'alice') // plain user
                .send(validArchive);

            expect(res.status).toBe(200);
            expect(res.body.identity_linked).toBe(false);
            expect(res.body.identity_note).toContain('requires a linked artist profile');
        });

        test('handles errors during import', async () => {
            mockLibrary.createPlaylist.mockImplementation(() => { throw new Error('DB Error'); });
            const res = await request(app)
                .post('/api/account/import')
                .set('x-user', 'alice')
                .send(validArchive);

            expect(res.status).toBe(500);
        });
    });
});
