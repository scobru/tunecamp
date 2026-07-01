import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createMiscRoutes } from '../misc.js';
import path from 'path';

describe('Misc Routes Security', () => {
    let app: express.Express;
    let mockIntegration: any;
    let mockConfig: any;

    beforeEach(() => {
        mockIntegration = {
            getAsset: jest.fn()
        };
        mockConfig = {
            musicDir: path.resolve('/mock/music/dir')
        };

        const container: any = {
            config: mockConfig,
            integration: mockIntegration,
            identity: { getSetting: jest.fn() },
            library: { getStats: jest.fn().mockResolvedValue({}) },
            authMiddleware: { requireAdmin: (req: any, res: any, next: any) => next() },
            waveformService: {},
            metadataService: { getRegistry: () => ({ getRegistryInfo: () => ({}) }) },
            scannerService: { getRegistry: () => ({ getRegistryInfo: () => ({}) }) },
            streamingService: { getRegistry: () => ({ getRegistryInfo: () => ({}) }) },
            playlistService: { getRegistry: () => ({ getRegistryInfo: () => ({}) }) },
            social: {}
        };

        app = express();
        app.use(createMiscRoutes(container));
    });

    it('should prevent path traversal when serving asset covers', async () => {
        // Mock getAsset to return a malicious cover_path
        mockIntegration.getAsset.mockReturnValue({
            id: 1,
            cover_path: '/etc/passwd'
        });

        const response = await request(app).get('/api/assets/cover/1');

        // Should not serve the file, should return 403 or 404
        expect(response.status).not.toBe(200);
        expect(response.status).toBe(403);
    });
});
