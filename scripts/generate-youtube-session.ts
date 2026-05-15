import { YouTubeSessionGenerator } from './src/server/utils/youtube-session.js';

async function main() {
    const generator = new YouTubeSessionGenerator();
    try {
        await generator.launchLoginSession();
    } catch (e) {
        console.error("❌ Failed to launch session:", e);
        process.exit(1);
    }
}

main();
