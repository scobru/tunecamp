import path from "path";
import os from "os";
import fs from "fs-extra";
import { loadPlugins, getExternalProviderIds } from "../plugin-loader.js";
import { metadataService } from "../../modules/catalog/metadata.service.js";
import { streamingService } from "../../modules/streaming/streaming.service.js";

describe("Plugin Loader & Demo Provider Integration Test", () => {
    it("should load the demo plugin and register it as MetadataProvider and StreamingProvider", async () => {
        const pluginsDir = path.join(process.cwd(), "plugins");
        
        // Load plugins from the plugins directory
        await loadPlugins(pluginsDir);

        // Verify registration in MetadataService registry
        const metadataRegistry = metadataService.getRegistry();
        const demoMetadata = metadataRegistry.get("demo");
        expect(demoMetadata).toBeDefined();
        expect(demoMetadata?.name).toBe("Demo Audio & Metadata Provider");
        expect(demoMetadata?.version).toBe("1.0.0");

        // Verify registration in StreamingService registry
        const streamingRegistry = streamingService.getRegistry();
        const demoStreaming = streamingRegistry.get("demo");
        expect(demoStreaming).toBeDefined();
        expect(demoStreaming?.name).toBe("Demo Audio & Metadata Provider");

        // Verify metadata provider functionality
        const releases = await demoMetadata!.searchRelease("Resonance");
        expect(releases).toHaveLength(1);
        expect(releases[0].title).toBe("Helix Resonance");
        expect(releases[0].artist).toBe("SoundHelix");

        const recordings = await demoMetadata!.searchRecording("Song 1");
        expect(recordings).toHaveLength(1);
        expect(recordings[0].title).toBe("SoundHelix Song 1");

        // Verify streaming provider functionality
        const candidates = await (demoStreaming as any).search("Song 2");
        expect(candidates).toHaveLength(1);
        expect(candidates[0].id).toBe("demo:song2");
        expect(candidates[0].provider).toBe("demo");

        const streamUrl = await (demoStreaming as any).getStreamById("demo:song2");
        expect(streamUrl).toBe("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3");

        const canHandle = (demoStreaming as any).canHandle("demo:song1");
        expect(canHandle).toBe(true);
    });
});

describe("Plugin init() settings context", () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tunecamp-plugin-test-"));
        // A metadata plugin that declares a configSchema and echoes what its
        // init() context reads back, so the test can assert the scoping.
        await fs.writeFile(path.join(tmpDir, "ctx-probe.mjs"), `
export default class CtxProbe {
    id = 'ctx-probe';
    name = 'Context Probe';
    version = '1.0.0';
    configSchema = [{ key: 'api_key', label: 'API Key', type: 'password' }];
    async init(ctx) {
        this.seenApiKey = ctx.getSetting('api_key');
        ctx.setSetting('touched', 'yes');
    }
    async searchRelease() { return []; }
    async searchRecording() { return []; }
    async getCoverUrl() { return null; }
}
`);
    });

    afterAll(async () => {
        await fs.remove(tmpDir);
    });

    it("hands the plugin namespaced getSetting/setSetting and surfaces configSchema", async () => {
        const store: Record<string, string> = { "plugin_ctx-probe_api_key": "k-123" };
        const db = {
            getPluginState: () => undefined,
            getSetting: (k: string) => store[k],
            setSetting: (k: string, v: string) => { store[k] = v; }
        };

        await loadPlugins(tmpDir, db);

        const instance: any = metadataService.getRegistry().get("ctx-probe");
        expect(instance).toBeDefined();
        // init() read the admin-saved value through the prefixed key
        expect(instance.seenApiKey).toBe("k-123");
        // and writes are namespaced too
        expect(store["plugin_ctx-probe_touched"]).toBe("yes");

        // configSchema is exposed through the registry info (what the admin API returns)
        const info = metadataService.getRegistry().getRegistryInfo().find(p => p.id === "ctx-probe");
        expect(info?.configSchema).toEqual([{ key: "api_key", label: "API Key", type: "password" }]);
    });
});

describe("getExternalProviderIds", () => {
    it("should return the exact same instance on multiple calls", () => {
        const instance1 = getExternalProviderIds();
        const instance2 = getExternalProviderIds();

        expect(instance1).toBeInstanceOf(Set);
        expect(instance1).toBe(instance2);
    });
});
