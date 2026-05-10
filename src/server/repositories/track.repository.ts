import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Track } from "../database.types.js";

export class TrackRepository extends BaseRepository {
    private getTrackStmt: Statement;
    private getAllTracksStmt: Statement;
    private getAllPublicTracksStmt: Statement;
    private getTracksByAlbumStmt: Statement;
    private getPublicTracksByAlbumStmt: Statement;

    constructor(db: DatabaseType) {
        super(db);
        
        const baseSelect = `
            SELECT t.*, a.title as album_title, a.album_artist, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            ar_t.id as artist_id,
            COALESCE(ar_t.name, t.artist_name, a.album_artist, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id,
            own.username as owner_name
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
           LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
           LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
        `;

        this.getTrackStmt = this.db.prepare(`${baseSelect} WHERE t.id = ?`);
        
        this.getAllTracksStmt = this.db.prepare(`
            ${baseSelect}
            ORDER BY artist_name, a.title, t.track_num
        `);

        this.getAllPublicTracksStmt = this.db.prepare(`
            ${baseSelect}
            WHERE (a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released')
               OR EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.visibility IN ('public', 'unlisted') AND r.status = 'released')
            ORDER BY artist_name, a.title, t.track_num
        `);

        this.getTracksByAlbumStmt = this.db.prepare(`
            ${baseSelect}
            WHERE t.album_id = ? ORDER BY t.track_num
        `);

        this.getPublicTracksByAlbumStmt = this.db.prepare(`
            ${baseSelect}
            WHERE t.album_id = ? AND (
                (a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released')
                OR EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.visibility IN ('public', 'unlisted') AND r.status = 'released')
            )
            ORDER BY t.track_num
        `);
    }

    getByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined {
        const row = this.db.prepare("SELECT * FROM tracks WHERE LOWER(title) = LOWER(?) AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL)) AND (album_id = ? OR (album_id IS NULL AND ? IS NULL))").get(title, artistId, artistId, albumId, albumId);
        return this.mapTrack(row);
    }

    protected mapTrack(row: any): Track {
        if (!row) return row;
        return {
            ...row,
            currency: row.currency || 'ETH',
            price: row.price || 0,
            price_usdc: row.price_usdc || 0,
            price_usdt: row.price_usdt || 0,
        } as Track;
    }

    getById(id: number): Track | undefined {
        const row = this.getTrackStmt.get(id);
        if (row) return this.mapTrack(row);

        // Fallback: Check release_tracks for release-only tracks
        const releaseTrackRow = this.db.prepare(`
            SELECT 
                rt.id,
                rt.title,
                rt.artist_name,
                rt.track_num,
                rt.duration,
                rt.file_path,
                rt.price,
                rt.price_usdc,
                rt.currency,
                r.title as album_title,
                r.album_artist,
                r.id as album_id,
                ar.name as artist_name,
                ar.id as artist_id
            FROM release_tracks rt
            JOIN releases r ON rt.release_id = r.id
            LEFT JOIN artists ar ON r.artist_id = ar.id
            WHERE rt.id = ? OR rt.track_id = ?
            LIMIT 1
        `).get(id, id);

        return releaseTrackRow ? this.mapTrack(releaseTrackRow) : undefined;
    }

    getByIds(ids: number[]): Track[] {
        if (ids.length === 0) return [];
        const CHUNK_SIZE = 900;
        const results: Track[] = [];

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            const rows = this.db.prepare(`
                SELECT t.*, a.title as album_title, a.album_artist, a.download as album_download, a.visibility as album_visibility, a.price as album_price,
                COALESCE(ar_t.id, ar_a.id) as artist_id,
                COALESCE(ar_t.name, ar_a.name, t.artist_name) as artist_name,
                COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
                COALESCE(t.owner_id, a.owner_id) as owner_id,
                own.username as owner_name
               FROM tracks t
               LEFT JOIN albums a ON t.album_id = a.id
               LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
               LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
               LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
               WHERE t.id IN (${placeholders})
            `).all(...chunk);
            results.push(...rows.map(row => this.mapTrack(row)));
        }
        return results;
    }

    getAll(publicOnly = false, limit?: number, offset?: number): Track[] {
        let sql = publicOnly ? this.getAllPublicTracksStmt.source : this.getAllTracksStmt.source;
        
        if (limit !== undefined) {
            sql += ` LIMIT ${Number(limit)}`;
            if (offset !== undefined) {
                sql += ` OFFSET ${Number(offset)}`;
            }
        } else {
            // Safety default limit to prevent OOM on massive libraries
            sql += " LIMIT 5000";
        }

        const rows = this.db.prepare(sql).all();
        return rows.map(row => this.mapTrack(row));
    }

    getByAlbumId(albumId: number, publicOnly = false): Track[] {
        const stmt = publicOnly ? this.getPublicTracksByAlbumStmt : this.getTracksByAlbumStmt;
        const rows = stmt.all(albumId);
        return rows.map(row => this.mapTrack(row));
    }

    getByArtist(artistId: number, publicOnly = false, artistName?: string): Track[] {
        const baseSelect = `
            SELECT t.*, a.title as album_title, a.album_artist, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            COALESCE(ar_t.id, ar_a.id) as artist_id,
            COALESCE(ar_t.name, t.artist_name, a.album_artist, ar_a.name, 'Unknown Artist') as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id,
            own.username as owner_name
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
            LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
        `;

        const condition = artistName 
            ? `(t.artist_id = ? OR ar_t.name = ? OR t.artist_name = ? OR t.artist_name LIKE ? OR (t.artist_id IS NULL AND (a.artist_id = ? OR ar_a.name = ?)))`
            : `(t.artist_id = ? OR (t.artist_id IS NULL AND a.artist_id = ?))`;

        const publicCondition = `
            AND (
                (a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released')
                OR EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.visibility IN ('public', 'unlisted') AND r.status = 'released')
                OR (t.album_id IS NULL)
            )
        `;


        const sql = publicOnly 
            ? `${baseSelect} WHERE ${condition} ${publicCondition} ORDER BY a.title, t.track_num`
            : `${baseSelect} WHERE ${condition} ORDER BY a.title, t.track_num`;
        
        const params: (number | string)[] = [artistId];
        if (artistName) {
            params.push(artistName);
            params.push(artistName);
            params.push(`%${artistName}%`);
            params.push(artistId);
            params.push(artistName);
        } else {
            params.push(artistId);
        }

        const rows = this.db.prepare(sql).all(...params);
        return rows.map(row => this.mapTrack(row));
    }

    getByOwner(ownerId: number, publicOnly = false): Track[] {
        const baseSelect = `
            SELECT t.*, a.title as album_title, a.album_artist, a.download as album_download, a.visibility as album_visibility, a.price as album_price, 
            COALESCE(ar_t.id, ar_a.id) as artist_id, 
            COALESCE(ar_t.name, ar_a.name) as artist_name, 
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress, 
            COALESCE(t.owner_id, a.owner_id) as owner_id, 
            own.username as owner_name
            FROM tracks t 
            LEFT JOIN albums a ON t.album_id = a.id 
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id 
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id 
            LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
        `;

        const condition = `
            (t.owner_id = ? 
             OR (t.owner_id IS NULL AND a.owner_id = ?) 
             OR EXISTS (SELECT 1 FROM track_ownership to_ WHERE to_.track_id = t.id AND to_.owner_id = ?) 
             OR EXISTS (SELECT 1 FROM album_ownership ao_ WHERE ao_.album_id = a.id AND ao_.owner_id = ?))
        `;

        const publicCondition = `AND (a.is_public = 1 OR t.album_id IS NULL)`;

        const sql = publicOnly
            ? `${baseSelect} WHERE ${condition} ${publicCondition} ORDER BY a.title, t.track_num`
            : `${baseSelect} WHERE ${condition} ORDER BY a.title, t.track_num`;

        const rows = this.db.prepare(sql).all(ownerId, ownerId, ownerId, ownerId);
        return rows.map(row => this.mapTrack(row));
    }

    getRandom(limit: number): Track[] {
        const baseSelect = `
            SELECT t.*, a.title as album_title, a.album_artist, a.download as album_download, a.visibility as album_visibility, a.price as album_price,
            COALESCE(ar_t.id, ar_a.id) as artist_id,
            COALESCE(ar_t.name, ar_a.name, t.artist_name) as artist_name,
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as walletAddress,
            COALESCE(t.owner_id, a.owner_id) as owner_id,
            COALESCE(own.username, ar_t.name, ar_a.name, t.artist_name) as owner_name
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
            LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id
        `;
        const rows = this.db.prepare(`${baseSelect} ORDER BY RANDOM() LIMIT ?`).all(limit);
        return rows.map(row => this.mapTrack(row));
    }

    getByPath(filePath: string): Track | undefined {
        const row = this.db.prepare(`
            SELECT t.*, a.title as album_title, a.album_artist, 
            COALESCE(ar_t.id, ar_a.id) as artist_id, 
            COALESCE(ar_t.name, ar_a.name) as artist_name, 
            COALESCE(t.owner_id, a.owner_id) as owner_id, 
            own.username as owner_name
            FROM tracks t 
            LEFT JOIN albums a ON t.album_id = a.id 
            LEFT JOIN artists ar_t ON t.artist_id = ar_t.id 
            LEFT JOIN artists ar_a ON a.artist_id = ar_a.id 
            LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id 
            WHERE t.file_path = ?
        `).get(filePath);
        return row ? this.mapTrack(row) : undefined;
    }

    getByHash(hash: string): Track | undefined {
        const row = this.db.prepare("SELECT * FROM tracks WHERE hash = ?").get(hash);
        return row ? this.mapTrack(row) : undefined;
    }

    create(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number {
        const result = this.db.prepare(`
            INSERT OR IGNORE INTO tracks (title, album_id, artist_id, owner_id, track_num, duration, file_path, format, bitrate, sample_rate, price, price_usdc, price_usdt, currency, lossless_path, url, service, external_artwork, lyrics, hash, external_id, fingerprint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            track.title, track.album_id, track.artist_id, track.owner_id, 
            track.track_num, track.duration, track.file_path, track.format, track.bitrate, 
            track.sample_rate, track.price || 0, track.price_usdc || 0, track.price_usdt || 0, track.currency || 'ETH', 
            track.lossless_path || null, track.url || null, track.service || null, 
            track.external_artwork || null, track.lyrics || null, track.hash || null, track.external_id || null, track.fingerprint || null
        );
        return result.lastInsertRowid as number;
    }

    update(id: number, track: Partial<Track>): void {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, value] of Object.entries(track)) {
            if (['id', 'created_at', 'album_title', 'artist_name', 'owner_name'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length === 0) return;
        values.push(id);
        this.db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

        // Side effect: sync some fields to release_tracks
        if (track.title || track.duration || track.file_path || track.price || track.currency) {
            const rtFields: string[] = [];
            const rtValues: any[] = [];
            if (track.title) { rtFields.push("title = ?"); rtValues.push(track.title); }
            if (track.duration) { rtFields.push("duration = ?"); rtValues.push(track.duration); }
            if (track.file_path) { rtFields.push("file_path = ?"); rtValues.push(track.file_path); }
            if (track.price_usdc) { rtFields.push("price_usdc = ?"); rtValues.push(track.price_usdc); }
            if (track.price_usdt) { rtFields.push("price_usdt = ?"); rtValues.push(track.price_usdt); }
            if (track.currency) { rtFields.push("currency = ?"); rtValues.push(track.currency); }
            
            if (rtFields.length > 0) {
                rtValues.push(id);
                this.db.prepare(`UPDATE release_tracks SET ${rtFields.join(', ')} WHERE track_id = ?`).run(...rtValues);
            }
        }
    }

    updateArtist(id: number, artistId: number | null, artistName: string | null): void {
        this.db.transaction(() => {
            this.db.prepare("UPDATE tracks SET artist_id = ?, artist_name = ? WHERE id = ?").run(artistId, artistName, id);
            this.db.prepare("UPDATE release_tracks SET artist_name = ? WHERE track_id = ?").run(artistName, id);
        })();
    }

    updateOwner(id: number, ownerId: number | null): void {
        this.db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, id);
    }

    updateOrder(id: number, trackNum: number): void {
        this.db.prepare("UPDATE tracks SET track_num = ? WHERE id = ?").run(trackNum, id);
    }

    updatePathsPrefix(oldPrefix: string, newPrefix: string): void {
        this.db.prepare("UPDATE tracks SET file_path = ? || SUBSTR(file_path, LENGTH(?) + 1) WHERE file_path = ? OR file_path LIKE ? || '/%'").run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
        this.db.prepare("UPDATE tracks SET lossless_path = ? || SUBSTR(lossless_path, LENGTH(?) + 1) WHERE lossless_path = ? OR lossless_path LIKE ? || '/%'").run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
    }

    merge(fromId: number, toId: number, targetFilePath: string): void {
        this.db.transaction(() => {
            try {
                this.db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) SELECT ?, owner_id FROM track_ownership WHERE track_id = ?").run(toId, fromId);
                this.db.prepare("UPDATE release_tracks SET track_id = ?, file_path = ? WHERE track_id = ?").run(toId, targetFilePath, fromId);
                this.db.prepare("UPDATE play_history SET track_id = ? WHERE track_id = ?").run(toId, fromId);
                this.db.prepare("UPDATE bookmarks SET track_id = ? WHERE track_id = ?").run(toId, String(fromId));
                this.db.prepare("UPDATE starred_items SET item_id = ? WHERE item_id = ? AND item_type = 'track'").run(String(toId), String(fromId));
                this.db.prepare("UPDATE item_ratings SET item_id = ? WHERE item_id = ? AND item_type = 'track'").run(String(toId), String(fromId));
                this.db.prepare("DELETE FROM track_ownership WHERE track_id = ?").run(fromId);
                this.db.prepare("DELETE FROM tracks WHERE id = ?").run(fromId);
            } catch (err) {
                console.error(`🚨 [TrackRepository] Merge failed during transaction (${fromId} -> ${toId}):`, err);
                throw err; // Re-throw to ensure transaction rollback
            }
        })();
    }

    getTrackOwners(id: number): number[] {
        return this.db.prepare("SELECT owner_id FROM track_ownership WHERE track_id = ?").all(id).map((r: any) => r.owner_id);
    }

    addOwner(tid: number, oid: number): void {
        this.db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) VALUES (?, ?)").run(tid, oid);
    }

    removeOwner(tid: number, oid: number): void {
        this.db.prepare("DELETE FROM track_ownership WHERE track_id = ? AND owner_id = ?").run(tid, oid);
    }

    delete(id: number, ownerId?: number): void {
        if (ownerId) {
            this.removeOwner(id, ownerId);
            if (this.getTrackOwners(id).length > 0) return;
        }
        this.db.transaction(() => {
            this.db.prepare("DELETE FROM track_ownership WHERE track_id = ?").run(id);
            this.db.prepare("DELETE FROM release_tracks WHERE track_id = ?").run(id);
            this.db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
        })();
    }

    getByReleaseId(releaseId: number): Track[] {
        const rows = this.db.prepare(`
            SELECT 
                COALESCE(rt.track_id, rt.id) as id,
                rt.id as release_track_id,
                rt.track_id as library_track_id,
                rt.release_id,
                rt.title,
                rt.artist_name,
                rt.track_num,
                rt.duration,
                rt.file_path,
                rt.price,
                rt.price_usdc,
                rt.currency,
                t.waveform, 
                t.lyrics,
                r.title as album_title, 
                r.album_artist,
                r.cover_path as album_cover_path,
                ar.wallet_address as walletAddress
            FROM release_tracks rt
            JOIN releases r ON rt.release_id = r.id
            LEFT JOIN tracks t ON rt.track_id = t.id
            LEFT JOIN artists ar ON r.artist_id = ar.id
            WHERE rt.release_id = ?
            ORDER BY rt.track_num ASC
        `).all(releaseId);
        return rows.map(row => this.mapTrack(row));
    }
}
