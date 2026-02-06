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
    const markers = ['examples', 'music', 'releases', 'library', 'tracks', 'audio', 'assets'];

    for (const marker of markers) {
        // Look for the marker as a directory segment
        const markerSegment = `/${marker}/`;
        if (normalized.includes(markerSegment) || normalized.startsWith(`${marker}/`)) {
            const idx = normalized.indexOf(marker);
            const relative = normalized.substring(idx);

            // Try relative to CWD
            const candidateCwd = path.resolve(process.cwd(), relative);
            if (fs.existsSync(candidateCwd)) return candidateCwd;

            // Try relative to root (Docker volume mapping often uses /music or /data)
            const candidateRoot = path.join("/", relative);
            if (fs.existsSync(candidateRoot)) return candidateRoot;
        }
    }

    // 4. DESPERATE FALLBACK for absolute paths in Docker
    // If we are on Linux and the path looks like it should be in /music but isn't found
    if (path.sep === '/' && !normalized.startsWith('/')) {
        // Try prepending /music or /app/music if not there
        const tryPrefixes = ['/music', '/app/music', '/app'];
        for (const prefix of tryPrefixes) {
            const candidate = path.join(prefix, normalized);
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    // 5. Basename fallback (very desperate, only if unique?) - skipped for now

    return null;
}
