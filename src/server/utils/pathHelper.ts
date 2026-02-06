import fs from "fs-extra";
import path from "path";

/**
 * Tries to resolve a file path that might be from a different OS or absolute path structure.
 * Useful when DB has Windows paths (D:\...) but running on Linux/Docker.
 */
export function resolveFile(storedPath: string | null | undefined): string | null {
    if (!storedPath) return null;

    // 1. Try as is
    if (fs.existsSync(storedPath)) return storedPath;

    // 2. Try normalizing separators
    const normalized = storedPath.replace(/\\/g, '/');
    if (fs.existsSync(normalized)) return normalized;

    // 3. Try relative logic
    // Common folders in this project
    const markers = ['examples', 'music', 'releases', 'library', 'assets'];

    for (const marker of markers) {
        if (normalized.includes(`/${marker}/`) || normalized.startsWith(`${marker}/`)) {
            const idx = normalized.indexOf(marker);
            const relative = normalized.substring(idx);

            // Try relative to CWD
            const candidateCwd = path.join(process.cwd(), relative);
            if (fs.existsSync(candidateCwd)) return candidateCwd;

            // Try resolving if storedPath was a Windows absolute path but we're on Linux (Docker)
            // Stored: D:\shogun-2\tunecamp\music\...
            // This is handled by the marker logic above if 'music' is a marker.
        }
    }

    // DESPERATE FALLBACK: If it looks like a Windows path (D:\...) and we are on Linux/Darwin,
    // try to match the relative part of the path from the current workspace
    if (path.sep === '/' && (storedPath.includes(':\\') || storedPath.includes(':/'))) {
        const parts = storedPath.split(/[\\/]/);
        const tunecampIdx = parts.findIndex(p => p.toLowerCase() === 'tunecamp');
        if (tunecampIdx !== -1) {
            const relativeToProject = path.join(...parts.slice(tunecampIdx + 1));
            const candidate = path.join(process.cwd(), relativeToProject);
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    // 4. Try just basename in CWD (desperate fallback? No, too risky)

    return null;
}
