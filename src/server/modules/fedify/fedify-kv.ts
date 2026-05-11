import type { KvKey, KvStore, KvStoreSetOptions } from "@fedify/fedify";
import type { Database } from "better-sqlite3";

/**
 * A KvStore implementation backed by better-sqlite3.
 * Stores values as JSON strings in a 'fedify_kv' table.
 */
export class BetterSqliteKvStore implements KvStore {
    private db: Database;
    private tableName: string;

    constructor(db: Database, tableName = "fedify_kv") {
        this.db = db;
        this.tableName = tableName;
        this.init();
    }

    private init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                key TEXT PRIMARY KEY,
                value TEXT,
                expires_at INTEGER
            )
        `);
    }

    private serializeKey(key: KvKey): string {
        // Fedify keys are arrays of strings/numbers. Join them with a separator.
        // We use a null character or similar as separator to avoid collisions,
        // or just standard colon defined by us if simple.
        // Fedify standard conventions often suggest joining.
        // Let's use JSON.stringify to be safe and unique for any key structure.
        return JSON.stringify(key);
    }

    async get<T = unknown>(key: KvKey): Promise<T | undefined> {
        const keyStr = this.serializeKey(key);
        const now = Date.now();

        // Clean up expired (lazy expiration)
        const row = this.db.prepare(`SELECT value, expires_at FROM ${this.tableName} WHERE key = ?`).get(keyStr) as { value: string; expires_at: number } | undefined;

        if (!row) return undefined;

        if (row.expires_at && row.expires_at < now) {
            this.delete(key);
            return undefined;
        }

        try {
            return JSON.parse(row.value) as T;
        } catch {
            return undefined;
        }
    }

    async set(key: KvKey, value: unknown, options?: KvStoreSetOptions): Promise<void> {
        const keyStr = this.serializeKey(key);
        const valStr = JSON.stringify(value);
        let expiresAt: number | null = null;

        if (options?.ttl) {
            expiresAt = Date.now() + options.ttl.total("millisecond");
        }

        this.db.prepare(`
            INSERT INTO ${this.tableName} (key, value, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            expires_at = excluded.expires_at
        `).run(keyStr, valStr, expiresAt);
    }

    async delete(key: KvKey): Promise<void> {
        const keyStr = this.serializeKey(key);
        this.db.prepare(`DELETE FROM ${this.tableName} WHERE key = ?`).run(keyStr);
    }
}
