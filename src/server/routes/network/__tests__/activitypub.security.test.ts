import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { createActivityPubRoutes } from '../activitypub.js';
import type { DatabaseService } from '../../../core/database.js';
import type { ActivityPubService } from '../../../modules/activitypub/activitypub.service.js';

const mockDb = {
    getApNote: jest.fn(),
    getApNoteByContent: jest.fn(),
    getAlbum: jest.fn(),
    getPost: jest.fn(),
    deleteApNote: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    updatePost: jest.fn(),
    getArtistBySlug: jest.fn(),
    getApNotes: jest.fn(),
    getFollowers: jest.fn(),
    getFollowerInboxes: jest.fn(),
    getRemoteActor: jest.fn(),
} as unknown as DatabaseService;

const mockApService = {
    broadcastDelete: jest.fn(),
    broadcastPostDelete: jest.fn(),
    syncArtistContent: jest.fn(),
} as unknown as ActivityPubService;

const mockAuthMiddleware = {
    requireAdmin: (req: any, res: any, next: any) => {
        // Mock middleware that blocks if no token
        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ error: "No token provided" });
        }

        if (token === 'Bearer root') {
            req.isAdmin = true;
            req.artistId = null; // Root admin
            req.isRootAdmin = true;
        } else if (token === 'Bearer artist1') {
            req.isAdmin = true;
            req.artistId = 1;
        } else if (token === 'Bearer artist2') {
            req.isAdmin = true;
            req.artistId = 2;
        } else if (token === 'Bearer admin_no_artist') {
            req.isAdmin = true;
            req.artistId = null;
            req.isRootAdmin = false;
        } else {
             // Default generic admin for existing tests compatibility, or treat as restricted?
             // Let's treat as root for 'validtoken' to keep existing test passing (mostly)
             req.isAdmin = true;
        }
        next();
    },
    requireUser: (req: any, res: any, next: any) => {
        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ error: "No token provided" });
        }
        
        if (token === 'Bearer root') {
            req.isAdmin = true;
            req.isRootAdmin = true;
        } else if (token === 'Bearer artist1') {
            req.isAdmin = false;
            req.artistId = 1;
        } else if (token === 'Bearer artist2') {
            req.isAdmin = false;
            req.artistId = 2;
        } else if (token === 'Bearer user_no_artist') {
            req.isAdmin = false;
            req.artistId = null;
        }
        next();
    },
    optionalAuth: (req: any, res: any, next: any) => next(),
};

describe('ActivityPub Security', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/ap', createActivityPubRoutes({
            apService: mockApService,
            database: mockDb,
            authMiddleware: mockAuthMiddleware as any
        } as any));
    });

    test('DELETE /note should require authentication', async () => {
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            note_type: 'release',
            content_id: 123
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123 });

        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1');

        // Desired behavior: 401 Unauthorized
        expect(response.status).toBe(401);
    });

    test('DELETE /note should succeed for authenticated root admin', async () => {
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            note_type: 'release',
            content_id: 123,
            artist_id: 2
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123, artist_id: 2 });

        (mockApService.broadcastDelete as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1')
            .set('Authorization', 'Bearer root');

        expect(response.status).toBe(200);
        expect(mockApService.broadcastDelete).toHaveBeenCalled();
    });

    test('DELETE /note should deny access if artist does not own the note', async () => {
        // Note belongs to Artist 2
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            artist_id: 2,
            note_type: 'release',
            content_id: 123
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123, artist_id: 2 });

        // Request from Artist 1
        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1')
            .set('Authorization', 'Bearer artist1');

        expect(response.status).toBe(403);
    });

    test('DELETE /note should deny access if restricted admin has no artistId', async () => {
        // Note belongs to Artist 2
        (mockDb.getApNote as jest.Mock).mockReturnValue({
            note_id: 'http://example.com/note/1',
            artist_id: 2,
            note_type: 'release',
            content_id: 123
        });
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 123, artist_id: 2 });

        // Request from restricted admin with no artistId
        const response = await request(app)
            .delete('/ap/note?id=http://example.com/note/1')
            .set('Authorization', 'Bearer admin_no_artist');

        expect(response.status).toBe(403);
    });

    test('GET /published/:artistId should require authentication', async () => {
        const response = await request(app).get('/ap/published/1');
        expect(response.status).toBe(401);
    });

    test('GET /published/:artistId should deny access if artist does not own the data', async () => {
        const response = await request(app)
            .get('/ap/published/2')
            .set('Authorization', 'Bearer artist1');
        expect(response.status).toBe(403);
    });

    test('GET /published/:artistId should allow access for the artist who owns the data', async () => {
        const mockNotes = [{ id: 1, title: 'Test Note' }];
        (mockDb.getApNotes as jest.Mock).mockReturnValue(mockNotes);

        const response = await request(app)
            .get('/ap/published/1')
            .set('Authorization', 'Bearer artist1');
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockNotes);
    });

    test('GET /published/:artistId should allow access for root admin', async () => {
        const mockNotes = [{ id: 1, title: 'Test Note' }];
        (mockDb.getApNotes as jest.Mock).mockReturnValue(mockNotes);

        const response = await request(app)
            .get('/ap/published/2')
            .set('Authorization', 'Bearer root');
        
        expect(response.status).toBe(200);
    });
    
    test('POST /ap/sync/artist/:artistId should require authentication', async () => {
        const response = await request(app).post('/ap/sync/artist/1');
        expect(response.status).toBe(401);
    });

    test('POST /ap/sync/artist/:artistId should deny access if artist does not own the data', async () => {
        const response = await request(app)
            .post('/ap/sync/artist/2')
            .set('Authorization', 'Bearer artist1');
        expect(response.status).toBe(403);
    });

    test('POST /ap/sync/artist/:artistId should allow access for the artist who owns the data', async () => {
        (mockApService.syncArtistContent as jest.Mock).mockReturnValue({ notes: 5 });

        const response = await request(app)
            .post('/ap/sync/artist/1')
            .set('Authorization', 'Bearer artist1');
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ message: "ActivityPub synchronization complete", notes: 5 });
        expect(mockApService.syncArtistContent).toHaveBeenCalledWith(1);
    });

    test('POST /ap/sync/artist/:artistId should allow access for root admin', async () => {
        (mockApService.syncArtistContent as jest.Mock).mockReturnValue({ notes: 5 });

        const response = await request(app)
            .post('/ap/sync/artist/2')
            .set('Authorization', 'Bearer root');
        
        expect(response.status).toBe(200);
    });
});

