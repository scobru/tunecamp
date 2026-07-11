import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createFedify } from '../fedify.js';
import { createDatabase } from '../../../core/database.js';

describe('createFedify', () => {
    let dbService: any;

    beforeAll(() => {
        dbService = createDatabase(':memory:');
    });

    afterAll(() => {
        if (dbService && typeof dbService.close === 'function') {
            dbService.close();
        }
    });

    test('successfully initializes federation with a valid database and config', () => {
        const config = {
            siteName: 'Test Instance',
            publicUrl: 'https://site.test',
        } as any;

        const federation = createFedify(dbService, config);

        expect(federation).toBeDefined();
        expect(typeof (federation as any).setNodeInfoDispatcher).toBe('function');
        expect(typeof (federation as any).setActorDispatcher).toBe('function');
    });

    test('initializes without publicUrl in config', () => {
        const config = {
            siteName: 'Test Instance',
        } as any;

        const federation = createFedify(dbService, config);
        expect(federation).toBeDefined();
    });

    test('initializes with minimal configuration', () => {
        const config = {} as any;
        const federation = createFedify(dbService, config);
        expect(federation).toBeDefined();
        expect(typeof (federation as any).setInboxListeners).toBe('function');
    });
});
