import type { DatabaseService } from '../../../core/database.js';
import type { TelegramRepository } from '../../../repositories/telegram.repository.js';
import type { ScannerService } from '../../catalog/scanner.js';
import { VisibilityProfile } from '../../../common/visibility.js';

export interface TelegramBotContext {
    safeReply: (ctx: any, text: string) => Promise<any>;
    isAuthorized: (ctx: any) => boolean;
    sendTrack: (ctx: any, track: any) => Promise<boolean>;
    sendRandomTrack: (ctx: any) => Promise<void>;
    database: DatabaseService;
    telegramRepo: TelegramRepository;
    scanner: ScannerService;
    musicDir: string;
}

export function createTelegramCommands(botCtx: TelegramBotContext): Record<string, (ctx: any) => Promise<any> | any> {
    const handleStatus = (ctx: any) => {
        const chatId = ctx.chat.id;
        botCtx.safeReply(ctx, `Tunecamp Music Ingester Bot is active!\nChat ID: ${chatId}`);
    };

    const commands: Record<string, (ctx: any) => Promise<any> | any> = {
        'start': handleStatus,
        'status': handleStatus,
        'artists': (ctx) => {
            const artists = botCtx.telegramRepo.getRecentArtists(50);
            if (artists.length === 0) return botCtx.safeReply(ctx, "No artists found in library.");
            const list = artists.map(a => `• ${a.name}`).join('\n');
            return botCtx.safeReply(ctx, `🎨 Artists in Library:\n\n${list}`);
        },
        'albums': (ctx) => {
            const albums = botCtx.telegramRepo.getRecentAlbums(50);
            if (albums.length === 0) return botCtx.safeReply(ctx, "No albums found in library.");
            const list = albums.map(a => `• ${a.artist_name ? a.artist_name + ' - ' : ''}${a.title}`).join('\n');
            return botCtx.safeReply(ctx, `💿 Recent Library Albums:\n\n${list}`);
        },
        'album': (ctx) => commands['albums'](ctx),
        'releases': (ctx) => {
            const releases = botCtx.telegramRepo.getRecentReleases(50);
            if (releases.length === 0) return botCtx.safeReply(ctx, "No releases found.");
            const list = releases.map(r => `• ${r.artist_name ? r.artist_name + ' - ' : ''}${r.title}`).join('\n');
            return botCtx.safeReply(ctx, `🚀 Recent Published Releases:\n\n${list}`);
        },
        'release': (ctx) => commands['releases'](ctx),
        'help': (ctx) => {
            const helpText = `
📖 **Tunecamp Bot Help**

This bot automatically ingests music files shared in this channel and allows you to search your library.

**Commands:**
• /status - Check bot status and Chat ID
• /search <query> - Search and receive music files
• /play <query> - Alias for search
• /artists - List artists in your library
• /albums - List recent library albums
• /releases - List recent published releases
• /playlists - Browse and play your playlists
• /radio - Start random radio mode
• /debug_db - Admin: Debug database paths and stats
• /rescan - Consolidate library and repair paths
• /help - Show this help message

**How to Import with Metadata:**
1. Send a **Photo** (Album Cover).
2. Add a **Caption** to the photo with these hashtags:
   #artist: Name
   #album: Title
   #year: 2024
3. Send the **Audio File(s)** immediately after.

The bot will automatically associate the photo as the cover and use the hashtags for the library metadata.
            `;
            return botCtx.safeReply(ctx, helpText);
        },
        'debug_db': async (ctx) => {
            if (!botCtx.isAuthorized(ctx)) return botCtx.safeReply(ctx, "⚠️ Unauthorized.");
            
            const dbPath = botCtx.database.db.name;
            const stats = botCtx.telegramRepo.getDatabaseStats();
            const recentTracks = botCtx.telegramRepo.getRecentTracks(5);

            const debugInfo = `
🔧 **Database Debug Info**
• **CWD:** ${process.cwd()}
• **DB Path:** ${dbPath}
• **Artists:** ${stats.artists}
• **Tracks:** ${stats.tracks}
• **Albums:** ${stats.albums}
• **Releases:** ${stats.releases}

🎵 **Recent Tracks:**
${recentTracks.map(t => `• ${t.artist_name || 'Unknown'} - ${t.title}`).join('\n') || 'None'}
`;
            return botCtx.safeReply(ctx, debugInfo);
        },
        'search': async (ctx) => {
            const text = (ctx.message?.text || ctx.channelPost?.text || '');
            const query = text.split(' ').slice(1).join(' ').trim();
            
            if (!query) return botCtx.safeReply(ctx, "🔍 Please provide a search query.\nUsage: /search <title or artist>");

            console.log(`[TelegramBot] Searching for: "${query}"`);

            const profile = botCtx.isAuthorized(ctx) ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;

            // 1. Use the main database search which is more comprehensive
            const searchResults = botCtx.database.search(query, profile);
            let tracks: any[] = [...searchResults.tracks];

            // 2. If no tracks found but an artist matched, fetch all tracks for that artist
            if (tracks.length === 0 && searchResults.artists.length > 0) {
                const artist = searchResults.artists[0];
                console.log(`[TelegramBot] No direct track matches, but artist "${artist.name}" found. Fetching artist tracks.`);
                const artistTracks = botCtx.database.getTracksByArtist(artist.id, profile);
                tracks.push(...artistTracks);
            }

            // 3. Search in Release Tracks (Published Releases compartment)
            const releaseResults = botCtx.telegramRepo.searchReleaseTracks(query, 10);

            // Merge and deduplicate (by file_path)
            const seenPaths = new Set(tracks.map(t => t.file_path));
            for (const rr of releaseResults) {
                if (rr.file_path && !seenPaths.has(rr.file_path)) {
                    tracks.push(rr);
                    seenPaths.add(rr.file_path);
                }
            }

            if (tracks.length === 0) {
                console.log(`[TelegramBot] No results found for query: ${query}`);
                return botCtx.safeReply(ctx, `❌ No results found for "${query}". Try /artists to see available names.`);
            }

            // LIMIT RESULTS to prevent server/Telegram overload (Max 5 tracks per search)
            const limit = 5;
            const resultsToSend = tracks.slice(0, limit);

            if (tracks.length > limit) {
                await botCtx.safeReply(ctx, `🔎 Found ${tracks.length} results. Sending the top ${limit}...`);
            }

            let sentCount = 0;
            let missingCount = 0;

            for (const track of resultsToSend) {
                const success = await botCtx.sendTrack(ctx, track);
                if (success) sentCount++;
                else missingCount++;
            }

            if (sentCount === 0 && missingCount > 0) {
                return botCtx.safeReply(ctx, `⚠️ Found results, but the physical files are missing on the server.`);
            }
        },
        'play': (ctx) => commands['search'](ctx),
        'playlists': async (ctx) => {
            const playlists = botCtx.database.getPlaylists();
            if (playlists.length === 0) return botCtx.safeReply(ctx, "No playlists found.");
            
            const buttons = playlists.map(p => ([{
                text: `📂 ${p.name}`,
                callback_data: `pl_view_${p.id}`
            }]));

            await ctx.reply("📚 Your Playlists:", {
                reply_markup: { inline_keyboard: buttons }
            });
        },
        'rescan': async (ctx) => {
            if (!botCtx.isAuthorized(ctx)) {
                return botCtx.safeReply(ctx, "⚠️ Unauthorized. Only admins can trigger a rescan.");
            }
            await botCtx.safeReply(ctx, "🔍 Starting library rescan...");
            try {
                const result = await botCtx.scanner.scanDirectory(botCtx.musicDir);
                return botCtx.safeReply(ctx, `✅ Rescan complete!\nProcessed: ${result.successful.length}\nFailed: ${result.failed.length}`);
            } catch (e) {
                return botCtx.safeReply(ctx, `❌ Rescan failed: ${e}`);
            }
        },
        'radio': async (ctx) => {
            await botCtx.sendRandomTrack(ctx);
        },
        'debug': async (ctx) => {
            if (!botCtx.isAuthorized(ctx)) {
                return botCtx.safeReply(ctx, "⚠️ Unauthorized.");
            }
            const text = (ctx.message?.text || ctx.channelPost?.text || '').toLowerCase();
            let newValue: string;
            
            if (text.includes('on')) newValue = 'true';
            else if (text.includes('off')) newValue = 'false';
            else {
                const current = botCtx.database.getSetting('telegram_debug') === 'true';
                newValue = current ? 'false' : 'true';
            }

            botCtx.database.setSetting('telegram_debug', newValue);
            return botCtx.safeReply(ctx, `🔧 Debug mode (verbose logs) is now ${newValue === 'true' ? 'ON' : 'OFF'}`);
        }
    };

    return commands;
}
