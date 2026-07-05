import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'div', 'span', 'img'
        ],
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'src', 'alt'],
        ALLOW_DATA_ATTR: false, // Prevent custom data attributes unless needed
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i // Allow data URIs specifically for dompurify if requested or rely on DOMPurify defaults which allow data URIs for images. DOMPurify allows data URIs by default.
    });
}
