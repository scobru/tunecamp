/**
 * Render a constrained Markdown subset to HTML for ActivityPub federation.
 *
 * HTML is escaped first; URLs in links/images are sanitized (see `safeUrl`) so
 * they cannot break out of the src/href attribute. Shared by the AP renderer
 * (activitypub.renderer.ts) and the Fedify outbox (fedify.ts) so the sanitizer
 * has a single source of truth.
 *
 * NOTE: the webapp keeps its own copy (webapp/src/utils/markdown.ts) because it
 * lives in a separate build with Tailwind classes on the output; keep the two
 * `safeUrl` rules in sync if either changes.
 */
export function renderApMarkdown(markdown: string): string {
    if (!markdown) return "";
    // Escape HTML tags to prevent injection in the Fediverse
    let html = markdown
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Normalize line endings
    html = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Headings
    html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");

    // Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
    html = html.replace(/_(.*?)_/g, "<em>$1</em>");

    // Sanitize URLs: allow only http(s), mailto, anchors, and site-relative paths.
    // Input is already escaped for &<>, but NOT quotes — reject any URL carrying
    // quotes/spaces/angle brackets so it can't break out of the src/href attribute.
    const safeUrl = (url: string): string => {
        const u = url.trim();
        return /^(https?:\/\/|mailto:|\/|#)/i.test(u) && !/["'<>\s]/.test(u) ? u : "#";
    };

    // Images: ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) =>
        `<img src="${safeUrl(url)}" alt="${alt}" />`);

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
        `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`);

    // Bullet Lists
    html = html.replace(/^\s*[\-\*]\s+(.+)$/gm, "<li>$1</li>");
    // Wrap <li> elements in <ul>
    html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
        return `<ul>${match}</ul>`;
    });
    html = html.replace(/<\/ul>\s*<ul>/g, "");

    // Split by double newlines into block elements
    const blocks = html.split(/\n\n+/);
    const processedBlocks = blocks.map(block => {
        const trimmed = block.trim();
        if (!trimmed) return "";
        if (/^<(h[1-6]|ul|ol|li|hr|blockquote|p|div|a|img)/i.test(trimmed)) {
            return trimmed;
        }
        return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    });

    return processedBlocks.filter(Boolean).join("\n");
}
