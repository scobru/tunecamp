import { jest } from "@jest/globals";
import { AIService, aiService, initAIService } from "../ai.service.js";
import type { AIProvider } from "../../../core/provider.js";
import type { OpenRouterService } from "../openrouter.service.js";

class MockAIProvider implements AIProvider {
    id = "mock";
    name = "Mock Provider";
    version = "1.0.0";

    available = true;
    shouldThrowIsAvailable = false;

    async isAvailable() {
        if (this.shouldThrowIsAvailable) throw new Error("Unavailable");
        return this.available;
    }

    async enrichMetadata(context: any) {
        return { genre: "mock-genre", description: "mock-desc" };
    }

    async complete(prompt: string) {
        return "mock-response";
    }
}

describe("AIService", () => {
    let service: AIService;

    beforeEach(() => {
        service = new AIService();
    });

    it("should return empty object for enrichMetadata when no providers are available", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        const result = await service.enrichMetadata({ title: "Test" });
        expect(result).toEqual({});
        expect(warnSpy).toHaveBeenCalledWith("[AIService] No AI provider available for enrichMetadata");
        warnSpy.mockRestore();
    });

    it("should return null for complete when no providers are available", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        const result = await service.complete("Test prompt");
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith("[AIService] No AI provider available for complete()");
        warnSpy.mockRestore();
    });

    it("should use the first available provider for enrichMetadata", async () => {
        const provider1 = new MockAIProvider();
        provider1.id = "mock1";
        provider1.available = false;

        const provider2 = new MockAIProvider();
        provider2.id = "mock2";
        provider2.available = true;

        service.getRegistry().register(provider1);
        service.getRegistry().register(provider2);

        const enrichSpy = jest.spyOn(provider2, "enrichMetadata");
        const result = await service.enrichMetadata({ title: "Test Title" });

        expect(result).toEqual({ genre: "mock-genre", description: "mock-desc" });
        expect(enrichSpy).toHaveBeenCalledWith({ title: "Test Title" });
    });

    it("should use the first available provider for complete", async () => {
        const provider = new MockAIProvider();
        service.getRegistry().register(provider);

        const completeSpy = jest.spyOn(provider, "complete");
        const result = await service.complete("Hello");

        expect(result).toBe("mock-response");
        expect(completeSpy).toHaveBeenCalledWith("Hello");
    });

    it("should skip providers that throw during isAvailable check", async () => {
        const provider1 = new MockAIProvider();
        provider1.id = "mock1";
        provider1.shouldThrowIsAvailable = true;

        const provider2 = new MockAIProvider();
        provider2.id = "mock2";
        provider2.available = true;

        service.getRegistry().register(provider1);
        service.getRegistry().register(provider2);

        const result = await service.complete("Hello");
        expect(result).toBe("mock-response");
    });

    it("should list providers correctly", () => {
        const provider1 = new MockAIProvider();
        provider1.id = "mock1";
        provider1.name = "Mock 1";
        provider1.version = "1.0.1";

        service.getRegistry().register(provider1);

        const list = service.listProviders();
        expect(list).toEqual([{
            id: "mock1",
            name: "Mock 1",
            version: "1.0.1"
        }]);
    });
});

describe("aiService singleton", () => {
    it("should be a singleton instance", async () => {
        await jest.isolateModulesAsync(async () => {
            const mod1 = await import("../ai.service.js");
            const mod2 = await import("../ai.service.js");

            expect(mod1.aiService).toBeInstanceOf(mod1.AIService);
            expect(mod1.aiService).toBe(mod2.aiService);
        });
    });
});

describe("initAIService", () => {
    it("should register OpenRouter and sync with database", async () => {
        await jest.isolateModulesAsync(async () => {
            const { initAIService, aiService } = await import("../ai.service.js");

            const mockOpenRouterService = {} as OpenRouterService;
            const mockDb = {
                getAllPluginsState: jest.fn().mockReturnValue([])
            };

            const result = initAIService(mockOpenRouterService, mockDb);

            expect(result).toBe(aiService);
            expect(result.listProviders().length).toBe(1);
            expect(result.listProviders()[0].id).toBe("openrouter");
            expect(mockDb.getAllPluginsState).toHaveBeenCalled();
        });
    });

    it("should sync registry with database successfully", async () => {
        await jest.isolateModulesAsync(async () => {
            const { initAIService, aiService } = await import("../ai.service.js");
            const mockOpenRouterService = {} as OpenRouterService;

            // Mock db that disables the openrouter provider
            const mockDb = {
                getAllPluginsState: jest.fn().mockReturnValue([
                    { id: "openrouter", enabled: 0 }
                ])
            };

            initAIService(mockOpenRouterService, mockDb);

            // Wait a tick for the promise to resolve
            await new Promise(process.nextTick);

            expect(aiService.getRegistry().isEnabled("openrouter")).toBe(false);
        });
    });

    it("should catch and log errors during db sync", async () => {
        await jest.isolateModulesAsync(async () => {
            const { initAIService } = await import("../ai.service.js");
            const mockOpenRouterService = {} as OpenRouterService;

            const error = new Error("Sync failed");
            const mockDb = {
                getAllPluginsState: jest.fn().mockImplementation(() => {
                    throw error;
                })
            };

            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            initAIService(mockOpenRouterService, mockDb);

            // Wait a tick for the promise to resolve
            await new Promise(process.nextTick);

            expect(errorSpy).toHaveBeenCalledWith("Failed to sync AI registry:", error);
            errorSpy.mockRestore();
        });
    });
});
