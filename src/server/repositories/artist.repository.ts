import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Artist } from "../core/database.types.js";

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

    create(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility: 'public' | 'private' | 'unlisted' = 'private', externalId?: string): number {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
        const linksJson = links ? JSON.stringify(links) : null;
        const postParamsJson = postParams ? JSON.stringify(postParams) : null;
        let finalSlug = slug;
        let attempt = 0;
        while (attempt < 100) {
            try {
                const result = this.db
                    .prepare("INSERT INTO artists (name, slug, bio, photo_path, links, post_params, wallet_address, visibility, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    .run(name, finalSlug, bio || null, photoPath || null, linksJson, postParamsJson, walletAddress || null, visibility, externalId || null);
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
        throw new Error("Could not create unique slug for artist");
    }

    update(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted'): void {
        const linksJson = links ? JSON.stringify(links) : undefined;
        const postParamsJson = postParams ? JSON.stringify(postParams) : undefined;
        this.db.prepare(`
            UPDATE artists SET 
                name = COALESCE(?, name),
                bio = COALESCE(?, bio),
                photo_path = COALESCE(?, photo_path),
                links = COALESCE(?, links),
                post_params = COALESCE(?, post_params),
                wallet_address = COALESCE(?, wallet_address),
                visibility = COALESCE(?, visibility)
            WHERE id = ?
        `).run(name ?? null, bio ?? null, photoPath ?? null, linksJson ?? null, postParamsJson ?? null, walletAddress ?? null, visibility ?? null, id);
    }

    updateKeys(id: number, publicKey: string, privateKey: string): void {
        this.db.prepare("UPDATE artists SET public_key = ?, private_key = ? WHERE id = ?").run(publicKey, privateKey, id);
    }

    delete(id: number): void {
        this.db.transaction(() => {
            this.db.prepare("UPDATE albums SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("UPDATE tracks SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("DELETE FROM followers WHERE artist_id = ?").run(id);
            this.db.prepare("DELETE FROM artists WHERE id = ?").run(id);
        })();
    }
}
