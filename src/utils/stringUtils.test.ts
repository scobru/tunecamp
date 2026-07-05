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
    test('should return empty string for null/undefined/empty input', () => {
        // @ts-ignore
        expect(StringUtils.normalizeUrl(null)).toBe('');
        // @ts-ignore
        expect(StringUtils.normalizeUrl(undefined)).toBe('');
        expect(StringUtils.normalizeUrl('')).toBe('');
    });

    test('should return original url if no trailing slash', () => {
        expect(StringUtils.normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    test('should remove a single trailing slash', () => {
        expect(StringUtils.normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
    });

    test('should remove multiple trailing slashes', () => {
        expect(StringUtils.normalizeUrl('https://example.com/path///')).toBe('https://example.com/path');
    });
});
