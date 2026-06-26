import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
    it('returns empty string for empty input', () => {
        expect(sanitizeHtml('')).toBe('');
        expect(sanitizeHtml(null as any)).toBe('');
    });

    it('allows safe tags', () => {
        const input = '<p><b>Bold</b> and <i>italic</i></p>';
        expect(sanitizeHtml(input)).toBe(input);
    });

    it('removes unsafe tags completely', () => {
        const input = '<p>Text</p><script>alert("xss")</script>';
        expect(sanitizeHtml(input)).toBe('<p>Text</p>');
    });

    it('removes unsafe attributes from safe tags', () => {
        const input = '<p class="text-sm" onclick="alert()">Text</p>';
        expect(sanitizeHtml(input)).toBe('<p class="text-sm">Text</p>');
    });

    it('validates href attributes to prevent javascript protocols', () => {
        const input = '<a href="javascript:alert(1)">Click</a>';
        expect(sanitizeHtml(input)).toBe('<a>Click</a>');
    });

    it('allows valid href protocols', () => {
        const input = '<a href="https://example.com">Link</a>';
        expect(sanitizeHtml(input)).toBe(input);

        const input2 = '<a href="/local-path">Link</a>';
        expect(sanitizeHtml(input2)).toBe(input2);
    });

    it('allows data URIs for src attributes', () => {
        const input = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="test">';
        expect(sanitizeHtml(input)).toBe(input);
    });

    it('removes data URIs from other elements or invalid data URIs', () => {
        const input = '<a href="data:text/html,<script>alert(1)</script>">Link</a>';
        expect(sanitizeHtml(input)).toBe('<a>Link</a>');
    });
});
