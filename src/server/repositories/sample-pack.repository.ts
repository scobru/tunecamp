import type { Database as DatabaseType } from "better-sqlite3";

export interface SamplePack {
    id: number;
    title: string;
    slug: string;
    artistId: number | null;
    artistName: string | null;
    ownerId: number | null;
    description: string | null;
    coverPath: string | null;
    license: string;
    status: "pending" | "approved" | "rejected";
    curationNotes: string | null;
    createdAt: string;
    sampleCount: number;
}

export interface SamplePackListOptions {
    status?: string;
    artistId?: number;
    ownerId?: number;
    search?: string;
    limit?: number;
    offset?: number;
}

const KEY_MAP: Record<string, string> = {
    artistId: "artist_id",
    ownerId: "owner_id",
    coverPath: "cover_path",
    curationNotes: "curation_notes",
    createdAt: "created_at",
};

export class SamplePackRepository {
    constructor(protected db: DatabaseType) {}

    private static readonly SELECT_WITH_JOINS = `
        SELECT sample_packs.*, artists.name as artist_name, admin.username as owner_username,
            (SELECT COUNT(*) FROM samples WHERE samples.pack_id = sample_packs.id) as sample_count
        FROM sample_packs
        LEFT JOIN artists ON artists.id = sample_packs.artist_id
        LEFT JOIN admin ON admin.id = sample_packs.owner_id
    `;

    private mapPack(row: any): SamplePack {
        return {
            id: row.id,
            title: row.title,
            slug: row.slug,
            artistId: row.artist_id,
            artistName: row.artist_name || row.owner_username || null,
            ownerId: row.owner_id,
            description: row.description,
            coverPath: row.cover_path,
            license: row.license,
            status: row.status,
            curationNotes: row.curation_notes,
            createdAt: row.created_at,
            sampleCount: row.sample_count,
        };
    }

    getById(id: number): SamplePack | null {
        const row = this.db.prepare(`${SamplePackRepository.SELECT_WITH_JOINS} WHERE sample_packs.id = ?`).get(id);
        return row ? this.mapPack(row) : null;
    }

    getBySlug(slug: string): SamplePack | null {
        const row = this.db.prepare(`${SamplePackRepository.SELECT_WITH_JOINS} WHERE sample_packs.slug = ?`).get(slug);
        return row ? this.mapPack(row) : null;
    }

    private buildWhere(opts: SamplePackListOptions): { clause: string; params: any[] } {
        const conditions: string[] = [];
        const params: any[] = [];
        if (opts.status) {
            conditions.push("sample_packs.status = ?");
            params.push(opts.status);
        }
        if (opts.artistId) {
            conditions.push("sample_packs.artist_id = ?");
            params.push(opts.artistId);
        }
        if (opts.ownerId) {
            conditions.push("sample_packs.owner_id = ?");
            params.push(opts.ownerId);
        }
        if (opts.search) {
            conditions.push("(sample_packs.title LIKE ? OR sample_packs.description LIKE ?)");
            const term = `%${opts.search}%`;
            params.push(term, term);
        }
        return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
    }

    list(opts: SamplePackListOptions = {}): SamplePack[] {
        const { clause, params } = this.buildWhere(opts);
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;
        const rows = this.db
            .prepare(`${SamplePackRepository.SELECT_WITH_JOINS} ${clause} ORDER BY sample_packs.created_at DESC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset);
        return rows.map((r) => this.mapPack(r));
    }

    private makeSlug(title: string): string {
        return (
            title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "pack"
        );
    }

    create(pack: {
        title: string;
        artistId: number | null;
        ownerId: number | null;
        description: string | null;
        coverPath: string | null;
        license: string;
        status?: SamplePack["status"];
    }): SamplePack {
        const baseSlug = this.makeSlug(pack.title);
        let slug = baseSlug;
        let attempt = 0;
        const insert = this.db.prepare(`
            INSERT INTO sample_packs (title, slug, artist_id, owner_id, description, cover_path, license, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        while (true) {
            try {
                const info = insert.run(
                    pack.title,
                    slug,
                    pack.artistId,
                    pack.ownerId,
                    pack.description,
                    pack.coverPath,
                    pack.license,
                    pack.status ?? "pending"
                );
                return this.getById(info.lastInsertRowid as number)!;
            } catch (err: any) {
                if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && err.message.includes("slug")) {
                    attempt += 1;
                    slug = `${baseSlug}-${attempt}`;
                    continue;
                }
                throw err;
            }
        }
    }

    update(id: number, fields: Partial<Pick<SamplePack, "title" | "description" | "license" | "coverPath">>): SamplePack | null {
        const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
        if (entries.length === 0) return this.getById(id);
        const setClause = entries.map(([k]) => `${KEY_MAP[k] ?? k} = ?`).join(", ");
        const values = entries.map(([, v]) => v);
        this.db.prepare(`UPDATE sample_packs SET ${setClause} WHERE id = ?`).run(...values, id);
        return this.getById(id);
    }

    setModeration(id: number, status: SamplePack["status"], notes?: string): SamplePack | null {
        this.db.prepare("UPDATE sample_packs SET status = ?, curation_notes = ? WHERE id = ?").run(status, notes ?? null, id);
        this.db.prepare("UPDATE samples SET status = ?, curation_notes = ? WHERE pack_id = ?").run(status, notes ?? null, id);
        return this.getById(id);
    }

    delete(id: number): void {
        this.db.prepare("DELETE FROM sample_packs WHERE id = ?").run(id);
    }
}
