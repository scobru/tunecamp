import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { AIService, initAIService } from "../ai.service.js";
import type { AIProvider } from "../../../core/provider.js";

describe("AIService", () => {
	let aiService: AIService;

	beforeEach(() => {
		aiService = new AIService();
	});

	test("enrichMetadata returns empty object when no provider is available", async () => {
		const result = await aiService.enrichMetadata({ title: "My Song", artist: "Unknown" });
		expect(result).toEqual({});
	});

	test("complete returns null when no provider is available", async () => {
		const result = await aiService.complete("Recommend 5 songs");
		expect(result).toBeNull();
	});

	test("enrichMetadata delegates to first available registered provider", async () => {
		const mockProvider: AIProvider = {
			id: "mock-ai",
			name: "Mock AI",
			version: "1.0.0",
			isAvailable: jest.fn().mockImplementation(async () => true) as any,
			enrichMetadata: jest.fn().mockImplementation(async () => ({
				genre: "Ambient",
				tags: ["chill", "meditation"],
			})) as any,
			complete: jest.fn().mockImplementation(async () => "Result") as any,
		};

		aiService.getRegistry().register(mockProvider);

		const result = await aiService.enrichMetadata({ title: "Peaceful Water", artist: "Nature" });
		expect(result.genre).toBe("Ambient");
		expect(result.tags).toContain("chill");
		expect(mockProvider.enrichMetadata).toHaveBeenCalled();
	});

	test("complete delegates to first available registered provider", async () => {
		const mockProvider: AIProvider = {
			id: "mock-ai",
			name: "Mock AI",
			version: "1.0.0",
			isAvailable: jest.fn().mockImplementation(async () => true) as any,
			enrichMetadata: jest.fn() as any,
			complete: jest.fn().mockImplementation(async (prompt: string) => `Answer for: ${prompt}`) as any,
		};

		aiService.getRegistry().register(mockProvider);

		const result = await aiService.complete("Hello AI");
		expect(result).toBe("Answer for: Hello AI");
	});

	test("listProviders returns summary of registered providers", () => {
		aiService.getRegistry().register({
			id: "ai-1",
			name: "Model 1",
			version: "1.0.0",
		} as any);

		const list = aiService.listProviders();
		expect(list).toEqual([{ id: "ai-1", name: "Model 1", version: "1.0.0" }]);
	});

	test("initAIService wires OpenRouterService provider and syncs with db", () => {
		const mockOpenRouterService: any = {
			isEnabled: () => true,
		};
		const mockDb = {
			getAllPluginsState: () => [],
		};

		const service = initAIService(mockOpenRouterService, mockDb);
		expect(service.listProviders().some((p: any) => p.id === "openrouter")).toBe(true);
	});
});
