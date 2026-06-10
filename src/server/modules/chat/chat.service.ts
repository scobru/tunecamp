import { EventEmitter } from 'events';
import type { DatabaseService } from '../../core/database.js';
import type { TelegramBotService } from '../integrations/telegram-bot.js';

export interface ChatMessage {
    id: number;
    username: string;
    role: string;
    message: string;
    source: 'webapp' | 'telegram';
    telegram_message_id: number | null;
    created_at: string;
}

export class ChatService {
    public events = new EventEmitter();
    private telegramBot?: TelegramBotService;

    constructor(private database: DatabaseService) {}

    setTelegramBot(bot: TelegramBotService) {
        this.telegramBot = bot;
    }

    getHistory(limit = 100): ChatMessage[] {
        try {
            const messages = this.database.db.prepare(
                "SELECT * FROM chat_messages ORDER BY id DESC LIMIT ?"
            ).all(limit) as ChatMessage[];
            return messages.reverse();
        } catch (err) {
            console.error('[ChatService] Failed to fetch chat history:', err);
            return [];
        }
    }

    addMessage(
        username: string, 
        role: string, 
        message: string, 
        source: 'webapp' | 'telegram', 
        telegramMessageId?: number
    ): ChatMessage | null {
        try {
            const result = this.database.db.prepare(
                "INSERT INTO chat_messages (username, role, message, source, telegram_message_id) VALUES (?, ?, ?, ?, ?)"
            ).run(username, role, message, source, telegramMessageId || null);

            const insertedMsg: ChatMessage = {
                id: Number(result.lastInsertRowid),
                username,
                role,
                message,
                source,
                telegram_message_id: telegramMessageId || null,
                created_at: new Date().toISOString()
            };

            // Broadcast message to all active SSE streams
            this.events.emit('message', insertedMsg);

            // Forward to Telegram group if message originated from webapp
            if (source === 'webapp' && this.telegramBot) {
                this.telegramBot.sendWebappMessageToGroup(username, role, message).catch(err => {
                    console.error('[ChatService] Failed to forward message to Telegram:', err.message);
                });
            }

            return insertedMsg;
        } catch (err) {
            console.error('[ChatService] Failed to save chat message:', err);
            return null;
        }
    }
}
