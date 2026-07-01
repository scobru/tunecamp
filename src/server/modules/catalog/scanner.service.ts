import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { ScannerProvider } from "../../core/provider.js";
import { LocalScannerProvider } from "../../providers/scanner/local-fs.provider.js";
import type { Scanner } from "./scanner.js";
import type { DatabaseService } from "../../core/database.js";

/**
 * ScannerService manages a registry of ScannerProviders and coordinates
 * scanning across multiple sources.
 */
export class ScannerService {
    private registry = new ProviderRegistry<ScannerProvider>();

    constructor(scanner: Scanner) {
        // Register the built-in local filesystem provider
        this.registry.register(new LocalScannerProvider(scanner));
    }

    async scanAll(musicDir: string): Promise<string[]> {
        const results: string[] = [];

        for (const provider of this.registry.getEnabled()) {
            try {
                console.log(`[ScannerService] 🔍 Running provider: ${provider.name}`);

                // For the local provider, set the directory before scanning
                if ((provider as any).setMusicDirectory) {
                    (provider as any).setMusicDirectory(musicDir);
                }

                const files = await provider.scan();
                console.log(`[ScannerService] ✅ ${provider.name} found ${files.length} files.`);
                results.push(...files);
            } catch (error) {
                console.error(`[ScannerService] ❌ Provider "${provider.name}" failed:`, error);
            }
        }

        return results;
    }

    /** Returns the underlying Scanner behind the local-fs provider. */
    private getLocalScanner(): Scanner {
        const local = this.registry.get("local-fs") as any;
        if (!local || !local.scanner) {
            throw new Error("Local filesystem scanner not found");
        }
        return local.scanner;
    }

    /**
     * Proxies to the local scanner for backward compatibility with admin routes.
     */
    async scanDirectory(dir: string, onProgress?: (processed: number, total: number) => void): Promise<any> {
        return this.getLocalScanner().scanDirectory(dir, onProgress);
    }

    /**
     * Proxies to the local scanner for backward compatibility with admin routes.
     */
    async processAudioFile(filePath: string, musicDir: string, overrideArtistId?: number, ownerId?: number, overrideAlbumId?: number, suggestedCoverPath?: string, metadataHints?: any): Promise<any> {
        return this.getLocalScanner().processAudioFile(filePath, musicDir, overrideArtistId, ownerId, overrideAlbumId, suggestedCoverPath, metadataHints);
    }

    getRegistry(): ProviderRegistry<ScannerProvider> {
        return this.registry;
    }
}

/** Singleton exported for app-wide access */
let _scannerService: ScannerService | null = null;

export function getScannerService(): ScannerService | null {
    return _scannerService;
}

export async function initScannerService(db: DatabaseService, scanner: Scanner): Promise<ScannerService> {
    _scannerService = new ScannerService(scanner);
    
    await syncRegistryWithDatabase(_scannerService.getRegistry(), db);
    
    return _scannerService;
}
