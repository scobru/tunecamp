import type { DatabaseService } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import { ProviderRegistry, syncRegistryWithDatabase, type TuneCampProvider } from "../../core/provider.js";

export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export type ChatCompletionResult =
    | { ok: true; message: ChatMessage }
    | { ok: false; error: string; status?: number; toolUseUnsupported?: boolean };

function stripJsonFences(raw: string): string {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export class OpenRouterService implements TuneCampProvider {
    readonly id = "openrouter";
    readonly name = "OpenRouter";
    readonly version = "2.0.0";
    readonly description = "AI Library Assistant & suggestions via OpenRouter";

    private registry = new ProviderRegistry<TuneCampProvider>();

    constructor(
        private database: DatabaseService,
        private config: ServerConfig
    ) {
        this.registry.register(this);
    }

    getRegistry(): ProviderRegistry<TuneCampProvider> {
        return this.registry;
    }

    async syncWithDatabase(): Promise<void> {
        try {
            await syncRegistryWithDatabase(this.registry, this.database);
        } catch (err) {
            console.error("[OpenRouter] Failed to sync plugin registry:", err);
        }
    }

    public isEnabled(): boolean {
        const pluginState = this.database.getPluginState("openrouter");
        const isPluginEnabled = pluginState ? pluginState.enabled : true;
        return isPluginEnabled && !!this.getApiKey();
    }

    private getApiKey(): string | undefined {
        return this.database.getSetting("openrouter_api_key") || this.config.openrouterApiKey;
    }

    public getModel(): string {
        return this.database.getSetting("openrouter_model") || this.config.openrouterModel || "openrouter/free";
    }

    async chat(
        messages: ChatMessage[],
        options: {
            tools?: ToolDefinition[];
            toolChoice?: "auto" | "none";
            responseFormat?: { type: "json_object" };
            temperature?: number;
        } = {}
    ): Promise<ChatCompletionResult> {
        const apiKey = this.getApiKey();
        const pluginState = this.database.getPluginState("openrouter");
        const isPluginEnabled = pluginState ? pluginState.enabled : true;

        if (!isPluginEnabled || !apiKey) {
            return {
                ok: false,
                error: "OpenRouter AI is not configured or disabled. Set an API key in Admin → Integrations."
            };
        }

        const model = this.getModel();
        const body: Record<string, any> = {
            model,
            messages
        };

        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools;
            body.tool_choice = options.toolChoice ?? "auto";
        }
        if (options.responseFormat) {
            body.response_format = options.responseFormat;
        }
        if (options.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://tunecamp.app",
                    "X-Title": "TuneCamp"
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(60000)
            });

            if (!response.ok) {
                const rawText = await response.text();
                let errMsg = rawText;
                try {
                    const parsed = JSON.parse(rawText);
                    errMsg = parsed?.error?.message || parsed?.message || rawText;
                } catch { /* raw text fallback */ }

                const toolUseUnsupported =
                    (response.status === 400 || response.status === 404) &&
                    /tool|function/i.test(errMsg);

                console.error(`[OpenRouter] API Error (${response.status}):`, errMsg);

                if (toolUseUnsupported) {
                    return {
                        ok: false,
                        status: response.status,
                        toolUseUnsupported: true,
                        error: `Model "${model}" does not support tool calling (${errMsg}). Select a tool-capable model in Admin → Integrations (e.g. google/gemini-2.5-flash, openai/gpt-4o-mini, or anthropic/claude-3.5-haiku).`
                    };
                }

                return {
                    ok: false,
                    status: response.status,
                    error: `OpenRouter API error (${response.status}): ${errMsg || "Request failed"}`
                };
            }

            const data = await response.json() as any;
            const message = data?.choices?.[0]?.message as ChatMessage | undefined;
            if (!message) {
                return {
                    ok: false,
                    error: "OpenRouter returned an empty response."
                };
            }

            return { ok: true, message };
        } catch (error: any) {
            console.error("[OpenRouter] Request failed:", error);
            return {
                ok: false,
                error: error?.message || "Failed to contact OpenRouter API."
            };
        }
    }

    async suggestRelatedTracks(targetTrack: any, candidates: any[]): Promise<number[]> {
        if (!this.isEnabled() || candidates.length === 0) return [];

        const libraryContext = candidates.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist_name,
            genre: t.genre
        }));

        const prompt = `Given the track "${targetTrack.title}" by "${targetTrack.artist_name}" (${targetTrack.genre || "Unknown genre"}),
select the top 5 most similar tracks from the following library list based on musical style, mood, and era.
Return ONLY an array of IDs in JSON format like: {"recommendedIds": [1, 2, 3]}.

Library list:
${JSON.stringify(libraryContext)}`;

        const res = await this.chat(
            [
                { role: "system", content: "You are a music recommendation engine." },
                { role: "user", content: prompt }
            ],
            { responseFormat: { type: "json_object" } }
        );

        if (!res.ok || !res.message.content) return [];
        try {
            const parsed = JSON.parse(stripJsonFences(res.message.content));
            return Array.isArray(parsed.recommendedIds) ? parsed.recommendedIds : [];
        } catch (error) {
            console.error("[OpenRouter] Error parsing recommendation JSON:", error);
            return [];
        }
    }

    async parseMetadataFromText(text: string): Promise<{ artist?: string; album?: string; year?: number; genre?: string; bandcampUrl?: string } | null> {
        if (!this.isEnabled()) return null;

        const prompt = `Extract music metadata from the following text. Look for Artist, Album, Year, and Genre.
Additionally, if you can identify the specific album, provide its official Bandcamp URL if it exists.
Return ONLY a JSON object with keys "artist", "album", "year" (number), "genre", "bandcampUrl".
If a field is missing or unknown, omit it. Be precise.
Text: "${text}"`;

        const res = await this.chat(
            [
                { role: "system", content: "You are a specialized music metadata extractor. Extract data precisely from messy text." },
                { role: "user", content: prompt }
            ],
            { responseFormat: { type: "json_object" } }
        );

        if (!res.ok || !res.message.content) return null;
        try {
            return JSON.parse(stripJsonFences(res.message.content));
        } catch (error) {
            console.error("[OpenRouter] Error parsing metadata JSON:", error);
            return null;
        }
    }
}
