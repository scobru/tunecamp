export const GleamUtils = {
    escapeHtml: (text: string): string => {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    formatTimeAgo: (timestampMs: number, currentTimeMs: number = Date.now()): string => {
        const diffMs = currentTimeMs - timestampMs;
        const diffSeconds = Math.trunc(diffMs / 1000);

        if (diffSeconds < 60) return "just now";
        if (diffSeconds < 3600) {
            const minutes = Math.trunc(diffSeconds / 60);
            return `${minutes}m ago`;
        }
        if (diffSeconds < 86400) {
            const hours = Math.trunc(diffSeconds / 3600);
            return `${hours}h ago`;
        }
        if (diffSeconds < 604800) {
            const days = Math.trunc(diffSeconds / 86400);
            return `${days}d ago`;
        }
        return new Date(timestampMs).toLocaleDateString();
    },

    slugify: (text: string): string => {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dashes
            .replace(/^-+|-+$/g, '');   // Trim dashes
    },

    generateTrackSlug: (albumTitle: string, trackTitle: string): string => {
        const track = trackTitle || "untitled";
        return GleamUtils.slugify(`${albumTitle}-${track}`);
    },

    getFileExtension: (filename: string): string => {
        const parts = filename.split('.');
        if (parts.length <= 1) return "";
        return parts[parts.length - 1].toLowerCase();
    },

    sanitizeFilename: (filename: string): string => {
        // Allow alphanumerics, dots, underscores, dashes. Replace others with underscore.
        return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
};
