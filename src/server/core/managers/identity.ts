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

        // Phase 4: ActivityPub user keys
        updateUserApKeys(userId: number, pubKey: string, privKey: string): void {
            db.prepare("UPDATE admin SET ap_public_key = ?, ap_private_key = ? WHERE id = ?")
              .run(pubKey, privKey, userId);
        },

        // FID Registry - Cross-instance artist linking
        getFidRegistry(userId: number) {
            return db.prepare("SELECT * FROM fid_registry WHERE user_id = ?").all(userId) as any[];
        },
        getFidRegistryByInstance(userId: number, instanceDomain: string) {
            return db.prepare("SELECT * FROM fid_registry WHERE user_id = ? AND instance_domain = ?").get(userId, instanceDomain) as any | undefined;
        },
        addFidRegistryEntry(entry: {
            userId: number;
            instanceDomain: string;
            artistId?: number | null;
            artistName?: string | null;
            artistSlug?: string | null;
            publicKey?: string | null;
            passportSignature?: string | null;
        }): number {
            return Number(db.prepare(`
                INSERT INTO fid_registry (user_id, instance_domain, artist_id, artist_name, artist_slug, public_key, passport_signature)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                entry.userId,
                entry.instanceDomain,
                entry.artistId || null,
                entry.artistName || null,
                entry.artistSlug || null,
                entry.publicKey || null,
                entry.passportSignature || null
            ).lastInsertRowid);
        },
        updateFidRegistryEntry(id: number, data: {
            artistId?: number | null;
            artistName?: string | null;
            artistSlug?: string | null;
            publicKey?: string | null;
            passportSignature?: string | null;
            verified?: number;
        }): void {
            const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
            const values = Object.values(data);
            if (fields.length === 0) return;
            db.prepare(`UPDATE fid_registry SET ${fields} WHERE id = ?`).run(...values, id);
        },
        deleteFidRegistryEntry(id: number): void {
            db.prepare("DELETE FROM fid_registry WHERE id = ?").run(id);
        },
        verifyFidRegistryEntry(id: number): void {
            db.prepare("UPDATE fid_registry SET verified = 1 WHERE id = ?").run(id);
        },

        // FID WebAuthn SSO - trust-on-first-use credentialId -> public key binding
        getFidWebauthnKey(credentialId: string): string | undefined {
            return (db.prepare("SELECT public_key_pem FROM fid_webauthn_credentials WHERE credential_id = ?").get(credentialId) as any)?.public_key_pem;
        },
        registerFidWebauthnKey(credentialId: string, publicKeyPem: string): void {
            db.prepare("INSERT OR IGNORE INTO fid_webauthn_credentials (credential_id, public_key_pem) VALUES (?, ?)").run(credentialId, publicKeyPem);
        },
    };
}
