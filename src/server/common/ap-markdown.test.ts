import { describe, it, expect } from '@jest/globals';
import { renderApMarkdown } from './ap-markdown.js';

describe('renderApMarkdown', () => {
    describe('basic inputs and HTML escaping', () => {
        it('should handle whitespace-only input blocks', () => {
            expect(renderApMarkdown('   \n\n   ')).toBe('');
        });

        it('should handle empty or missing input', () => {
            expect(renderApMarkdown('')).toBe('');
            // @ts-ignore
            expect(renderApMarkdown(null)).toBe('');
            // @ts-ignore
            expect(renderApMarkdown(undefined)).toBe('');
        });

        it('should escape HTML characters to prevent injection', () => {
            const input = 'This & that <script>alert("XSS")</script>';
            const result = renderApMarkdown(input);
            expect(result).toContain('This &amp; that &lt;script&gt;alert("XSS")&lt;/script&gt;');
        });
    });

    describe('line ending normalization and text formatting', () => {
        it('should normalize Windows and Mac line endings to Unix', () => {
            const input = 'Line 1\r\nLine 2\rLine 3';
            const result = renderApMarkdown(input);
            expect(result).toBe('<p>Line 1<br />Line 2<br />Line 3</p>');
        });

        it('should format headings (h1, h2, h3)', () => {
            expect(renderApMarkdown('# Heading 1')).toBe('<h1>Heading 1</h1>');
            expect(renderApMarkdown('## Heading 2')).toBe('<h2>Heading 2</h2>');
            expect(renderApMarkdown('### Heading 3')).toBe('<h3>Heading 3</h3>');
        });

        it('should format bold and italic text', () => {
            expect(renderApMarkdown('**bold text**')).toBe('<p><strong>bold text</strong></p>');
            expect(renderApMarkdown('__bold text__')).toBe('<p><strong>bold text</strong></p>');
            expect(renderApMarkdown('*italic text*')).toBe('<p><em>italic text</em></p>');
            expect(renderApMarkdown('_italic text_')).toBe('<p><em>italic text</em></p>');
        });

        it('should format combined inline text correctly', () => {
            expect(renderApMarkdown('This is **bold** and *italic*.'))
                .toBe('<p>This is <strong>bold</strong> and <em>italic</em>.</p>');
        });
    });

    describe('safe URL logic', () => {
        it('should allow valid URL protocols and paths', () => {
            expect(renderApMarkdown('[link](http://example.com)')).toContain('href="http://example.com"');
            expect(renderApMarkdown('[link](https://example.com)')).toContain('href="https://example.com"');
            expect(renderApMarkdown('[link](mailto:test@example.com)')).toContain('href="mailto:test@example.com"');
            expect(renderApMarkdown('[link](/relative/path)')).toContain('href="/relative/path"');
            expect(renderApMarkdown('[link](#anchor)')).toContain('href="#anchor"');
        });

        it('should sanitize unsafe protocols by falling back to #', () => {
            expect(renderApMarkdown('[link](javascript:alert("XSS"))')).toContain('href="#"');
            expect(renderApMarkdown('[link](data:text/html,<script>alert(1)</script>)')).toContain('href="#"');
            expect(renderApMarkdown('[link](vbscript:msgbox("hello"))')).toContain('href="#"');
        });

        it('should reject URLs containing unsafe characters (quotes, spaces, angle brackets)', () => {
            // Unsafe URLs that could break out of attributes
            expect(renderApMarkdown('[link](http://example.com"onmouseover="alert(1)"))')).toContain('href="#"');
            expect(renderApMarkdown('[link](http://example.com\'onmouseover=\'alert(1)\')')).toContain('href="#"');
            expect(renderApMarkdown('[link](http://example.com/ space)')).toContain('href="#"');
            // <script> is escaped to &lt;script&gt; before safeUrl, so it passes. We test with quotes instead.
            expect(renderApMarkdown('[link](http://example.com/"test")')).toContain('href="#"');
        });

        it('should trim whitespace from URLs before validation', () => {
            expect(renderApMarkdown('[link](  https://example.com  )')).toContain('href="https://example.com"');
        });
    });

    describe('lists, images, links, and block processing', () => {
        it('should format images', () => {
            const input = '![alt text](https://example.com/image.png)';
            const expected = '<img src="https://example.com/image.png" alt="alt text" />';
            expect(renderApMarkdown(input)).toBe(expected);
        });

        it('should format links', () => {
            const input = '[Click here](https://example.com)';
            const expected = '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Click here</a>';
            expect(renderApMarkdown(input)).toBe(expected);
        });

        it('should format bullet lists using - or *', () => {
            const inputHyphen = '- Item 1\n- Item 2';
            expect(renderApMarkdown(inputHyphen)).toBe('<ul><li>Item 1</li>\n<li>Item 2</li></ul>');

            const inputStar = '* Item A\n* Item B';
            expect(renderApMarkdown(inputStar)).toBe('<ul><li>Item A</li>\n<li>Item B</li></ul>');
        });

        it('should split blocks by double newlines and wrap paragraphs', () => {
            const input = 'Paragraph 1\n\nParagraph 2\nStill paragraph 2\n\n# Heading block';
            const result = renderApMarkdown(input);
            expect(result).toBe('<p>Paragraph 1</p>\n<p>Paragraph 2<br />Still paragraph 2</p>\n<h1>Heading block</h1>');
        });

        it('should correctly escape and wrap tags in <p> if they are input directly', () => {

            const input = '<ul><li>Item</li></ul>\n\n### Heading 3\n\n<p>Already a p tag text</p>';
            const result = renderApMarkdown(input);
            expect(result).toBe('<p>&lt;ul&gt;&lt;li&gt;Item&lt;/li&gt;&lt;/ul&gt;</p>\n<h3>Heading 3</h3>\n<p>&lt;p&gt;Already a p tag text&lt;/p&gt;</p>');
        });
    });
});
