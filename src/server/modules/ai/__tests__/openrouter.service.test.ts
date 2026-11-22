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
				if (k === "openrouter_model") return "google/gemini-2.5-flash";
				return null;
			}),
			getPluginState: jest.fn().mockReturnValue({ enabled: true }),
			getAllPluginsState: jest.fn().mockReturnValue([]),
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

	describe("chat", () => {
		test("returns error without calling fetch when API key is missing", async () => {
			mockDatabase.getSetting.mockReturnValue(null);
			mockConfig.openrouterApiKey = undefined;

			const res = await service.chat([{ role: "user", content: "Hello" }]);
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("OpenRouter AI is not configured");
			}
		});

		test("sends messages and tools to OpenRouter and returns assistant message", async () => {
			const mockApiResponse = {
				choices: [
					{
						message: {
							role: "assistant",
							content: null,
							tool_calls: [
								{
									id: "call_1",
									type: "function",
									function: {
										name: "search_external_releases",
										arguments: JSON.stringify({ query: "Bluvertigo - Acidi e basi" })
									}
								}
							]
						}
					}
				]
			};

			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: true,
				status: 200,
				json: async () => mockApiResponse
			})) as any;

			const res = await service.chat(
				[{ role: "user", content: "Find tracks" }],
				{
					tools: [
						{
							type: "function",
							function: {
								name: "search_external_releases",
								description: "Search releases",
								parameters: { type: "object", properties: { query: { type: "string" } } }
							}
						}
					]
				}
			);

			expect(res.ok).toBe(true);
			if (res.ok) {
				expect(res.message.tool_calls).toHaveLength(1);
				expect(res.message.tool_calls?.[0].function.name).toBe("search_external_releases");
			}
			expect(global.fetch).toHaveBeenCalledWith(
				"https://openrouter.ai/api/v1/chat/completions",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: "Bearer sk-test-key-123"
					})
				})
			);
		});

		test("flags toolUseUnsupported when model rejects tool calling", async () => {
			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: false,
				status: 404,
				text: async () => JSON.stringify({ error: { message: "No endpoints found that support tool use" } })
			})) as any;

			const res = await service.chat([{ role: "user", content: "Hello" }], {
				tools: [{ type: "function", function: { name: "t", description: "d", parameters: {} } }]
			});

			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.toolUseUnsupported).toBe(true);
				expect(res.error).toContain("google/gemini-2.5-flash");
			}
		});

		test("handles network exceptions cleanly", async () => {
			global.fetch = jest.fn().mockImplementation(async () => {
				throw new Error("Network unreachable");
			}) as any;

			const res = await service.chat([{ role: "user", content: "Hello" }]);
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error).toContain("Network unreachable");
			}
		});
	});

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
							role: "assistant",
							content: "```json\n{\"recommendedIds\": [2, 3]}\n```"
						}
					}
				]
			};

			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: true,
				status: 200,
				json: async () => mockApiResponse
			})) as any;

			const result = await service.suggestRelatedTracks(target, candidates);
			expect(result).toEqual([2, 3]);
		});

		test("returns empty array when candidate list is empty", async () => {
			const result = await service.suggestRelatedTracks({ title: "A", artist_name: "B" }, []);
			expect(result).toEqual([]);
		});
	});

	describe("parseMetadataFromText", () => {
		test("parses structured metadata JSON from response", async () => {
			global.fetch = jest.fn().mockImplementation(async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					choices: [
						{
							message: {
								role: "assistant",
								content: JSON.stringify({ artist: "Bluvertigo", album: "Acidi e basi", year: 1995 })
							}
						}
					]
				})
			})) as any;

			const res = await service.parseMetadataFromText("Bluvertigo - Acidi e basi (1995)");
			expect(res).toEqual({ artist: "Bluvertigo", album: "Acidi e basi", year: 1995 });
		});
	});
});
