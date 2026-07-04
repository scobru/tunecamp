import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import fsExtra from '../../../../utils/fs.js';
import { GoogleDriveStorageProvider } from '../google-drive.provider.js';

jest.spyOn(fsExtra, 'readFile' as any).mockResolvedValue(Buffer.from('audio-bytes') as any);
jest.spyOn(fsExtra, 'ensureDir' as any).mockResolvedValue(undefined as any);

const ADMIN_ID = 1;

function makeService(overrides: Record<string, any> = {}) {
    return {
        uploadFile: jest.fn(async () => ({ id: 'gdrive-file-id' })),
        getFile: jest.fn(async () => ({ id: 'gdrive-file-id' })),
        getFileStream: jest.fn(async () => ({ stream: {} })),
        ...overrides
    } as any;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fsExtra, 'readFile' as any).mockResolvedValue(Buffer.from('audio-bytes') as any);
    jest.spyOn(fsExtra, 'ensureDir' as any).mockResolvedValue(undefined as any);
});

describe('GoogleDriveStorageProvider', () => {
    test('has the expected provider identity', () => {
        const p = new GoogleDriveStorageProvider(makeService(), ADMIN_ID);
        expect(p.id).toBe('google-drive');
        expect(p.name).toBe('Google Drive');
    });

    describe('upload', () => {
        test('uploads with the mime type derived from the extension and returns the file id', async () => {
            const service = makeService();
            const p = new GoogleDriveStorageProvider(service, ADMIN_ID);

            const id = await p.upload('/tmp/song.flac', 'music/song.flac');

            expect(id).toBe('gdrive-file-id');
            expect(service.uploadFile).toHaveBeenCalledTimes(1);
            const [userId, name, mimeType] = service.uploadFile.mock.calls[0];
            expect(userId).toBe(ADMIN_ID);
            expect(name).toBe('song.flac');
            expect(mimeType).toBe('audio/flac');
        });

        test('falls back to octet-stream for an unknown extension', async () => {
            const service = makeService();
            const p = new GoogleDriveStorageProvider(service, ADMIN_ID);
            await p.upload('/tmp/file.xyz', 'music/file.xyz');
            expect(service.uploadFile.mock.calls[0][2]).toBe('application/octet-stream');
        });

        test('falls back to the remotePath when the service returns no id', async () => {
            const service = makeService({ uploadFile: jest.fn(async () => ({})) });
            const p = new GoogleDriveStorageProvider(service, ADMIN_ID);
            expect(await p.upload('/tmp/a.mp3', 'music/a.mp3')).toBe('music/a.mp3');
        });
    });

    describe('exists', () => {
        test('true when the service resolves metadata', async () => {
            const p = new GoogleDriveStorageProvider(makeService(), ADMIN_ID);
            expect(await p.exists('file-id')).toBe(true);
        });

        test('false when the service throws', async () => {
            const service = makeService({ getFile: jest.fn(async () => { throw new Error('not found'); }) });
            const p = new GoogleDriveStorageProvider(service, ADMIN_ID);
            expect(await p.exists('missing')).toBe(false);
        });
    });

    describe('getUrl', () => {
        test('returns null (no public urls without sharing)', async () => {
            const p = new GoogleDriveStorageProvider(makeService(), ADMIN_ID);
            expect(await p.getUrl('file-id')).toBeNull();
        });
    });

    describe('delete', () => {
        test('is a no-op stub that resolves', async () => {
            const p = new GoogleDriveStorageProvider(makeService(), ADMIN_ID);
            await expect(p.delete('file-id')).resolves.toBeUndefined();
        });
    });
});
