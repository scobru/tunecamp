import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
    it('renders markdown images as <img>', () => {
        const html = renderMarkdown('![a cat](https://x.test/cat.png)');
        expect(html).toContain('<img src="https://x.test/cat.png"');
        expect(html).toContain('alt="a cat"');
    });

    it('renders links with safe http urls', () => {
        expect(renderMarkdown('[site](https://x.test/p)')).toContain('href="https://x.test/p"');
    });

    it('neutralizes javascript: link urls', () => {
        const html = renderMarkdown('[x](javascript:alert(1))');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('href="#"');
    });

    it('rejects attribute-injection urls (quotes/spaces) in images', () => {
        // Classic break-out attempt: ![x](a" onerror="alert(1))
        const html = renderMarkdown('![x](a" onerror="alert(1))');
        expect(html).not.toContain('onerror');
        expect(html).toContain('src="#"');
    });
});
