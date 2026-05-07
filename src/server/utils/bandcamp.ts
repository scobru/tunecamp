import fetch from "node-fetch";
import { isSafeUrl } from "../../utils/networkUtils.js";

export async function extractBandcampMetadata(url: string) {
    try {
        if (!url) return null;
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const isBandcamp = hostname === "bandcamp.com" || hostname.endsWith(".bandcamp.com");
        const isBcbits = hostname === "bcbits.com" || hostname.endsWith(".bcbits.com");

        if (!isBandcamp && !isBcbits) return null;
        if (!(await isSafeUrl(url))) return null;

        const response = await fetch(url.split("?")[0]);
        const html = await response.text();

        let tralbumData = null;

        // Method 1: data-tralbum attribute
        const match = html.match(/data-tralbum="([^"]+)"/);
        if (match && match[1]) {
            try {
                const decoded = match[1].replace(/&quot;/g, '"');
                tralbumData = JSON.parse(decoded);
            } catch (e) {
                console.error("Parse error for tralbum data attribute", e);
            }
        }

        // Method 3: JSON-LD (Method 2 was empty/commented in original, skipped)
        if (!tralbumData) {
            const ldMatch = html.match(/<script type="application\/ld\+json">\s*({.*?})\s*<\/script>/s);
            if (ldMatch && ldMatch[1]) {
                try {
                    const ldData = JSON.parse(ldMatch[1]);
                    if (ldData.albumRelease) {
                        tralbumData = {
                            current: {
                                title: ldData.name,
                                release_date: ldData.datePublished,
                            },
                            trackinfo: (ldData.track?.itemListElement || []).map((t: any) => ({
                                title: t.item.name,
                                track_num: t.position,
                            })),
                        };
                    }
                } catch (e) { }
            }
        }

        if (!tralbumData) return null;

        const title = tralbumData.current?.title || "";
        const artist = tralbumData.artist || "";
        const dateStr = tralbumData.current?.release_date || "";
        const year = dateStr ? new Date(dateStr).getFullYear() : new Date().getFullYear();

        const coverArtId = tralbumData.art_id || "";
        const cover = coverArtId ? `https://f4.bcbits.com/img/a${coverArtId}_10.jpg` : "";

        let finalCover = cover;
        if (!finalCover) {
            const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
            if (imgMatch) finalCover = imgMatch[1];
        }

        const trackinfo = tralbumData.trackinfo || [];
        const tracks = trackinfo
            .map((t: any) => ({
                title: t.title || t.name,
                duration: t.duration || 0,
                position: t.track_num || t.position,
                lyrics: t.lyrics || null,
            }))
            .filter((t: any) => t.title);

        return { title, artist, year, cover: finalCover, tracks };
    } catch (error) {
        console.error("[Bandcamp] Error extracting metadata:", error);
        return null;
    }
}
