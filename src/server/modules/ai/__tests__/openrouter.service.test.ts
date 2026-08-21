import { describe, test, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { OpenRouterService } from "../openrouter.service.js";

describe("OpenRouter Service", () => {
	let service: OpenRouterService;
	let mockDatabase: any;
	let mockConfig: any;
	let originalFetch: any;

	beforeEach(() => {
		originalFetch = global.fetch;
		mockDatabase = {
			getSetting: jest.fn().mockImplementation((k: string) => {
				if (k === "openrouter_api_key") return "sk-test-key-123";
				if (k === "openrouter_model") return "meta-llama/llama-3-8b";
				return null;
			}),
			getPluginState: jest.fn().mockReturnValue({ enabled: true }),
		};
		mockConfig = {
			openrouterApiKey: "sk-config-key",
			openrouterModel: "openrouter/free",
		};
		service = new OpenRouterService(mockDatabase, mockConfig);
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	// ── isEnabled ───────────────────────────────────────────────────────────

	describe("isEnabled", () => {
		test("returns true when plugin is enabled and API key is present", () => {
			expect(service.isEnabled()).toBe(true);
		});

		test("returns false when API key is missing", () => {
			mockDatabase.getSetting.mockReturnValue(null);
			mockConfig.openrouterApiKey = undefined;
			expect(service.isEnabled()).toBe(false);
		});

		test("returns false when plugin is explicitly disabled", () => {
			mockDatabase.getPluginState.mockReturnValue({ enabled: false });
			expect(service.isEnabled()).toBe(false);
		});
	});

	// ── enrichMetadata ──────────────────────────────────────────────────────

	describe("enrichMetadata", () => {
		test("returns null when API key is not configured", async () => {
			mockDatabase.getSetting.mockReturnValue(null);
			mockConfig.openrouterApiKey = undefined;

			const result = await service.enrichMetadata("Track 1", "Artist 1");
			expect(result).toBeNull();
		});

		test("calls OpenRouter API and parses JSON response", async () => {
			const mockApiResponse = {
				choices: [
					{
						message: {
							content: JSON.stringify({
								genre: "Synthwave",
								year: 1984,
								description: "A retro futuristic track.",
								mood: "nostalgic, energetic",
								tags: ["retrowave", "synthpop", "cyberpunk"],
							}),
						},
					},
				],
			};

			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: true,
				status: 200,
				json: async () => mockApiResponse,
				text: async () => JSON.stringify(mockApiResponse),
			})) as any;

			const result = await service.enrichMetadata("Nightcall", "Kavinsky");
			expect(result).toBeDefined();
			expect(result?.genre).toBe("Synthwave");
			expect(result?.year).toBe(1984);
			expect(result?.tags).toContain("retrowave");
			expect(global.fetch).toHaveBeenCalledWith(
				"https://openrouter.ai/api/v1/chat/completions",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: "Bearer sk-test-key-123",
					}),
				}),
			);
		});

		test("returns null on API failure (non-200 status)", async () => {
			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: false,
				status: 429,
				text: async () => "Rate limit exceeded",
			})) as any;

			const result = await service.enrichMetadata("Nightcall", "Kavinsky");
			expect(result).toBeNull();
		});

		test("returns null when fetch throws network error", async () => {
			global.fetch = jest.fn().mockImplementation(async () => {
				throw new Error("Network unreachable");
			}) as any;

			const result = await service.enrichMetadata("Nightcall", "Kavinsky");
			expect(result).toBeNull();
		});
	});

	// ── suggestRelatedTracks ────────────────────────────────────────────────

	describe("suggestRelatedTracks", () => {
		test("returns recommended track IDs matching candidate library", async () => {
			const target = { id: 1, title: "Resonance", artist_name: "HOME", genre: "Chillwave" };
			const candidates = [
				{ id: 2, title: "Sun", artist_name: "Caribou", genre: "Electronic" },
				{ id: 3, title: "Midnight City", artist_name: "M83", genre: "Synthpop" },
			];

			const mockApiResponse = {
				choices: [
					{
						message: {
							content: JSON.stringify({
								recommendedIds: [2, 3],
							}),
						},
					},
				],
			};

			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: true,
				status: 200,
				json: async () => mockApiResponse,
			})) as any;

			const result = await service.suggestRelatedTracks(target, candidates);
			expect(result).toEqual([2, 3]);
		});

		test("returns empty array when candidate list is empty", async () => {
			const result = await service.suggestRelatedTracks({ title: "A", artist_name: "B" }, []);
			expect(result).toEqual([]);
		});
	});

	// ── identifyArtist ──────────────────────────────────────────────────────

	describe("identifyArtist", () => {
		test("generates search query and summary for artist", async () => {
			const mockApiResponse = {
				choices: [
					{
						message: {
							content: JSON.stringify({
								searchQuery: "Aphex Twin Richard D James",
								bio: "Pioneering British electronic musician and composer.",
							}),
						},
					},
				],
			};

			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: true,
				status: 200,
				json: async () => mockApiResponse,
			})) as any;

			const result = await service.identifyArtist("Aphex Twin", ["Selected Ambient Works"]);
			expect(result).toBeDefined();
			expect(result?.searchQuery).toBe("Aphex Twin Richard D James");
			expect(result?.bio).toContain("electronic musician");
		});
	});
});
