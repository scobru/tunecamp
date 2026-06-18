import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'path';
import fsExtra from 'fs-extra';
import * as fileUtils from './fileUtils.js';

const accessSpy = jest.spyOn(fsExtra, 'access' as any);

describe('fileExists', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should return true if file exists', async () => {
        accessSpy.mockResolvedValue(undefined as any);
        const exists = await fileUtils.fileExists('path/to/existing/file.txt');
        expect(exists).toBe(true);
        expect(accessSpy).toHaveBeenCalledWith('path/to/existing/file.txt');
    });

    test('should return false if file does not exist', async () => {
        accessSpy.mockRejectedValue(new Error('File not found') as any);
        const exists = await fileUtils.fileExists('path/to/non-existing/file.txt');
        expect(exists).toBe(false);
        expect(accessSpy).toHaveBeenCalledWith('path/to/non-existing/file.txt');
    });
});

describe('createSlug', () => {
    test('should convert text to lowercase and replace special characters with hyphens', () => {
        expect(fileUtils.createSlug('Hello World')).toBe('hello-world');
        expect(fileUtils.createSlug('Music & Art')).toBe('music-art');
        expect(fileUtils.createSlug('  Spaces  ')).toBe('spaces');
        expect(fileUtils.createSlug('Special!@#$%^&*()Characters')).toBe('special-characters');
    });

    test('should handle multiple special characters and trailing hyphens', () => {
        expect(fileUtils.createSlug('---Hello---World---')).toBe('hello-world');
        expect(fileUtils.createSlug('Hello...World')).toBe('hello-world');
    });

    test('should handle empty strings', () => {
        expect(fileUtils.createSlug('')).toBe('');
    });

    test('should handle strings with only special characters', () => {
        expect(fileUtils.createSlug('!!!')).toBe('');
        expect(fileUtils.createSlug('   ')).toBe('');
    });

    test('should handle strings with numbers', () => {
        expect(fileUtils.createSlug('12345')).toBe('12345');
        expect(fileUtils.createSlug('Song 123')).toBe('song-123');
    });

    test('should handle already sluggified strings', () => {
        expect(fileUtils.createSlug('hello-world')).toBe('hello-world');
    });

    test('should handle leading and trailing special characters', () => {
        expect(fileUtils.createSlug('!hello!')).toBe('hello');
        expect(fileUtils.createSlug('_leading_and_trailing_')).toBe('leading-and-trailing');
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
