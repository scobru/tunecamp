import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import * as fileUtils from './fileUtils.js';

describe('fileExists', () => {
    test('should return true if file exists', async () => {
        // Use an actual existing file (package.json) to test the happy path without mocks
        const exists = await fileUtils.fileExists('package.json');
        expect(exists).toBe(true);
    });

    test('should return false if file does not exist', async () => {
        // Use a definitely non-existent file path to natively cover the catch block for the error path without mocks
        const exists = await fileUtils.fileExists('path/to/non-existing/file-123456789.txt');
        expect(exists).toBe(false);
    });
});

describe('getRelativePath', () => {
    test('should return relative path and normalize backslashes', () => {
        const result = fileUtils.getRelativePath('/app/src', '/app/src/utils/file.ts');
        expect(result).toBe('utils/file.ts');
    });

    test('should return empty string for same directory', () => {
        const result = fileUtils.getRelativePath('/app/src', '/app/src');
        expect(result).toBe('');
    });

    test('should return relative path when navigating up directories', () => {
        const result = fileUtils.getRelativePath('/app/src/utils', '/app/src/index.ts');
        expect(result).toBe('../index.ts');
    });

    test('should return relative path for deeply nested directories', () => {
        const result = fileUtils.getRelativePath('/app', '/app/src/components/ui/button.tsx');
        expect(result).toBe('src/components/ui/button.tsx');
    });

    test('should normalize paths containing existing backslashes', () => {
        const result = fileUtils.getRelativePath('/app/src', '/app/src/utils\\file.ts');
        expect(result).toBe('utils/file.ts');
    });
});

describe('resolveSafePath', () => {
    const rootDir = '/app/music';

    test('should resolve a valid relative path', () => {
        const result = fileUtils.resolveSafePath(rootDir, 'artist/album/song.mp3');
        expect(result?.endsWith(path.normalize('artist/album/song.mp3'))).toBe(true);
        expect(result?.includes(path.resolve(rootDir))).toBe(true);
    });

    test('should handle root directory self-reference', () => {
        const result = fileUtils.resolveSafePath(rootDir, '.');
        expect(result?.endsWith('music')).toBe(true);
    });

    test('should strip leading slashes and resolve correctly', () => {
        const result = fileUtils.resolveSafePath(rootDir, '/artist/song.mp3');
        expect(result?.endsWith(path.normalize('artist/song.mp3'))).toBe(true);

        const resultMulti = fileUtils.resolveSafePath(rootDir, '///artist/song.mp3');
        expect(resultMulti?.endsWith(path.normalize('artist/song.mp3'))).toBe(true);
    });

    test('should strip leading backslashes and resolve correctly', () => {
        const result = fileUtils.resolveSafePath(rootDir, '\\\\artist\\song.mp3');
        expect(result?.endsWith(path.normalize('artist\\song.mp3'))).toBe(true);
    });

    test('should return null for null byte injection', () => {
        const result = fileUtils.resolveSafePath(rootDir, 'artist/song\0.mp3');
        expect(result).toBeNull();
    });

    test('should return null when userPath is exactly a null byte', () => {
        const result = fileUtils.resolveSafePath(rootDir, '\0');
        expect(result).toBeNull();
    });

    test('should return null when userPath starts with a null byte', () => {
        const result = fileUtils.resolveSafePath(rootDir, '\0test.txt');
        expect(result).toBeNull();
    });

    test('should return null for directory traversal escaping root', () => {
        const result = fileUtils.resolveSafePath(rootDir, '../secrets.txt');
        expect(result).toBeNull();

        const resultDeep = fileUtils.resolveSafePath(rootDir, 'artist/../../secrets.txt');
        expect(resultDeep).toBeNull();
    });

    test('should return null for absolute paths attempting to escape', () => {
        expect(fileUtils.resolveSafePath(rootDir, '../../etc/passwd')).toBeNull();
    });

    test('should correctly resolve paths with internal .. that stay within root', () => {
        const result = fileUtils.resolveSafePath(rootDir, 'artist/album/../song.mp3');
        expect(result?.endsWith(path.normalize('artist/song.mp3'))).toBe(true);
        expect(result?.includes(path.resolve(rootDir))).toBe(true);
    });

    test('should return null when rootDir is the filesystem root and userPath is valid', () => {
        // Since path.resolve('/', 'foo') resolves to '/foo' and path.relative('/', '/foo') resolves to 'foo'
        // the check `!absPath.startsWith(resolvedRoot + path.sep)` evaluates to:
        // !('/foo'.startsWith('/' + '/')) -> !('/foo'.startsWith('//')) -> !false -> true
        // and absPath !== resolvedRoot -> '/foo' !== '/' -> true
        // Thus, isSafePath('/', '/foo') returns false.
        const result = fileUtils.resolveSafePath('/', 'foo');
        expect(result).toBeNull();
    });
});

describe('File Hashing', () => {
    const tmpDir = path.join(os.tmpdir(), 'getFastFileHash-tests');

    beforeAll(async () => {
        await fs.mkdirp(tmpDir);
    });

    afterAll(async () => {
        await fs.remove(tmpDir);
    });

    describe('getFileHash', () => {
        test('should compute correct MD5 hash for a file', async () => {
            const filePath = path.join(tmpDir, 'hash-test.txt');
            const content = 'hello world';
            await fs.writeFile(filePath, content);

            const expectedHash = crypto.createHash('md5').update(content).digest('hex');
            const hash = await fileUtils.getFileHash(filePath);

            expect(hash).toBe(expectedHash);
        });
    });

    describe('getFastFileHash', () => {
        test('should fallback to full hash for empty files (0 bytes)', async () => {
            const filePath = path.join(tmpDir, 'empty.txt');
            const content = Buffer.alloc(0);
            await fs.writeFile(filePath, content);

            const expectedHash = crypto.createHash('md5').update(content).digest('hex');
            const hash = await fileUtils.getFastFileHash(filePath);

            expect(hash).toBe(expectedHash);
        });

        test('should fallback to full hash for files just under 2MB (2MB - 1 byte)', async () => {
            const filePath = path.join(tmpDir, 'edge-small.txt');
            const content = Buffer.alloc(2 * 1024 * 1024 - 1, 'b');
            await fs.writeFile(filePath, content);

            const expectedHash = crypto.createHash('md5').update(content).digest('hex');
            const hash = await fileUtils.getFastFileHash(filePath);

            expect(hash).toBe(expectedHash);
        });

        test('should fallback to full hash for small files (< 2MB)', async () => {
            const filePath = path.join(tmpDir, 'small.txt');
            const content = Buffer.alloc(1024 * 1024, 'a'); // 1MB
            await fs.writeFile(filePath, content);

            const expectedHash = crypto.createHash('md5').update(content).digest('hex');
            const hash = await fileUtils.getFastFileHash(filePath);

            expect(hash).toBe(expectedHash);
        });

        test('should hash head, tail, and size for large files (>= 2MB)', async () => {
            const filePath = path.join(tmpDir, 'large.txt');
            const head = Buffer.alloc(1024 * 1024, 'a'); // 1MB
            const middle = Buffer.alloc(1024 * 1024, 'b'); // 1MB
            const tail = Buffer.alloc(1024 * 1024, 'c'); // 1MB

            await fs.writeFile(filePath, Buffer.concat([head, middle, tail]));

            const expectedHash = crypto.createHash('md5')
                .update(head)
                .update(tail)
                .update((3 * 1024 * 1024).toString())
                .digest('hex');

            const hash = await fileUtils.getFastFileHash(filePath);

            expect(hash).toBe(expectedHash);
        });
    });
});

describe('findAudioFiles', () => {
    const tmpDir = path.join(os.tmpdir(), 'findAudioFiles-tests');

    beforeAll(async () => {
        await fs.mkdirp(tmpDir);
    });

    afterAll(async () => {
        await fs.remove(tmpDir);
    });

    test('should return empty array if no audio files found', async () => {
        const emptyDir = path.join(tmpDir, 'empty');
        await fs.mkdirp(emptyDir);
        const files = await fileUtils.findAudioFiles(emptyDir);
        expect(files).toEqual([]);
    });

    test('should find audio files in directory and subdirectories', async () => {
        const testDir = path.join(tmpDir, 'audio-files');
        await fs.mkdirp(testDir);

        await fs.writeFile(path.join(testDir, 'song.mp3'), '');
        await fs.writeFile(path.join(testDir, 'image.jpg'), '');

        const subDir = path.join(testDir, 'album');
        await fs.mkdirp(subDir);
        await fs.writeFile(path.join(subDir, 'track.flac'), '');

        const files = await fileUtils.findAudioFiles(testDir);

        // Sort for consistent checking
        expect(files.map(f => f.replace(/\\/g, '/')).sort()).toEqual([
            'album/track.flac',
            'song.mp3'
        ].sort());
    });
});
