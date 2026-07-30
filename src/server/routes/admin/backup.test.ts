import { jest } from '@jest/globals';
import fsExtra from 'fs-extra';
import path from 'path';

let cleanupParts: any;
let mockedFs: any;
beforeAll(async () => {
    ({ cleanupParts } = await import('./backup.js'));
    mockedFs = fsExtra;
    jest.spyOn(mockedFs, 'unlink').mockImplementation(async () => undefined as any);
});

describe('cleanupParts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should concurrently unlink all part files using Promise.allSettled', async () => {
        const partFiles = ['part1', 'part2', 'part3'];
        const uploadDir = 'uploads';

        (mockedFs.unlink as jest.Mock).mockResolvedValue(undefined);

        await cleanupParts(partFiles, uploadDir);

        expect(mockedFs.unlink).toHaveBeenCalledTimes(3);
        expect(mockedFs.unlink).toHaveBeenCalledWith(path.join('uploads', 'part1'));
        expect(mockedFs.unlink).toHaveBeenCalledWith(path.join('uploads', 'part2'));
        expect(mockedFs.unlink).toHaveBeenCalledWith(path.join('uploads', 'part3'));
    });

    it('should gracefully handle and swallow errors during unlink', async () => {
        const partFiles = ['part1', 'part2'];
        const uploadDir = 'uploads';

        (mockedFs.unlink as jest.Mock).mockRejectedValueOnce(new Error('Deletion failed')).mockResolvedValueOnce(undefined);

        await expect(cleanupParts(partFiles, uploadDir)).resolves.toBeUndefined();
        expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
    });
});
