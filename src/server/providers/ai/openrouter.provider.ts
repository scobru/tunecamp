import type { AIProvider } from "../../core/provider.js";
import type { OpenRouterService } from "../../modules/ai/openrouter.service.js";

/**
 * OpenRouterAIProvider wraps the existing OpenRouterService to conform
 * to the AIProvider interface.
 *
 * This makes AI capabilities a first-class extension point — a developer
 * can replace this with an OllamaAIProvider, AnthropicAIProvider, etc.
 * without changing any core code.
 */
export class OpenRouterAIProvider implements AIProvider {
    readonly id = "openrouter";
    readonly name = "OpenRouter";
    readonly version = "1.0.0";
    readonly description = "AI metadata enrichment via OpenRouter LLM gateway";

    constructor(private readonly openRouterService: OpenRouterService) {}

    /**
     * Checks if the OpenRouter service is configured with an API key.
     */
    async isAvailable(): Promise<boolean> {
        try {
            // OpenRouterService is available if it has a key set (it validates in constructor)
            // We check by attempting a lightweight call
            const result = await this.openRouterService.parseMetadataFromText("test");
            return result !== null;
        } catch {
            return false;
        }
    }

    /**
     * Enriches metadata for a track/album using OpenRouter.
     * Maps to the existing enrichMetadata() method on the service.
     */
    async enrichMetadata(context: {
        title: string;
        artist?: string;
        album?: string;
        genre?: string;
    }): Promise<Partial<{ description: string; genre: string; tags: string[]; mood: string }>> {
        try {
            const result = await this.openRouterService.enrichMetadata(
                context.title,
                context.artist || "Unknown Artist"
            );

            if (!result) return {};

            return {
                description: result.description || undefined,
                genre: result.genre || undefined,
                tags: result.tags || undefined,
                mood: result.mood || undefined,
            };
        } catch (error) {
            console.error("[OpenRouterAIProvider] enrichMetadata() failed:", error);
            return {};
        }
    }

    /**
     * General-purpose text completion via OpenRouter.
     * Uses parseMetadataFromText as a proxy for free-form prompts.
     */
    async complete(prompt: string): Promise<string | null> {
        try {
            const result = await this.openRouterService.parseMetadataFromText(prompt);
            if (!result) return null;
            return JSON.stringify(result);
        } catch (error) {
            console.error("[OpenRouterAIProvider] complete() failed:", error);
            return null;
        }
    }
}
