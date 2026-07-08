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
    const baseTime = 1600000000000; // Use a fixed time for deterministic tests

    test('should return "just now" for times under 60 seconds', () => {
        expect(StringUtils.formatTimeAgo(baseTime, baseTime)).toBe('just now');
        expect(StringUtils.formatTimeAgo(baseTime - 30 * 1000, baseTime)).toBe('just now');
        expect(StringUtils.formatTimeAgo(baseTime - 59 * 1000, baseTime)).toBe('just now');
    });

    test('should return "just now" for future timestamps', () => {
        // diffSeconds will be negative, which is < 60
        expect(StringUtils.formatTimeAgo(baseTime + 10 * 1000, baseTime)).toBe('just now');
    });

    test('should return minutes for times between 1 minute and 59 minutes', () => {
        expect(StringUtils.formatTimeAgo(baseTime - 60 * 1000, baseTime)).toBe('1m ago');
        expect(StringUtils.formatTimeAgo(baseTime - 120 * 1000, baseTime)).toBe('2m ago');
        expect(StringUtils.formatTimeAgo(baseTime - 3599 * 1000, baseTime)).toBe('59m ago');
    });

    test('should return hours for times between 1 hour and 23 hours', () => {
        expect(StringUtils.formatTimeAgo(baseTime - 3600 * 1000, baseTime)).toBe('1h ago');
        expect(StringUtils.formatTimeAgo(baseTime - 7200 * 1000, baseTime)).toBe('2h ago');
        expect(StringUtils.formatTimeAgo(baseTime - 86399 * 1000, baseTime)).toBe('23h ago');
    });

    test('should return days for times between 1 day and 6 days', () => {
        expect(StringUtils.formatTimeAgo(baseTime - 86400 * 1000, baseTime)).toBe('1d ago');
        expect(StringUtils.formatTimeAgo(baseTime - 172800 * 1000, baseTime)).toBe('2d ago');
        expect(StringUtils.formatTimeAgo(baseTime - 604799 * 1000, baseTime)).toBe('6d ago');
    });

    test('should return locale date string for times 7 days or older', () => {
        const timestamp7Days = baseTime - 604800 * 1000;
        expect(StringUtils.formatTimeAgo(timestamp7Days, baseTime)).toBe(new Date(timestamp7Days).toLocaleDateString());

        const timestamp30Days = baseTime - 30 * 86400 * 1000;
        expect(StringUtils.formatTimeAgo(timestamp30Days, baseTime)).toBe(new Date(timestamp30Days).toLocaleDateString());
    });

    test('should use Date.now() when currentTimeMs is not provided', () => {
        const mockNow = 1600000000000;
        const spy = jest.spyOn(Date, 'now').mockReturnValue(mockNow);

        expect(StringUtils.formatTimeAgo(mockNow - 30 * 1000)).toBe('just now');
        expect(StringUtils.formatTimeAgo(mockNow - 120 * 1000)).toBe('2m ago');

        spy.mockRestore();
    });
});
