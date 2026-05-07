import fetch from "node-fetch";
import type { DatabaseService } from "../database.js";
import type { ServerConfig } from "../config.js";

export interface AIEnrichedMetadata {
    genre?: string;
    year?: number;
    description?: string;
    mood?: string;
    tags?: string[];
}

export class OpenRouterService {
    constructor(
        private database: DatabaseService,
        private config: ServerConfig
    ) {}

    private getApiKey(): string | undefined {
        return this.database.getSetting("openrouter_api_key") || this.config.openrouterApiKey;
    }

    private getModel(): string {
        return this.database.getSetting("openrouter_model") || this.config.openrouterModel || "openrouter/free";
    }

    async enrichMetadata(trackTitle: string, artistName: string): Promise<AIEnrichedMetadata | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            console.warn("[OpenRouter] API Key missing. Skipping enrichment.");
            return null;
        }

        const prompt = `Analyze the music track "${trackTitle}" by "${artistName}". 
Provide metadata in JSON format with the following fields: 
"genre" (main genre), 
"year" (release year), 
"description" (short 1-sentence description), 
"mood" (1-2 descriptive words), 
"tags" (array of 3-5 sub-genres or styles). 
If you are unsure, provide your best guess based on common knowledge. 
Output ONLY valid JSON.`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://tunecamp.app",
                    "X-Title": "TuneCamp"
                },
                body: JSON.stringify({
                    model: this.getModel(),
                    messages: [
                        { role: "system", content: "You are a specialized music metadata expert." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const err = await response.text();
                console.error(`[OpenRouter] API Error: ${response.status}`, err);
                return null;
            }

            const data = await response.json() as any;
            const content = data.choices[0]?.message?.content;
            if (!content) return null;

            return JSON.parse(content) as AIEnrichedMetadata;
        } catch (error) {
            console.error("[OpenRouter] Error during enrichment:", error);
            return null;
        }
    }

    async suggestRelatedTracks(targetTrack: any, candidates: any[]): Promise<number[]> {
        const apiKey = this.getApiKey();
        if (!apiKey || candidates.length === 0) return [];

        const libraryContext = candidates.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist_name,
            genre: t.genre
        }));

        const prompt = `Given the track "${targetTrack.title}" by "${targetTrack.artist_name}" (${targetTrack.genre || 'Unknown genre'}), 
select the top 5 most similar tracks from the following library list based on musical style, mood, and era. 
Return ONLY an array of IDs in JSON format like: {"recommendedIds": [1, 2, 3]}.

Library list:
${JSON.stringify(libraryContext)}`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://tunecamp.app",
                    "X-Title": "TuneCamp"
                },
                body: JSON.stringify({
                    model: this.getModel(),
                    messages: [
                        { role: "system", content: "You are a music recommendation engine." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) return [];

            const data = await response.json() as any;
            const content = data.choices[0]?.message?.content;
            if (!content) return [];

            const result = JSON.parse(content);
            return result.recommendedIds || [];
        } catch (error) {
            console.error("[OpenRouter] Error during recommendation:", error);
            return [];
        }
    }

    async identifyArtist(artistName: string, releaseTitles: string[]): Promise<{ searchQuery: string, bio?: string } | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;

        const prompt = `I am looking for the official identity and a photo of the music artist "${artistName}".
They have released the following albums/tracks: ${releaseTitles.join(", ")}.

Provide a refined search query for music databases (like MusicBrainz or Discogs) that uniquely identifies this artist.
Also provide a very brief (1 sentence) summary of who they are to help confirm the match.

Output ONLY valid JSON in this format:
{"searchQuery": "refined search query", "bio": "brief summary"}`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://tunecamp.app",
                    "X-Title": "TuneCamp"
                },
                body: JSON.stringify({
                    model: this.getModel(),
                    messages: [
                        { role: "system", content: "You are a music historian and metadata expert." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) return null;

            const data = await response.json() as any;
            const content = data.choices[0]?.message?.content;
            if (!content) return null;

            return JSON.parse(content);
        } catch (error) {
            console.error("[OpenRouter] Error identifying artist:", error);
            return null;
        }
    }
}
