import type { Database as DatabaseType } from "better-sqlite3";
import type { IntegrationManager, StorageAccount, Torrent } from "../database.types.js";

export function createIntegrationManager(db: DatabaseType): IntegrationManager {
    return {
        // Storage
        getStorageAccounts: (uid?: number) => (uid ? db.prepare("SELECT * FROM storage_accounts WHERE user_id = ?").all(uid) : db.prepare("SELECT * FROM storage_accounts").all()) as StorageAccount[],
        getStorageAccount: (id: number) => db.prepare("SELECT * FROM storage_accounts WHERE id = ?").get(id) as StorageAccount | undefined,
        getStorageAccountByProvider: (uid: number, p: string) => db.prepare("SELECT * FROM storage_accounts WHERE user_id = ? AND provider = ?").get(uid, p) as StorageAccount | undefined,
        createStorageAccount: (a: any) => Number(db.prepare("INSERT INTO storage_accounts (user_id, provider, account_email, access_token, refresh_token, expiry_date) VALUES (?, ?, ?, ?, ?, ?)").run(a.user_id, a.provider, a.account_email, a.access_token, a.refresh_token, a.expiry_date).lastInsertRowid),
        updateStorageAccount: (id: number, a: any) => {
            const allowed = new Set(["user_id", "provider", "account_email", "access_token", "refresh_token", "expiry_date"]);
            const keys = Object.keys(a).filter(k => allowed.has(k));
            if (!keys.length) return;
            const f = keys.map(k => `${k} = ?`).join(", ");
            db.prepare(`UPDATE storage_accounts SET ${f} WHERE id = ?`).run(...keys.map(k => a[k]), id);
        },
        deleteStorageAccount: (id: number) => { db.prepare("DELETE FROM storage_accounts WHERE id = ?").run(id); },
        getPrimaryAdminId: () => { const a = db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as any; return a ? a.id : null; },

        // Soulseek
        createSoulseekDownload: (d: any) => Number(db.prepare("INSERT INTO soulseek_downloads (user_id, file_path, filename, status) VALUES (?, ?, ?, ?)").run(d.user_id, d.file_path, d.filename, d.status).lastInsertRowid),
        updateSoulseekDownloadProgress: (id: number, p: number, s?: string, fp?: string) => { db.prepare("UPDATE soulseek_downloads SET progress = ?, status = COALESCE(?, status), file_path = COALESCE(?, file_path) WHERE id = ?").run(p, s || null, fp || null, id); },
        getSoulseekDownloads: (uid?: number) => uid ? db.prepare("SELECT * FROM soulseek_downloads WHERE user_id = ?").all(uid) as any[] : db.prepare("SELECT * FROM soulseek_downloads").all() as any[],
        getSoulseekDownload: (id: number) => db.prepare("SELECT * FROM soulseek_downloads WHERE id = ?").get(id) as any,
        getUserSoulseekCredentials: (uid: number) => db.prepare("SELECT slsk_username as username, slsk_password as password_encrypted FROM admin WHERE id = ?").get(uid) as any,
        updateUserSoulseekCredentials: (uid: number, u?: string, p?: string) => { db.prepare("UPDATE admin SET slsk_username = COALESCE(?, slsk_username), slsk_password = COALESCE(?, slsk_password) WHERE id = ?").run(u || null, p || null, uid); },
        clearFailedSoulseekDownloads: (uid: number) => { db.prepare("DELETE FROM soulseek_downloads WHERE user_id = ? AND status = 'failed'").run(uid); },
        deleteSoulseekDownload: (id: number) => { db.prepare("DELETE FROM soulseek_downloads WHERE id = ?").run(id); },

        // Torrents
        getTorrents: () => db.prepare("SELECT * FROM torrents").all() as Torrent[],
        getTorrent: (h: string) => db.prepare("SELECT * FROM torrents WHERE info_hash = ? COLLATE NOCASE").get(h.toLowerCase()) as Torrent | undefined,
        getTorrentsStatus: () => [], 
        createTorrent: (t: any) => {
            db.prepare(`
                INSERT INTO torrents (info_hash, magnet_uri, status, owner_id, name, artist, path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(info_hash) DO UPDATE SET
                    magnet_uri = excluded.magnet_uri,
                    status = excluded.status,
                    owner_id = COALESCE(excluded.owner_id, owner_id),
                    name = COALESCE(excluded.name, name),
                    artist = COALESCE(excluded.artist, artist),
                    path = COALESCE(excluded.path, path)
            `).run(
                t.info_hash.toLowerCase(),
                t.magnet_uri,
                t.status || 'metadata',
                t.owner_id ?? null,
                t.name ?? null,
                t.artist ?? null,
                t.path ?? null
            );
        },
        updateTorrentProgress: (ih: string, p: number, s: any, ds: number, us: number, np: number, sz: number, path: string | null) => { db.prepare("UPDATE torrents SET progress = ?, status = ?, download_speed = ?, upload_speed = ?, num_peers = ?, size = ?, path = ? WHERE info_hash = ? COLLATE NOCASE").run(p, s, ds, us, np, sz, path, ih.toLowerCase()); },
        updateTorrentStatus: (ih: string, s: any) => { db.prepare("UPDATE torrents SET status = ? WHERE info_hash = ? COLLATE NOCASE").run(s, ih.toLowerCase()); },
        deleteTorrent: (h: string) => { db.prepare("DELETE FROM torrents WHERE info_hash = ? COLLATE NOCASE").run(h.toLowerCase()); },

        // Unlock Codes
        createUnlockCode: (c: string, rid?: number, tid?: number, tx?: string, aid?: number, uid?: number) => { db.prepare("INSERT INTO unlock_codes (code, release_id, track_id, tx_hash, asset_id, user_id) VALUES (?, ?, ?, ?, ?, ?)").run(c, rid || null, tid || null, tx || null, aid || null, uid || null); },
        validateUnlockCode: (c: string) => { const r = db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(c) as any; return r ? { valid: true, releaseId: r.release_id, trackId: r.track_id, assetId: r.asset_id, isUsed: !!r.is_used } : { valid: false, isUsed: false }; },
        redeemUnlockCode: (c: string) => { db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?").run(c); },
        listUnlockCodes: (rid?: number) => rid ? db.prepare("SELECT * FROM unlock_codes WHERE release_id = ?").all(rid) : db.prepare("SELECT * FROM unlock_codes").all(),
        getPurchasesByUser: (uid: number) => db.prepare(`SELECT uc.code, uc.created_at, uc.release_id, uc.track_id, uc.asset_id, al.title as release_title, al.cover_path, ar.name as artist_name, t.title as track_title, t.file_path FROM unlock_codes uc LEFT JOIN albums al ON uc.release_id = al.id LEFT JOIN artists ar ON al.artist_id = ar.id LEFT JOIN tracks t ON uc.track_id = t.id WHERE uc.user_id = ? ORDER BY uc.created_at DESC`).all(uid) as any[],
        getUnlockCodeByTxHash: (tx: string) => db.prepare("SELECT * FROM unlock_codes WHERE tx_hash = ?").get(tx),

        // Assets
        getPublicAssets: () => db.prepare("SELECT a.*, ar.name as artist_name FROM assets a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.visibility = 'public' ORDER BY a.created_at DESC").all() as any[],
        getAssetsByArtist: (artistId: number) => db.prepare("SELECT a.*, ar.name as artist_name FROM assets a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.artist_id = ? ORDER BY a.created_at DESC").all(artistId) as any[],
        getAllAssets: () => db.prepare("SELECT a.*, ar.name as artist_name FROM assets a LEFT JOIN artists ar ON a.artist_id = ar.id ORDER BY a.created_at DESC").all() as any[],
        getAsset: (id: number) => db.prepare("SELECT a.*, ar.name as artist_name FROM assets a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.id = ?").get(id) as any,
        getAssetBySlug: (slug: string) => db.prepare("SELECT a.*, ar.name as artist_name FROM assets a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.slug = ?").get(slug) as any,
        createAsset(data: any): number {
            const slug = (data.title as string).slice(0, 24).toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).substring(2, 7);
            return Number(db.prepare("INSERT INTO assets (title, slug, description, artist_id, owner_id, type, file_path, mime_type, file_size, cover_path, price, price_usdc, currency, visibility, requires_subscription) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .run(data.title, slug, data.description || null, data.artist_id || null, data.owner_id || null, data.type || 'digital', data.file_path || null, data.mime_type || null, data.file_size || null, data.cover_path || null, data.price || 0, data.price_usdc || 0, data.currency || 'ETH', data.visibility || 'public', data.requires_subscription ? 1 : 0)
                .lastInsertRowid);
        },
        updateAsset(id: number, data: any): void {
            const fields: string[] = [];
            const params: any[] = [];
            if (data.title !== undefined) { fields.push("title = ?"); params.push(data.title); }
            if (data.description !== undefined) { fields.push("description = ?"); params.push(data.description); }
            if (data.artist_id !== undefined) { fields.push("artist_id = ?"); params.push(data.artist_id); }
            if (data.type !== undefined) { fields.push("type = ?"); params.push(data.type); }
            if (data.file_path !== undefined) { fields.push("file_path = ?"); params.push(data.file_path); }
            if (data.mime_type !== undefined) { fields.push("mime_type = ?"); params.push(data.mime_type); }
            if (data.file_size !== undefined) { fields.push("file_size = ?"); params.push(data.file_size); }
            if (data.cover_path !== undefined) { fields.push("cover_path = ?"); params.push(data.cover_path); }
            if (data.price !== undefined) { fields.push("price = ?"); params.push(data.price); }
            if (data.price_usdc !== undefined) { fields.push("price_usdc = ?"); params.push(data.price_usdc); }
            if (data.currency !== undefined) { fields.push("currency = ?"); params.push(data.currency); }
            if (data.visibility !== undefined) { fields.push("visibility = ?"); params.push(data.visibility); }
            if (data.requires_subscription !== undefined) { fields.push("requires_subscription = ?"); params.push(data.requires_subscription ? 1 : 0); }
            if (!fields.length) return;
            params.push(id);
            db.prepare(`UPDATE assets SET ${fields.join(", ")} WHERE id = ?`).run(...params);
        },
        deleteAsset: (id: number) => { db.prepare("DELETE FROM assets WHERE id = ?").run(id); },
    };
}
