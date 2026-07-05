import type { Database as DatabaseType, Statement } from "better-sqlite3";
import type { Track } from "../core/database.types.js";
import { VisibilityProfile, ViewerContext, VisibilityGuardian, getContextFromProfile } from "../common/visibility.js";

export class TrackRepository {
    private getTrackStmt: Statement;

    constructor(protected db: DatabaseType) {
        const baseSelect = `SELECT * FROM v_tracks`;

        this.getTrackStmt = this.db.prepare(`${baseSelect} WHERE id = ?`);
    }

    /**
     * True only for tracks belonging to a publicly-released release (never private library
     * tracks). Gates what "now listening" is allowed to leak to the open network. Mirrors the
     * album PUBLIC_CONDITION (visibility public/unlisted + status released) plus is_release.
     */
    isPublicReleaseTrack(id: number): boolean {
        return !!this.db.prepare(
            `SELECT 1 FROM tracks t JOIN albums a ON t.album_id = a.id
             WHERE t.id = ? AND a.is_release = 1 AND a.status = 'released'
               AND a.visibility IN ('public','unlisted') LIMIT 1`
        ).get(id);
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
            JOIN v_albums r ON rt.release_id = r.id
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

    getAll(profile?: VisibilityProfile | ViewerContext, limit?: number, offset?: number): Track[] {
        const context = getContextFromProfile(profile);
        const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
        let sql = `SELECT * FROM v_tracks WHERE ${filter.sql} ORDER BY artist_name, album_title, track_num`;
        
        if (limit !== undefined) {
            sql += ` LIMIT ${Number(limit)}`;
            if (offset !== undefined) {
                sql += ` OFFSET ${Number(offset)}`;
            }
        } else {
            // Safety default limit to prevent OOM on massive libraries
            sql += " LIMIT 5000";
        }

        const rows = this.db.prepare(sql).all(...filter.params);
        return rows.map(row => this.mapTrack(row));
    }

    getByAlbumId(albumId: number, profile?: VisibilityProfile | ViewerContext): Track[] {
        const context = getContextFromProfile(profile);
        const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
        const sql = `SELECT * FROM v_tracks WHERE album_id = ? AND (${filter.sql}) ORDER BY track_num`;
        const rows = this.db.prepare(sql).all(albumId, ...filter.params);
        return rows.map(row => this.mapTrack(row));
    }

    getExternalArtworkByAlbumId(albumId: number, profile?: VisibilityProfile | ViewerContext): string | null {
        const context = getContextFromProfile(profile);
        const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
        const sql = `SELECT external_artwork FROM v_tracks WHERE album_id = ? AND external_artwork IS NOT NULL AND (${filter.sql}) LIMIT 1`;
        const row = this.db.prepare(sql).get(albumId, ...filter.params) as { external_artwork: string } | undefined;
        return row ? row.external_artwork : null;
    }

    getByArtist(artistId: number, profile?: VisibilityProfile | ViewerContext, artistName?: string): Track[] {
        const context = getContextFromProfile(profile);
        const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
        const condition = artistName 
            ? `(artist_id = ? OR artist_name = ? OR (artist_id IS NULL AND (artist_id = ? OR artist_name = ?)))`
            : `(artist_id = ? OR (artist_id IS NULL AND artist_id = ?))`;

        const sql = `SELECT * FROM v_tracks WHERE ${condition} AND (${filter.sql}) ORDER BY album_title, track_num`;
        
        const params: (number | string)[] = [artistId];
        if (artistName) {
            params.push(artistName);
            params.push(artistId);
            params.push(artistName);
        } else {
            params.push(artistId);
        }
        params.push(...filter.params);

        const rows = this.db.prepare(sql).all(...params);
        return rows.map(row => this.mapTrack(row));
    }

    getByOwner(ownerId: number, profile?: VisibilityProfile | ViewerContext): Track[] {
        const context = getContextFromProfile(profile);
        const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
        const condition = `
            (owner_id = ? 
             OR (owner_id IS NULL AND effective_owner_id = ?) 
             OR EXISTS (SELECT 1 FROM track_ownership to_ WHERE to_.track_id = v_tracks.id AND to_.owner_id = ?) 
             OR EXISTS (SELECT 1 FROM album_ownership ao_ WHERE ao_.album_id = album_id AND ao_.owner_id = ?))
        `;

        const sql = `SELECT * FROM v_tracks WHERE ${condition} AND (${filter.sql}) ORDER BY album_title, track_num`;
        const params = [ownerId, ownerId, ownerId, ownerId, ...filter.params];

        const rows = this.db.prepare(sql).all(...params);
        return rows.map(row => this.mapTrack(row));
    }

    getRandom(limit: number): Track[] {
        const rows = this.db.prepare(`SELECT * FROM v_tracks WHERE mime_type LIKE 'audio/%' OR mime_type IS NULL ORDER BY RANDOM() LIMIT ?`).all(limit);
        return rows.map(row => this.mapTrack(row));
    }

    getByPath(filePath: string): Track | undefined {
        const row = this.db.prepare(`SELECT * FROM v_tracks WHERE file_path = ? OR lossless_path = ?`).get(filePath, filePath);
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
            INSERT OR IGNORE INTO tracks (title, album_id, artist_id, owner_id, artist_name, track_num, duration, file_path, format, bitrate, sample_rate, price, price_usdc, price_usdt, currency, lossless_path, url, service, external_artwork, lyrics, hash, external_id, fingerprint, mime_type, file_size, file_hash, version, description, podcast_episode_num, podcast_season_num, podcast_episode_type, genre, year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            track.title, safeAlbumId, safeArtistId, safeOwnerId, track.artist_name || null,
            track.track_num, track.duration, track.file_path, track.format, track.bitrate, 
            track.sample_rate, track.price || 0, track.price_usdc || 0, track.price_usdt || 0, track.currency || 'ETH', 
            track.lossless_path || null, track.url || null, track.service || null, 
            track.external_artwork || null, track.lyrics || null, track.hash || null, track.external_id || null, track.fingerprint || null,
            track.mime_type || 'audio/mpeg', track.file_size || 0, track.file_hash || null, track.version || null,
            track.description || null, track.podcast_episode_num || null, track.podcast_season_num || null, track.podcast_episode_type || 'full',
            (track as any).genre || null, (track as any).year || null
        );
        return result.lastInsertRowid as number;
    }

    createBatch(tracks: Omit<Track, "id" | "created_at" | "album_title">[]): number[] {
        if (tracks.length === 0) return [];

        const artistExistsStmt = this.db.prepare("SELECT 1 FROM artists WHERE id = ?");
        const albumExistsStmt = this.db.prepare("SELECT 1 FROM albums WHERE id = ?");
        const adminExistsStmt = this.db.prepare("SELECT 1 FROM admin WHERE id = ?");
        const insertStmt = this.db.prepare(`
            INSERT OR IGNORE INTO tracks (title, album_id, artist_id, owner_id, artist_name, track_num, duration, file_path, format, bitrate, sample_rate, price, price_usdc, price_usdt, currency, lossless_path, url, service, external_artwork, lyrics, hash, external_id, fingerprint, mime_type, file_size, file_hash, version, description, podcast_episode_num, podcast_season_num, podcast_episode_type, genre, year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const validArtistIds = new Set<number>();
        const invalidArtistIds = new Set<number>();
        const validAlbumIds = new Set<number>();
        const invalidAlbumIds = new Set<number>();
        const validAdminIds = new Set<number>();
        const invalidAdminIds = new Set<number>();

        const insertedIds: number[] = [];

        this.db.transaction(() => {
            for (const track of tracks) {
                let safeArtistId = track.artist_id;
                if (safeArtistId !== null && safeArtistId !== undefined) {
                    if (validArtistIds.has(safeArtistId)) {
                        // valid
                    } else if (invalidArtistIds.has(safeArtistId)) {
                        safeArtistId = null;
                    } else {
                        if (artistExistsStmt.get(safeArtistId)) {
                            validArtistIds.add(safeArtistId);
                        } else {
                            invalidArtistIds.add(safeArtistId);
                            safeArtistId = null;
                        }
                    }
                }

                let safeAlbumId = track.album_id;
                if (safeAlbumId !== null && safeAlbumId !== undefined) {
                    if (validAlbumIds.has(safeAlbumId)) {
                        // valid
                    } else if (invalidAlbumIds.has(safeAlbumId)) {
                        safeAlbumId = null;
                    } else {
                        if (albumExistsStmt.get(safeAlbumId)) {
                            validAlbumIds.add(safeAlbumId);
                        } else {
                            invalidAlbumIds.add(safeAlbumId);
                            safeAlbumId = null;
                        }
                    }
                }

                let safeOwnerId = track.owner_id;
                if (safeOwnerId !== null && safeOwnerId !== undefined) {
                    if (validAdminIds.has(safeOwnerId)) {
                        // valid
                    } else if (invalidAdminIds.has(safeOwnerId)) {
                        safeOwnerId = null;
                    } else {
                        if (adminExistsStmt.get(safeOwnerId)) {
                            validAdminIds.add(safeOwnerId);
                        } else {
                            invalidAdminIds.add(safeOwnerId);
                            safeOwnerId = null;
                        }
                    }
                }

                const res = insertStmt.run(
                    track.title, safeAlbumId, safeArtistId, safeOwnerId, track.artist_name || null,
                    track.track_num, track.duration, track.file_path, track.format, track.bitrate,
                    track.sample_rate, track.price || 0, track.price_usdc || 0, track.price_usdt || 0, track.currency || 'ETH',
                    track.lossless_path || null, track.url || null, track.service || null,
                    track.external_artwork || null, track.lyrics || null, track.hash || null, track.external_id || null, track.fingerprint || null,
                    track.mime_type || 'audio/mpeg', track.file_size || 0, track.file_hash || null, track.version || null,
                    track.description || null, track.podcast_episode_num || null, track.podcast_season_num || null, track.podcast_episode_type || 'full',
                    (track as any).genre || null, (track as any).year || null
                );

                insertedIds.push(res.lastInsertRowid as number);
            }
        })();

        return insertedIds;
    }

    update(id: number, track: Partial<Track>): void {
        // Map camelCase keys to snake_case database column names
        const normalizedTrack: any = {};
        const keyMap: { [key: string]: string } = {
            artistId: 'artist_id',
            albumId: 'album_id',
            ownerId: 'owner_id',
            trackNum: 'track_num',
            filePath: 'file_path',
            sampleRate: 'sample_rate',
            priceUsdc: 'price_usdc',
            priceUsdt: 'price_usdt',
            losslessPath: 'lossless_path',
            externalArtwork: 'external_artwork',
            externalId: 'external_id',
            mimeType: 'mime_type',
            fileSize: 'file_size',
            fileHash: 'file_hash',
            podcastEpisodeNum: 'podcast_episode_num',
            podcastSeasonNum: 'podcast_season_num',
            podcastEpisodeType: 'podcast_episode_type'
        };

        for (const [key, value] of Object.entries(track)) {
            const normalizedKey = keyMap[key] || key;
            normalizedTrack[normalizedKey] = value;
        }
        track = normalizedTrack;

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
    }

    updateArtist(id: number, artistId: number | null, artistName: string | null): void {
        this.db.transaction(() => {
            this.db.prepare("UPDATE tracks SET artist_id = ?, artist_name = ? WHERE id = ?").run(artistId, artistName, id);
        })();
    }

    updateOwner(id: number, ownerId: number | null): void {
        this.db.transaction(() => {
            this.db.prepare("UPDATE tracks SET owner_id = ? WHERE id = ?").run(ownerId, id);
            if (ownerId !== null) {
                this.db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) VALUES (?, ?)").run(id, ownerId);
            }
        })();
    }

    updateOrder(id: number, trackNum: number): void {
        this.db.prepare("UPDATE tracks SET track_num = ? WHERE id = ?").run(trackNum, id);
    }

    updatePathsPrefix(oldPrefix: string, newPrefix: string): void {
        this.db.prepare("UPDATE tracks SET file_path = ? || SUBSTR(file_path, LENGTH(?) + 1) WHERE file_path = ? OR file_path LIKE ? || '/%'").run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
        this.db.prepare("UPDATE tracks SET lossless_path = ? || SUBSTR(lossless_path, LENGTH(?) + 1) WHERE lossless_path = ? OR lossless_path LIKE ? || '/%'").run(newPrefix, oldPrefix, oldPrefix, oldPrefix);
    }

    updateLosslessPathBatch(ids: number[], path: string | null): void {
        if (ids.length === 0) return;
        this.db.transaction(() => {
            const CHUNK_SIZE = 900;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');
                this.db.prepare(`UPDATE tracks SET lossless_path = ? WHERE id IN (${placeholders})`).run(path, ...chunk);
            }
        })();
    }

    updatePathsBatch(updates: { id: number, path: string }[]): void {
        if (updates.length === 0) return;
        this.db.transaction(() => {
            const stmt = this.db.prepare("UPDATE tracks SET file_path = ? WHERE id = ?");
            for (const { id, path } of updates) {
                stmt.run(path, id);
            }
        })();
    }

    merge(fromId: number | number[], toId: number, targetFilePath: string): void {
        const fromIds = Array.isArray(fromId) ? fromId : [fromId];
        if (fromIds.length === 0) return;
        this.db.transaction(() => {
            for (const fId of fromIds) {
                try {
                    // Carry over metadata that the keeper is missing (don't overwrite existing values)
                    const from = this.db.prepare("SELECT * FROM tracks WHERE id = ?").get(fId) as any;
                    const to = this.db.prepare("SELECT * FROM tracks WHERE id = ?").get(toId) as any;
                    if (from && to) {
                        const carryFields = [
                            'lossless_path', 'external_id', 'fingerprint', 'lyrics',
                            'external_artwork', 'hash', 'file_hash', 'waveform',
                            'year', 'genre', 'bitrate', 'sample_rate', 'duration',
                            'mime_type', 'file_size', 'version', 'url', 'service',
                            'artist_name', 'track_num', 'album_id', 'artist_id'
                        ];
                        const updates: string[] = [];
                        const values: any[] = [];
                        for (const f of carryFields) {
                            const toVal = to[f];
                            const fromVal = from[f];
                            const toEmpty = toVal === null || toVal === undefined || toVal === '' || toVal === 0;
                            const fromHas = fromVal !== null && fromVal !== undefined && fromVal !== '' && fromVal !== 0;
                            if (toEmpty && fromHas) {
                                updates.push(`${f} = ?`);
                                values.push(fromVal);
                            }
                        }
                        if (updates.length > 0) {
                            values.push(toId);
                            this.db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
                        }
                    }

                    this.db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) SELECT ?, owner_id FROM track_ownership WHERE track_id = ?").run(toId, fId);
                    this.db.prepare("UPDATE play_history SET track_id = ? WHERE track_id = ?").run(toId, fId);
                    this.db.prepare("UPDATE bookmarks SET track_id = ? WHERE track_id = ?").run(toId, String(fId));
                    this.db.prepare("UPDATE starred_items SET item_id = ? WHERE item_id = ? AND item_type = 'track'").run(String(toId), String(fId));
                    this.db.prepare("UPDATE item_ratings SET item_id = ? WHERE item_id = ? AND item_type = 'track'").run(String(toId), String(fId));
                    // Re-point release_tracks that referenced the merged-away track
                    try {
                        this.db.prepare("UPDATE OR IGNORE release_tracks SET track_id = ? WHERE track_id = ?").run(toId, fId);
                        this.db.prepare("DELETE FROM release_tracks WHERE track_id = ?").run(fId);
                    } catch (e) {}
                    // Re-point playlist_tracks
                    try {
                        this.db.prepare("UPDATE OR IGNORE playlist_tracks SET track_id = ? WHERE track_id = ?").run(toId, fId);
                        this.db.prepare("DELETE FROM playlist_tracks WHERE track_id = ?").run(fId);
                    } catch (e) {}
                    this.db.prepare("DELETE FROM track_ownership WHERE track_id = ?").run(fId);
                    this.db.prepare("DELETE FROM tracks WHERE id = ?").run(fId);
                } catch (err) {
                    console.error(`🚨 [TrackRepository] Merge failed during transaction (${fId} -> ${toId}):`, err);
                    throw err; // Re-throw to ensure transaction rollback
                }
            }
        })();
    }

    getTrackOwners(id: number): number[] {
        return this.db.prepare("SELECT owner_id FROM track_ownership WHERE track_id = ?").all(id).map((r: any) => r.owner_id);
    }

    addOwner(tid: number, oid: number): void {
        if (oid !== null && oid !== undefined) {
            const exists = this.db.prepare("SELECT 1 FROM admin WHERE id = ?").get(oid);
            if (!exists) {
                console.warn(`[TrackRepository] Invalid owner_id ${oid} in addOwner for track ${tid}, skipping.`);
                return;
            }
        }
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
            this.db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
        })();
    }

    deleteBatch(ids: number[]): void {
        if (ids.length === 0) return;
        this.db.transaction(() => {
            const CHUNK_SIZE = 900;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');
                this.db.prepare(`DELETE FROM track_ownership WHERE track_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...chunk);
            }
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
            JOIN albums r ON rt.release_id = r.id
            LEFT JOIN tracks t ON rt.track_id = t.id
            LEFT JOIN artists ar ON r.artist_id = ar.id
            WHERE rt.release_id = ?
            ORDER BY rt.track_num ASC
        `).all(releaseId);
        return rows.map(row => this.mapTrack(row));
    }

    getCount(): number {
        const row = this.db.prepare("SELECT COUNT(*) as count FROM tracks WHERE mime_type LIKE 'audio/%' OR mime_type IS NULL").get() as any;
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
            // A track "has a cover" only via external_artwork or its album's real
            // cover_path. Scanner-created folder albums often have none — the UI
            // just renders an SVG placeholder — so they must still count as missing.
            case 'cover': condition = "(external_artwork IS NULL AND (album_id IS NULL OR EXISTS (SELECT 1 FROM albums al WHERE al.id = album_id AND (al.cover_path IS NULL OR al.cover_path = ''))))"; break;
            case 'album': condition = "album_id IS NULL"; break;
            case 'artist': condition = "(artist_id IS NULL OR artist_name = 'Unknown Artist')"; break;
            case 'external': condition = "external_id IS NULL"; break;
            default: return [];
        }
        const rows = this.db.prepare(`SELECT * FROM v_tracks WHERE ${condition}`).all();
        return rows.map(row => this.mapTrack(row));
    }
}
