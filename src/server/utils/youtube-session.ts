import fs from 'fs-extra';
import path from 'path';

/**
 * YouTubeCookieManager
 * 
 * Handles the storage and validation of YouTube cookies used by yt-dlp.
 */
export class YouTubeCookieManager {
    private cookiesPath: string;

    constructor() {
        this.cookiesPath = path.join(process.cwd(), 'data', 'youtube_cookies.txt');
    }

    /**
     * Saves raw cookie content to the standard path.
     * @param content The cookie file content (ideally in Netscape format)
     */
    async saveCookies(content: string): Promise<void> {
        // Basic validation: check if it has the Netscape header or at least some content
        if (!content || content.trim().length < 10) {
            throw new Error("Cookie content is too short or empty");
        }

        if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
            throw new Error("Received HTML instead of a cookie file. Please ensure you are uploading a raw .txt or .cookie file.");
        }

        await fs.ensureDir(path.dirname(this.cookiesPath));
        await fs.writeFile(this.cookiesPath, content);
        console.log(`💾 YouTube cookies saved to: ${this.cookiesPath}`);
    }

    /**
     * Gets the path where cookies are stored.
     */
    getCookiesPath(): string {
        return this.cookiesPath;
    }

    /**
     * Checks if cookies exist.
     */
    async hasCookies(): Promise<boolean> {
        return fs.pathExists(this.cookiesPath);
    }
}
