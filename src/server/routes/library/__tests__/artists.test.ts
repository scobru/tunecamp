import { createArtistsRoutes } from '../artists.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../core/database.js';

describe('Artists Routes', () => {
    let app: express.Express;
    let mockDatabase: any;
    const musicDir = '/tmp/music';

    beforeEach(() => {
        mockDatabase = {
            getArtists: jest.fn().mockReturnValue([
                { id: 1, name: 'Artist with Release', slug: 'artist-1', visibility: 'public' },
                { id: 2, name: 'Artist with Album', slug: 'artist-2', visibility: 'public' },
                { id: 3, name: 'Private Artist', slug: 'artist-3', visibility: 'private' }
            ]),
            getReleases: jest.fn().mockImplementation((publicOnly) => {
                return publicOnly ? [{ id: 101, artist_id: 1, title: 'Release 1' }] : [];
            }),
            getAlbums: jest.fn().mockImplementation((publicOnly) => {
                return publicOnly ? [{ id: 201, artist_id: 2, title: 'Album 1' }] : [];
            }),
            isStarred: jest.fn().mockReturnValue(false),
            getItemRating: jest.fn().mockReturnValue(0),
            getArtist: jest.fn(),
            getArtistBySlug: jest.fn(),
            getReleasesByArtist: jest.fn().mockReturnValue([]),
            getAlbumsByArtist: jest.fn().mockReturnValue([]),
            getTracksByArtist: jest.fn().mockReturnValue([]),
            getStarredItems: jest.fn().mockReturnValue([]),
            createArtist: jest.fn().mockReturnValue(4),
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
            req.isSuperUser = req.headers['x-is-superuser'] === 'true';
            req.artistId = req.headers['x-artist-id'] ? parseInt(req.headers['x-artist-id'] as string) : null;
            next();
        });

        const mockMetadataService = {
            searchArtist: jest.fn().mockReturnValue([])
        };
        app.use('/api/artists', createArtistsRoutes(mockDatabase as any, musicDir, mockMetadataService as any, {} as any, {} as any));
    });

    describe('GET /api/artists', () => {
        test('returns all artists for admin', async () => {
            const response = await request(app)
                .get('/api/artists')
                .set('x-is-admin', 'true');

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(3);
        });

        test('only returns artists with formal releases for non-admin', async () => {
            const response = await request(app)
                .get('/api/artists')
                .set('x-is-admin', 'false');

            expect(response.status).toBe(200);
            // Artist 1 has a release. Artist 2 only has an album. Artist 3 is private.
            expect(response.body).toHaveLength(1);
            expect(response.body[0].id).toBe(1);
        });

        test('returns own artist profile even if no formal release', async () => {
            const response = await request(app)
                .get('/api/artists')
                .set('x-is-admin', 'false')
                .set('x-artist-id', '2'); // Artist 2 is requesting

            expect(response.status).toBe(200);
            // Artist 1 (public release) and Artist 2 (self)
            expect(response.body).toHaveLength(2);
            const ids = response.body.map((a: any) => a.id);
            expect(ids).toContain(1);
            expect(ids).toContain(2);
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

        test('returns artist with private album if user has starred a track in it', async () => {
            const artist = { id: 1, name: 'Artist 1', slug: 'artist-1', visibility: 'public' };
            mockDatabase.getArtist.mockReturnValue(artist);
            
            // Mock empty public content
            mockDatabase.getReleasesByArtist.mockReturnValue([]);
            mockDatabase.getAlbumsByArtist.mockImplementation((id: any, profile: any) => {
                if (profile === 'ALL_ACCESS') return [{ id: 501, title: 'Private Album', visibility: 'private' }];
                return [];
            });
            mockDatabase.getTracksByArtist.mockImplementation((id: any, profile: any) => {
                if (profile === 'ALL_ACCESS') return [{ id: 901, title: 'Starred Track', album_id: 501 }];
                return [];
            });
            
            // User has starred the track
            mockDatabase.getStarredItems.mockImplementation((user: any, type: any) => {
                if (type === 'track') return [{ item_id: '901' }];
                return [];
            });

            const response = await request(app)
                .get('/api/artists/1')
                .set('x-username', 'testuser')
                .set('x-is-admin', 'false');

            expect(response.status).toBe(200);
            // The private album should be visible now
            expect(response.body.albums).toHaveLength(1);
            expect(response.body.albums[0].id).toBe(501);
        });

        test('returns artist with starred private album', async () => {
            const artist = { id: 1, name: 'Artist 1', slug: 'artist-1', visibility: 'public' };
            mockDatabase.getArtist.mockReturnValue(artist);
            
            mockDatabase.getReleasesByArtist.mockReturnValue([]);
            mockDatabase.getAlbumsByArtist.mockImplementation((id: any, profile: any) => {
                if (profile === 'ALL_ACCESS') return [{ id: 502, title: 'Starred Private Album', visibility: 'private' }];
                return [];
            });
            mockDatabase.getTracksByArtist.mockReturnValue([]);
            
            mockDatabase.getStarredItems.mockImplementation((user: any, type: any) => {
                if (type === 'album') return [{ item_id: '502' }];
                return [];
            });

            const response = await request(app)
                .get('/api/artists/1')
                .set('x-username', 'testuser')
                .set('x-is-admin', 'false');

            expect(response.status).toBe(200);
            expect(response.body.albums).toHaveLength(1);
            expect(response.body.albums[0].id).toBe(502);
        });
    });
});

