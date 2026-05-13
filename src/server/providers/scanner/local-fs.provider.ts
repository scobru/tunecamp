import type { DatabaseService } from "../../core/database.js";
import type { StorageEngine } from "../../modules/storage/storage.engine.js";
import type { ScannerProvider } from "../../core/provider.js";
import type { Scanner, ScanResult } from "../../modules/catalog/scanner.js";
import path from "path";
import { parseFile } from "music-metadata";

/**
 * LocalScannerProvider wraps the existing Scanner class to conform to the
 * new ScannerProvider interface. This is the first step in the "Strangler Fig"
 * pattern: existing logic stays intact, but can now be managed by the ProviderRegistry.
 *
 * Future providers (e.g. IPFSScannerProvider, S3ScannerProvider) will implement
 * the same interface without touching this class.
 */
export class LocalScannerProvider implements ScannerProvider {
    readonly id = "local-fs";
    readonly name = "Local Filesystem";
    readonly version = "1.0.0";
    readonly description = "Scans a local directory for audio files";

    /** The root directory to scan, set by the ScannerService */
    private musicDir: string = "";

    constructor(
        public readonly scanner: Scanner
    ) {}

    /**
     * Called by the ScannerService before calling scan().
     */
    setMusicDirectory(dir: string): void {
        this.musicDir = dir;
    }

    /**
     * Walks the music directory and returns a flat list of audio file paths.
     */
    async scan(): Promise<string[]> {
        if (!this.musicDir) {
            console.warn("[LocalScannerProvider] Music directory not set.");
            return [];
        }

        // We delegate the full scan (including YAML processing and DB ingestion)
        // to the existing Scanner. This preserves all battle-tested logic while
        // making the Scanner manageable via the new registry.
        const result: ScanResult = await this.scanner.scanDirectory(this.musicDir);

        // Return just the paths of successfully processed files
        return result.successful.map(r => r.convertedPath || r.originalPath);
    }

    /**
     * Reads ID3/metadata from a local audio file path.
     */
    async getMetadata(filePath: string): Promise<any> {
        try {
            const metadata = await parseFile(filePath, { skipCovers: true });
            return {
                title: metadata.common.title,
                artist: metadata.common.artist,
                album: metadata.common.album,
                year: metadata.common.year,
                genre: metadata.common.genre,
                trackNumber: metadata.common.track?.no,
                duration: metadata.format.duration,
                bitrate: metadata.format.bitrate,
                sampleRate: metadata.format.sampleRate,
                codec: metadata.format.codec,
            };
        } catch (error) {
            console.error(`[LocalScannerProvider] Error reading metadata from ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Opens a readable stream to a local file.
     */
    async getFileStream(filePath: string): Promise<NodeJS.ReadableStream> {
        const { createReadStream } = await import("fs");
        return createReadStream(filePath);
    }

    /**
     * Checks if a file exists on the local filesystem.
     */
    async exists(filePath: string): Promise<boolean> {
        const { access } = await import("fs/promises");
        try {
            await access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}
