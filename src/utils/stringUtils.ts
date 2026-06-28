export const StringUtils = {
    /**
     * Escapes HTML special characters to prevent XSS attacks
     */
    escapeHtml: (text: string): string => {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    /**
     * Converts text to a URL-safe slug
     * Example: "Hello World!" -> "hello-world"
     */
    slugify: (text: string): string => {
        if (!text) return "";
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with dashes
            .replace(/^-+|-+$/g, ""); // Trim dashes
    },

    /**
     * Generates a track slug from album title and track title
     * Example: ("My Album", "Track 1") -> "my-album-track-1"
     */
    generateTrackSlug: (albumTitle: string, trackTitle: string): string => {
        const track = trackTitle || "untitled";
        // We reuse the slugify logic
        const combined = `${albumTitle}-${track}`;
        return StringUtils.slugify(combined);
    },

    /**
     * Formats a timestamp (in milliseconds) as relative time
     * Returns: "just now", "5m ago", "2h ago", "3d ago", or empty string for dates
     */
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

    /**
     * Sanitizes a filename by keeping only safe characters
     * Keeps: a-zA-Z0-9._-, replaces everything else with _
     */
    sanitizeFilename: (filename: string): string => {
        if (!filename) return "";
        return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    },

    /**
     * Normalizes a URL by removing trailing slash
     * Example: "https://example.com/" -> "https://example.com"
     */
    normalizeUrl: (url: string): string => {
        if (!url) return "";
        return url.replace(/\/+$/, "");
    },

    /**
     * Extracts file extension from filename (without the dot, lowercase)
     * Example: "song.mp3" -> "mp3"
     */
    getFileExtension: (filename: string): string => {
        const parts = filename.split(".");
        if (parts.length <= 1) return "";
        return parts[parts.length - 1].toLowerCase();
    },

    /**
     * Validates username format
     * Returns Ok(username) if valid, Error(message) if invalid
     * Rules: 3-20 characters, only a-zA-Z0-9_
     * Returns object { ok: boolean, value?: string, error?: string } to mimic Result
     */
    validateUsername: (username: string): { ok: boolean; value?: string; error?: string } => {
        if (!username) return { ok: false, error: "Username is required" };
        if (username.length < 3) return { ok: false, error: "Username must be at least 3 characters" };
        if (username.length > 20) return { ok: false, error: "Username must be at most 20 characters" };

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { ok: false, error: "Username must contain only letters, numbers, and underscores" };
        }

        return { ok: true, value: username };
    },

    /**
     * Pads a string on the left with a given character until it reaches a target length
     */
    padLeft: (text: string, length: number, char: string): string => {
        return text.padStart(length, char);
    },

    /**
     * Generates a random unlock code
     * Format: XXXX-XXXX-XXXX (alphanumeric, no ambiguous characters)
     */
    generateUnlockCode: (): string => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0, O, 1, I
        const segments = 3;
        const segmentLength = 4;

        const code: string[] = [];
        for (let s = 0; s < segments; s++) {
            let segment = "";
            for (let i = 0; i < segmentLength; i++) {
                segment += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            code.push(segment);
        }

        return code.join("-");
    },

    /**
     * Cleans a file path by normalizing slashes and removing leading '../'
     */
    cleanPath: (p: string | null): string | null => {
        if (!p) return null;
        let cleaned = p.replace(/\\/g, "/");
        while (cleaned.startsWith("../")) {
            cleaned = cleaned.substring(3);
        }
        return cleaned;
    }
};
