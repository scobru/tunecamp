import fetch from "node-fetch";
import { load } from "cheerio";

export const KHINSIDER_BASE_URL = "https://downloads.khinsider.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface KhInsiderTrack {
    name: string;
    songPageUrl: string;
    mp3Url?: string;
}

export interface KhInsiderAlbum {
    albumId: string;
    name: string;
    url: string;
}

export interface KhInsiderAlbumDetail {
    name: string;
    tracks: KhInsiderTrack[];
}

export async function searchKhInsider(query: string): Promise<KhInsiderAlbum[]> {
    const url = `${KHINSIDER_BASE_URL}/search?search=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = load(html);
    
    const results: KhInsiderAlbum[] = [];
    $('.albumList tr').each((_index: number, el: any) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        const name = link.text().trim();
        if (href && name && !href.includes("search?")) {
            results.push({
                albumId: href.split('/').pop()!,
                name,
                url: href.startsWith('http') ? href : `${KHINSIDER_BASE_URL}${href}`
            });
        }
    });
    
    return results;
}

export async function parseKhInsiderAlbum(albumUrl: string): Promise<KhInsiderAlbumDetail | null> {
    const res = await fetch(albumUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = load(html);
    
    const name = $('#EchoTopic h2').first().text().trim();
    const tracks: KhInsiderTrack[] = [];
    
    $('#playlist .playlistDownloadSong').each((_index: number, el: any) => {
        const link = $(el).find('a').first();
        const href = link.attr('href');
        const trackName = link.text().trim();
        if (href && trackName) {
            tracks.push({
                name: trackName,
                songPageUrl: href.startsWith('http') ? href : `${KHINSIDER_BASE_URL}${href}`
            });
        }
    });
    
    return { name, tracks };
}

export async function parseKhInsiderSong(songPageUrl: string): Promise<string | null> {
    const res = await fetch(songPageUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = load(html);
    
    // Look for the MP3 link
    const mp3Link = $('#audio').attr('src') || $('.audio-track source').attr('src');
    if (mp3Link) return mp3Link;
    
    // Fallback: search for any .mp3 link that looks like a download
    let foundUrl: string | null = null;
    $('a').each((_index: number, el: any) => {
        const href = $(el).attr('href');
        if (href?.endsWith('.mp3')) {
            foundUrl = href;
            return false; // break
        }
    });
    
    return foundUrl;
}
