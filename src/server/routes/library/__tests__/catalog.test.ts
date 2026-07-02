import { createCatalogRoutes } from '../catalog.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { CatalogService } from '../../../modules/catalog/catalog.service.js';
import type { DiscoveryService } from '../../../modules/catalog/discovery.service.js';

// Mock dependencies
const mockCatalogService = {
    getSettings: jest.fn(),
    getLegalPages: jest.fn(),
    getRemoteTracks: jest.fn(),
    getRemotePosts: jest.fn(),
} as unknown as CatalogService;

const mockDiscoveryService = {
    getOverview: jest.fn(),
    search: jest.fn(),
} as unknown as DiscoveryService;

describe('Catalog Routes', () => {
    let app: express.Express;
    let mockIsAdmin = false;
    let mockIsSuperUser = false;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsAdmin = false;
        mockIsSuperUser = false;

        app = express();
        app.use(express.json());

        // Middleware to mock req.isAdmin and req.isSuperUser
        app.use((req: any, res, next) => {
            req.isAdmin = mockIsAdmin;
            req.isSuperUser = mockIsSuperUser;
            next();
        });

        const router = createCatalogRoutes({
            catalogService: mockCatalogService,
            discoveryService: mockDiscoveryService
        } as any);
        app.use('/catalog', router);
    });

    describe('GET /catalog', () => {
        const mockOverview = {
            stats: { artists: 5, albums: 10, tracks: 50 },
            releases: [],
            recentReleases: [],
            recentAlbums: []
        };

        test('should return overview from service', async () => {
            mockIsAdmin = true;
            (mockDiscoveryService.getOverview as jest.Mock<any>).mockResolvedValue(mockOverview);

            const response = await request(app).get('/catalog');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockOverview);
            expect(mockDiscoveryService.getOverview).toHaveBeenCalledWith(true, undefined);
        });

        test('should handle errors and return 500', async () => {
            (mockDiscoveryService.getOverview as jest.Mock<any>).mockRejectedValue(new Error('Service Error'));

            const response = await request(app).get('/catalog');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Failed to get overview' });
        });
    });

    describe('GET /catalog/search', () => {
        test('should search via service', async () => {
            const mockResults = { artists: [], albums: [], tracks: [] };
            (mockDiscoveryService.search as jest.Mock<any>).mockResolvedValue(mockResults);

            const response = await request(app).get('/catalog/search?q=test');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResults);
            expect(mockDiscoveryService.search).toHaveBeenCalledWith('test', false, undefined);
        });
    });

    describe('GET /catalog/settings', () => {
        test('should return settings from service', async () => {
            const mockSettings = { siteName: 'Test' };
            (mockCatalogService.getSettings as jest.Mock).mockReturnValue(mockSettings);

            const response = await request(app).get('/catalog/settings');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockSettings);
        });
    });

    describe('GET /catalog/legal', () => {
        test('should return legal pages from service', async () => {
            const mockLegal = {
                terms: '# Terms of Service',
                privacy: '# Privacy Policy',
                contactEmail: 'legal@example.com',
                termsIsDefault: true,
                privacyIsDefault: false,
            };
            (mockCatalogService.getLegalPages as jest.Mock).mockReturnValue(mockLegal);

            const response = await request(app).get('/catalog/legal');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockLegal);
        });

        test('should handle errors and return 500', async () => {
            (mockCatalogService.getLegalPages as jest.Mock).mockImplementation(() => {
                throw new Error('Service Error');
            });

            const response = await request(app).get('/catalog/legal');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Failed to fetch legal pages' });
        });
    });
});

