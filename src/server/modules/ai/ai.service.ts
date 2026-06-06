import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { AIProvider } from "../../core/provider.js";
import { OpenRouterAIProvider } from "../../providers/ai/openrouter.provider.js";
import type { OpenRouterService } from "./openrouter.service.js";

/**
 * AIService manages a registry of AIProviders.
 *
 * Provides a unified interface for AI/LLM features regardless of the
 * underlying provider (OpenRouter, Ollama, Anthropic, local models, etc.)
 *
 * Strategy: use the first available provider. Falls back gracefully if
 * no provider is configured.
 */
class AIService {
    private registry = new ProviderRegistry<AIProvider>();

    /**
     * Enriches metadata using the first available AI provider.
     */
    async enrichMetadata(context: {
        title: string;
        artist?: string;
        album?: string;
        genre?: string;
    }): Promise<Partial<{ description: string; genre: string; tags: string[]; mood: string }>> {
        const provider = await this.getAvailableProvider();
        if (!provider) {
            console.warn("[AIService] No AI provider available for enrichMetadata");
            return {};
        }
        return provider.enrichMetadata(context);
    }

    /**
     * Sends a free-form prompt to the first available AI provider.
     */
    async complete(prompt: string): Promise<string | null> {
        const provider = await this.getAvailableProvider();
        if (!provider) {
            console.warn("[AIService] No AI provider available for complete()");
            return null;
        }
        return provider.complete(prompt);
    }

    /**
     * Returns the first provider that reports isAvailable() === true.
     */
    private async getAvailableProvider(): Promise<AIProvider | null> {
        for (const provider of this.registry.getAll()) {
            try {
                if (await provider.isAvailable()) return provider;
            } catch { /* skip */ }
        }
        return null;
    }

    getRegistry(): ProviderRegistry<AIProvider> {
        return this.registry;
    }

    listProviders() {
        return this.registry.getAll().map((p: AIProvider) => ({
            id: p.id, name: p.name, version: p.version
        }));
    }
}

export const aiService = new AIService();

export function initAIService(openRouterService: OpenRouterService, db?: any): AIService {
    aiService.getRegistry().register(new OpenRouterAIProvider(openRouterService));
    if (db) {
        syncRegistryWithDatabase(aiService.getRegistry(), db).catch(err => console.error("Failed to sync AI registry:", err));
    }
    return aiService;
}
