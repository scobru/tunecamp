import { jest } from "@jest/globals";
import { StringUtils } from './stringUtils.js';

describe('StringUtils.escapeHtml', () => {
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore - testing runtime behavior for non-TS usage or edge cases
        expect(StringUtils.escapeHtml(null)).toBe('');
        // @ts-ignore
        expect(StringUtils.escapeHtml(undefined)).toBe('');
        expect(StringUtils.escapeHtml('')).toBe('');
    });

    test('should return original string if no special characters present', () => {
        const input = 'Hello World 123';
        expect(StringUtils.escapeHtml(input)).toBe(input);
    });

    test('should escape ampersand (&)', () => {
        expect(StringUtils.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
        expect(StringUtils.escapeHtml('&')).toBe('&amp;');
    });

    test('should escape less than (<)', () => {
        expect(StringUtils.escapeHtml('<script>')).toBe('&lt;script&gt;');
        expect(StringUtils.escapeHtml('1 < 2')).toBe('1 &lt; 2');
    });

    test('should escape greater than (>)', () => {
        expect(StringUtils.escapeHtml('2 > 1')).toBe('2 &gt; 1');
        expect(StringUtils.escapeHtml('->')).toBe('-&gt;');
    });

    test('should escape double quotes (")', () => {
        expect(StringUtils.escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
        expect(StringUtils.escapeHtml('"')).toBe('&quot;');
    });

    test('should escape single quotes (\')', () => {
        expect(StringUtils.escapeHtml("It's me")).toBe('It&#039;s me');
        expect(StringUtils.escapeHtml("'")).toBe('&#039;');
    });

    test('should escape multiple special characters correctly', () => {
        const input = '<div class="test">It\'s & code</div>';
        const expected = '&lt;div class=&quot;test&quot;&gt;It&#039;s &amp; code&lt;/div&gt;';
        expect(StringUtils.escapeHtml(input)).toBe(expected);
    });

    test('should handle sequential special characters', () => {
        expect(StringUtils.escapeHtml('<<>>""&&\'\'')).toBe('&lt;&lt;&gt;&gt;&quot;&quot;&amp;&amp;&#039;&#039;');
    });
});

describe('StringUtils.sanitizeFilename', () => {
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore
        expect(StringUtils.sanitizeFilename(null)).toBe('');
        // @ts-ignore
        expect(StringUtils.sanitizeFilename(undefined)).toBe('');
        expect(StringUtils.sanitizeFilename('')).toBe('');
    });

    test('should return original string if it contains only safe characters', () => {
        const input = 'my-song_01.mp3';
        expect(StringUtils.sanitizeFilename(input)).toBe(input);
    });

    test('should replace spaces with underscores', () => {
        expect(StringUtils.sanitizeFilename('my song.mp3')).toBe('my_song.mp3');
    });

    test('should replace special characters with underscores', () => {
        expect(StringUtils.sanitizeFilename('song!@#$%^&*().mp3')).toBe('song__________.mp3');
    });

    test('should replace path components with underscores', () => {
        expect(StringUtils.sanitizeFilename('path/to/file.mp3')).toBe('path_to_file.mp3');
        expect(StringUtils.sanitizeFilename('..\\file.mp3')).toBe('.._file.mp3');
    });

    test('should replace non-ASCII characters with underscores', () => {
        expect(StringUtils.sanitizeFilename('música.mp3')).toBe('m_sica.mp3');
        expect(StringUtils.sanitizeFilename('🎵.mp3')).toBe('__.mp3');
    });
});

describe('StringUtils.generateUnlockCode', () => {
    test('should generate codes matching the format AAAA-BBBB-CCCC', () => {
        const regex = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
        for (let i = 0; i < 100; i++) {
            const code = StringUtils.generateUnlockCode();
            expect(code).toMatch(regex);
        }
    });

    test('should not contain ambiguous characters', () => {
        const ambiguousChars = ['0', 'O', '1', 'I'];
        for (let i = 0; i < 100; i++) {
            const code = StringUtils.generateUnlockCode();
            ambiguousChars.forEach(char => {
                expect(code).not.toContain(char);
            });
        }
    });

    test('should generate unique codes', () => {
        const codes = new Set();
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            codes.add(StringUtils.generateUnlockCode());
        }
        expect(codes.size).toBe(iterations);
    });

    describe("cleanPath", () => {
        it("should return null for empty input", () => {
            expect(StringUtils.cleanPath("")).toBeNull();
            expect(StringUtils.cleanPath(null)).toBeNull();
        });

        it("should normalize backslashes to forward slashes", () => {
            expect(StringUtils.cleanPath("C:\\MyMusic\\song.mp3")).toBe("C:/MyMusic/song.mp3");
        });

        it("should remove leading '../'", () => {
            expect(StringUtils.cleanPath("../../../song.mp3")).toBe("song.mp3");
            expect(StringUtils.cleanPath(".././song.mp3")).toBe("./song.mp3");
        });
    });
});

describe('StringUtils.normalizeUrl', () => {
    describe('empty and edge cases', () => {
        test.each([
            ['', ''],
            ['/', ''],
            ['//', ''],
            ['///', '']
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });
    });

    describe('URLs without trailing slashes', () => {
        test.each([
            ['https://example.com', 'https://example.com'],
            ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
            ['ws://chat.example.com', 'ws://chat.example.com'],
            ['file:///etc/passwd', 'file:///etc/passwd']
        ])('preserves "%s"', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });
    });

    describe('URLs with trailing slashes', () => {
        test.each([
            ['https://example.com/', 'https://example.com'],
            ['http://localhost:8080/api/', 'http://localhost:8080/api'],
            ['ftp://server/path/', 'ftp://server/path'],
            ['https://example.com//', 'https://example.com'],
            ['http://localhost/path///', 'http://localhost/path'],
            ['wss://ws.example.com////', 'wss://ws.example.com']
        ])('strips trailing slashes from "%s"', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });
    });

    describe('complex URLs', () => {
        test.each([
            ['https://example.com/search?q=hello/', 'https://example.com/search?q=hello'],
            ['https://example.com/#about/', 'https://example.com/#about'],
            ['http://localhost/?a=1&b=2//', 'http://localhost/?a=1&b=2'],
            ['https://example.com/a//b/c?q=1//2#foo//bar', 'https://example.com/a//b/c?q=1//2#foo//bar']
        ])('correctly normalizes "%s"', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });
    });

    describe('long URLs', () => {
        it('handles extremely long URLs appropriately (max length boundary)', () => {
            const base = 'https://example.com/path';
            const longPath = '/a'.repeat(1000);
            expect(StringUtils.normalizeUrl(base + longPath + '/')).toBe(base + longPath);
            expect(StringUtils.normalizeUrl(base + longPath + '///')).toBe(base + longPath);
        });
    });
});

describe('StringUtils.getFileExtension', () => {
    test('should return empty string for filename with no extension', () => {
        expect(StringUtils.getFileExtension('filename')).toBe('');
        expect(StringUtils.getFileExtension('')).toBe('');
    });

    test('should extract simple extension and convert to lowercase', () => {
        expect(StringUtils.getFileExtension('song.mp3')).toBe('mp3');
        expect(StringUtils.getFileExtension('song.MP3')).toBe('mp3');
        expect(StringUtils.getFileExtension('IMAGE.JPEG')).toBe('jpeg');
    });

    test('should extract extension from filename with multiple dots', () => {
        expect(StringUtils.getFileExtension('archive.tar.gz')).toBe('gz');
        expect(StringUtils.getFileExtension('my.song.v1.0.flac')).toBe('flac');
    });

    test('should handle edge cases like hidden files or trailing dots', () => {
        expect(StringUtils.getFileExtension('.hidden')).toBe('hidden');
        expect(StringUtils.getFileExtension('.gitignore')).toBe('gitignore');
        expect(StringUtils.getFileExtension('file.')).toBe('');
    });
});

describe('StringUtils.slugify', () => {
    it('returns empty string for falsy input', () => {
        // @ts-ignore
        expect(StringUtils.slugify(null)).toBe('');
        // @ts-ignore
        expect(StringUtils.slugify(undefined)).toBe('');
        expect(StringUtils.slugify('')).toBe('');
    });

    it('converts to lowercase', () => {
        expect(StringUtils.slugify('HELLO')).toBe('hello');
    });

    it('replaces non-alphanumeric characters with dashes', () => {
        expect(StringUtils.slugify('hello world!')).toBe('hello-world');
        expect(StringUtils.slugify('hello_world')).toBe('hello-world');
        expect(StringUtils.slugify('hello@#$world')).toBe('hello-world');
    });

    it('trims leading and trailing dashes', () => {
        expect(StringUtils.slugify('-hello-world-')).toBe('hello-world');
        expect(StringUtils.slugify('---hello---world---')).toBe('hello-world');
    });
});

describe('StringUtils.validateUsername', () => {
    it('returns error if username is empty', () => {
        expect(StringUtils.validateUsername('')).toEqual({ ok: false, error: 'Username is required' });
        // @ts-ignore
        expect(StringUtils.validateUsername(null)).toEqual({ ok: false, error: 'Username is required' });
    });

    it('returns error if username is too short', () => {
        expect(StringUtils.validateUsername('ab')).toEqual({ ok: false, error: 'Username must be at least 3 characters' });
    });

    it('returns error if username is too long', () => {
        expect(StringUtils.validateUsername('a'.repeat(21))).toEqual({ ok: false, error: 'Username must be at most 20 characters' });
    });

    it('returns error if username contains invalid characters', () => {
        expect(StringUtils.validateUsername('user!name')).toEqual({ ok: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(StringUtils.validateUsername('user-name')).toEqual({ ok: false, error: 'Username must contain only letters, numbers, and underscores' });
        expect(StringUtils.validateUsername('user name')).toEqual({ ok: false, error: 'Username must contain only letters, numbers, and underscores' });
    });

    it('returns ok and value if username is valid', () => {
        expect(StringUtils.validateUsername('user_name123')).toEqual({ ok: true, value: 'user_name123' });
        expect(StringUtils.validateUsername('USR_NME')).toEqual({ ok: true, value: 'USR_NME' });
        expect(StringUtils.validateUsername('abc')).toEqual({ ok: true, value: 'abc' });
        expect(StringUtils.validateUsername('a'.repeat(20))).toEqual({ ok: true, value: 'a'.repeat(20) });
    });
});

describe('StringUtils.formatTimeAgo', () => {
    const NOW = 1700000000000;

    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    it('formats times less than 60 seconds ago as "just now"', () => {
        expect(StringUtils.formatTimeAgo(NOW, NOW)).toBe('just now');
        expect(StringUtils.formatTimeAgo(NOW - 1, NOW)).toBe('just now');
        expect(StringUtils.formatTimeAgo(NOW - 59999, NOW)).toBe('just now');
    });

    it('formats times between 1 and 59 minutes ago', () => {
        expect(StringUtils.formatTimeAgo(NOW - 60000, NOW)).toBe('1m ago');
        expect(StringUtils.formatTimeAgo(NOW - 60001, NOW)).toBe('1m ago');
        expect(StringUtils.formatTimeAgo(NOW - 3599999, NOW)).toBe('59m ago');
    });

    it('formats times between 1 and 23 hours ago', () => {
        expect(StringUtils.formatTimeAgo(NOW - 3600000, NOW)).toBe('1h ago');
        expect(StringUtils.formatTimeAgo(NOW - 3600001, NOW)).toBe('1h ago');
        expect(StringUtils.formatTimeAgo(NOW - 86399999, NOW)).toBe('23h ago');
    });

    it('formats times between 1 and 6 days ago', () => {
        expect(StringUtils.formatTimeAgo(NOW - 86400000, NOW)).toBe('1d ago');
        expect(StringUtils.formatTimeAgo(NOW - 86400001, NOW)).toBe('1d ago');
        expect(StringUtils.formatTimeAgo(NOW - 604799999, NOW)).toBe('6d ago');
    });

    it('formats times 7 or more days ago as local date string', () => {
        const _7DaysAgo = NOW - 604800000;
        expect(StringUtils.formatTimeAgo(_7DaysAgo, NOW)).toBe(new Date(_7DaysAgo).toLocaleDateString());

        const _30DaysAgo = NOW - (30 * 86400000);
        expect(StringUtils.formatTimeAgo(_30DaysAgo, NOW)).toBe(new Date(_30DaysAgo).toLocaleDateString());
    });

    it('handles negative diffs (future times) gracefully as "just now"', () => {
        expect(StringUtils.formatTimeAgo(NOW + 10000, NOW)).toBe('just now');
    });

    it('uses Date.now() when currentTimeMs is omitted', () => {
        expect(StringUtils.formatTimeAgo(NOW - 60000)).toBe('1m ago');
    });
});
