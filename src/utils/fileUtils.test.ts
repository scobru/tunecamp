import { describe, test, expect } from '@jest/globals';
import path from 'path';
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

    test('should return null for null byte injection', () => {
        const result = fileUtils.resolveSafePath(rootDir, 'artist/song\0.mp3');
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
});
