import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Album, Release } from "../database.types.js";

export class AlbumRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    getByTitle(title: string, artistId?: number): Album | undefined {
        const sql = artistId
            ? `SELECT a.*, 
               COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
               COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artistSlug, ar.slug as artist_slug 
               FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.title = ? AND a.artist_id = ?`
            : `SELECT a.*, 
               COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
               COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artistSlug, ar.slug as artist_slug 
               FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.title = ?`;
        const params = artistId ? [title, artistId] : [title];
        const row = this.db.prepare(sql).get(...params);
        return this.mapAlbum(row);
    }

    protected mapAlbum(row: any): Album | undefined {
        if (!row) return undefined;
        return {
            ...row,
            currency: row.currency || 'ETH',
            is_public: !!row.is_public,
            is_release: !!row.is_release,
            published_to_gundb: !!row.published_to_gundb,
            published_to_ap: !!row.published_to_ap,
        } as Album;
    }

    getById(id: number): Album | undefined {
        let row = this.db.prepare(`
            SELECT a.*, 
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
            ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress, own.username as owner_name 
            FROM albums a
            LEFT JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN admin own ON a.owner_id = own.id
            WHERE a.id = ?
        `).get(id) as any;
        
        if (!row) {
            row = this.db.prepare(`
                SELECT r.*, 
                COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
                ar.slug as artist_slug, ar.wallet_address as walletAddress 
                FROM releases r
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.id = ?
            `).get(id) as any;
            if (row) row.is_release = 1;
        }

        return this.mapAlbum(row);
    }

    getBySlug(slug: string): Album | undefined {
        let row = this.db.prepare(`
            SELECT a.*, 
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
            ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress 
            FROM albums a 
            LEFT JOIN artists ar ON a.artist_id = ar.id 
            WHERE a.slug = ?
        `).get(slug) as any;

        if (!row) {
            row = this.db.prepare(`
                SELECT r.*, 
                COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
                ar.slug as artist_slug, ar.wallet_address as walletAddress 
                FROM releases r
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.slug = ?
            `).get(slug) as any;
            if (row) row.is_release = 1;
        }
        return this.mapAlbum(row);
    }

    getLibraryAlbums(publicOnly = false, limit?: number, offset?: number): Album[] {
        let sql = `
            SELECT a.*, 
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
            ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress 
            FROM albums a 
            LEFT JOIN artists ar ON a.artist_id = ar.id 
            WHERE a.is_release = 0 ${publicOnly ? "AND a.visibility = 'public' AND a.status = 'released'" : ""}
            ORDER BY a.title
        `;
        
        if (limit !== undefined) {
            sql += ` LIMIT ${Number(limit)}`;
            if (offset !== undefined) sql += ` OFFSET ${Number(offset)}`;
        } else {
            sql += " LIMIT 1000";
        }

        const rows = this.db.prepare(sql).all();
        return rows.map(row => this.mapAlbum(row)) as Album[];
    }

    getWithStats(publicOnly = false): (Album & { songCount: number; duration: number })[] {
        const sql = `
            SELECT
                a.*, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
                ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress,
                COUNT(t.id) as songCount,
                SUM(IFNULL(t.duration, 0)) as duration
            FROM albums a
            LEFT JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN tracks t ON t.album_id = a.id
            WHERE a.is_release = 0 ${publicOnly ? "AND a.visibility = 'public' AND a.status = 'released'" : ""}
            GROUP BY a.id
            ORDER BY a.date DESC
        `;
        const rows = this.db.prepare(sql).all();
        return rows.map(row => this.mapAlbum(row)) as any[];
    }

    getByIds(ids: number[]): Album[] {
        if (ids.length === 0) return [];
        const CHUNK_SIZE = 900;
        const results: Album[] = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            const rows = this.db.prepare(`
                SELECT a.*, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
                ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.id IN (${placeholders})
            `).all(...chunk);
            results.push(...rows.map(row => this.mapAlbum(row)) as Album[]);

            const foundIds = new Set(results.map(r => r.id));
            const missingIds = chunk.filter(id => !foundIds.has(id));

            if (missingIds.length > 0) {
                const missingPlaceholders = missingIds.map(() => "?").join(",");
                const releaseRows = this.db.prepare(`
                    SELECT r.*, 
                COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
                    ar.slug as artist_slug, ar.wallet_address as walletAddress FROM releases r
                    LEFT JOIN artists ar ON r.artist_id = ar.id
                    WHERE r.id IN (${missingPlaceholders})
                `).all(...missingIds);
                releaseRows.forEach((r: any) => r.is_release = 1);
                results.push(...releaseRows.map(row => this.mapAlbum(row)) as Album[]);
            }
        }
        return results;
    }

    getReleases(publicOnly = false): Release[] {
        const sql = publicOnly
            ? `SELECT r.*, 
               COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
               COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.visibility = 'public' AND r.status = 'released' ORDER BY r.date DESC`
            : `SELECT r.*, 
               COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
               COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
               ORDER BY r.date DESC`;
        const rows = this.db.prepare(sql).all();
        return rows.map((row: any) => ({ ...row, is_release: 1 })) as any[];
    }

    getByArtist(artistId: number, publicOnly = false, artistName?: string): Album[] {
        const condition = artistName 
            ? `(a.artist_id = ? OR ar.name = ? OR a.title LIKE ? OR EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = a.id AND (t.artist_id = ? OR t.artist_name = ?)))`
            : `(a.artist_id = ? OR EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = a.id AND t.artist_id = ?))`;

        const sql = `SELECT a.*, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artistSlug, ar.slug as artist_slug FROM albums a 
               LEFT JOIN artists ar ON a.artist_id = ar.id 
               WHERE ${condition}
               AND a.is_release = 0 
               ${publicOnly ? "AND a.visibility = 'public' AND a.status = 'released'" : ""}
               ORDER BY a.date DESC`;
        
        const params: (number | string)[] = [artistId];
        if (artistName) {
            params.push(artistName);
            params.push(`%${artistName}%`);
            params.push(artistId);
            params.push(artistName);
        } else {
            params.push(artistId);
        }
        
        const rows = this.db.prepare(sql).all(...params);
        return rows.map(row => this.mapAlbum(row)) as Album[];
    }

    getReleasesByArtist(artistId: number, publicOnly = false, artistName?: string): Release[] {
        const condition = artistName
            ? `(r.artist_id = ? OR ar.name = ? OR EXISTS (SELECT 1 FROM release_tracks rt WHERE rt.release_id = r.id AND rt.artist_name = ?))`
            : `(r.artist_id = ?)`;

        const sql = `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artist_slug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
               WHERE ${condition}
               ${publicOnly ? "AND r.visibility = 'public' AND r.status = 'released'" : ""}
               ORDER BY r.date DESC`;
        
        const params: (number | string)[] = [artistId];
        if (artistName) {
            params.push(artistName);
            params.push(artistName);
        }

        const rows = this.db.prepare(sql).all(...params);
        return rows.map((row: any) => ({ ...row, is_release: 1 })) as any[];
    }

    getByOwner(ownerId: number, publicOnly = false): Album[] {
        const sql = publicOnly
            ? `SELECT a.*, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artistSlug, ar.slug as artist_slug FROM albums a 
               JOIN album_ownership ao ON a.id = ao.album_id
               LEFT JOIN artists ar ON a.artist_id = ar.id 
               WHERE ao.owner_id = ? AND a.is_release = 0 AND a.visibility = 'public' AND a.status = 'released' ORDER BY a.date DESC`
            : `SELECT a.*, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artistName, 
                COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name, 
               ar.slug as artist_slug FROM albums a 
               JOIN album_ownership ao ON a.id = ao.album_id
               LEFT JOIN artists ar ON a.artist_id = ar.id 
               WHERE ao.owner_id = ? AND a.is_release = 0 ORDER BY a.date DESC`;
        const rows = this.db.prepare(sql).all(ownerId);
        return rows.map(row => this.mapAlbum(row)) as Album[];
    }

    getCovers(artistId: number): string[] {
        const rows = this.db.prepare(`
            SELECT cover_path FROM (
                SELECT cover_path, date, 1 as is_release FROM releases WHERE artist_id = ? AND cover_path IS NOT NULL
                UNION ALL 
                SELECT cover_path, date, 0 as is_release FROM albums WHERE artist_id = ? AND is_release = 0 AND cover_path IS NOT NULL
            ) ORDER BY is_release DESC, date DESC
        `).all(artistId, artistId) as any[];
        return rows.map(r => r.cover_path);
    }

    getArtistAlbumCounts(): { artist_id: number, count: number }[] {
        return this.db.prepare(`SELECT artist_id, count(*) as count FROM albums WHERE is_release = 0 GROUP BY artist_id`).all() as any[];
    }

    search(query: string, limit: number, publicOnly = false): Album[] {
        const likeQuery = `%${query}%`;
        const sql = publicOnly
            ? `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
       LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released' AND (a.title LIKE ? OR ar.name LIKE ?) LIMIT ?`
            : `SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a 
       LEFT JOIN artists ar ON a.artist_id = ar.id WHERE (a.title LIKE ? OR ar.name LIKE ?) LIMIT ?`;
        const rows = this.db.prepare(sql).all(likeQuery, likeQuery, limit);
        return rows.map(row => this.mapAlbum(row)) as Album[];
    }

    create(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number {
        const slug = album.slug || album.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "album";
        let finalSlug = slug;
        let attempt = 0;
        while (attempt < 100) {
            try {
                const result = this.db.prepare(`INSERT INTO albums (title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, price_usdc, price_usdt, currency, external_links, is_public, visibility, is_release, published_at, published_to_gundb, published_to_ap, use_nft, album_artist)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(album.title, finalSlug, album.artist_id, album.owner_id, album.date, album.cover_path, album.genre, album.description, album.type || null, album.year || null, album.download, album.price || 0, album.price_usdc || 0, album.price_usdt || 0, album.currency || 'ETH', album.external_links,
                        album.visibility === 'public' || album.visibility === 'unlisted' ? 1 : 0, album.visibility || 'private', album.is_release ? 1 : 0, album.published_at, album.published_to_gundb ? 1 : 0, album.published_to_ap ? 1 : 0, album.use_nft ? 1 : 0, album.album_artist || null);
                return result.lastInsertRowid as number;
            } catch (e: any) {
                if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) { attempt++; finalSlug = `${slug}-${attempt}`; } else throw e;
            }
        }
        throw new Error("Could not create unique slug for album");
    }

    update(id: number, album: Partial<Album>): void {
        const fields: string[] = [];
        const values: any[] = [];

        for (const [key, value] of Object.entries(album)) {
            if (['id', 'created_at', 'artist_name', 'artist_slug'].includes(key)) continue;
            fields.push(`${key} = ?`);
            if (['published_to_gundb', 'published_to_ap', 'is_public', 'is_release'].includes(key)) {
                values.push(value ? 1 : 0);
            } else {
                values.push(value);
            }
        }

        if (fields.length === 0) return;

        values.push(id);
        this.db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        
        // Also update corresponding release if exists
        try {
            this.db.prepare(`UPDATE releases SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        } catch (e) {
            // Might not exist, which is fine
        }
    }

    promoteToRelease(id: number): void {
        const album = this.db.prepare("SELECT * FROM albums WHERE id = ?").get(id) as any;
        if (!album) return;
        this.db.transaction(() => {
            this.db.prepare(`INSERT OR IGNORE INTO releases (id, title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, price_usdc, price_usdt, currency, external_links, visibility, published_at, published_to_gundb, published_to_ap, license, created_at, use_nft, album_artist)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(album.id, album.title, album.slug, album.artist_id, album.owner_id, album.date, album.cover_path, album.genre, album.description, album.type, album.year, album.download, album.price, album.price_usdc || 0, album.price_usdt || 0, album.currency, album.external_links, album.visibility, album.published_at, album.published_to_gundb, album.published_to_ap, album.license, album.created_at, album.use_nft ?? 1, album.album_artist);
            
            const tracks = this.db.prepare("SELECT * FROM tracks WHERE album_id = ?").all(id) as any[];
            for (const track of tracks) {
                this.db.prepare(`INSERT OR IGNORE INTO release_tracks (release_id, track_id, title, artist_name, track_num, duration, file_path, price, price_usdc, price_usdt, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(id, track.id, track.title, track.artist_name, track.track_num, track.duration, track.file_path, track.price, track.price_usdc || 0, track.price_usdt || 0, track.currency, track.created_at);
            }
            const isPublic = album.visibility === 'public' || album.visibility === 'unlisted';
            this.db.prepare("UPDATE albums SET is_release = 1, is_public = ? WHERE id = ?").run(isPublic ? 1 : 0, id);
        })();
    }

    delete(id: number, keepTracks = false): void {
        this.db.transaction(() => {
            this.db.prepare("DELETE FROM release_tracks WHERE release_id = ?").run(id);
            this.db.prepare("DELETE FROM unlock_codes WHERE release_id = ?").run(id);
            this.db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE content_id = ? AND note_type = 'release'").run(id);
            if (keepTracks) this.db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ?").run(id);
            else this.db.prepare("DELETE FROM tracks WHERE album_id = ?").run(id);
            this.db.prepare("DELETE FROM albums WHERE id = ?").run(id);
            this.db.prepare("DELETE FROM releases WHERE id = ?").run(id);
        })();
    }

    createRelease(release: Omit<Release, "id" | "created_at" | "artist_name" | "artist_slug">): number {
        const slug = release.slug || release.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";
        let finalSlug = slug;
        let attempt = 0;
        while (attempt < 100) {
            try {
                const result = this.db.prepare(`
                    INSERT INTO releases (title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, price_usdc, price_usdt, currency, external_links, visibility, published_at, published_to_gundb, published_to_ap, license, album_artist, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    release.title, finalSlug, release.artist_id, release.owner_id,
                    release.date, release.cover_path, release.genre, release.description, release.type, release.year,
                    release.download, release.price || 0, release.price_usdc || 0, release.price_usdt || 0, release.currency || 'ETH', release.external_links,
                    release.visibility || 'private', release.published_at, 
                    release.published_to_gundb ? 1 : 0, release.published_to_ap ? 1 : 0,
                    release.license, release.album_artist || null, release.status || 'draft'
                );
                return result.lastInsertRowid as number;
            } catch (e: any) {
                if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                    attempt++;
                    finalSlug = `${slug}-${attempt}`;
                } else {
                    throw e;
                }
            }
        }
        throw new Error("Could not create unique slug for release");
    }

    updateReleaseStatus(id: number, status: string): void {
        this.db.prepare("UPDATE releases SET status = ? WHERE id = ?").run(status, id);
    }
}
