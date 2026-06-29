import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../activitypub.renderer.js', () => ({
    ActivityPubRenderer: jest.fn().mockImplementation(() => ({
        renderActor: jest.fn(),
        renderNote: jest.fn(),
    })),
}));

jest.unstable_mockModule('../activitypub.transport.js', () => ({
    ActivityPubTransport: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
}));

jest.unstable_mockModule('../activitypub.delivery-queue.js', () => ({
    DeliveryQueue: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        enqueue: jest.fn(),
    })),
}));

describe('ActivityPubService (mocked environment)', () => {
    let service: any; // using any to bypass some internal strict types for easier testing
    let mockDb: any;
    let mockConfig: any;
    let mockFederation: any;
    let ActivityPubService: any;

    // We need to store the instances dynamically since they're instantiated inside constructor
    let rendererInstance: any;
    let transportInstance: any;
    let queueInstance: any;

    beforeEach(async () => {
        jest.clearAllMocks();

        const rendererModule = await import('../activitypub.renderer.js');
        const transportModule = await import('../activitypub.transport.js');
        const queueModule = await import('../activitypub.delivery-queue.js');

        mockDb = {
            db: {}, // mock sqlite db
            getSetting: jest.fn(),
            getArtistBySlug: jest.fn(),
        };

        mockConfig = {
            publicUrl: 'https://example.com',
            port: 3000,
        };

        mockFederation = {};

        const serviceModule = await import('../activitypub.service.js');
        ActivityPubService = serviceModule.ActivityPubService;

        service = new ActivityPubService(mockDb, mockConfig, mockFederation);

        // Grab instances assigned inside constructor for asserting
        rendererInstance = (service as any).renderer;
        transportInstance = (service as any).transport;
        queueInstance = (service as any).deliveryQueue;
    });

    describe('startDeliveryQueue', () => {
        test('should call deliveryQueue.start()', () => {
            service.startDeliveryQueue();
            expect(queueInstance.start).toHaveBeenCalled();
        });
    });

    describe('sendActivity', () => {
        test('should not enqueue if transport.send is successful', async () => {
            transportInstance.send.mockResolvedValue(true);
            const actor = { slug: 'test-actor' };
            const inbox = 'https://remote.com/inbox';
            const activity = { type: 'Create' };

            await service.sendActivity(actor, inbox, activity);

            expect(transportInstance.send).toHaveBeenCalledWith(actor, inbox, activity);
            expect(queueInstance.enqueue).not.toHaveBeenCalled();
        });

        test('should enqueue if transport.send fails', async () => {
            transportInstance.send.mockResolvedValue(false);
            const actor = { slug: 'test-actor' };
            const inbox = 'https://remote.com/inbox';
            const activity = { type: 'Create' };

            await service.sendActivity(actor, inbox, activity);

            expect(transportInstance.send).toHaveBeenCalledWith(actor, inbox, activity);
            expect(queueInstance.enqueue).toHaveBeenCalledWith('test-actor', inbox, activity);
        });

        test('should enqueue using site handle if actor has no slug', async () => {
            transportInstance.send.mockResolvedValue(false);
            mockDb.getSetting.mockImplementation((key: string) => {
                if (key === 'site_handle') return 'site';
                return null;
            });
            const actor = { name: 'Test Actor without slug' };
            const inbox = 'https://remote.com/inbox';
            const activity = { type: 'Create' };

            await service.sendActivity(actor, inbox, activity);

            // getSiteHandle defaults to "site" if db setting is absent, but here we mock it to site
            expect(queueInstance.enqueue).toHaveBeenCalledWith('site', inbox, activity);
        });
    });

    describe('generateActor', () => {
        test('should call renderer.renderActor with artist', () => {
            const artist = { slug: 'test', name: 'Test' };
            service.generateActor(artist);
            expect(rendererInstance.renderActor).toHaveBeenCalledWith(expect.objectContaining({ slug: 'test' }));
        });

        test('should attach site_public_key if artist is site actor', () => {
            const artist = { slug: 'site', name: 'Site Actor' };
            mockDb.getSetting.mockImplementation((key: string) => {
                if (key === 'site_handle') return 'site';
                if (key === 'site_public_key') return 'mock-public-key';
                return null;
            });
            service.generateActor(artist);
            expect(rendererInstance.renderActor).toHaveBeenCalledWith(expect.objectContaining({
                slug: 'site',
                public_key: 'mock-public-key'
            }));
        });
    });

    describe('generateNote', () => {
        test('should call renderer.renderNote with provided params', () => {
            const album = { id: 1 } as any;
            const artist = { id: 2 } as any;
            const tracks = [] as any;

            service.generateNote(album, artist, tracks);

            expect(rendererInstance.renderNote).toHaveBeenCalledWith(album, artist, tracks);
        });
    });
});
