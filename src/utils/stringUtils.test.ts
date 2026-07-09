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
    describe('Falsy and empty edge cases', () => {
        it('should correctly handle falsy inputs by returning an empty string', () => {
            // @ts-ignore
            expect(StringUtils.normalizeUrl(null)).toBe('');
            // @ts-ignore
            expect(StringUtils.normalizeUrl(undefined)).toBe('');
            expect(StringUtils.normalizeUrl('')).toBe('');
        });

        it('should return empty string when input consists only of slashes', () => {
            const inputs = ['/', '//', '///', '////'];
            inputs.forEach(input => {
                expect(StringUtils.normalizeUrl(input)).toBe('');
            });
        });
    });

    describe('Standard URL processing', () => {
        it.each([
            ['https://example.com', 'https://example.com'],
            ['http://localhost:8080', 'http://localhost:8080'],
            ['ftp://files.example.com', 'ftp://files.example.com'],
            ['https://example.com/api/v1', 'https://example.com/api/v1']
        ])('should leave URL unmodified if there is no trailing slash: %s', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });

        it.each([
            ['https://example.com/', 'https://example.com'],
            ['https://example.com/path/', 'https://example.com/path'],
            ['http://localhost/api/', 'http://localhost/api']
        ])('should strip a single trailing slash: %s', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });

        it.each([
            ['https://example.com//', 'https://example.com'],
            ['https://example.com/path///', 'https://example.com/path'],
            ['http://localhost////', 'http://localhost']
        ])('should strip multiple trailing slashes: %s', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });
    });

    describe('Complex paths with queries and fragments', () => {
        it.each([
            ['https://example.com/search?q=test/', 'https://example.com/search?q=test'],
            ['https://example.com/#section/', 'https://example.com/#section'],
            ['https://example.com/path/?query=1/', 'https://example.com/path/?query=1'],
            ['https://example.com/api?a=b&c=d/', 'https://example.com/api?a=b&c=d']
        ])('should strip trailing slash after queries or fragments: %s', (input, expected) => {
            expect(StringUtils.normalizeUrl(input)).toBe(expected);
        });

        it('should retain internal slashes without modification', () => {
            const complexUrl = 'https://example.com/a/b/c//d?q=//test#//frag';
            expect(StringUtils.normalizeUrl(complexUrl)).toBe(complexUrl);
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

describe('StringUtils.formatTimeAgo', () => {
    const mockCurrentTime = 1600000000000;

    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(mockCurrentTime);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    describe('when less than a minute has passed', () => {
        it('returns "just now" for exactly 0 seconds difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime, mockCurrentTime)).toBe('just now');
        });

        it('returns "just now" for 59 seconds difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 59 * 1000, mockCurrentTime)).toBe('just now');
        });

        it('returns "just now" for future dates', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime + 10 * 1000, mockCurrentTime)).toBe('just now');
        });
    });

    describe('when minutes have passed (1 to 59)', () => {
        it('returns "1m ago" for exactly 60 seconds difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 60 * 1000, mockCurrentTime)).toBe('1m ago');
        });

        it('returns "59m ago" for 59 minutes and 59 seconds difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 3599 * 1000, mockCurrentTime)).toBe('59m ago');
        });
    });

    describe('when hours have passed (1 to 23)', () => {
        it('returns "1h ago" for exactly 60 minutes difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 3600 * 1000, mockCurrentTime)).toBe('1h ago');
        });

        it('returns "23h ago" for 23 hours and 59 minutes difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 86399 * 1000, mockCurrentTime)).toBe('23h ago');
        });
    });

    describe('when days have passed (1 to 6)', () => {
        it('returns "1d ago" for exactly 24 hours difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 86400 * 1000, mockCurrentTime)).toBe('1d ago');
        });

        it('returns "6d ago" for exactly 6 days and 23 hours difference', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 604799 * 1000, mockCurrentTime)).toBe('6d ago');
        });
    });

    describe('when 7 or more days have passed', () => {
        it('returns formatted date string for exactly 7 days difference', () => {
            const timestamp = mockCurrentTime - 604800 * 1000;
            expect(StringUtils.formatTimeAgo(timestamp, mockCurrentTime)).toBe(new Date(timestamp).toLocaleDateString());
        });

        it('returns formatted date string for 30 days difference', () => {
            const timestamp = mockCurrentTime - 30 * 86400 * 1000;
            expect(StringUtils.formatTimeAgo(timestamp, mockCurrentTime)).toBe(new Date(timestamp).toLocaleDateString());
        });
    });

    describe('default current time behavior', () => {
        it('uses Date.now() when currentTimeMs is omitted', () => {
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 60 * 1000)).toBe('1m ago');
            expect(StringUtils.formatTimeAgo(mockCurrentTime - 120 * 1000)).toBe('2m ago');
        });
    });
});
