
import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import { getPlaceholderSVG, formatDuration, slugify, formatTimeAgo, formatAudioFilename, sanitizeFilename, validateUsername } from './audioUtils.js';

describe('formatAudioFilename', () => {
    test('should format standard input correctly', () => {
        expect(formatAudioFilename(1, 'Test Title', 'flac')).toBe('01-test-title.flac');
        expect(formatAudioFilename(10, 'Another Title', 'mp3')).toBe('10-another-title.mp3');
    });

    test('should fallback to 0 for falsy trackNum and omit prefix', () => {
        // @ts-ignore
        expect(formatAudioFilename(null, 'Test Title', 'flac')).toBe('test-title.flac');
        // @ts-ignore
        expect(formatAudioFilename(undefined, 'Test Title', 'flac')).toBe('test-title.flac');
        expect(formatAudioFilename(0, 'Test Title', 'flac')).toBe('test-title.flac');
    });

    test('should fallback to "Unknown" for falsy title', () => {
        // @ts-ignore
        expect(formatAudioFilename(1, null, 'flac')).toBe('01-unknown.flac');
        // @ts-ignore
        expect(formatAudioFilename(1, undefined, 'flac')).toBe('01-unknown.flac');
        expect(formatAudioFilename(1, '', 'flac')).toBe('01-unknown.flac');
    });

    test('should fallback to "mp3" for falsy extension', () => {
        // @ts-ignore
        expect(formatAudioFilename(1, 'Test Title', null)).toBe('01-test-title.mp3');
        // @ts-ignore
        expect(formatAudioFilename(1, 'Test Title', undefined)).toBe('01-test-title.mp3');
        expect(formatAudioFilename(1, 'Test Title', '')).toBe('01-test-title.mp3');
    });

    test('should combine all fallbacks correctly', () => {
        // @ts-ignore
        expect(formatAudioFilename(null, null, null)).toBe('unknown.mp3');
        expect(formatAudioFilename(0, '', '')).toBe('unknown.mp3');
    });
});

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

describe('formatDuration', () => {
    test('should return 0:00 for undefined or null', () => {
        expect(formatDuration(undefined)).toBe('0:00');
        expect(formatDuration(null as any)).toBe('0:00');
    });

    test('should return 0:00 for 0', () => {
        expect(formatDuration(0)).toBe('0:00');
    });

    test('should format seconds correctly', () => {
        expect(formatDuration(59)).toBe('0:59');
    });

    test('should format minutes correctly', () => {
        expect(formatDuration(60)).toBe('1:00');
        expect(formatDuration(65)).toBe('1:05');
    });

    test('should format hours correctly (as minutes)', () => {
        expect(formatDuration(3600)).toBe('60:00');
        expect(formatDuration(3661)).toBe('61:01');
    });

    test('should truncate floating point numbers', () => {
        expect(formatDuration(65.7)).toBe('1:05');
    });
});

describe('formatTimeAgo', () => {
    let dateNowSpy: ReturnType<typeof jest.spyOn>;
    const MOCK_CURRENT_TIME = new Date('2024-01-01T12:00:00.000Z').getTime();

    beforeAll(() => {
        // Mock Date.now() to return a consistent timestamp
        dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(MOCK_CURRENT_TIME);
    });

    afterAll(() => {
        // Restore the original Date.now()
        dateNowSpy.mockRestore();
    });

    test('should format time within 60 seconds as "just now"', () => {
        // 10 seconds ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 10 * 1000)).toBe('just now');
        // 59 seconds ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 59 * 1000)).toBe('just now');
    });

    test('should format time within 60 minutes as "Xm ago"', () => {
        // 1 minute ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 60 * 1000)).toBe('1m ago');
        // 45 minutes ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 45 * 60 * 1000)).toBe('45m ago');
    });

    test('should format time within 24 hours as "Xh ago"', () => {
        // 1 hour ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 3600 * 1000)).toBe('1h ago');
        // 23 hours ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 23 * 3600 * 1000)).toBe('23h ago');
    });

    test('should format time within 7 days as "Xd ago"', () => {
        // 1 day ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 86400 * 1000)).toBe('1d ago');
        // 6 days ago
        expect(formatTimeAgo(MOCK_CURRENT_TIME - 6 * 86400 * 1000)).toBe('6d ago');
    });

    test('should format older dates with toLocaleDateString', () => {
        // 8 days ago
        const olderDate = new Date(MOCK_CURRENT_TIME - 8 * 86400 * 1000);
        expect(formatTimeAgo(olderDate.getTime())).toBe(olderDate.toLocaleDateString());

        // 1 year ago
        const yearAgoDate = new Date(MOCK_CURRENT_TIME - 365 * 86400 * 1000);
        expect(formatTimeAgo(yearAgoDate.getTime())).toBe(yearAgoDate.toLocaleDateString());
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
    test('should return invalid for empty/null username', () => {
        expect(validateUsername('')).toEqual({ valid: false, error: 'Username is required' });
        // @ts-ignore
        expect(validateUsername(null)).toEqual({ valid: false, error: 'Username is required' });
    });

    test('should return invalid for too short username', () => {
        expect(validateUsername('ab')).toEqual({ valid: false, error: 'Username must be at least 3 characters' });
    });

    test('should return invalid for too long username', () => {
        expect(validateUsername('this_is_a_very_long_username_that_is_too_long')).toEqual({ valid: false, error: 'Username must be at most 20 characters' });
    });

    test('should return invalid for invalid characters', () => {
        expect(validateUsername('user!name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(validateUsername('user name')).toEqual({ valid: false, error: 'Username must contain only letters, numbers, and underscores' });
    });

    test('should return valid for valid username', () => {
        expect(validateUsername('valid_User_123')).toEqual({ valid: true });
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
