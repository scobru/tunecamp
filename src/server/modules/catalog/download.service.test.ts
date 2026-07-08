import { jest } from '@jest/globals';

describe('DownloadService Singleton', () => {
    it('returns null before initialization', async () => {
        await jest.isolateModulesAsync(async () => {
            const { getDownloadService } = await import('./download.service.js');
            expect(getDownloadService()).toBeNull();
        });
    });

    it('returns the DownloadService instance after initialization', async () => {
        await jest.isolateModulesAsync(async () => {
            const { getDownloadService, initDownloadService, DownloadService } = await import('./download.service.js');
            const service = initDownloadService();

            expect(service).toBeInstanceOf(DownloadService);
            expect(getDownloadService()).toBe(service);
        });
    });
});
