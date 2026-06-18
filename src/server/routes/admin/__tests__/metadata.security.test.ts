import express from 'express';
import request from 'supertest';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import * as networkUtils from '../../../../utils/networkUtils.js';
import { createMetadataRoutes } from '../metadata.js';

const isSafeUrlSpy = jest.spyOn(networkUtils, 'isSafeUrl' as any);

const mockDb = {
    getAlbum: jest.fn(),
    getTracks: jest.fn(),
    updateAlbumCover: jest.fn(),
    getArtistByName: jest.fn(),
    createArtist: jest.fn(),
    updateAlbumArtist: jest.fn(),
} as any;

const mockCatalogService = {
    updateAlbum: jest.fn<any>().mockResolvedValue(undefined),
} as any;

const mockMaintenanceService = {
    propagateAlbumMetadataToTracks: jest.fn<any>().mockResolvedValue(undefined),
} as any;

describe('Metadata Security', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use((req: any, res, next) => {
            req.isAdmin = true;
            next();
        });
        app.use('/api/metadata', createMetadataRoutes({
            database: mockDb,
            library: mockDb.library || mockDb,
            musicDir: '/tmp/music',
            metadataService: { scanTracks: jest.fn(), scanDirectory: jest.fn() },
            catalogService: mockCatalogService,
            maintenanceService: mockMaintenanceService
        } as any));
    });

    test('POST /api/metadata/apply should block unsafe coverUrl', async () => {
        isSafeUrlSpy.mockResolvedValue(false as any);
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 1, title: 'Test Album' });

        const response = await request(app)
            .post('/api/metadata/apply')
            .send({
                albumId: 1,
                coverUrl: 'http://127.0.0.1/secret.jpg'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid or unsafe cover URL');
    });

    test('POST /api/metadata/apply should allow safe coverUrl', async () => {
        isSafeUrlSpy.mockResolvedValue(true as any);
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 1, title: 'Test Album', cover_path: '/tmp/music/album/cover.jpg' });
        (mockDb.getTracks as jest.Mock).mockReturnValue([]);

        const response = await request(app)
            .post('/api/metadata/apply')
            .send({
                albumId: 1,
                coverUrl: 'https://legit.com/cover.jpg'
            });

        expect(response.status).toBe(200);
        expect(isSafeUrlSpy).toHaveBeenCalledWith('https://legit.com/cover.jpg');
    });
});
