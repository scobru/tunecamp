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

    test('getDownloadService returns instance after initialization', async () => {
        let isolatedGetDownloadService: any;
        let isolatedInitDownloadService: any;
        await jest.isolateModulesAsync(async () => {
            const module = await import('../download.service.js');
            isolatedGetDownloadService = module.getDownloadService;
            isolatedInitDownloadService = module.initDownloadService;
        });
        const instance = isolatedInitDownloadService({} as any);
        expect(isolatedGetDownloadService()).toBe(instance);
        expect(isolatedGetDownloadService()).not.toBeNull();
    });
});
