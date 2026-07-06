
import { describe, expect, test } from '@jest/globals';
import { getPlaceholderSVG, slugify, sanitizeFilename, validateUsername } from './audioUtils.js';

describe('slugify', () => {
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore
        expect(slugify(null)).toBe('');
        // @ts-ignore
        expect(slugify(undefined)).toBe('');
        expect(slugify('')).toBe('');
    });

    test('should convert text to a URL-safe slug correctly', () => {
        expect(slugify('Hello World!')).toBe('hello-world');
        expect(slugify('My Awesome Track 1')).toBe('my-awesome-track-1');
    });

    test('should handle special characters', () => {
        expect(slugify('A b c 1@#')).toBe('a-b-c-1');
        expect(slugify('Track name with (parentheses) & [brackets]!')).toBe('track-name-with-parentheses-brackets');
    });

    test('should trim leading/trailing dashes', () => {
        expect(slugify('--Hello--')).toBe('hello');
        expect(slugify('---Multiple--Dashes---')).toBe('multiple-dashes');
    });
});

describe('Audio Utils Security', () => {
    test('getPlaceholderSVG should escape HTML special characters to prevent XSS', () => {
        const maliciousInput = '<script>alert("xss")</script>';
        const svg = getPlaceholderSVG(maliciousInput);

        // Should NOT contain the raw script tag
        expect(svg).not.toContain('<script>');
        expect(svg).not.toContain('</script>');

        // Should contain the escaped version
        expect(svg).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

        // Ensure the SVG structure is still valid
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
    });

    test('getPlaceholderSVG should handle normal input correctly', () => {
        const normalInput = 'My Album';
        const svg = getPlaceholderSVG(normalInput);

        expect(svg).toContain('My Album');
        expect(svg).toContain('<text');
    });

    test('getPlaceholderSVG should handle empty input', () => {
        // Default is 'No Cover'
        const svg = getPlaceholderSVG(undefined);
        expect(svg).toContain('No Cover');
    });
});

describe('getPlaceholderSVG structure and defaults', () => {
    test('should return default "No Cover" text when called with no arguments', () => {
        const svg = getPlaceholderSVG();
        expect(svg).toContain('No Cover');
    });

    test('should include correct width, height, and viewBox', () => {
        const svg = getPlaceholderSVG('Test');
        expect(svg).toContain('width="500"');
        expect(svg).toContain('height="500"');
        expect(svg).toContain('viewBox="0 0 500 500"');
    });

    test('should properly escape ampersands and quotes', () => {
        const svg = getPlaceholderSVG('Rock & "Roll"');
        expect(svg).toContain('Rock &amp; &quot;Roll&quot;');
    });
});

describe('sanitizeFilename', () => {
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore
        expect(sanitizeFilename(null)).toBe('');
        // @ts-ignore
        expect(sanitizeFilename(undefined)).toBe('');
        expect(sanitizeFilename('')).toBe('');
    });

    test('should keep safe characters', () => {
        expect(sanitizeFilename('my_Song-1.2.mp3')).toBe('my_Song-1.2.mp3');
    });

    test('should replace unsafe characters with underscore', () => {
        expect(sanitizeFilename('song with spaces.mp3')).toBe('song_with_spaces.mp3');
        expect(sanitizeFilename('song/with\\slashes:*.mp3')).toBe('song_with_slashes__.mp3');
    });
});

describe('validateUsername', () => {
    test('should return invalid for empty/null/undefined username', () => {
        expect(validateUsername('')).toEqual({ valid: false, error: 'Username is required' });
        // @ts-ignore
        expect(validateUsername(null)).toEqual({ valid: false, error: 'Username is required' });
        // @ts-ignore
        expect(validateUsername(undefined)).toEqual({ valid: false, error: 'Username is required' });
    });

    test('should return invalid for too short username', () => {
        expect(validateUsername('a')).toEqual({ valid: false, error: 'Username must be at least 3 characters' });
        expect(validateUsername('ab')).toEqual({ valid: false, error: 'Username must be at least 3 characters' });
    });

    test('should return invalid for too long username', () => {
        expect(validateUsername('this_is_a_very_long_username_that_is_too_long')).toEqual({ valid: false, error: 'Username must be at most 20 characters' });
        expect(validateUsername('twentyone_chars_long_')).toEqual({ valid: false, error: 'Username must be at most 20 characters' });
    });

    test('should return invalid for invalid characters', () => {
        expect(validateUsername('user!name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(validateUsername('user name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(validateUsername('user@name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
    });

    test('should return valid for valid username', () => {
        expect(validateUsername('valid_User_123')).toEqual({ valid: true });
    });

    test('should return invalid for boundary edge cases', () => {
        // 2 characters (too short)
        expect(validateUsername('ab')).toEqual({ valid: false, error: 'Username must be at least 3 characters' });
        // 3 characters (shortest valid)
        expect(validateUsername('abc')).toEqual({ valid: true });
        // 20 characters (longest valid)
        expect(validateUsername('a1234567890123456789')).toEqual({ valid: true });
        // 21 characters (too long)
        expect(validateUsername('a12345678901234567890')).toEqual({ valid: false, error: 'Username must be at most 20 characters' });
    });
});

describe('getPlaceholderSVG structure details', () => {
    test('should include safe text in the template', () => {
        const svg = getPlaceholderSVG('Safe Text Test');
        expect(svg).toContain('Safe Text Test');
    });

    test('should properly escape text using StringUtils.escapeHtml', () => {
        const svg = getPlaceholderSVG('<script>alert("xss")</script>');
        expect(svg).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    test('should set default text to "No Cover" when text is undefined', () => {
        const svg = getPlaceholderSVG(undefined);
        expect(svg).toContain('No Cover');
    });

    test('should correctly render the outer svg and main rect tags', () => {
        const svg = getPlaceholderSVG('Test');
        expect(svg).toContain('<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">');
        expect(svg).toContain('<rect width="500" height="500" fill="#0f172a"/>');
    });

    test('should include defs and linearGradient definitions', () => {
        const svg = getPlaceholderSVG('Test');
        expect(svg).toContain('<defs>');
        expect(svg).toContain('<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">');
    });
});
