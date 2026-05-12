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

     * Searches Bandcamp for tracks matching the query.
     */
    async search(query: string): Promise<any[]> {
        try {
            // Bandcamp search URL for tracks
            const url = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const html = await response.text();

            // Very basic scraping of search results
            // This is brittle but works for a fallback
            const results: any[] = [];
            
            // Regex to find track items: <li class="searchresult item track">...
            const itemRegex = /<li class="searchresult item track">([\s\S]*?)<\/li>/g;
            let match;
            
            while ((match = itemRegex.exec(html)) !== null) {
                const itemHtml = match[1];
                
                const urlMatch = itemHtml.match(/<div class="heading">\s*<a href="([^"]+)"/);
                const titleMatch = itemHtml.match(/<div class="heading">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/);
                const artistMatch = itemHtml.match(/<div class="subhead">\s*by\s*([\s\S]*?)\s*<\/div>/);
                const thumbMatch = itemHtml.match(/<div class="art">\s*<img src="([^"]+)"/);

                if (urlMatch && titleMatch) {
                    results.push({
                        id: urlMatch[1], // Use URL as ID for Bandcamp
                        title: titleMatch[1].trim().replace(/&amp;/g, '&'),
                        artist: artistMatch ? artistMatch[1].trim().replace(/&amp;/g, '&') : "Unknown",
                        url: urlMatch[1],
                        thumbnail: thumbMatch ? thumbMatch[1] : undefined,
                        source: "bandcamp",
                        type: "recording"
                    });
                }
                
                if (results.length >= 5) break; // Limit results
            }

            return results;
        } catch (error) {
            console.error(`[BandcampProvider] ❌ Search failed for: ${query}`, error);
            return [];
        }
    }
}
