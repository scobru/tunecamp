import { describe, test, expect, jest } from '@jest/globals';

describe('Singleton uninitialized state', () => {
    test('getDownloadService returns null before initialization', async () => {
        let isolatedGetDownloadService: any;
        await jest.isolateModulesAsync(async () => {
            const module = await import('../download.service.js');
            isolatedGetDownloadService = module.getDownloadService;
        });
        expect(isolatedGetDownloadService()).toBeNull();
    });
});
