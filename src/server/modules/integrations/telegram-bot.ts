// @ts-nocheck
import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { ScannerService } from '../catalog/scanner.js';
import { DatabaseService } from '../../core/database.js';
import type { ServerConfig } from '../../core/config.js';
import type { OpenRouterService } from '../ai/openrouter.service.js';
import { VisibilityProfile } from '../../common/visibility.js';
import { TelegramMetadataParser } from './telegram/telegram-metadata-parser.js';
import { TelegramRepository } from '../../repositories/telegram.repository.js';
import { createTelegramCommands, type TelegramBotContext } from './telegram/telegram-commands.js';

export class TelegramBotService {
    private bot?: Telegraf;
    private isRunning = false;
    private recentContext = new Map<string, { photoId?: string, caption?: string, timestamp: number }>();
    private userCooldowns = new Map<string, number>();
    private readonly COMMAND_COOLDOWN = 1000; // 1 second between commands per user
    private telegramRepo: TelegramRepository;
    private metadataParser: TelegramMetadataParser;

    constructor(
        private database: DatabaseService,
        private scanner: ScannerService,
        private config: ServerConfig,
        private ai?: OpenRouterService
    ) {
        this.telegramRepo = new TelegramRepository(database.db);
        this.metadataParser = new TelegramMetadataParser(ai);
    }

    private get musicDir(): string {
        return this.config.musicDir;
    }

    private getMasterId(): string | undefined {
        return this.config.telegramMasterId || this.database.getSetting('telegram_master_id');
    }

    private checkRateLimit(ctx: any): boolean {
        const msg = ctx.message || ctx.channelPost;
        
        // NEVER rate limit media uploads (batch ingestion)
        if (msg?.audio || msg?.document || msg?.photo) return true;
        
        // ONLY rate limit text messages that look like commands
        if (msg?.text && !msg.text.startsWith('/')) return true;

        const userId = ctx.from?.id?.toString() || ctx.chat?.id?.toString();
        if (!userId) return true;

        // NEVER rate limit the Master Admin
        if (userId === this.getMasterId()) return true;

        const now = Date.now();
        const lastRequest = this.userCooldowns.get(userId) || 0;
        
        if (now - lastRequest < this.COMMAND_COOLDOWN) {
            const remaining = Math.ceil((this.COMMAND_COOLDOWN - (now - lastRequest)) / 1000);
            console.warn(`[TelegramBot] User ${userId} rate limited. Wait ${remaining}s.`);
            // Silent ignore for very frequent requests (spam), send a hint for slower but still fast ones
            if (now - lastRequest < 500) return false; 
            this.safeReply(ctx, `⏳ Calmati! Aspetta un attimo... / Wait a second...`);
            return false;
        }

        this.userCooldowns.set(userId, now);
        return true;
    }

    private async safeReply(ctx: any, text: string, retryCount = 0): Promise<any> {
        try {
            return await ctx.reply(text);
        } catch (err: any) {
            if (err.response?.error_code === 429 && retryCount < 3) {
                const retryAfter = (err.response?.parameters?.retry_after || 5) * 1000;
                console.warn(`[TelegramBot] Rate limited (429). Retrying in ${retryAfter}ms...`);
                await new Promise(r => setTimeout(r, retryAfter));
                return this.safeReply(ctx, text, retryCount + 1);
            }
            console.error('[TelegramBot] Failed to send reply:', err.message);
        }
    }

    async start() {
        if (this.isRunning) return;

        // SECURITY: Prefer Environment Variable over Database settings for secrets
        let token = this.config.telegramBotToken;

        if (!token) {
            console.warn('[TelegramBot] No bot token found in settings or environment. Telegram integration will be inactive.');
            return;
        }

        try {
            this.bot = new Telegraf(token);

            this.bot.catch((err: any, ctx) => {
                console.error(`[TelegramBot] Unhandled error for ${ctx.updateType}:`, err);
            });

            // Global middleware for logging and rate limiting
            this.bot.use(async (ctx, next) => {
                if (ctx.message || ctx.channelPost || ctx.callbackQuery) {
                    if (!this.checkRateLimit(ctx)) return;
                }
                return next();
            });

            // 1. Define command handlers
            const botCtx: TelegramBotContext = {
                safeReply: this.safeReply.bind(this),
                isAuthorized: this.isAuthorized.bind(this),
                sendTrack: this.sendTrack.bind(this),
                sendRandomTrack: this.sendRandomTrack.bind(this),
                database: this.database,
                telegramRepo: this.telegramRepo,
                scanner: this.scanner,
                musicDir: this.musicDir
            };
            const commands = createTelegramCommands(botCtx);

            // 2. Define the main update handler
            const handleUpdate = async (ctx: any) => {
                try {
                    const msg = ctx.message || ctx.channelPost;
                    if (!msg) return;

                    const chatId = ctx.chat.id.toString();
                    const chatType = ctx.chat.type;

                    // Handle Commands
                    const text = msg.text || msg.caption;
                    if (text && text.startsWith('/')) {
                        const parts = text.split(' ');
                        const cmdWithBot = parts[0].substring(1);
                        const cmd = cmdWithBot.split('@')[0];
                        
                        if (commands[cmd]) {
                            console.log(`[TelegramBot] Command received in ${chatType} ${chatId}: ${cmd}`);
                            return await commands[cmd](ctx);
                        }
                    }

                    // Handle Photo context
                    if (msg.photo) {
                        if (this.isAuthorized(ctx)) {
                            const photoId = msg.photo[msg.photo.length - 1].file_id;
                            const existing = this.recentContext.get(chatId) || { timestamp: 0 };
                            this.recentContext.set(chatId, {
                                ...existing,
                                photoId,
                                caption: msg.caption || existing.caption,
                                timestamp: Date.now()
                            });
                            console.log(`[TelegramBot] Photo context saved for chat ${chatId}`);
                        }
                        return;
                    }

                    // Handle Text context (for metadata hashtags sent as separate messages)
                    if (msg.text && (msg.text.includes('#artist') || msg.text.includes('#album'))) {
                        if (this.isAuthorized(ctx)) {
                            const existing = this.recentContext.get(chatId) || { timestamp: 0 };
                            this.recentContext.set(chatId, {
                                ...existing,
                                caption: msg.text,
                                timestamp: Date.now()
                            });
                            console.log(`[TelegramBot] Text metadata context saved for chat ${chatId}`);
                        }
                        return;
                    }

                    // Handle Audio files
                    if (msg.audio) {
                        await this.handleAudio(ctx, msg.audio);
                    } else if (msg.document) {
                        const doc = msg.document;
                        if (doc.mime_type?.startsWith('audio/') || 
                            ['.mp3', '.flac', '.wav', '.ogg', '.m4a'].some((ext: string) => doc.file_name?.toLowerCase().endsWith(ext))) {
                            await this.handleAudio(ctx, doc);
                        }
                    }
                } catch (err) {
                    console.error('[TelegramBot] Error in update loop:', err);
                }
            };

            // 3. Register handlers
            this.bot.on('message', handleUpdate);
            this.bot.on('channel_post', handleUpdate);

            this.bot.action('next_radio', async (ctx) => {
                try {
                    await ctx.answerCbQuery();
                    await this.sendRandomTrack(ctx);
                } catch (err) {
                    console.error('[TelegramBot] Radio action error:', err);
                }
            });

            // Playlist View Action
            this.bot.action(/^pl_view_(\d+)$/, async (ctx) => {
                try {
                    await ctx.answerCbQuery();
                    const playlistId = parseInt(ctx.match[1]);
                    const tracks = this.database.getPlaylistTracks(playlistId);
                    
                    if (tracks.length === 0) return ctx.editMessageText("This playlist is empty.");

                    const buttons = tracks.slice(0, 10).map(t => ([{
                        text: `🎵 ${t.artist_name || 'Unknown'} - ${t.title}`,
                        callback_data: `pl_play_${t.id}`
                    }]));

                    if (tracks.length > 10) {
                        buttons.push([{ text: `... and ${tracks.length - 10} more (view in app)`, callback_data: 'noop' }]);
                    }

                    buttons.push([{ text: '🔙 Back to Playlists', callback_data: 'pl_list' }]);

                    await ctx.editMessageText(`📂 Playlist Tracks (Total: ${tracks.length}):`, {
                        reply_markup: { inline_keyboard: buttons }
                    });
                } catch (err) {
                    console.error('[TelegramBot] Playlist view error:', err);
                }
            });

            // Playlist Back Action
            this.bot.action('pl_list', async (ctx) => {
                try {
                    await ctx.answerCbQuery();
                    const playlists = this.database.getPlaylists();
                    const buttons = playlists.map(p => ([{
                        text: `📂 ${p.name}`,
                        callback_data: `pl_view_${p.id}`
                    }]));
                    await ctx.editMessageText("📚 Your Playlists:", {
                        reply_markup: { inline_keyboard: buttons }
                    });
                } catch (err) {
                    console.error('[TelegramBot] Playlist list error:', err);
                }
            });

            // Play Track Action (from Playlist or Search)
            this.bot.action(/^pl_play_(\d+)$/, async (ctx) => {
                try {
                    await ctx.answerCbQuery("Sending track...");
                    const trackId = parseInt(ctx.match[1]);
                    const track = this.database.getTrack(trackId);
                    if (track) {
                        await this.sendTrack(ctx, track);
                    }
                } catch (err) {
                    console.error('[TelegramBot] Play action error:', err);
                }
            });

            this.isRunning = true;
            this.bot.launch().catch(err => {
                console.error('[TelegramBot] Background launch error:', err);
            });
            console.log('✅ Telegram Bot started');
            
        } catch (err) {
            console.error('[TelegramBot] Failed to start:', err);
        }
    }

    async stop() {
        if (!this.bot) return;
        try {
            this.bot.stop('SIGTERM');
            console.log('[TelegramBot] Stopped');
        } catch (e) {
            console.error('[TelegramBot] Error stopping bot:', e);
        }
        this.isRunning = false;
        this.bot = undefined;
    }

    async restart() {
        console.log('[TelegramBot] Restarting with new settings...');
        await this.stop();
        await this.start();
    }

    async isActive(): Promise<boolean> {
        return this.isRunning;
    }

    private isAuthorized(ctx: any): boolean {
        const chatId = ctx.chat?.id?.toString();
        const chatType = ctx.chat?.type; // 'private', 'group', 'supergroup', 'channel'
        const senderId = ctx.from?.id?.toString();
        
        const allowedChannelsSetting = this.database.getSetting('telegram_allowed_channels');
        if (!allowedChannelsSetting) return true; // If no whitelist configured, allow all
        
        const allowed = allowedChannelsSetting.split(',').map(s => s.trim());
        const masterId = this.getMasterId();
        
        if (masterId && senderId === masterId) return true;

        if (chatType === 'channel') {
            // In a channel, if the channel itself is whitelisted, we allow commands
            return allowed.includes(chatId);
        } else if (chatType === 'private') {
            return !!(senderId && allowed.includes(senderId));
        } else if (chatType === 'group' || chatType === 'supergroup') {
            // If the chat itself is whitelisted (e.g. linked group), allow anyone in the group
            if (allowed.includes(chatId)) return true;
            // Otherwise, check if the sender is whitelisted
            return !!(senderId && allowed.includes(senderId));
        }
        
        return false;
    }

    private async handleAudio(ctx: any, audio: any) {
        if (!this.isAuthorized(ctx)) {
            const chatType = ctx.chat?.type;
            if (chatType !== 'group' && chatType !== 'supergroup') {
                console.warn(`[TelegramBot] Unauthorized ${chatType} message from chat ${ctx.chat.id}`);
            }
            return;
        }

        // Check for file size limit (20MB for standard Bot API)
        const masterId = this.getMasterId();
        const isMaster = masterId && ctx.from?.id?.toString() === masterId;

        if (!isMaster && audio.file_size && audio.file_size > 20 * 1024 * 1024) {
            const fileName = audio.file_name || audio.title || 'audio file';
            const sizeMB = (audio.file_size / (1024 * 1024)).toFixed(1);
            console.warn(`[TelegramBot] File ${fileName} is too big (${sizeMB}MB)`);
            await this.safeReply(ctx, `⚠️ "${fileName}" is too large (${sizeMB}MB).\n\nTelegram Bots are limited to 20MB per file by the default API. To import larger files, please use the web interface or a local scanner.`);
            return;
        }

        const chatId = ctx.chat.id.toString();
        
        try {
            // Check for recent context (photo/caption/text)
            let suggestedCoverPath: string | undefined;
            let metadataHints: any = {};
            const context = this.recentContext.get(chatId);
            
            // Get caption from current message or recent context
            const msg = ctx.message || ctx.channelPost;
            const currentCaption = msg?.caption || '';
            const contextCaption = (context && (Date.now() - context.timestamp < 60 * 60 * 1000)) ? (context.caption || '') : '';
            
            // Combine captions for parsing (current message takes precedence if we parse sequentially)
            const caption = (currentCaption + '\n' + contextCaption).trim();
            
            if (caption) {
                metadataHints = await this.metadataParser.parse(caption);
            }

            if (context?.photoId) {
                try {
                    const photoLink = await ctx.telegram.getFileLink(context.photoId);
                    const importDir = path.join(this.musicDir, 'imports', 'telegram');
                    await fs.ensureDir(importDir);
                    const coverPath = path.join(importDir, `cover_${context.photoId}.jpg`);
                    
                    const photoResponse = await axios({ url: photoLink.href, responseType: 'stream', method: 'GET' });
                    const photoWriter = fs.createWriteStream(coverPath);
                    photoResponse.data.pipe(photoWriter);
                    await new Promise<void>((resolve, reject) => {
                        photoWriter.on('finish', () => resolve());
                        photoWriter.on('error', (err) => reject(err));
                    });
                    suggestedCoverPath = coverPath;
                } catch (e) {
                    console.error('[TelegramBot] Failed to download cover:', e);
                }
            }

            let fileLink;
            try {
                fileLink = await ctx.telegram.getFileLink(audio.file_id);
            } catch (getFileErr: any) {
                if (getFileErr.message?.includes('file is too big') || getFileErr.response?.error_code === 400) {
                    console.warn(`[TelegramBot] Telegram refused to provide link for ${audio.file_name || 'file'}: File too big.`);
                    return await this.safeReply(ctx, `⚠️ Telegram Bot API cannot download files larger than 20MB. Please upload via the web interface.`);
                }
                throw getFileErr;
            }

            const fileName = audio.file_name || `${audio.file_unique_id}.mp3`;
            const importDir = path.join(this.musicDir, 'imports', 'telegram');
            await fs.ensureDir(importDir);

            const filePath = path.join(importDir, fileName);
            const isVerbose = this.database.getSetting('telegram_debug') === 'true'; // Default to quiet if not explicitly 'true'

            if (isVerbose) {
                await this.safeReply(ctx, `📥 Downloading ${fileName}...`);
            }
            
            const response = await axios({ 
                url: fileLink.href, 
                method: 'GET', 
                responseType: 'stream',
                timeout: 60000 // 60s timeout for download start
            });
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', (err) => reject(err));
            });

            if (isVerbose) {
                await this.safeReply(ctx, `⚙️ Processing ${fileName}...`);
            }
            const primaryAdminId = this.database.getPrimaryAdminId();
            const result = await this.scanner.processAudioFile(filePath, this.musicDir, undefined, primaryAdminId || undefined, undefined, suggestedCoverPath, metadataHints);

            if (result?.success) {
                if (result.trackId) {
                    const allAdmins = this.database.getAdmins();
                    const track = this.database.getTrack(result.trackId);
                    for (const admin of allAdmins) {
                        this.database.addTrackOwner(result.trackId, admin.id);
                        if (track?.album_id) {
                            this.database.addAlbumOwner(track.album_id, admin.id);
                        }
                    }
                }
                await this.safeReply(ctx, `✅ UPLOADED TO TUNECAMP!\n\n${result.message}`);
            } else {
                await this.safeReply(ctx, `❌ Import failed: ${result?.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('[TelegramBot] Error handling audio:', err);
            await this.safeReply(ctx, '❌ Error processing audio file. Please check server logs.');
        }
    }

    private async sendTrack(ctx: any, track: any) {
        let fullPath = track.file_path;
        if (fullPath && !path.isAbsolute(fullPath)) {
            fullPath = path.join(this.musicDir, fullPath);
        }

        if (!fullPath || !fs.existsSync(fullPath)) {
            console.warn(`[TelegramBot] File not found for track ${track.id}: ${fullPath}`);
            return false;
        }

        try {
            const extra: any = {
                title: track.title,
                performer: track.artist_name || 'Unknown Artist',
                caption: `🎵 ${track.title} - ${track.artist_name || 'Unknown'}`
            };

            // Try to find a cover
            if (track.album_cover && fs.existsSync(track.album_cover)) {
                extra.thumb = { source: track.album_cover };
            } else if (track.album_id) {
                const album = this.database.getAlbum(track.album_id);
                if (album?.cover_path) {
                    const fullCoverPath = path.isAbsolute(album.cover_path) ? album.cover_path : path.join(this.musicDir, album.cover_path);
                    if (fs.existsSync(fullCoverPath)) {
                        extra.thumb = { source: fullCoverPath };
                    }
                }
            }

            await ctx.replyWithAudio({ source: fullPath }, extra);
            return true;
        } catch (err: any) {
            console.error(`[TelegramBot] Failed to send audio for track ${track.id}:`, err.message);
            return false;
        }
    }

    private async sendRandomTrack(ctx: any) {
        try {
            const tracks = this.database.getRandomTracks(1);
            if (tracks.length === 0) return this.safeReply(ctx, "📭 Library is empty.");

            const track = tracks[0];
            let fullPath = track.file_path;
            if (fullPath && !path.isAbsolute(fullPath)) {
                fullPath = path.join(this.musicDir, fullPath);
            }

            if (!fullPath || !fs.existsSync(fullPath)) {
                return this.safeReply(ctx, "⚠️ File not found. Try another one.");
            }

            const extra: any = {
                title: track.title,
                performer: track.artist_name || 'Unknown Artist',
                caption: `📻 Radio Mode: ${track.artist_name || 'Unknown'} - ${track.title}`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⏭ Prossimo / Next', callback_data: 'next_radio' }]
                    ]
                }
            };

            if (track.album_id) {
                const album = this.database.getAlbum(track.album_id);
                if (album?.cover_path && fs.existsSync(album.cover_path)) {
                    extra.thumb = { source: album.cover_path };
                }
            }

            await ctx.replyWithAudio({ source: fullPath }, extra);
        } catch (err: any) {
            console.error(`[TelegramBot] Failed to send radio track: ${err.message}`);
            await this.safeReply(ctx, "❌ Error fetching radio track.");
        }
    }
}
