import { Router } from "express";
import fs from "fs-extra";
import path from "path";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function createBrowserRoutes(musicDir: string) {
    const router = Router();

    /**
     * GET /api/browser
     * List files and folders in a directory
     * Query params:
     * - path: Relative path from musicDir (default: root)
     */
    router.get("/", async (req, res) => {
        try {
            let relPath = (req.query.path as string) || "";

            // Normalize path: remove leading slash to make it relative
            if (relPath.startsWith("/")) {
                relPath = relPath.substring(1);
            }

            // Security check: unexpected ".." or absolute paths
            if (relPath.includes("..") || path.isAbsolute(relPath)) {
                return res.status(400).json({ error: "Invalid path" });
            }

            const absPath = path.join(musicDir, relPath);

            if (!(await fs.pathExists(absPath))) {
                return res.status(404).json({ error: "Path not found" });
            }

            const stats = await fs.stat(absPath);
            if (!stats.isDirectory()) {
                return res.status(400).json({ error: "Not a directory" });
            }

            const entries = await fs.readdir(absPath, { withFileTypes: true });

            const dirs = [];
            const files = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    dirs.push({
                        name: entry.name,
                        path: path.join(relPath, entry.name).replace(/\\/g, "/"),
                        type: "directory"
                    });
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (AUDIO_EXTENSIONS.includes(ext)) {
                        files.push({
                            name: entry.name,
                            path: path.join(relPath, entry.name).replace(/\\/g, "/"),
                            type: "file",
                            ext: ext
                        });
                    } else if (IMAGE_EXTENSIONS.includes(ext)) {
                        files.push({
                            name: entry.name,
                            path: path.join(relPath, entry.name).replace(/\\/g, "/"),
                            type: "image",
                            ext: ext
                        });
                    }
                }
            }

            // Sort: Directories first, then files
            dirs.sort((a, b) => a.name.localeCompare(b.name));
            files.sort((a, b) => a.name.localeCompare(b.name));

            res.json({
                path: relPath,
                parent: relPath ? path.dirname(relPath).replace(/\\/g, "/") : null,
                entries: [...dirs, ...files]
            });
        } catch (error) {
            console.error("Error listing directory:", error);
            res.status(500).json({ error: "Failed to list directory" });
        }
    });

    /**
     * GET /api/browser/file
     * Stream a file from the music directory
     * Query params:
     * - path: Relative path from musicDir
     */
    router.get("/file", async (req, res) => {
        try {
            const relPath = (req.query.path as string) || "";
            // Security check
            if (relPath.includes("..") || path.isAbsolute(relPath)) {
                return res.status(400).json({ error: "Invalid path" });
            }

            const absPath = path.join(musicDir, relPath);

            if (!(await fs.pathExists(absPath))) {
                return res.status(404).json({ error: "File not found" });
            }

            const stats = await fs.stat(absPath);
            if (!stats.isFile()) {
                return res.status(400).json({ error: "Not a file" });
            }

            res.sendFile(absPath);
        } catch (error) {
            console.error("Error serving file:", error);
            res.status(500).json({ error: "Failed to serve file" });
        }
    });



    /**
     * DELETE /api/browser
     * Delete a file or directory
     * Query params:
     * - path: Relative path from musicDir
     */
    router.delete("/", async (req, res) => {
        try {
            let relPath = (req.query.path as string) || "";

            // Normalize path
            if (relPath.startsWith("/")) {
                relPath = relPath.substring(1);
            }

            // Security check
            if (relPath.includes("..") || path.isAbsolute(relPath) || relPath === "" || relPath === "." || relPath === "./") {
                return res.status(400).json({ error: "Invalid path or root directory protection" });
            }

            const absPath = path.join(musicDir, relPath);

            if (!(await fs.pathExists(absPath))) {
                return res.status(404).json({ error: "Path not found" });
            }

            await fs.remove(absPath);
            console.log(`🗑️ Deleted via browser: ${relPath}`);

            res.json({ message: "Deleted successfully" });
        } catch (error) {
            console.error("Error deleting path:", error);
            res.status(500).json({ error: "Failed to delete" });
        }
    });

    return router;
}
