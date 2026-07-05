import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mockExecFile = jest.fn();

jest.unstable_mockModule('child_process', () => ({
    execFile: mockExecFile
}));

const mockEnsureDir = jest.fn();
const mockReaddir = jest.fn();
const mockMove = jest.fn();
const mockExistsSync = jest.fn();

jest.unstable_mockModule('fs-extra', () => ({
    default: {
        ensureDir: mockEnsureDir,
        readdir: mockReaddir,
        move: mockMove,
        existsSync: mockExistsSync,
    }
}));

describe('LocalizationService', () => {
    let LocalizationService: any;
    let mockDb: any;
    let mockCatalog: any;

    beforeEach(async () => {
        mockDb = {
            getTrack: jest.fn(),
            getAlbum: jest.fn(),
            updateTrack: jest.fn()
        };
        mockCatalog = {
            localizeTrack: jest.fn()
        };

        mockExecFile.mockImplementation((cmd: any, args: any, cb: any) => {
            if (typeof cb === 'function') {
                cb(null, { stdout: '', stderr: '' });
            }
        });
        mockEnsureDir.mockResolvedValue(undefined as never);
        mockReaddir.mockResolvedValue(['temp_1.m4a'] as never);
        mockMove.mockResolvedValue(undefined as never);
        mockExistsSync.mockReturnValue(true);

        const module = await import('./localization.service.js');
        LocalizationService = module.LocalizationService;

        jest.clearAllMocks();
    });

    test('should set GDrive service', () => {
        const service = new LocalizationService(mockDb, mockCatalog, '/music');
        const mockGDrive = {} as any;
        service.setGDriveService(mockGDrive);
        expect(service['gdriveService']).toBe(mockGDrive);
    });

    test('should set cookies path', () => {
        const service = new LocalizationService(mockDb, mockCatalog, '/music');
        service.setCookiesPath('/path/to/cookies');
        expect(service['cookiesPath']).toBe('/path/to/cookies');
    });

    test('should throw if track not found', async () => {
        mockDb.getTrack.mockReturnValue(undefined);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await expect(service.localizeTrack(1)).rejects.toThrow('Track not found');
    });

    test('should throw if track is already localized', async () => {
        mockDb.getTrack.mockReturnValue({
            id: 1,
            file_path: 'local/path.m4a',
            external_id: null,
            url: null
        });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await expect(service.localizeTrack(1)).rejects.toThrow('Track is already localized');
    });

    test('should handle Google Drive tracks directly if service available', async () => {
        mockDb.getTrack.mockReturnValue({
            id: 1,
            file_path: 'gdrive://123',
            external_id: null,
            url: null
        });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');
        const mockGDrive = {} as any;
        service.setGDriveService(mockGDrive);

        mockCatalog.localizeTrack.mockResolvedValue({ id: 1 });

        const result = await service.localizeTrack(1);
        expect(result).toEqual({ id: 1 });
        expect(mockCatalog.localizeTrack).toHaveBeenCalledWith(1, mockGDrive);
    });

    test('should throw if Google Drive track but no service available', async () => {
        mockDb.getTrack.mockReturnValue({
            id: 1,
            file_path: 'gdrive://123',
            external_id: null,
            url: null
        });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await expect(service.localizeTrack(1)).rejects.toThrow('Google Drive service not available for localization');
    });

    test('should determine URL from youtube service and external_id', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'youtube', external_id: 'dQw4w9WgXcQ', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(args).toContain('--force-ipv4');
    });

    test('should determine URL from soundcloud service and external_id', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'soundcloud', external_id: '123456', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://api.soundcloud.com/tracks/123456');
    });

    test('should fallback to direct URL if present', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'https://example.com/audio.mp3', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://example.com/audio.mp3');
    });

    test('should parse ext: youtube ID correctly', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'ext:youtube:abc1234', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://www.youtube.com/watch?v=abc1234');
    });

    test('should handle ext: prefix with http actual url', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'ext:provider:http://example.com/audio.mp3', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('http://example.com/audio.mp3');
    });

    test('should handle ext: prefix with 2 parts where second part starts with http', async () => {
        // We simulate a 2-part split by creating a url that won't result in 3 parts when split by ':'
        // But the 2nd part starts with http. Since it splits by :, we'll use a URL without further colons,
        // e.g. "ext:http//example.com/audio.mp3" (no colon after http)
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'ext:http//example.com/audio.mp3', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('http//example.com/audio.mp3');
    });

    test('should handle unrecognised provider in ext: prefix without http', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'ext:unknownprovider:some_id', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('ext:unknownprovider:some_id'); // If it doesn't match, it uses original url (minus external_id logic fallback)
    });

    test('should handle ext:soundcloud prefix with numeric ID', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'ext:soundcloud:123456', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://api.soundcloud.com/tracks/123456');
    });

    test('should handle ext:soundcloud prefix with non-numeric ID', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, url: 'ext:soundcloud:some-track-name', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://soundcloud.com/some-track-name');
    });

    test('should fallback to external_id if no url and no known service', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'other', external_id: 'https://example.com/audio.mp3', title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args[args.length - 1]).toBe('https://example.com/audio.mp3');
    });

    test('should throw if no valid URL can be determined', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'unknown', external_id: null, url: null, title: 'test' });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await expect(service.localizeTrack(1)).rejects.toThrow('Could not determine source URL for localization');
    });

    test('should append cookies argument if cookiesPath is set', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'youtube', external_id: 'test_id', title: 'test' });
        mockExistsSync.mockReturnValue(true);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');
        service.setCookiesPath('/path/to/cookies');

        await service.localizeTrack(1);

        expect(mockExecFile).toHaveBeenCalled();
        const args = mockExecFile.mock.calls[0][1] as string[];
        expect(args).toContain('--cookies');
        expect(args).toContain('/path/to/cookies');
    });

    test('should handle download failure from yt-dlp', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'youtube', external_id: 'test_id', title: 'test' });
        mockExecFile.mockImplementation((cmd: any, args: any, cb: any) => {
            if (typeof cb === 'function') {
                cb(new Error('yt-dlp error'));
            }
        });
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await expect(service.localizeTrack(1)).rejects.toThrow('Localization failed: yt-dlp error');
    });

    test('should handle missing file after successful download', async () => {
        mockDb.getTrack.mockReturnValue({ id: 1, service: 'youtube', external_id: 'test_id', title: 'test' });
        mockReaddir.mockResolvedValue(['other_file.m4a'] as never);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await expect(service.localizeTrack(1)).rejects.toThrow('Localization failed: Downloaded file not found after yt-dlp execution');
    });

    test('should successfully update DB with local path and format', async () => {
        mockDb.getTrack.mockReturnValue({
            id: 1,
            service: 'youtube',
            external_id: 'test_id',
            title: 'Test Song',
            artist_name: 'Test Artist',
            album_title: 'Test Album'
        });
        // Mock return value ONLY after the method changes it or using mockReturnValueOnce
        mockDb.getTrack.mockReturnValueOnce({
            id: 1,
            service: 'youtube',
            external_id: 'test_id',
            title: 'Test Song',
            artist_name: 'Test Artist',
            album_title: 'Test Album'
        }).mockReturnValueOnce({
                id: 1,
                file_path: 'localized/Test Artist/Test Album/Test Song.m4a',
                format: 'm4a',
                service: 'local'
            });
        mockReaddir.mockResolvedValue(['temp_1.m4a'] as never);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        const result = await service.localizeTrack(1);

        expect(mockMove).toHaveBeenCalled();
        expect(mockDb.updateTrack).toHaveBeenCalledWith(1, {
            file_path: 'localized/Test Artist/Test Album/Test Song.m4a',
            format: 'm4a',
            service: 'local'
        });
        expect(result.file_path).toBe('localized/Test Artist/Test Album/Test Song.m4a');
    });

    test('should fetch album title from database if album_id is present', async () => {
        mockDb.getTrack.mockReturnValueOnce({
            id: 1,
            service: 'youtube',
            external_id: 'test_id',
            title: 'Test Song',
            artist_name: 'Test Artist',
            album_id: 42
        }).mockReturnValueOnce({
            id: 1,
            file_path: 'localized/Test Artist/Fetched Album/Test Song.m4a',
            format: 'm4a',
            service: 'local'
        });
        mockDb.getAlbum.mockReturnValue({ id: 42, title: 'Fetched Album' });
        mockReaddir.mockResolvedValue(['temp_1.m4a'] as never);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        const result = await service.localizeTrack(1);

        expect(mockDb.getAlbum).toHaveBeenCalledWith(42);
        expect(mockMove).toHaveBeenCalled();
        expect(mockDb.updateTrack).toHaveBeenCalledWith(1, {
            file_path: 'localized/Test Artist/Fetched Album/Test Song.m4a',
            format: 'm4a',
            service: 'local'
        });
    });

    test('should prevent path traversal in track metadata', async () => {
        mockDb.getTrack.mockReturnValueOnce({
            id: 1,
            service: 'youtube',
            external_id: 'test_id',
            title: 'Test Song',
            artist_name: '..',
            album_title: '..'
        });
        mockReaddir.mockResolvedValue(['temp_1.m4a'] as never);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        await service.localizeTrack(1);
        // The file path should be safely replaced with underscores instead of ..
        expect(mockDb.updateTrack).toHaveBeenCalledWith(1, expect.objectContaining({ file_path: expect.stringMatching(/localized\/_\/_\/Test Song\.m4a/) }));
    });

    test('should handle missing album from database gracefully', async () => {
        mockDb.getTrack.mockReturnValueOnce({
            id: 1,
            service: 'youtube',
            external_id: 'test_id',
            title: 'Test Song',
            artist_name: 'Test Artist',
            album_id: 42
        }).mockReturnValueOnce({
            id: 1,
            file_path: 'localized/Test Artist/Unknown Album/Test Song.m4a',
            format: 'm4a',
            service: 'local'
        });
        mockDb.getAlbum.mockReturnValue(undefined);
        mockReaddir.mockResolvedValue(['temp_1.m4a'] as never);
        const service = new LocalizationService(mockDb, mockCatalog, '/music');

        const result = await service.localizeTrack(1);

        expect(mockDb.getAlbum).toHaveBeenCalledWith(42);
        expect(mockMove).toHaveBeenCalled();
        expect(mockDb.updateTrack).toHaveBeenCalledWith(1, {
            file_path: 'localized/Test Artist/Unknown Album/Test Song.m4a',
            format: 'm4a',
            service: 'local'
        });
    });
});
