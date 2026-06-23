import type { OpenRouterService } from '../../ai/openrouter.service.js';

export interface TelegramMetadataHints {
    artist?: string;
    album?: string;
    year?: number;
    title?: string;
    genre?: string;
    [key: string]: any;
}

export class TelegramMetadataParser {
    constructor(private ai?: OpenRouterService) {}

    public async parse(caption: string): Promise<TelegramMetadataHints> {
        if (!caption || !caption.trim()) {
            return {};
        }

        let metadataHints: TelegramMetadataHints = {};
        console.log(`[TelegramMetadataParser] Parsing caption for metadata: ${caption.substring(0, 50)}...`);

        const artistMatch = caption.match(/#artist[:\s\-=]+([^\n#\r]+)/i);
        const albumMatch = caption.match(/#album[:\s\-=]+([^\n#\r]+)/i);
        const yearMatch = caption.match(/#year[:\s\-=]+(\d{4})/i);
        const titleMatch = caption.match(/#title[:\s\-=]+([^\n#\r]+)/i);
        const genreMatch = caption.match(/#genre[:\s\-=]+([^\n#\r]+)/i);

        if (artistMatch) metadataHints.artist = artistMatch[1].trim();
        if (albumMatch) metadataHints.album = albumMatch[1].trim();
        if (yearMatch) metadataHints.year = parseInt(yearMatch[1], 10);
        if (titleMatch) metadataHints.title = titleMatch[1].trim();
        if (genreMatch) metadataHints.genre = genreMatch[1].trim();

        // If no hashtags found, try AI parsing or line-based fallback
        if (!metadataHints.artist && !metadataHints.album) {
            if (this.ai && this.ai.isEnabled()) {
                console.log(`[TelegramMetadataParser] No hashtags found. Attempting AI parsing for: "${caption.substring(0, 100)}..."`);
                try {
                    const aiMetadata = await this.ai.parseMetadataFromText(caption);
                    if (aiMetadata) {
                        const meta = Array.isArray(aiMetadata) ? aiMetadata[0] : aiMetadata;
                        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
                            console.log(`[TelegramMetadataParser] AI successfully parsed metadata:`, meta);
                            metadataHints = { ...metadataHints, ...meta };
                        }
                    }
                } catch (e) {
                    console.error(`[TelegramMetadataParser] AI parsing failed:`, e);
                }
            }

            // Secondary fallback: simple line-based parsing if AI failed or is unavailable
            if (!metadataHints.artist) {
                const lines = caption.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
                if (lines.length >= 1) metadataHints.artist = lines[0];
                if (lines.length >= 2) metadataHints.album = lines[1];
            }
        }

        console.log(`[TelegramMetadataParser] Final metadata hints from caption:`, metadataHints);
        return metadataHints;
    }
}
