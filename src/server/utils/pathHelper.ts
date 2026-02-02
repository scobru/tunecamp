import fs from "fs-extra";
import path from "path";

/**
 * Tries to resolve a file path that might be from a different OS or absolute path structure.
 * Useful when DB has Windows paths (D:\...) but running on Linux/Docker.
 */
export function resolveFile(storedPath: string): string | null {
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

            // Try relative to ../../ (if we are deep in src/server/utils - wait, process.cwd is likely project root)
        }
    }

    // 4. Try just basename in CWD (desperate fallback? No, too risky)

    return null;
}
