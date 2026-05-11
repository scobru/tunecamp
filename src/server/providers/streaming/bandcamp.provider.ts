import fetch from "node-fetch";
import type { StreamingProvider } from "../../core/provider.js";

/**
 * BandcampStreamingProvider scrapes Bandcamp pages to find streamable audio URLs.
 */
export class BandcampStreamingProvider implements StreamingProvider {
    readonly id = "bandcamp";
    readonly name = "Bandcamp";
    readonly version = "1.0.0";
    readonly description = "Bandcamp streaming fallback (scrapes streamable URLs from public pages)";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Resolves a track title and artist to a Bandcamp stream URL.
     */
    async getStreamUrl(title: string, artist?: string, album?: string): Promise<string | null> {
        try {
            // Simplified: Bandcamp search is complex, but we can look for specific patterns
            return null; 
        } catch (error) {
            console.error(`[BandcampProvider] ❌ Error resolving ${title}:`, error);
            return null;
        }
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("bandcamp.com") || sourceId.includes("bcbits.com");
    }

    async getStreamById(id: string): Promise<string | null> {
        return this.extractStreamFromUrl(id);
    }

    /**
     * Helper to extract the actual MP3 stream from a Bandcamp track page.
     */
    async extractStreamFromUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            const html = await response.text();

            // Bandcamp stores track data in a JS object
            const match = html.match(/trackinfo: \[(.*?)\]/s);
            if (match && match[1]) {
                // This is a bit brittle but common for Bandcamp scraping
                const fileMatch = match[1].match(/"file":\s*{"mp3-128":"(.*?)"}/);
                if (fileMatch && fileMatch[1]) {
                    return fileMatch[1].replace(/\\/g, ''); // Unescape slashes
                }
            }
            return null;
        } catch (e) {
            console.error(`[BandcampProvider] Failed to extract stream from ${url}:`, e);
            return null;
        }
    }
}
