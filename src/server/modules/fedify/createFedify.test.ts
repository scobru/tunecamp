import { jest } from '@jest/globals';
import { createFedify } from './fedify.js';

describe('createFedify', () => {
    let dbServiceMock: any;
    let configMock: any;

    beforeEach(() => {
        dbServiceMock = {
            db: {
                exec: jest.fn(),
                prepare: jest.fn().mockReturnValue({
                    get: jest.fn(),
                    run: jest.fn(),
                    all: jest.fn(),
                })
            },
            getSetting: jest.fn(),
            upsertRemoteActor: jest.fn(),
        };
        configMock = {
            publicUrl: 'https://example.com',
            siteName: 'TestSite',
        };
    });

    test('should instantiate federation and return it', () => {
        const fed = createFedify(dbServiceMock, configMock);
        expect(fed).toBeDefined();
        // The return object is a Federation instance. We can verify some of the exposed methods.
        expect(typeof fed.setNodeInfoDispatcher).toBe('function');
        expect(typeof fed.setActorDispatcher).toBe('function');
        expect(typeof fed.setObjectDispatcher).toBe('function');
        expect(typeof fed.setOutboxDispatcher).toBe('function');
        expect(typeof fed.setFollowersDispatcher).toBe('function');
        expect(typeof fed.setFollowingDispatcher).toBe('function');
    });

    test('should not crash if config is minimal', () => {
        const minimalConfig = {};
        const fed = createFedify(dbServiceMock, minimalConfig as any);
        expect(fed).toBeDefined();
    });
});
