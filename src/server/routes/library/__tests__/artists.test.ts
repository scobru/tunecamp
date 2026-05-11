import { createArtistsRoutes } from '../artists.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../database.js';

describe('Artists Routes', () => {
    let app: express.Express;
    let mockDatabase: any;
    const musicDir = '/tmp/music';

    beforeEach(() => {
        mockDatabase = {
            getArtists: jest.fn().mockReturnValue([
                { id: 1, name: 'Artist 1', slug: 'artist-1', isLibraryArtist: false },
                { id: 2, name: 'Artist 2', slug: 'artist-2', isLibraryArtist: true }
            ]),
            getReleases: jest.fn().mockReturnValue([]),
            getAlbums: jest.fn().mockReturnValue([]),
            isStarred: jest.fn().mockReturnValue(false),
            getItemRating: jest.fn().mockReturnValue(0),
            getArtist: jest.fn(),
            getArtistBySlug: jest.fn(),
            getReleasesByArtist: jest.fn().mockReturnValue([]),
            getAlbumsByArtist: jest.fn().mockReturnValue([]),
            getTracksByArtist: jest.fn().mockReturnValue([]),
            createArtist: jest.fn().mockReturnValue(3),
            getArtistByName: jest.fn().mockReturnValue(null),
            updateArtist: jest.fn(),
            deleteArtist: jest.fn()
        };

        app = express();
        app.use(express.json());

        // Auth middleware mock
        app.use((req: any, res, next) => {
            req.username = req.headers['x-username'] || 'testuser';
            req.isAdmin = req.headers['x-is-admin'] === 'true';
            req.artistId = req.headers['x-artist-id'] ? parseInt(req.headers['x-artist-id'] as string) : null;
            next();
        });

        app.use('/api/artists', createArtistsRoutes(mockDatabase as any, musicDir));
    });

    describe('GET /api/artists', () => {
        test('returns all artists for admin', async () => {
            const response = await request(app)
                .get('/api/artists')
                .set('x-is-admin', 'true');

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
        });

        test('filters out library artists with no content for non-admin', async () => {
            // Artist 2 is a library artist and has no releases/albums
            const response = await request(app)
                .get('/api/artists')
                .set('x-is-admin', 'false');

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(0); // Artist 1 also has no public releases in mock
        });
    });

    describe('POST /api/artists', () => {
        test('allows admin to create artist', async () => {
            const response = await request(app)
                .post('/api/artists')
                .set('x-is-admin', 'true')
                .send({ name: 'New Artist', bio: 'Bio' });

            expect(response.status).toBe(201);
            expect(mockDatabase.createArtist).toHaveBeenCalledWith('New Artist', 'Bio', undefined, undefined, undefined, undefined);
        });

        test('denies non-admin from creating artist', async () => {
            const response = await request(app)
                .post('/api/artists')
                .set('x-is-admin', 'false')
                .send({ name: 'New Artist' });

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/artists/:id', () => {
        test('returns 404 if artist not found', async () => {
            mockDatabase.getArtist.mockReturnValue(null);
            const response = await request(app).get('/api/artists/999');
            expect(response.status).toBe(404);
        });

        test('returns artist details for admin', async () => {
            const artist = { id: 1, name: 'Artist 1', slug: 'artist-1' };
            mockDatabase.getArtist.mockReturnValue(artist);
            
            const response = await request(app)
                .get('/api/artists/1')
                .set('x-is-admin', 'true');

            expect(response.status).toBe(200);
            expect(response.body.name).toBe('Artist 1');
        });
    });
});

