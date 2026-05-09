import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Artist } from "../database.types.js";

export class ArtistRepository extends BaseRepository {
    private getArtistStmt: Statement;
    private getArtistSimpleStmt: Statement;
    private getArtistBySlugStmt: Statement;
    private getArtistByNameStmt: Statement;

    constructor(db: DatabaseType) {
        super(db);

        const baseSelect = `
            SELECT a.*, a.wallet_address as walletAddress,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                  THEN 0 ELSE 1 END) as isLibraryArtist
            FROM artists a
        `;

        this.getArtistStmt = this.db.prepare(`${baseSelect} WHERE a.id = ?`);
        this.getArtistSimpleStmt = this.db.prepare(`SELECT a.*, a.wallet_address as walletAddress FROM artists a WHERE a.id = ?`);
        this.getArtistBySlugStmt = this.db.prepare(`${baseSelect} WHERE a.slug = ?`);
        this.getArtistByNameStmt = this.db.prepare(`${baseSelect} WHERE a.name = ? COLLATE NOCASE`);
    }

    private mapArtist(row: any): Artist | undefined {
        if (!row) return undefined;
        return {
            ...row,
            isLibraryArtist: !!row.isLibraryArtist,
        } as Artist;
    }

    getById(id: number): Artist | undefined {
        const row = this.getArtistStmt.get(id);
        return this.mapArtist(row);
    }

    getByIdSimple(id: number): Artist | undefined {
        const row = this.getArtistSimpleStmt.get(id);
        return this.mapArtist(row);
    }

    getBySlug(slug: string): Artist | undefined {
        const row = this.getArtistBySlugStmt.get(slug);
        return this.mapArtist(row);
    }

    getByName(name: string): Artist | undefined {
        const row = this.getArtistByNameStmt.get(name);
        return this.mapArtist(row);
    }

    getAll(): Artist[] {
        const sql = `
            SELECT a.*, a.wallet_address as walletAddress,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                  THEN 0 ELSE 1 END) as isLibraryArtist
            FROM artists a ORDER BY a.name
        `;
        const rows = this.db.prepare(sql).all();
        return rows.map(row => this.mapArtist(row)) as Artist[];
    }

    getByIds(ids: number[]): Artist[] {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => "?").join(",");
        const sql = `
            SELECT a.*, a.wallet_address as walletAddress,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                  THEN 0 ELSE 1 END) as isLibraryArtist
            FROM artists a WHERE a.id IN (${placeholders})
        `;
        const rows = this.db.prepare(sql).all(...ids);
        return rows.map(row => this.mapArtist(row)) as Artist[];
    }
}
