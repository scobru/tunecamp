import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import fs from '../../../utils/fs.js';
import path from 'path';

// Spy on fs methods
const mockUnlink = jest.spyOn(fs, 'unlink');
const mockEnsureDirSync = jest.spyOn(fs, 'ensureDirSync');

// Import target after spying
const { cleanupParts } = await import('./backup.js');

describe('cleanupParts', () => {
    beforeEach(() => {
        mockUnlink.mockReset();
        mockEnsureDirSync.mockReset();
        // Default implementations
        mockUnlink.mockImplementation((p: string) => fs.promises.unlink(p));
        mockEnsureDirSync.mockImplementation((p: string) => fs.promises.mkdir(p, { recursive: true }).then(() => {}));
    });

    it('should concurrently unlink all part files using Promise.allSettled', async () => {
        const partFiles = ['part1', 'part2', 'part3'];
        const uploadDir = 'uploads';

        mockUnlink.mockResolvedValue(undefined);

        await cleanupParts(partFiles, uploadDir);

        expect(mockUnlink).toHaveBeenCalledTimes(3);
        expect(mockUnlink).toHaveBeenCalledWith(path.join('uploads', 'part1'));
        expect(mockUnlink).toHaveBeenCalledWith(path.join('uploads', 'part2'));
        expect(mockUnlink).toHaveBeenCalledWith(path.join('uploads', 'part3'));
    });

    it('should gracefully handle and swallow errors during unlink', async () => {
        const partFiles = ['part1', 'part2'];
        const uploadDir = 'uploads';

        mockUnlink.mockRejectedValueOnce(new Error('Deletion failed')).mockResolvedValueOnce(undefined);

        await expect(cleanupParts(partFiles, uploadDir)).resolves.toBeUndefined();
        expect(mockUnlink).toHaveBeenCalledTimes(2);
    });
});
