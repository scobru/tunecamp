import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createSearchRoutes } from '../search.js';
import { UserRole, VisibilityProfile } from '../../../common/visibility.js';

/** Mounts the search router, injecting `reqPatch` onto every request first. */
function buildApp(services: any, reqPatch: (req: any) => void) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { reqPatch(req); next(); });
    const mockIdentity = {
        getSetting: jest.fn().mockReturnValue('false'),
        getAllSettings: jest.fn().mockReturnValue({}),
    };
    app.use('/api/search', createSearchRoutes({ identity: mockIdentity, ...services } as any));
    return app;
}

function makeStreaming(overrides: any = {}) {
    return {
        search: (jest.fn() as any).mockResolvedValue([]),
        getRegistry: () => ({ getEnabled: () => overrides.enabled ?? [] }),
        listProviders: () => overrides.providers ?? [],
        ...overrides.methods,
    };
}

function makeMetadata(enabledProviders: any[] = []) {
    return {
        getRegistry: () => ({ getEnabled: () => enabledProviders }),
    };
}

describe('Search Routes', () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('GET /global', () => {
        test('returns 400 when no query is provided', async () => {
            const app = buildApp(
                { library: { search: jest.fn() }, streamingService: makeStreaming(), metadataService: makeMetadata() },
                (req) => { req.role = UserRole.NORMAL_USER; req.context = { role: UserRole.NORMAL_USER }; },
            );
            const res = await request(app).get('/api/search/global');
            expect(res.status).toBe(400);
        });

        test('normal user gets only local results, with no provider search', async () => {
            const library = { search: jest.fn().mockReturnValue([{ id: 1, title: 'Local Song' }]) };
            const streamingService = makeStreaming();
            const metadataService = makeMetadata([{ id: 'mb', searchRecording: jest.fn() }]);

            const app = buildApp(
                { library, streamingService, metadataService },
                (req) => {
                    req.role = UserRole.NORMAL_USER;
                    req.isAdmin = false;
                    req.context = { role: UserRole.NORMAL_USER };
                    req.username = 'listener';
                },
            );

            const res = await request(app).get('/api/search/global?q=song');

            expect(res.status).toBe(200);
            expect(res.body.local).toEqual([{ id: 1, title: 'Local Song' }]);
            expect(res.body.streaming).toEqual([]);
            expect(res.body.external).toEqual([]);
            expect(streamingService.search).not.toHaveBeenCalled();
            expect(library.search).toHaveBeenCalledWith('song', expect.any(String));
        });

        test('manager gets local + streaming + external, with metadata de-duped against streaming providers', async () => {
            const library = { search: jest.fn().mockReturnValue([{ id: 1 }]) };
            const streamingService = makeStreaming({
                enabled: [{ id: 'soundcloud' }],
                providers: [{ id: 'soundcloud' }],
                methods: {
                    search: (jest.fn() as any).mockResolvedValue([{ id: 's1', title: 'Stream', provider: 'soundcloud' }]),
                },
            });
            const mbProvider = { id: 'musicbrainz', searchRecording: (jest.fn() as any).mockResolvedValue([{ id: 'm1', title: 'Meta' }]) };
            // A metadata provider that shares an id with a streaming provider must be skipped.
            const dupProvider = { id: 'soundcloud', searchRecording: (jest.fn() as any).mockResolvedValue([{ id: 'dup' }]) };
            const metadataService = makeMetadata([mbProvider, dupProvider]);

            const app = buildApp(
                { library, streamingService, metadataService },
                (req) => { req.isAdmin = true; req.role = UserRole.ADMIN; req.context = { role: UserRole.ADMIN }; },
            );

            const res = await request(app).get('/api/search/global?q=song');

            expect(res.status).toBe(200);
            expect(res.body.streaming).toEqual([
                expect.objectContaining({ id: 's1', isStreaming: true, providerId: 'soundcloud', source: 'soundcloud' }),
            ]);
            expect(res.body.external).toEqual([
                expect.objectContaining({ id: 'm1', isExternal: true, providerId: 'musicbrainz', source: 'musicbrainz' }),
            ]);
            // De-dup: the soundcloud metadata provider was not queried.
            expect(dupProvider.searchRecording).not.toHaveBeenCalled();
            expect(mbProvider.searchRecording).toHaveBeenCalledWith('song');
        });

        test('skips external metadata when no streaming provider is enabled (no audio engine)', async () => {
            const library = { search: jest.fn().mockReturnValue([]) };
            const streamingService = makeStreaming({ enabled: [], providers: [] });
            const mbProvider = { id: 'musicbrainz', searchRecording: (jest.fn() as any).mockResolvedValue([{ id: 'm1' }]) };
            const metadataService = makeMetadata([mbProvider]);

            const app = buildApp(
                { library, streamingService, metadataService },
                (req) => { req.isAdmin = true; req.role = UserRole.ADMIN; req.context = { role: UserRole.ADMIN }; },
            );

            const res = await request(app).get('/api/search/global?q=song');

            expect(res.status).toBe(200);
            expect(res.body.external).toEqual([]);
            expect(mbProvider.searchRecording).not.toHaveBeenCalled();
        });

        test('returns 500 when the local search throws', async () => {
            const library = { search: jest.fn(() => { throw new Error('db down'); }) };
            const app = buildApp(
                { library, streamingService: makeStreaming(), metadataService: makeMetadata() },
                (req) => { req.role = UserRole.NORMAL_USER; req.context = { role: UserRole.NORMAL_USER }; },
            );
            const res = await request(app).get('/api/search/global?q=song');
            expect(res.status).toBe(500);
        });

        test('guest with no viewer context defaults to the public stage profile', async () => {
            const library = { search: jest.fn().mockReturnValue([]) };
            const app = buildApp(
                { library, streamingService: makeStreaming(), metadataService: makeMetadata() },
                () => { /* no role, no context — a guest */ },
            );
            await request(app).get('/api/search/global?q=song');
            expect(library.search).toHaveBeenCalledWith('song', VisibilityProfile.PUBLIC_STAGE);
        });
    });

    describe('Soulseek P2P gate', () => {
        test('blocks /content/soulseek with 403 while the integration is disabled by default', async () => {
            const app = buildApp(
                { library: { search: jest.fn() }, streamingService: makeStreaming(), metadataService: makeMetadata() },
                (req) => { req.isAdmin = true; req.role = UserRole.ROOT_ADMIN; },
            );
            const res = await request(app).get('/api/search/content/soulseek?q=test');
            expect(res.status).toBe(403);
            expect(res.body.error).toContain("'soulseek' integration is disabled");
        });
    });
});
