import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { DatabaseService } from '../../core/database.types.js';
import { Readable } from 'stream';
import { GoogleDriveService } from './google-drive.service.js';

describe('GoogleDriveService', () => {
    let service: any;
    let mockDb: any;
    let originalAxiosPost: any;
    let originalAxiosGet: any;

    beforeEach(async () => {
        mockDb = {
            getStorageAccountByProvider: jest.fn(),
            updateStorageAccount: jest.fn(),
            createStorageAccount: jest.fn(),
        };

        service = new GoogleDriveService(mockDb as unknown as DatabaseService, {
            clientId: 'test-id',
            clientSecret: 'test-secret',
            redirectUri: 'http://test/cb'
        });

        // Use spyOn for standard mocks to avoid experimental VM issues
        const axios = (await import('axios')).default;

        originalAxiosPost = axios.post;
        originalAxiosGet = axios.get;

        jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
        jest.spyOn(axios, 'get').mockResolvedValue({ data: {} });

        jest.clearAllMocks();
    });

    afterEach(async () => {
        const axios = (await import('axios')).default;
        axios.post = originalAxiosPost;
        axios.get = originalAxiosGet;
        jest.restoreAllMocks();
    });

    test('getAuthUrl returns correct URL', () => {
        const url = service.getAuthUrl('test-state');
        expect(url).toContain('client_id=test-id');
        expect(url).toContain('redirect_uri=http%3A%2F%2Ftest%2Fcb');
        expect(url).toContain('state=test-state');
    });

    describe('getValidToken', () => {
        test('throws if account not connected', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue(undefined);
            await expect(service.getValidToken(1)).rejects.toThrow('Google Drive account not connected');
        });

        test('returns existing token if valid', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1,
                access_token: 'valid-token',
                expiry_date: Date.now() + 120000 // Valid for 2 mins
            });

            const axios = (await import('axios')).default;
            const token = await service.getValidToken(1);

            expect(token).toBe('valid-token');
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('throws if no refresh token and expired', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1,
                access_token: 'expired-token',
                expiry_date: Date.now() - 10000
            });
            await expect(service.getValidToken(1)).rejects.toThrow('No refresh token available');
        });

        test('refreshes token if expired', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1,
                access_token: 'expired-token',
                refresh_token: 'refresh-token',
                expiry_date: Date.now() - 10000
            });

            const axios = (await import('axios')).default;
            (axios.post as jest.Mock).mockResolvedValueOnce({
                data: { access_token: 'new-token', expires_in: 3600 }
            });

            const token = await service.getValidToken(1);

            expect(token).toBe('new-token');
            expect(axios.post).toHaveBeenCalledWith(
                'https://oauth2.googleapis.com/token',
                expect.objectContaining({ refresh_token: 'refresh-token' })
            );
            expect(mockDb.updateStorageAccount).toHaveBeenCalledWith(1, expect.objectContaining({
                access_token: 'new-token'
            }));
        });
    });

    describe('uploadFile', () => {
        test('uploads file and returns metadata', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1,
                access_token: 'valid-token',
                expiry_date: Date.now() + 120000
            });

            const axios = (await import('axios')).default;
            (axios.post as jest.Mock).mockResolvedValueOnce({
                data: { id: 'file-id', name: 'test.mp3', mimeType: 'audio/mpeg' }
            });

            const buffer = Buffer.from('test');
            const result = await service.uploadFile(1, 'test.mp3', 'audio/mpeg', buffer);

            expect(result.id).toBe('file-id');
            expect(axios.post).toHaveBeenCalledWith(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({ Authorization: 'Bearer valid-token' })
                })
            );
        });
    });

    describe('exchangeCode', () => {
        test('exchanges code and saves new account', async () => {
            const axios = (await import('axios')).default;
            (axios.post as jest.Mock).mockResolvedValueOnce({
                data: { access_token: 'acc-token', refresh_token: 'ref-token', expires_in: 3600 }
            });
            (axios.get as jest.Mock).mockResolvedValueOnce({
                data: { email: 'test@example.com' }
            });
            mockDb.getStorageAccountByProvider.mockReturnValue(undefined);
            mockDb.createStorageAccount.mockReturnValue(2);

            const id = await service.exchangeCode('auth-code', 1);

            expect(id).toBe(2);
            expect(axios.post).toHaveBeenCalledWith(
                'https://oauth2.googleapis.com/token',
                expect.objectContaining({ code: 'auth-code' })
            );
            expect(mockDb.createStorageAccount).toHaveBeenCalledWith(expect.objectContaining({
                user_id: 1,
                provider: 'google',
                account_email: 'test@example.com',
                access_token: 'acc-token',
                refresh_token: 'ref-token'
            }));
        });

        test('exchanges code and updates existing account', async () => {
            const axios = (await import('axios')).default;
            (axios.post as jest.Mock).mockResolvedValueOnce({
                data: { access_token: 'acc-token', refresh_token: 'ref-token', expires_in: 3600 }
            });
            (axios.get as jest.Mock).mockResolvedValueOnce({
                data: { email: 'test@example.com' }
            });
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 5, refresh_token: 'old-ref'
            });

            const id = await service.exchangeCode('auth-code', 1);

            expect(id).toBe(5);
            expect(mockDb.updateStorageAccount).toHaveBeenCalledWith(5, expect.objectContaining({
                access_token: 'acc-token',
                refresh_token: 'ref-token',
                account_email: 'test@example.com'
            }));
        });
    });

    describe('listFiles', () => {
        test('lists files and handles pagination', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1, access_token: 'valid-token', expiry_date: Date.now() + 120000
            });

            const axios = (await import('axios')).default;
            (axios.get as jest.Mock)
                .mockResolvedValueOnce({ data: { files: [{ id: 'f1' }], nextPageToken: 'token1' } })
                .mockResolvedValueOnce({ data: { files: [{ id: 'f2' }] } });

            const files = await service.listFiles(1, 'folder-1');

            expect(files.length).toBe(2);
            expect(axios.get).toHaveBeenCalledTimes(2);
            expect(axios.get).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
                params: expect.objectContaining({ pageToken: undefined })
            }));
            expect(axios.get).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
                params: expect.objectContaining({ pageToken: 'token1' })
            }));
        });
    });

    describe('listAudioFilesRecursive', () => {
        test('recursively finds audio files', async () => {
             mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1, access_token: 'valid-token', expiry_date: Date.now() + 120000
            });

            const mockListFiles = jest.spyOn(service, 'listFiles');
            mockListFiles
                .mockResolvedValueOnce([ // root
                    { id: 'f1', name: 'song.mp3', mimeType: 'audio/mpeg' },
                    { id: 'd1', name: 'folder1', mimeType: 'application/vnd.google-apps.folder' }
                ] as any)
                .mockResolvedValueOnce([ // d1
                    { id: 'f2', name: 'track.wav', mimeType: 'audio/wav' },
                    { id: 'f3', name: 'doc.txt', mimeType: 'text/plain' }
                ] as any);

            const audioFiles = await service.listAudioFilesRecursive(1);

            expect(audioFiles.length).toBe(2);
            expect(audioFiles.map((f: any) => f.id)).toEqual(['f1', 'f2']);
            expect(mockListFiles).toHaveBeenCalledTimes(2);
        });

        test('handles errors during folder traversal', async () => {
            mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1, access_token: 'valid-token', expiry_date: Date.now() + 120000
            });

            const mockListFiles = jest.spyOn(service, 'listFiles');
            mockListFiles.mockRejectedValueOnce(new Error('Network error'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const audioFiles = await service.listAudioFilesRecursive(1);

            expect(audioFiles.length).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[GDrive] Failed to list folder root:'), expect.any(Error));
        });
    });

    describe('getFile', () => {
        test('gets file metadata', async () => {
             mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1, access_token: 'valid-token', expiry_date: Date.now() + 120000
            });
            const axios = (await import('axios')).default;
            (axios.get as jest.Mock).mockResolvedValueOnce({
                data: { id: 'file-1', name: 'test' }
            });

            const file = await service.getFile(1, 'file-1');
            expect(file.id).toBe('file-1');
        });
    });

    describe('getFileStream', () => {
        test('gets file stream with range', async () => {
             mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1, access_token: 'valid-token', expiry_date: Date.now() + 120000
            });
            const mockStream = new Readable();
            const axios = (await import('axios')).default;
            (axios.get as jest.Mock).mockResolvedValueOnce({
                data: mockStream,
                status: 206,
                headers: { 'content-type': 'audio/mpeg' }
            });

            const result = await service.getFileStream(1, 'file-1', 'bytes=0-100');
            expect(result.stream).toBe(mockStream);
            expect(result.status).toBe(206);
            expect(axios.get).toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/file-1',
                expect.objectContaining({
                    headers: { Authorization: 'Bearer valid-token', Range: 'bytes=0-100' },
                    responseType: 'stream'
                })
            );
        });

        test('gets file stream without range', async () => {
             mockDb.getStorageAccountByProvider.mockReturnValue({
                id: 1, access_token: 'valid-token', expiry_date: Date.now() + 120000
            });
            const mockStream = new Readable();
            const axios = (await import('axios')).default;
            (axios.get as jest.Mock).mockResolvedValueOnce({
                data: mockStream,
                status: 200,
                headers: { 'content-type': 'audio/mpeg' }
            });

            const result = await service.getFileStream(1, 'file-1');
            expect(result.stream).toBe(mockStream);
            expect(result.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/file-1',
                expect.objectContaining({
                    headers: { Authorization: 'Bearer valid-token' },
                    responseType: 'stream'
                })
            );
        });
    });
});
