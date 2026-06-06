import { ProviderRegistry } from "../../core/provider.js";
import type { StorageProvider } from "../../core/provider.js";
import { GoogleDriveStorageProvider } from "../../providers/storage/google-drive.provider.js";
import { GoogleDriveService } from "./google-drive.service.js";

/**
 * StorageService manages a registry of StorageProviders.
 *
 * Handles storing and retrieving music files on remote backends
 * (Google Drive, S3, IPFS, etc.)
 *
 * The first available provider is used for upload/download.
 * Future: support per-user storage routing.
 */
class StorageService {
    private registry = new ProviderRegistry<StorageProvider>();

    async upload(localPath: string, remotePath: string): Promise<string> {
        const provider = this.getFirstAvailable();
        if (!provider) throw new Error("[StorageService] No storage provider registered");
        return provider.upload(localPath, remotePath);
    }

    async download(remotePath: string, localPath: string): Promise<void> {
        const provider = this.getFirstAvailable();
        if (!provider) throw new Error("[StorageService] No storage provider registered");
        return provider.download(remotePath, localPath);
    }

    async getUrl(remotePath: string): Promise<string | null> {
        const provider = this.getFirstAvailable();
        if (!provider) return null;
        return provider.getUrl(remotePath);
    }

    async exists(remotePath: string): Promise<boolean> {
        const provider = this.getFirstAvailable();
        if (!provider) return false;
        return provider.exists(remotePath);
    }

    private getFirstAvailable(): StorageProvider | undefined {
        return this.registry.getAll()[0];
    }

    getRegistry(): ProviderRegistry<StorageProvider> {
        return this.registry;
    }

    listProviders() {
        return this.registry.getAll().map((p: StorageProvider) => ({
            id: p.id, name: p.name, version: p.version
        }));
    }
}

export const storageService = new StorageService();

export function initStorageService(gdriveService: GoogleDriveService, adminUserId: number): StorageService {
    storageService.getRegistry().register(new GoogleDriveStorageProvider(gdriveService, adminUserId));
    return storageService;
}
