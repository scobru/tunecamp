import path from "path";
import fs from "fs-extra";
import { metadataService } from "../modules/catalog/metadata.service.js";
import { streamingService } from "../modules/streaming/streaming.service.js";
import { getScannerService } from "../modules/catalog/scanner.service.js";
import { getDownloadService } from "../modules/catalog/download.service.js";
import { storageService } from "../modules/storage/storage.service.js";
import { federationService } from "../modules/activitypub/federation.service.js";
import { aiService } from "../modules/ai/ai.service.js";

import type { MetadataProvider, StreamingProvider, DownloadProvider, ScannerProvider, StorageProvider, FederationProvider, AIProvider } from "./provider.js";

const PLUGIN_DIR_ENV = process.env.TUNECAMP_PLUGINS_DIR;

/**
 * Dynamically loads TuneCamp plugins from a directory.
 *
 * A plugin is a JS file (ESM) that exports a default class implementing
 * one or more of the provider interfaces:
 *   - MetadataProvider  → registers in MetadataService
 *   - StreamingProvider → registers in StreamingService
 *   - DownloadProvider  → registers in DownloadService
 *   - ScannerProvider   → registers in ScannerService
 *
 * Example plugin file (bandcamp-provider.js):
 * ```js
 * export default class BandcampProvider {
 *   id = "bandcamp";
 *   name = "Bandcamp";
 *   version = "1.0.0";
 *   async searchRelease(query) { ... }
 *   async searchRecording(query) { ... }
 *   async getCoverUrl(id) { ... }
 * }
 * ```
 */
export async function loadPlugins(pluginsDir?: string): Promise<void> {
    const dir = pluginsDir || PLUGIN_DIR_ENV || path.join(process.cwd(), "plugins");

    if (!(await fs.pathExists(dir))) {
        console.log(`[PluginLoader] Plugin directory not found: ${dir}. Skipping.`);
        return;
    }

    const files = await fs.readdir(dir);
    const jsFiles = files.filter(f => f.endsWith(".js") || f.endsWith(".mjs"));

    if (jsFiles.length === 0) {
        console.log(`[PluginLoader] No plugin files found in: ${dir}`);
        return;
    }

    console.log(`[PluginLoader] Found ${jsFiles.length} plugin file(s) in: ${dir}`);

    for (const file of jsFiles) {
        const fullPath = path.join(dir, file);
        try {
            const mod = await import(fullPath);
            const PluginClass = mod.default;

            if (!PluginClass || typeof PluginClass !== "function") {
                console.warn(`[PluginLoader] ⚠️ ${file}: No default export class found. Skipping.`);
                continue;
            }

            const instance = new PluginClass();

            if (!instance.id || !instance.name || !instance.version) {
                console.warn(`[PluginLoader] ⚠️ ${file}: Plugin missing required fields (id, name, version). Skipping.`);
                continue;
            }

            let registered = false;

            // Detect which interface(s) the plugin implements and register accordingly
            if (typeof instance.searchRelease === "function") {
                metadataService.getRegistry().register(instance as MetadataProvider);
                console.log(`[PluginLoader] ✅ Registered as MetadataProvider: ${instance.name}`);
                registered = true;
            }

            if (typeof instance.getStreamUrl === "function") {
                streamingService.getRegistry().register(instance as StreamingProvider);
                console.log(`[PluginLoader] ✅ Registered as StreamingProvider: ${instance.name}`);
                registered = true;
            }

            if (typeof instance.search === "function" && typeof instance.download === "function" && typeof instance.isAvailable === "function") {
                const ds = getDownloadService();
                if (ds) {
                    ds.getRegistry().register(instance as DownloadProvider);
                    console.log(`[PluginLoader] ✅ Registered as DownloadProvider: ${instance.name}`);
                    registered = true;
                }
            }

            if (typeof instance.scan === "function") {
                const ss = getScannerService();
                if (ss) {
                    ss.getRegistry().register(instance as ScannerProvider);
                    console.log(`[PluginLoader] ✅ Registered as ScannerProvider: ${instance.name}`);
                    registered = true;
                }
            }

            if (typeof instance.upload === "function" && typeof instance.getUrl === "function") {
                storageService.getRegistry().register(instance as StorageProvider);
                console.log(`[PluginLoader] ✅ Registered as StorageProvider: ${instance.name}`);
                registered = true;
            }

            if (typeof instance.publish === "function" && typeof instance.discover === "function") {
                federationService.getRegistry().register(instance as FederationProvider);
                console.log(`[PluginLoader] ✅ Registered as FederationProvider: ${instance.name}`);
                registered = true;
            }

            if (typeof instance.enrichMetadata === "function" && typeof instance.complete === "function") {
                aiService.getRegistry().register(instance as AIProvider);
                console.log(`[PluginLoader] ✅ Registered as AIProvider: ${instance.name}`);
                registered = true;
            }

            if (!registered) {
                console.warn(`[PluginLoader] ⚠️ ${file}: Plugin loaded but matched no known interface. Check your implementation.`);
            }

        } catch (error) {
            console.error(`[PluginLoader] ❌ Failed to load plugin ${file}:`, error);
        }
    }
}
