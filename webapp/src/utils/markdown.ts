/**
 * Simple, safe Markdown to HTML converter.
 * Escapes input to prevent XSS before parsing block/inline elements.
 */
export function renderMarkdown(markdown: string): string {
    if (!markdown) return "";

    // Escape HTML characters to prevent XSS
    let html = markdown
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Normalize line endings
    html = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Headings (match from start of line)
    html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");

    // Bold and Italic formatting
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
    html = html.replace(/_(.*?)_/g, "<em>$1</em>");

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>');

    // Bullet Lists (lines starting with - or *)
    html = html.replace(/^\s*[\-\*]\s+(.+)$/gm, "<li>$1</li>");
    
    // Group consecutive <li> blocks into <ul>
    html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
        return `<ul>${match}</ul>`;
    });
    // Remove adjacent list borders
    html = html.replace(/<\/ul>\s*<ul>/g, "");

    // Split blocks by double newline (or more)
    const blocks = html.split(/\n\n+/);
    const processedBlocks = blocks.map(block => {
        const trimmed = block.trim();
        if (!trimmed) return "";
        // If block is already wrapped in a block-level HTML element, return it directly
        if (/^<(h[1-6]|ul|ol|li|hr|blockquote|p|div|a)/i.test(trimmed)) {
            return trimmed;
        }
        // Wrap regular paragraphs and turn single newlines into <br />
        return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    });

    return processedBlocks.filter(Boolean).join("\n");
}
