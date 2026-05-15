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
