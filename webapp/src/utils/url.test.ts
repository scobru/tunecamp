import { describe, test, expect } from 'vitest';
import { fixRelativeUrl } from './url.ts';

describe('fixRelativeUrl', () => {
    test('should return empty string for null/undefined/empty', () => {
        expect(fixRelativeUrl(null)).toBe('');
        expect(fixRelativeUrl(undefined)).toBe('');
        expect(fixRelativeUrl('')).toBe('');
    });

    test('should not modify absolute URLs', () => {
        expect(fixRelativeUrl('http://example.com')).toBe('http://example.com');
        expect(fixRelativeUrl('https://example.com')).toBe('https://example.com');
        expect(fixRelativeUrl('data:image/png;base64,...')).toBe('data:image/png;base64,...');
        expect(fixRelativeUrl('blob:http://localhost/...')).toBe('blob:http://localhost/...');
        expect(fixRelativeUrl('/path/to/image.png')).toBe('/path/to/image.png');
    });

    test('should prepend /api/ to relative assets/ paths', () => {
        expect(fixRelativeUrl('assets/image.png')).toBe('/api/assets/image.png');
        expect(fixRelativeUrl('assets/sub/dir/img.jpg')).toBe('/api/assets/sub/dir/img.jpg');
    });

    test('should prepend / to other relative paths', () => {
        expect(fixRelativeUrl('images/cover.png')).toBe('/images/cover.png');
        expect(fixRelativeUrl('file.txt')).toBe('/file.txt');
    });
});
