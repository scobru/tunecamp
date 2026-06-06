import type { Database as DatabaseType } from "better-sqlite3";
import type { IdentityManager, User } from "../database.types.js";

export function createIdentityManager(db: DatabaseType): IdentityManager {
    return {
        // Users
        getUser: (id: number) => db.prepare("SELECT * FROM admin WHERE id = ?").get(id) as User | undefined,
        getUserByUsername: (u: string) => db.prepare("SELECT * FROM admin WHERE username = ?").get(u) as User | undefined,
        getUserByArtistId: (aid: number) => db.prepare("SELECT * FROM admin WHERE artist_id = ?").get(aid) as User | undefined,
        createUser(u: string, p: string, aid?: number | null, r = "admin"): number {
            return Number(db.prepare("INSERT INTO admin (username, password_hash, artist_id, role) VALUES (?, ?, ?, ?)").run(u, p, aid || null, r).lastInsertRowid);
        },
        updateUser(id: number, data: Partial<User>): void {
            const f = Object.keys(data).map(k => `${k} = ?`).join(", ");
            db.prepare(`UPDATE admin SET ${f} WHERE id = ?`).run(...Object.values(data), id);
        },
        getAllUsers: () => db.prepare("SELECT * FROM admin").all() as User[],
        deleteUser: (id: number) => { db.prepare("DELETE FROM admin WHERE id = ?").run(id); },
        getAdmins: () => db.prepare("SELECT * FROM admin WHERE role IN ('admin', 'super_user', 'root_admin')").all() as User[],
        syncZenUser(pub: string, epub: string, alias: string, avatar?: string): void {
            db.prepare(`
                INSERT INTO gun_users (pub, epub, alias, avatar) VALUES (?, ?, ?, ?)
                ON CONFLICT(pub) DO UPDATE SET
                    epub = excluded.epub,
                    alias = excluded.alias,
                    avatar = COALESCE(excluded.avatar, gun_users.avatar)
            `).run(pub, epub, alias, avatar || null);
        },
        getZenUser: (pub: string) => db.prepare("SELECT * FROM gun_users WHERE pub = ?").get(pub) as any,
        updateSubscription(userId: number, status: string, expiresAt: string): void {
            db.prepare("UPDATE admin SET subscription_status = ?, subscription_expires_at = ? WHERE id = ?").run(status, expiresAt, userId);
        },
        getUserSubscription(userId: number): { status: string, expiresAt: string | null } {
            const row = db.prepare("SELECT subscription_status, subscription_expires_at FROM admin WHERE id = ?").get(userId) as any;
            return {
                status: row ? row.subscription_status : "none",
                expiresAt: row ? row.subscription_expires_at : null
            };
        },

        // Auth
        createOAuthClient(c: any): void { db.prepare("INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri) VALUES (?, ?, ?, ?)").run(c.instance_url, c.client_id, c.client_secret, c.redirect_uri); },
        getOAuthClient: (url: string) => db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(url) as any,
        saveOAuthLink(p: string, s: string, pub: string, priv: string): void { db.prepare("INSERT OR REPLACE INTO oauth_links (provider, subject, gun_pub, gun_priv) VALUES (?, ?, ?, ?)").run(p, s, pub, priv); },
        getOAuthLink: (p: string, s: string) => db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(p, s) as any,

        // Settings
        getSetting: (k: string) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as any)?.value,
        setSetting: (k: string, v: string) => { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(k, v); },
        getAllSettings(): { [key: string]: string } {
            const rows = db.prepare("SELECT key, value FROM settings").all() as any[];
            const settings: { [key: string]: string } = {};
            for (const r of rows) {
                settings[r.key] = r.value;
            }
            return settings;
        },

        // Plugins
        getPluginState: (id: string) => { const r = db.prepare("SELECT enabled, config FROM system_plugins WHERE id = ?").get(id) as any; return r ? { enabled: !!r.enabled, config: r.config } : undefined; },
        setPluginEnabled: (id: string, e: boolean) => { db.prepare("INSERT OR REPLACE INTO system_plugins (id, enabled) VALUES (?, ?)").run(id, e ? 1 : 0); },
        setPluginConfig(id: string, config: string) { db.prepare("UPDATE system_plugins SET config = ? WHERE id = ?").run(config, id); },
        getAllPluginsState: () => db.prepare("SELECT * FROM system_plugins").all(),
    };
}
