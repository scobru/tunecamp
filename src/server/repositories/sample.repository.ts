import type { Database as DatabaseType, Statement } from "better-sqlite3";

export interface Sample {
    id: number;
    title: string;
    slug: string;
    artistId: number | null;
    artistName: string | null;
    ownerId: number | null;
    description: string | null;
    filePath: string;
    format: string | null;
    duration: number | null;
    fileSize: number;
    bpm: number | null;
    musicalKey: string | null;
    tags: string[];
    license: string;
    attributionName: string | null;
    coverPath: string | null;
    status: "pending" | "approved" | "rejected";
    curationNotes: string | null;
    downloadCount: number;
    createdAt: string;
}

export interface SampleListOptions {
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
    filePath: "file_path",
    fileSize: "file_size",
    musicalKey: "musical_key",
    attributionName: "attribution_name",
    coverPath: "cover_path",
    curationNotes: "curation_notes",
    downloadCount: "download_count",
    createdAt: "created_at",
};

export class SampleRepository {
    constructor(protected db: DatabaseType) {}

    private mapSample(row: any): Sample {
        return {
            id: row.id,
            title: row.title,
            slug: row.slug,
            artistId: row.artist_id,
            artistName: row.artist_name || row.attribution_name || row.owner_username || null,
            ownerId: row.owner_id,
            description: row.description,
            filePath: row.file_path,
            format: row.format,
            duration: row.duration,
            fileSize: row.file_size,
            bpm: row.bpm,
            musicalKey: row.musical_key,
            tags: row.tags ? JSON.parse(row.tags) : [],
            license: row.license,
            attributionName: row.attribution_name,
            coverPath: row.cover_path,
            status: row.status,
            curationNotes: row.curation_notes,
            downloadCount: row.download_count,
            createdAt: row.created_at,
        };
    }

    private static readonly SELECT_WITH_JOINS = `
        SELECT samples.*, artists.name as artist_name, admin.username as owner_username
        FROM samples
        LEFT JOIN artists ON artists.id = samples.artist_id
        LEFT JOIN admin ON admin.id = samples.owner_id
    `;

    getById(id: number): Sample | null {
        const row = this.db.prepare(`${SampleRepository.SELECT_WITH_JOINS} WHERE samples.id = ?`).get(id);
        return row ? this.mapSample(row) : null;
    }

    getBySlug(slug: string): Sample | null {
        const row = this.db.prepare(`${SampleRepository.SELECT_WITH_JOINS} WHERE samples.slug = ?`).get(slug);
        return row ? this.mapSample(row) : null;
    }

    private buildWhere(opts: SampleListOptions): { clause: string; params: any[] } {
        const conditions: string[] = [];
        const params: any[] = [];
        if (opts.status) {
            conditions.push("samples.status = ?");
            params.push(opts.status);
        }
        if (opts.artistId) {
            conditions.push("samples.artist_id = ?");
            params.push(opts.artistId);
        }
        if (opts.ownerId) {
            conditions.push("samples.owner_id = ?");
            params.push(opts.ownerId);
        }
        if (opts.search) {
            conditions.push("(samples.title LIKE ? OR samples.description LIKE ? OR samples.tags LIKE ?)");
            const term = `%${opts.search}%`;
            params.push(term, term, term);
        }
        return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
    }

    list(opts: SampleListOptions = {}): Sample[] {
        const { clause, params } = this.buildWhere(opts);
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;
        const rows = this.db
            .prepare(`${SampleRepository.SELECT_WITH_JOINS} ${clause} ORDER BY samples.created_at DESC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset);
        return rows.map((r) => this.mapSample(r));
    }

    count(opts: SampleListOptions = {}): number {
        const { clause, params } = this.buildWhere(opts);
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM samples ${clause}`).get(...params) as { count: number };
        return row.count;
    }

    private makeSlug(title: string): string {
        return (
            title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "sample"
        );
    }

    create(sample: Omit<Sample, "id" | "slug" | "status" | "downloadCount" | "createdAt" | "curationNotes" | "artistName"> & {
        status?: Sample["status"];
    }): Sample {
        const baseSlug = this.makeSlug(sample.title);
        let slug = baseSlug;
        let attempt = 0;
        const insert = this.db.prepare(`
            INSERT INTO samples (
                title, slug, artist_id, owner_id, description, file_path, format, duration,
                file_size, bpm, musical_key, tags, license, attribution_name, cover_path, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        while (true) {
            try {
                const info = insert.run(
                    sample.title,
                    slug,
                    sample.artistId,
                    sample.ownerId,
                    sample.description,
                    sample.filePath,
                    sample.format,
                    sample.duration,
                    sample.fileSize,
                    sample.bpm,
                    sample.musicalKey,
                    JSON.stringify(sample.tags ?? []),
                    sample.license,
                    sample.attributionName,
                    sample.coverPath,
                    sample.status ?? "pending"
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

    update(id: number, fields: Partial<Sample>): Sample | null {
        const entries = Object.entries(fields).filter(([k]) => k !== "id" && k !== "createdAt");
        if (entries.length === 0) return this.getById(id);
        const setClause = entries.map(([k]) => `${KEY_MAP[k] ?? k} = ?`).join(", ");
        const values = entries.map(([k, v]) => (k === "tags" ? JSON.stringify(v ?? []) : v));
        this.db.prepare(`UPDATE samples SET ${setClause} WHERE id = ?`).run(...values, id);
        return this.getById(id);
    }

    setModeration(id: number, status: Sample["status"], notes?: string): Sample | null {
        this.db.prepare("UPDATE samples SET status = ?, curation_notes = ? WHERE id = ?").run(status, notes ?? null, id);
        return this.getById(id);
    }

    incrementDownloadCount(id: number): void {
        this.db.prepare("UPDATE samples SET download_count = download_count + 1 WHERE id = ?").run(id);
    }

    delete(id: number): void {
        this.db.prepare("DELETE FROM samples WHERE id = ?").run(id);
    }
}
