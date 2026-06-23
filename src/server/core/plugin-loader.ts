import path from "path";
import { pathToFileURL } from "url";
import fs from "fs-extra";
import { metadataService } from "../modules/catalog/metadata.service.js";
import { streamingService } from "../modules/streaming/streaming.service.js";
import { getScannerService } from "../modules/catalog/scanner.service.js";
import { getDownloadService } from "../modules/catalog/download.service.js";
import { storageService } from "../modules/storage/storage.service.js";
import { aiService } from "../modules/ai/ai.service.js";
import { getScrobbleService } from "../modules/scrobble/scrobble.service.js";
import { getPlaylistService } from "../modules/catalog/playlist.service.js";

import type { MetadataProvider, StreamingProvider, DownloadProvider, ScannerProvider, StorageProvider, AIProvider, PlaylistProvider, ScrobbleProvider, ProviderRegistry, TuneCampProvider } from "./provider.js";

const PLUGIN_DIR_ENV = process.env.TUNECAMP_PLUGINS_DIR;

const externalProviderIds = new Set<string>();

export function getExternalProviderIds(): ReadonlySet<string> {
    return externalProviderIds;
}

/** Minimal slice of the database needed to restore plugin enabled/disabled state. */
interface PluginStateStore {
    getPluginState(id: string): { enabled: boolean } | undefined;
}

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
 * export default class SoundCloudProvider { ... }

 *   id = "bandcamp";
 *   name = "Bandcamp";
 *   version = "1.0.0";
 *   async searchRelease(query) { ... }
 *   async searchRecording(query) { ... }
 *   async getCoverUrl(id) { ... }
 * }
 * ```
 */
export async function loadPlugins(pluginsDir?: string, db?: PluginStateStore): Promise<void> {
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
            const mod = await import(pathToFileURL(fullPath).href);
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

            // Plugins are registered DISABLED, then reconciled below against the
            // persisted state. Going through registry.enable()/disable() (rather
            // than registering enabled outright) is what fires the plugin's
            // onEnable()/onDisable() lifecycle hooks at load time.
            const targets: ProviderRegistry<TuneCampProvider>[] = [];

            // Detect which interface(s) the plugin implements and register accordingly
            if (typeof instance.searchRelease === "function") {
                metadataService.getRegistry().register(instance as MetadataProvider, false);
                targets.push(metadataService.getRegistry() as ProviderRegistry<TuneCampProvider>);
                console.log(`[PluginLoader] ✅ Registered as MetadataProvider: ${instance.name}`);
            }

            if (typeof instance.getStreamUrl === "function") {
                streamingService.getRegistry().register(instance as StreamingProvider, false);
                targets.push(streamingService.getRegistry() as ProviderRegistry<TuneCampProvider>);
                console.log(`[PluginLoader] ✅ Registered as StreamingProvider: ${instance.name}`);
            }

            if (typeof instance.search === "function" && typeof instance.download === "function" && typeof instance.isAvailable === "function") {
                const ds = getDownloadService();
                if (ds) {
                    ds.getRegistry().register(instance as DownloadProvider, false);
                    targets.push(ds.getRegistry() as ProviderRegistry<TuneCampProvider>);
                    console.log(`[PluginLoader] ✅ Registered as DownloadProvider: ${instance.name}`);
                }
            }

            if (typeof instance.scan === "function") {
                const ss = getScannerService();
                if (ss) {
                    ss.getRegistry().register(instance as ScannerProvider, false);
                    targets.push(ss.getRegistry() as ProviderRegistry<TuneCampProvider>);
                    console.log(`[PluginLoader] ✅ Registered as ScannerProvider: ${instance.name}`);
                }
            }

            if (typeof instance.upload === "function" && typeof instance.getUrl === "function") {
                storageService.getRegistry().register(instance as StorageProvider, false);
                targets.push(storageService.getRegistry() as ProviderRegistry<TuneCampProvider>);
                console.log(`[PluginLoader] ✅ Registered as StorageProvider: ${instance.name}`);
            }

            if (typeof instance.enrichMetadata === "function" && typeof instance.complete === "function") {
                aiService.getRegistry().register(instance as AIProvider, false);
                targets.push(aiService.getRegistry() as ProviderRegistry<TuneCampProvider>);
                console.log(`[PluginLoader] ✅ Registered as AIProvider: ${instance.name}`);
            }

            if (typeof instance.canHandlePlaylist === "function" && typeof instance.fetchPlaylistByUrl === "function") {
                const ps = getPlaylistService();
                if (ps) {
                    ps.getRegistry().register(instance as PlaylistProvider, false);
                    targets.push(ps.getRegistry() as ProviderRegistry<TuneCampProvider>);
                    console.log(`[PluginLoader] ✅ Registered as PlaylistProvider: ${instance.name}`);
                }
            }

            if (typeof instance.scrobble === "function" && typeof instance.isConfigured === "function") {
                const ss = getScrobbleService();
                if (ss) {
                    ss.getRegistry().register(instance as ScrobbleProvider, false);
                    targets.push(ss.getRegistry() as ProviderRegistry<TuneCampProvider>);
                    console.log(`[PluginLoader] ✅ Registered as ScrobbleProvider: ${instance.name}`);
                }
            }

            if (targets.length === 0) {
                console.warn(`[PluginLoader] ⚠️ ${file}: Plugin loaded but matched no known interface. Check your implementation.`);
                continue;
            }

            externalProviderIds.add(instance.id);

            // Restore persisted enabled/disabled state. No saved row → enabled by
            // default. enable() runs the plugin's onEnable() hook; a disabled
            // plugin is simply left in its registered-disabled state.
            const persisted = db?.getPluginState(instance.id);
            const shouldEnable = persisted ? persisted.enabled : true;
            if (shouldEnable) {
                for (const registry of targets) {
                    await registry.enable(instance.id);
                }
            } else {
                console.log(`[PluginLoader] ⏸️ ${instance.name} kept disabled (persisted state)`);
            }

        } catch (error) {
            console.error(`[PluginLoader] ❌ Failed to load plugin ${file}:`, error);
        }
    }
}
