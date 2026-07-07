import path from "path";
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

describe("getExternalProviderIds", () => {
    it("should return the exact same instance on multiple calls", () => {
        const instance1 = getExternalProviderIds();
        const instance2 = getExternalProviderIds();

        expect(instance1).toBeInstanceOf(Set);
        expect(instance1).toBe(instance2);
    });
});
