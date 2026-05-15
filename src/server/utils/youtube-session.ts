import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs-extra';
import path from 'path';

puppeteer.use(StealthPlugin());

/**
 * YouTubeSessionGenerator
 * 
 * Provides a way to manually perform YouTube authentication on the server's IP
 * to obtain valid cookies and bypass bot detection.
 */
export class YouTubeSessionGenerator {
    private cookiesPath: string;

    constructor() {
        this.cookiesPath = path.join(process.cwd(), 'data', 'youtube_cookies.txt');
    }

    /**
     * Starts a visible browser (if possible) or a controlled session to perform login.
     * Note: In a headless server environment, this might require a VNC or remote debug port.
     */
    async launchLoginSession(): Promise<void> {
        console.log("🚀 Starting YouTube Login Session...");
        console.log("⚠️ If running on a headless server, ensure you have an X-server or use remote debugging.");

        const browser = await puppeteer.launch({
            headless: false, // Must be false for manual login
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
            defaultViewport: null
        });

        const page = await browser.newPage();
        
        // Go to YouTube Login
        await page.goto('https://accounts.google.com/ServiceLogin?service=youtube', { waitUntil: 'networkidle2' });

        console.log("👉 Please perform the login in the browser window.");
        console.log("⌛ Waiting for authentication to complete (looking for SID cookie)...");

        // Wait for user to be logged in (we look for a specific cookie that indicates session)
        let isLoggedIn = false;
        while (!isLoggedIn) {
            const cookies = await page.cookies();
            const hasSid = cookies.some(c => c.name === 'SID' && c.domain.includes('.google.com'));
            const hasLoginInfo = cookies.some(c => c.name === 'LOGIN_INFO' && c.domain.includes('.youtube.com'));
            
            if (hasSid && hasLoginInfo) {
                isLoggedIn = true;
                console.log("✅ Login detected!");
                
                // Format cookies for yt-dlp (Netscape format)
                const netscapeCookies = this.convertToNetscape(cookies);
                await fs.ensureDir(path.dirname(this.cookiesPath));
                await fs.writeFile(this.cookiesPath, netscapeCookies);
                
                console.log(`💾 Cookies saved to: ${this.cookiesPath}`);
            } else {
                // Check if browser was closed
                if (browser.process()?.killed) {
                    console.log("❌ Browser closed before login completed.");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log("🎉 Session successfully generated. You can close the browser or it will close in 10 seconds.");
        await new Promise(resolve => setTimeout(resolve, 10000));
        await browser.close();
    }

    /**
     * Converts Puppeteer cookies to Netscape format required by yt-dlp
     */
    private convertToNetscape(cookies: any[]): string {
        let output = "# Netscape HTTP Cookie File\n";
        output += "# http://curl.haxx.se/rfc/cookie_spec.html\n";
        output += "# This is a generated file!  Do not edit.\n\n";

        for (const cookie of cookies) {
            const domain = cookie.domain;
            const flag = domain.startsWith('.') ? "TRUE" : "FALSE";
            const path = cookie.path;
            const secure = cookie.secure ? "TRUE" : "FALSE";
            const expiration = cookie.expires ? Math.floor(cookie.expires) : 0;
            const name = cookie.name;
            const value = cookie.value;

            output += `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}\n`;
        }

        return output;
    }
}
