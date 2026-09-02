import { createPlaylistsRoutes } from '../playlists.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../core/database.js';

describe('Playlists Routes', () => {
    let app: express.Express;
    let mockDatabase: any;

    beforeEach(() => {
        mockDatabase = {
            getPlaylists: jest.fn().mockReturnValue([
                { id: 1, name: 'My Playlist', username: 'testuser', isPublic: false },
                { id: 2, name: 'Public Playlist', username: 'otheruser', isPublic: true }
            ]),
            getPlaylist: jest.fn(),
            getPlaylistTracks: jest.fn().mockReturnValue([]),
            createPlaylist: jest.fn().mockReturnValue(3),
            updatePlaylistVisibility: jest.fn(),
            updatePlaylistCover: jest.fn(),
            deletePlaylist: jest.fn(),
            addTrackToPlaylist: jest.fn(),
            removeTrackFromPlaylist: jest.fn(),
            getTrack: jest.fn(),
            getAlbum: jest.fn(),
            getGenres: jest.fn().mockReturnValue([]),
            getGenreTrackCounts: jest.fn().mockReturnValue({})
        };

        app = express();
        app.use(express.json());

        // Auth middleware mock
        app.use((req: any, res, next) => {
            req.username = req.headers['x-username'] || 'testuser';
            req.isAdmin = req.headers['x-is-admin'] === 'true';
            req.role = req.isAdmin ? 'admin' : 'user';
            req.context = { role: req.role as any, userId: 1 };
            req.isActive = true;
            next();
        });

        app.use('/api/playlists', createPlaylistsRoutes({
            config: { musicDir: "/test/music" },
            database: mockDatabase,
            library: mockDatabase
        } as any));
    });

    describe('GET /api/playlists/:id/public', () => {
        // The anonymous surface: no session, so a second app whose middleware
        // sets no username, mirroring how a remote player reaches it.
        let anonApp: express.Express;

        beforeEach(() => {
            // canConsumeTrack reaches for these; the shared mock predates it.
            mockDatabase.getRelease = jest.fn();
            mockDatabase.isTrackInPublicPlaylist = jest.fn().mockReturnValue(true);

            anonApp = express();
            anonApp.use(express.json());
            anonApp.use((req: any, _res, next) => {
                req.context = { role: 'guest' };
                next();
            });
            anonApp.use('/api/playlists', createPlaylistsRoutes({
                config: { musicDir: "/test/music" },
                database: mockDatabase,
                library: mockDatabase
            } as any));
        });

        test('returns a public playlist and its tracks without a session', async () => {
            mockDatabase.getPlaylist.mockReturnValue({
                id: 2, name: 'Public Playlist', username: 'otheruser', isPublic: true, description: 'desc'
            });
            mockDatabase.getPlaylistTracks.mockReturnValue([
                { id: 10, title: 'Track One', artist_name: 'A Band', album_id: 5, album_title: 'An Album', duration: 200 }
            ]);

            const response = await request(anonApp).get('/api/playlists/2/public');

            expect(response.status).toBe(200);
            expect(response.body.name).toBe('Public Playlist');
            expect(response.body.trackCount).toBe(1);
            expect(response.body.tracks[0]).toEqual({
                id: 10,
                title: 'Track One',
                artistName: 'A Band',
                albumId: 5,
                albumTitle: 'An Album',
                duration: 200,
                coverUrl: '/api/albums/5/cover',
                streamUrl: '/api/tracks/10/stream'
            });
        });

        test('never exposes the internal row: no file paths, no per-user fields', async () => {
            mockDatabase.getPlaylist.mockReturnValue({ id: 2, name: 'Public', username: 'u', isPublic: true });
            mockDatabase.getPlaylistTracks.mockReturnValue([
                { id: 11, title: 'T', artist_name: 'A', album_id: 1, file_path: '/srv/music/secret/T.flac', lossless_path: '/srv/lossless/T.flac' }
            ]);

            const response = await request(anonApp).get('/api/playlists/2/public');

            expect(response.status).toBe(200);
            const body = JSON.stringify(response.body);
            expect(body).not.toContain('/srv/music');
            expect(body).not.toContain('lossless');
            expect(response.body.tracks[0]).not.toHaveProperty('starred');
            expect(response.body.tracks[0]).not.toHaveProperty('path');
        });

        test('a private playlist is indistinguishable from a missing one', async () => {
            mockDatabase.getPlaylist.mockReturnValue({ id: 1, name: 'Mine', username: 'testuser', isPublic: false });
            const priv = await request(anonApp).get('/api/playlists/1/public');

            mockDatabase.getPlaylist.mockReturnValue(undefined);
            const missing = await request(anonApp).get('/api/playlists/999/public');

            expect(priv.status).toBe(404);
            expect(missing.status).toBe(404);
            expect(priv.body).toEqual(missing.body);
        });

        test('drops a track a guest may not consume', async () => {
            mockDatabase.getPlaylist.mockReturnValue({ id: 2, name: 'Public', username: 'u', isPublic: true });
            mockDatabase.getPlaylistTracks.mockReturnValue([
                { id: 12, title: 'Allowed', artist_name: 'A', album_id: 1 },
                // an orphan local file is only consumable through a public playlist
                { id: 13, title: 'Orphan', artist_name: 'B', album_id: null, file_path: '/srv/music/orphan.flac' }
            ]);
            mockDatabase.getAlbum.mockReturnValue({ id: 1, visibility: 'public' });
            mockDatabase.isTrackInPublicPlaylist = jest.fn().mockReturnValue(false);

            const response = await request(anonApp).get('/api/playlists/2/public');

            expect(response.status).toBe(200);
            expect(response.body.tracks.map((t: any) => t.title)).toEqual(['Allowed']);
        });

        test('rejects a non-numeric id', async () => {
            const response = await request(anonApp).get('/api/playlists/abc/public');
            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/playlists', () => {
        test('returns combined playlists for user', async () => {
            const response = await request(app)
                .get('/api/playlists')
                .set('x-username', 'testuser')
                .set('x-is-admin', 'false');

            expect(response.status).toBe(200);
            expect(mockDatabase.getPlaylists).toHaveBeenCalledTimes(2); // once for user, once for public
        });
    });

    describe('POST /api/playlists', () => {
        test('creates a new playlist', async () => {
            const response = await request(app)
                .post('/api/playlists')
                .send({ name: 'New Mix', description: 'desc', isPublic: true });

            expect(response.status).toBe(201);
            expect(mockDatabase.createPlaylist).toHaveBeenCalledWith('New Mix', 'testuser', 'desc', true);
        });
    });

    describe('DELETE /api/playlists/:id', () => {
        test('allows owner to delete playlist', async () => {
            mockDatabase.getPlaylist.mockReturnValue({ id: 1, username: 'testuser' });
            
            const response = await request(app)
                .delete('/api/playlists/1')
                .set('x-username', 'testuser');

            expect(response.status).toBe(200);
            expect(mockDatabase.deletePlaylist).toHaveBeenCalledWith(1);
        });

        test('denies non-owner from deleting playlist', async () => {
            mockDatabase.getPlaylist.mockReturnValue({ id: 2, username: 'otheruser' });
            
            const response = await request(app)
                .delete('/api/playlists/2')
                .set('x-username', 'testuser')
                .set('x-is-admin', 'false');

            expect(response.status).toBe(403);
        });
    });

    describe('GET /api/playlists/:id/cover', () => {
        test('prevents path traversal when serving cover images', async () => {
            mockDatabase.getPlaylist.mockReturnValue({
                id: 1,
                coverPath: '../../../../etc/passwd',
                username: 'testuser'
            });

            const response = await request(app)
                .get('/api/playlists/1/cover')
                .set('x-username', 'testuser');

            expect(response.status).toBe(404);
        });
    });
});

