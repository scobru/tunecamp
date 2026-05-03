import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Album, Release } from "../database.types.js";

export class AlbumRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    private mapAlbum(row: any): Album | undefined {
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
            SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress, own.username as owner_name 
            FROM albums a
            LEFT JOIN artists ar ON a.artist_id = ar.id
            LEFT JOIN admin own ON a.owner_id = own.id
            WHERE a.id = ?
        `).get(id) as any;
        
        if (!row) {
            row = this.db.prepare(`
                SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress 
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
            SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress 
            FROM albums a 
            LEFT JOIN artists ar ON a.artist_id = ar.id 
            WHERE a.slug = ?
        `).get(slug) as any;

        if (!row) {
            row = this.db.prepare(`
                SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artist_slug, ar.wallet_address as walletAddress 
                FROM releases r
                LEFT JOIN artists ar ON r.artist_id = ar.id
                WHERE r.slug = ?
            `).get(slug) as any;
            if (row) row.is_release = 1;
        }
        return this.mapAlbum(row);
    }

    getLibraryAlbums(): Album[] {
        const rows = this.db.prepare(`
            SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress 
            FROM albums a 
            LEFT JOIN artists ar ON a.artist_id = ar.id 
            WHERE a.is_release = 0 
            ORDER BY a.title
        `).all();
        return rows.map(row => this.mapAlbum(row)) as Album[];
    }

    getByIds(ids: number[]): Album[] {
        if (ids.length === 0) return [];
        const CHUNK_SIZE = 900;
        const results: Album[] = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            const rows = this.db.prepare(`
                SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM albums a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.id IN (${placeholders})
            `).all(...chunk);
            results.push(...rows.map(row => this.mapAlbum(row)) as Album[]);

            const foundIds = new Set(results.map(r => r.id));
            const missingIds = chunk.filter(id => !foundIds.has(id));

            if (missingIds.length > 0) {
                const missingPlaceholders = missingIds.map(() => "?").join(",");
                const releaseRows = this.db.prepare(`
                    SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress FROM releases r
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
            ? `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
               WHERE r.visibility = 'public' AND r.status = 'released' ORDER BY r.date DESC`
            : `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
               ORDER BY r.date DESC`;
        const rows = this.db.prepare(sql).all();
        return rows.map((row: any) => ({ ...row, is_release: 1 })) as any[];
    }

    getByArtist(artistId: number): Album[] {
        const rows = this.db.prepare(`
            SELECT a.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug, ar.wallet_address as walletAddress 
            FROM albums a 
            LEFT JOIN artists ar ON a.artist_id = ar.id 
            WHERE a.artist_id = ?
            ORDER BY a.date DESC
        `).all(artistId);
        return rows.map(row => this.mapAlbum(row)) as Album[];
    }

    getReleasesByArtist(artistId: number, publicOnly = false): Release[] {
        const sql = publicOnly
            ? `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
               WHERE r.artist_id = ? AND r.visibility = 'public' AND r.status = 'released' ORDER BY r.date DESC`
            : `SELECT r.*, ar.name as artistName, ar.name as artist_name, ar.slug as artistSlug, ar.slug as artist_slug FROM releases r
               LEFT JOIN artists ar ON r.artist_id = ar.id
               WHERE r.artist_id = ? ORDER BY r.date DESC`;
        const rows = this.db.prepare(sql).all(artistId);
        return rows.map((row: any) => ({ ...row, is_release: 1 })) as any[];
    }
}
