import { EventEmitter } from 'events';
import type { DatabaseService } from '../../core/database.js';

export interface BoardMessage {
    id: number;
    username: string;
    role: string;
    message: string;
    source: 'webapp' | 'telegram';
    telegram_message_id: number | null;
    avatar: string | null;
    deleted?: boolean;
    created_at: string;
}

export class BoardService {
    public events = new EventEmitter();

    constructor(private database: DatabaseService) {}

    getHistory(limit = 100): BoardMessage[] {
        try {
            const messages = this.database.db.prepare(`
                SELECT bm.*, COALESCE(a.avatar, gu.avatar) AS avatar
                FROM board_messages bm
                LEFT JOIN admin a ON bm.username = a.username COLLATE NOCASE
                LEFT JOIN gun_users gu ON a.gun_pub = gu.pub
                ORDER BY bm.id DESC LIMIT ?
            `).all(limit) as BoardMessage[];
            return messages.reverse();
        } catch (err) {
            console.error('[BoardService] Failed to fetch board history:', err);
            return [];
        }
    }

    getMessage(id: number): BoardMessage | null {
        try {
            return this.database.db.prepare(
                "SELECT * FROM board_messages WHERE id = ?"
            ).get(id) as BoardMessage | null;
        } catch (err) {
            console.error('[BoardService] Failed to fetch board message by ID:', err);
            return null;
        }
    }

    addMessage(
        username: string,
        role: string,
        message: string,
        source: 'webapp' | 'telegram' = 'webapp',
        telegramMessageId?: number
    ): BoardMessage | null {
        try {
            const result = this.database.db.prepare(
                "INSERT INTO board_messages (username, role, message, source, telegram_message_id) VALUES (?, ?, ?, ?, ?)"
            ).run(username, role, message, source, telegramMessageId || null);

            // Fetch the user's avatar for the SSE broadcast
            let avatar: string | null = null;
            try {
                const row = this.database.db.prepare(`
                    SELECT COALESCE(a.avatar, gu.avatar) AS avatar
                    FROM admin a
                    LEFT JOIN gun_users gu ON a.gun_pub = gu.pub
                    WHERE a.username = ? COLLATE NOCASE
                `).get(username) as { avatar: string | null } | undefined;
                avatar = row?.avatar ?? null;
            } catch { /* avatar lookup is best-effort */ }

            const insertedMsg: BoardMessage = {
                id: Number(result.lastInsertRowid),
                username,
                role,
                message,
                source,
                telegram_message_id: telegramMessageId || null,
                avatar,
                created_at: new Date().toISOString()
            };

            // Broadcast message to all active SSE streams
            this.events.emit('message', insertedMsg);

            return insertedMsg;
        } catch (err) {
            console.error('[BoardService] Failed to save board message:', err);
            return null;
        }
    }

    deleteMessage(id: number): boolean {
        try {
            const result = this.database.db.prepare(
                "DELETE FROM board_messages WHERE id = ?"
            ).run(id);

            const success = result.changes > 0;
            if (success) {
                // Broadcast deletion event to active SSE streams (sends minimal object with deleted flag)
                this.events.emit('message', { id, deleted: true });
            }
            return success;
        } catch (err) {
            console.error('[BoardService] Failed to delete board message:', err);
            return false;
        }
    }
}
