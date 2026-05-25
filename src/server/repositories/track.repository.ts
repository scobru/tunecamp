import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Track } from "../core/database.types.js";
import { VisibilityProfile } from "../common/visibility.js";

export class TrackRepository extends BaseRepository {
    private getTrackStmt: Statement;
    private getAllTracksStmt: Statement;
    private getAllPublicTracksStmt: Statement;
    private getTracksByAlbumStmt: Statement;
    private getPublicTracksByAlbumStmt: Statement;

    // Centralized visibility SQL fragments
    public static readonly PUBLIC_CONDITION = `
        (album_status = 'released' AND album_visibility IN ('public', 'unlisted'))
        OR EXISTS (SELECT 1 FROM release_tracks rt JOIN v_releases r ON rt.release_id = r.id WHERE rt.track_id = v_tracks.id AND r.visibility IN ('public', 'unlisted') AND r.status = 'released')
        OR (album_id IS NULL AND (1=1)) -- External/Floating tracks default to public stage if not restricted
    `;

    constructor(db: DatabaseType) {
        super(db);
        
        const baseSelect = `SELECT * FROM v_tracks`;

        this.getTrackStmt = this.db.prepare(`${baseSelect} WHERE id = ?`);
        
        this.getAllTracksStmt = this.db.prepare(`
            ${baseSelect}
            ORDER BY artist_name, album_title, track_num
        `);

        this.getAllPublicTracksStmt = this.db.prepare(`
            ${baseSelect}
            WHERE ${TrackRepository.PUBLIC_CONDITION}
            ORDER BY artist_name, album_title, track_num
        `);

        this.getTracksByAlbumStmt = this.db.prepare(`
            ${baseSelect}
            WHERE album_id = ? ORDER BY track_num
        `);

        this.getPublicTracksByAlbumStmt = this.db.prepare(`
            ${baseSelect}
            WHERE album_id = ? AND (${TrackRepository.PUBLIC_CONDITION})
            ORDER BY track_num
        `);
    }

    private getVisibilityFilter(profile: VisibilityProfile): string {
        switch (profile) {
            case VisibilityProfile.ALL_ACCESS:
                return "1=1";
            case VisibilityProfile.OWNER_SCOPED:
                return TrackRepository.PUBLIC_CONDITION;
            case VisibilityProfile.PUBLIC_STAGE:
            default:
                return TrackRepository.PUBLIC_CONDITION;
        }
    }

    getByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined {
        const row = this.db.prepare("SELECT * FROM v_tracks WHERE LOWER(title) = LOWER(?) AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL)) AND (album_id = ? OR (album_id IS NULL AND ? IS NULL))").get(title, artistId, artistId, albumId, albumId);
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
            // Standardize field names from view
            artistSlug: row.artist_slug,
            walletAddress: row.artist_wallet_address,
            owner_id: row.effective_owner_id
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
                r.artist_name as artist_name,
                r.artist_id as artist_id
            FROM release_tracks rt
            JOIN v_releases r ON rt.release_id = r.id
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
                SELECT * FROM v_tracks
                WHERE id IN (${placeholders})
            `).all(...chunk);
            results.push(...rows.map(row => this.mapTrack(row)));
        }
        return results;
    }

    getAll(profile: VisibilityProfile = VisibilityProfile.PUBLIC_STAGE, limit?: number, offset?: number): Track[] {
        let sql = (profile === VisibilityProfile.ALL_ACCESS) ? this.getAllTracksStmt.source : this.getAllPublicTracksStmt.source;
        
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

    getByAlbumId(albumId: number, profile: VisibilityProfile = VisibilityProfile.PUBLIC_STAGE): Track[] {
        const stmt = (profile === VisibilityProfile.ALL_ACCESS) ? this.getTracksByAlbumStmt : this.getPublicTracksByAlbumStmt;
        const rows = stmt.all(albumId);
        return rows.map(row => this.mapTrack(row));
    }

    getByArtist(artistId: number, profile: VisibilityProfile = VisibilityProfile.PUBLIC_STAGE, artistName?: string): Track[] {
        const visibilityFilter = this.getVisibilityFilter(profile);
        const condition = artistName 
            ? `(artist_id = ? OR artist_name = ? OR (artist_id IS NULL AND (artist_id = ? OR artist_name = ?)))`
            : `(artist_id = ? OR (artist_id IS NULL AND artist_id = ?))`;

        const sql = `SELECT * FROM v_tracks WHERE ${condition} AND (${visibilityFilter}) ORDER BY album_title, track_num`;
        
        const params: (number | string)[] = [artistId];
        if (artistName) {
            params.push(artistName);
            params.push(artistId);
            params.push(artistName);
        } else {
            params.push(artistId);
        }

        const rows = this.db.prepare(sql).all(...params);
        return rows.map(row => this.mapTrack(row));
    }

    getByOwner(ownerId: number, profile: VisibilityProfile = VisibilityProfile.PUBLIC_STAGE): Track[] {
        const visibilityFilter = this.getVisibilityFilter(profile);
        const condition = `
            (owner_id = ? 
             OR (owner_id IS NULL AND effective_owner_id = ?) 
             OR EXISTS (SELECT 1 FROM track_ownership to_ WHERE to_.track_id = v_tracks.id AND to_.owner_id = ?) 
             OR EXISTS (SELECT 1 FROM album_ownership ao_ WHERE ao_.album_id = album_id AND ao_.owner_id = ?))
        `;

        const sql = profile === VisibilityProfile.ALL_ACCESS
            ? `SELECT * FROM v_tracks WHERE ${condition} ORDER BY album_title, track_num`
            : `SELECT * FROM v_tracks WHERE ${condition} AND (${visibilityFilter}) ORDER BY album_title, track_num`;

        const rows = this.db.prepare(sql).all(ownerId, ownerId, ownerId, ownerId);
        return rows.map(row => this.mapTrack(row));
    }

    getRandom(limit: number): Track[] {
        const rows = this.db.prepare(`SELECT * FROM v_tracks ORDER BY RANDOM() LIMIT ?`).all(limit);
        return rows.map(row => this.mapTrack(row));
    }

    getByPath(filePath: string): Track | undefined {
        const row = this.db.prepare(`SELECT * FROM v_tracks WHERE file_path = ?`).get(filePath);
        return row ? this.mapTrack(row) : undefined;
    }

    getByHash(hash: string): Track | undefined {
        const row = this.db.prepare("SELECT * FROM tracks WHERE hash = ?").get(hash);
        return row ? this.mapTrack(row) : undefined;
    }

    getByExternalId(externalId: string): Track | undefined {
        const row = this.db.prepare("SELECT * FROM v_tracks WHERE external_id = ?").get(externalId);
        return row ? this.mapTrack(row) : undefined;
    }

    getByFingerprint(fingerprint: string): Track | undefined {
        const row = this.db.prepare("SELECT * FROM v_tracks WHERE fingerprint = ?").get(fingerprint);
        return row ? this.mapTrack(row) : undefined;
    }

    create(track: Omit<Track, "id" | "created_at" | "album_title">): number {
        // Safeguard foreign keys to prevent "FOREIGN KEY constraint failed"
        let safeAlbumId = track.album_id;
        if (safeAlbumId !== null && safeAlbumId !== undefined) {
            const exists = this.db.prepare("SELECT 1 FROM albums WHERE id = ?").get(safeAlbumId);
            if (!exists) {
                console.warn(`[TrackRepository] Invalid album_id ${safeAlbumId} for track "${track.title}", nulling out.`);
                safeAlbumId = null;
            }
        }

        let safeArtistId = track.artist_id;
        if (safeArtistId !== null && safeArtistId !== undefined) {
            const exists = this.db.prepare("SELECT 1 FROM artists WHERE id = ?").get(safeArtistId);
            if (!exists) {
                console.warn(`[TrackRepository] Invalid artist_id ${safeArtistId} for track "${track.title}", nulling out.`);
                safeArtistId = null;
            }
        }

        let safeOwnerId = track.owner_id;
        if (safeOwnerId !== null && safeOwnerId !== undefined) {
            const exists = this.db.prepare("SELECT 1 FROM admin WHERE id = ?").get(safeOwnerId);
            if (!exists) {
                console.warn(`[TrackRepository] Invalid owner_id ${safeOwnerId} for track "${track.title}", nulling out.`);
                safeOwnerId = null;
            }
        }

        const result = this.db.prepare(`
            INSERT OR IGNORE INTO tracks (title, album_id, artist_id, owner_id, artist_name, track_num, duration, file_path, format, bitrate, sample_rate, price, price_usdc, price_usdt, currency, lossless_path, url, service, external_artwork, lyrics, hash, external_id, fingerprint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            track.title, safeAlbumId, safeArtistId, safeOwnerId, track.artist_name || null,
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
            if (['id', 'created_at', 'album_title', 'owner_name', 'artist_slug', 'wallet_address', 'effective_owner_id', 'album_status', 'album_visibility', 'album_artist_tag'].includes(key)) continue;
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

    getCount(): number {
        const row = this.db.prepare("SELECT COUNT(*) as count FROM tracks").get() as any;
        return row ? row.count : 0;
    }

    getPaths(): string[] {
        const rows = this.db.prepare("SELECT file_path FROM tracks WHERE file_path IS NOT NULL").all() as any[];
        return rows.map(r => r.file_path);
    }

    getMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist' | 'external'): Track[] {
        let condition = "";
        switch (filter) {
            case 'genre': condition = "(genre IS NULL OR genre = 'Library' OR genre = '')"; break;
            case 'year': condition = "(year IS NULL OR year = 0)"; break;
            case 'cover': condition = "(external_artwork IS NULL AND album_id IS NULL)"; break;
            case 'album': condition = "album_id IS NULL"; break;
            case 'artist': condition = "(artist_id IS NULL OR artist_name = 'Unknown Artist')"; break;
            case 'external': condition = "external_id IS NULL"; break;
            default: return [];
        }
        const rows = this.db.prepare(`SELECT * FROM v_tracks WHERE ${condition}`).all();
        return rows.map(row => this.mapTrack(row));
    }
}
