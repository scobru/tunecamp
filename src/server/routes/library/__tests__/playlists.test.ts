import { createPlaylistsRoutes } from '../playlists.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../database.js';

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

        app.use('/api/playlists', createPlaylistsRoutes(mockDatabase as any));
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
});

