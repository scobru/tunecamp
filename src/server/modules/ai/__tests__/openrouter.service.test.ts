import { jest } from "@jest/globals";
import { OpenRouterService } from "../openrouter.service.js";
import type { DatabaseService } from "../../../core/database.js";
import type { ServerConfig } from "../../../core/config.js";

describe("OpenRouterService", () => {
    let service: OpenRouterService;
    let mockDatabase: jest.Mocked<DatabaseService>;
    let mockConfig: jest.Mocked<ServerConfig>;
    let originalFetch: typeof global.fetch;
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockDatabase = {
            getPluginState: jest.fn(),
            getSetting: jest.fn(),
        } as unknown as jest.Mocked<DatabaseService>;

        mockConfig = {
            openrouterApiKey: undefined,
            openrouterModel: undefined,
        } as unknown as jest.Mocked<ServerConfig>;

        service = new OpenRouterService(mockDatabase, mockConfig);

        originalFetch = global.fetch;
        mockFetch = jest.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe("isEnabled", () => {
        it("should return false if no plugin state or api key", () => {
            mockDatabase.getPluginState.mockReturnValue(undefined);
            mockDatabase.getSetting.mockReturnValue(undefined as any);
            expect(service.isEnabled()).toBe(false);
        });

        it("should return false if plugin is explicitly disabled", () => {
            mockDatabase.getPluginState.mockReturnValue({ enabled: false } as any);
            mockDatabase.getSetting.mockReturnValue("test-key" as any);
            expect(service.isEnabled()).toBe(false);
        });

        it("should return true if plugin is enabled and api key is present", () => {
            mockDatabase.getPluginState.mockReturnValue({ enabled: true } as any);
            mockDatabase.getSetting.mockReturnValue("test-key" as any);
            expect(service.isEnabled()).toBe(true);
        });

        it("should return true if plugin state is undefined and api key is present", () => {
            mockDatabase.getPluginState.mockReturnValue(undefined);
            mockDatabase.getSetting.mockReturnValue("test-key" as any);
            expect(service.isEnabled()).toBe(true);
        });
    });

    describe("enrichMetadata", () => {
        it("should skip and return null if no api key", async () => {
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
            const result = await service.enrichMetadata("Track", "Artist");
            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith("[OpenRouter] API Key missing. Skipping enrichment.");
            warnSpy.mockRestore();
        });

        it("should call fetch and return parsed data", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"genre":"rock","year":2020}' } }]
                })
            });

            const result = await service.enrichMetadata("Track", "Artist");
            expect(result).toEqual({ genre: "rock", year: 2020 });
            expect(mockFetch).toHaveBeenCalledWith(
                "https://openrouter.ai/api/v1/chat/completions",
                expect.objectContaining({ method: "POST" })
            );
        });

        it("should return null if fetch fails", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve("Internal Error")
            });
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
            const result = await service.enrichMetadata("Track", "Artist");
            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it("should catch fetch errors and return null", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockRejectedValue(new Error("Network Error"));
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
            const result = await service.enrichMetadata("Track", "Artist");
            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe("suggestRelatedTracks", () => {
        it("should return empty array if no api key", async () => {
            mockDatabase.getSetting.mockReturnValue(undefined as any);
            const result = await service.suggestRelatedTracks({}, [{}]);
            expect(result).toEqual([]);
        });

        it("should return empty array if candidates list is empty", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            const result = await service.suggestRelatedTracks({}, []);
            expect(result).toEqual([]);
        });

        it("should call fetch and return recommended ids", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"recommendedIds":[1,2,3]}' } }]
                })
            });

            const result = await service.suggestRelatedTracks({ title: "T1" }, [{ id: 1 }, { id: 2 }, { id: 3 }]);
            expect(result).toEqual([1, 2, 3]);
        });

        it("should handle missing content in response", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: {} }] })
            });

            const result = await service.suggestRelatedTracks({ title: "T1" }, [{ id: 1 }]);
            expect(result).toEqual([]);
        });

        it("should return empty array on fetch failure", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({ ok: false });

            const result = await service.suggestRelatedTracks({ title: "T1" }, [{ id: 1 }]);
            expect(result).toEqual([]);
        });

        it("should return empty array on fetch error", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockRejectedValue(new Error("Error"));
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            const result = await service.suggestRelatedTracks({ title: "T1" }, [{ id: 1 }]);
            expect(result).toEqual([]);
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe("identifyArtist", () => {
        it("should return null if no api key", async () => {
            mockDatabase.getSetting.mockReturnValue(undefined as any);
            const result = await service.identifyArtist("Artist", []);
            expect(result).toBeNull();
        });

        it("should call fetch and return artist info", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"searchQuery":"q","bio":"b"}' } }]
                })
            });

            const result = await service.identifyArtist("Artist", ["Album"]);
            expect(result).toEqual({ searchQuery: "q", bio: "b" });
        });

        it("should handle fetch failure", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({ ok: false });

            const result = await service.identifyArtist("Artist", ["Album"]);
            expect(result).toBeNull();
        });

        it("should handle fetch error", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockRejectedValue(new Error("Error"));
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            const result = await service.identifyArtist("Artist", ["Album"]);
            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe("parseMetadataFromText", () => {
        it("should return null if no api key", async () => {
            mockDatabase.getSetting.mockReturnValue(undefined as any);
            const result = await service.parseMetadataFromText("Text");
            expect(result).toBeNull();
        });

        it("should call fetch and return parsed metadata", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"artist":"A","album":"B","year":2000}' } }]
                })
            });

            const result = await service.parseMetadataFromText("Text");
            expect(result).toEqual({ artist: "A", album: "B", year: 2000 });
        });

        it("should handle fetch failure", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({ ok: false });

            const result = await service.parseMetadataFromText("Text");
            expect(result).toBeNull();
        });

        it("should handle fetch error", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockRejectedValue(new Error("Error"));
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            const result = await service.parseMetadataFromText("Text");
            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe("identifyAlbum", () => {
        it("should return null if no api key", async () => {
            mockDatabase.getSetting.mockReturnValue(undefined as any);
            const result = await service.identifyAlbum("Album", "Artist", []);
            expect(result).toBeNull();
        });

        it("should call fetch and return enriched metadata", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"genre":"rock","year":2000}' } }]
                })
            });

            const result = await service.identifyAlbum("Album", "Artist", ["Track"]);
            expect(result).toEqual({ genre: "rock", year: 2000 });
        });

        it("should handle fetch failure", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockResolvedValue({ ok: false });

            const result = await service.identifyAlbum("Album", "Artist", ["Track"]);
            expect(result).toBeNull();
        });

        it("should handle fetch error", async () => {
            mockDatabase.getSetting.mockImplementation((k: string) => k === "openrouter_api_key" ? "test-key" : undefined);
            mockFetch.mockRejectedValue(new Error("Error"));
            const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            const result = await service.identifyAlbum("Album", "Artist", ["Track"]);
            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });
});
