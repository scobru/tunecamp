import type { StorageProvider } from "../../core/provider.js";
import type { GoogleDriveService } from "../../modules/storage/google-drive.service.js";
import path from "path";
import fs from "../../../utils/fs.js";
import type { Readable } from "stream";

/**
 * GoogleDriveStorageProvider wraps GoogleDriveService to conform to the StorageProvider interface.
 *
 * NOTE: GoogleDrive requires a userId for all operations (OAuth per-user tokens).
 * This provider uses a configured adminUserId as the default actor for all operations.
 * Future: support per-user storage by passing userId through context.
 */
export class GoogleDriveStorageProvider implements StorageProvider {
    readonly id = "google-drive";
    readonly name = "Google Drive";
    readonly version = "1.0.0";
    readonly description = "Store and retrieve music files from Google Drive";

    constructor(
        private readonly gdriveService: GoogleDriveService,
        private readonly adminUserId: number
    ) {}

    /**
     * Uploads a local file to Google Drive.
     * Returns the Google Drive file ID (used as the remote reference).
     */
    async upload(localPath: string, remotePath: string): Promise<string> {
        const content = await fs.readFile(localPath) as unknown as Readable;
        const name = path.basename(remotePath);
        const ext = path.extname(name).toLowerCase();
        const mimeMap: Record<string, string> = {
            ".mp3": "audio/mpeg",
            ".flac": "audio/flac",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".ogg": "audio/ogg",
            ".opus": "audio/ogg",
            ".aac": "audio/aac",
        };
        const mimeType = mimeMap[ext] || "application/octet-stream";

        const file = await this.gdriveService.uploadFile(this.adminUserId, name, mimeType, content);
        return (file as any).id || remotePath;
    }

    /**
     * Downloads a file from Google Drive by fileId to a local path.
     */
    async download(remotePath: string, localPath: string): Promise<void> {
        const { stream } = await this.gdriveService.getFileStream(this.adminUserId, remotePath);
        await fs.ensureDir(path.dirname(localPath));
        await new Promise<void>((resolve, reject) => {
            const writer = require("fs").createWriteStream(localPath);
            stream.pipe(writer);
            writer.on("finish", resolve);
            writer.on("error", reject);
        });
    }

    /**
     * Returns a direct stream URL for a Google Drive file.
     * For now returns null since GDrive URLs require auth tokens.
     */
    async getUrl(_remotePath: string): Promise<string | null> {
        // Google Drive doesn't provide simple public URLs without sharing settings.
        // Use getFileStream() for actual streaming.
        return null;
    }

    /**
     * Checks if a file exists on Google Drive by attempting to fetch its metadata.
     */
    async exists(remotePath: string): Promise<boolean> {
        try {
            await this.gdriveService.getFile(this.adminUserId, remotePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Google Drive SDK doesn't expose a direct delete — stub for now.
     * Can be implemented when the underlying service adds deleteFile().
     */
    async delete(_remotePath: string): Promise<void> {
        console.warn("[GoogleDriveStorageProvider] delete() not yet implemented by GoogleDriveService.");
    }
}
