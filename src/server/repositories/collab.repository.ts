import type { Database as DatabaseType } from "better-sqlite3";

export interface CollabProject {
    id: number;
    title: string;
    description: string | null;
    ownerId: number;
    ownerUsername: string | null;
    visibility: "shared" | "private";
    createdAt: string;
    updatedAt: string;
    versionCount: number;
}

export interface CollabVersion {
    id: number;
    projectId: number;
    version: number;
    authorId: number;
    authorUsername: string | null;
    state: string;
    note: string | null;
    createdAt: string;
}

export interface CollabStem {
    id: number;
    projectId: number;
    authorId: number;
    authorUsername: string | null;
    name: string;
    filePath: string;
    mimeType: string | null;
    duration: number | null;
    createdAt: string;
}

export class CollabRepository {
    constructor(protected db: DatabaseType) {}

    private static readonly PROJECT_SELECT = `
        SELECT collab_projects.*, admin.username as owner_username,
            (SELECT COUNT(*) FROM collab_versions WHERE collab_versions.project_id = collab_projects.id) as version_count
        FROM collab_projects
        LEFT JOIN admin ON admin.id = collab_projects.owner_id
    `;

    private mapProject(row: any): CollabProject {
        return {
            id: row.id,
            title: row.title,
            description: row.description,
            ownerId: row.owner_id,
            ownerUsername: row.owner_username,
            visibility: row.visibility,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            versionCount: row.version_count,
        };
    }

    private mapVersion(row: any): CollabVersion {
        return {
            id: row.id,
            projectId: row.project_id,
            version: row.version,
            authorId: row.author_id,
            authorUsername: row.author_username,
            state: row.state,
            note: row.note,
            createdAt: row.created_at,
        };
    }

    private mapStem(row: any): CollabStem {
        return {
            id: row.id,
            projectId: row.project_id,
            authorId: row.author_id,
            authorUsername: row.author_username,
            name: row.name,
            filePath: row.file_path,
            mimeType: row.mime_type,
            duration: row.duration,
            createdAt: row.created_at,
        };
    }

    getById(id: number): CollabProject | null {
        const row = this.db.prepare(`${CollabRepository.PROJECT_SELECT} WHERE collab_projects.id = ?`).get(id);
        return row ? this.mapProject(row) : null;
    }

    list(opts: { ownerId?: number; visibility?: string; limit?: number; offset?: number } = {}): CollabProject[] {
        const conditions: string[] = [];
        const params: any[] = [];
        if (opts.ownerId !== undefined) {
            conditions.push("collab_projects.owner_id = ?");
            params.push(opts.ownerId);
        }
        if (opts.visibility) {
            conditions.push("collab_projects.visibility = ?");
            params.push(opts.visibility);
        }
        const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;
        const rows = this.db
            .prepare(`${CollabRepository.PROJECT_SELECT} ${clause} ORDER BY collab_projects.updated_at DESC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset);
        return rows.map((r) => this.mapProject(r));
    }

    create(project: { title: string; description: string | null; ownerId: number; visibility?: "shared" | "private" }): CollabProject {
        const info = this.db
            .prepare(`INSERT INTO collab_projects (title, description, owner_id, visibility) VALUES (?, ?, ?, ?)`)
            .run(project.title, project.description, project.ownerId, project.visibility ?? "shared");
        return this.getById(info.lastInsertRowid as number)!;
    }

    touch(id: number): void {
        this.db.prepare(`UPDATE collab_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    }

    delete(id: number): void {
        this.db.prepare("DELETE FROM collab_projects WHERE id = ?").run(id);
    }

    listVersions(projectId: number): CollabVersion[] {
        const rows = this.db
            .prepare(
                `SELECT collab_versions.*, admin.username as author_username
                 FROM collab_versions LEFT JOIN admin ON admin.id = collab_versions.author_id
                 WHERE collab_versions.project_id = ? ORDER BY collab_versions.version DESC`
            )
            .all(projectId);
        return rows.map((r) => this.mapVersion(r));
    }

    getLatestVersionNumber(projectId: number): number {
        const row = this.db
            .prepare(`SELECT MAX(version) as maxVersion FROM collab_versions WHERE project_id = ?`)
            .get(projectId) as { maxVersion: number | null };
        return row.maxVersion ?? 0;
    }

    createVersion(entry: { projectId: number; authorId: number; state: string; note: string | null }): CollabVersion {
        const nextVersion = this.getLatestVersionNumber(entry.projectId) + 1;
        const info = this.db
            .prepare(`INSERT INTO collab_versions (project_id, version, author_id, state, note) VALUES (?, ?, ?, ?, ?)`)
            .run(entry.projectId, nextVersion, entry.authorId, entry.state, entry.note);
        this.touch(entry.projectId);
        const row = this.db
            .prepare(
                `SELECT collab_versions.*, admin.username as author_username
                 FROM collab_versions LEFT JOIN admin ON admin.id = collab_versions.author_id
                 WHERE collab_versions.id = ?`
            )
            .get(info.lastInsertRowid);
        return this.mapVersion(row);
    }

    listStems(projectId: number): CollabStem[] {
        const rows = this.db
            .prepare(
                `SELECT collab_stems.*, admin.username as author_username
                 FROM collab_stems LEFT JOIN admin ON admin.id = collab_stems.author_id
                 WHERE collab_stems.project_id = ? ORDER BY collab_stems.created_at ASC`
            )
            .all(projectId);
        return rows.map((r) => this.mapStem(r));
    }

    getStemById(id: number): CollabStem | null {
        const row = this.db
            .prepare(
                `SELECT collab_stems.*, admin.username as author_username
                 FROM collab_stems LEFT JOIN admin ON admin.id = collab_stems.author_id
                 WHERE collab_stems.id = ?`
            )
            .get(id);
        return row ? this.mapStem(row) : null;
    }

    createStem(stem: { projectId: number; authorId: number; name: string; filePath: string; mimeType: string | null; duration: number | null }): CollabStem {
        const info = this.db
            .prepare(`INSERT INTO collab_stems (project_id, author_id, name, file_path, mime_type, duration) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(stem.projectId, stem.authorId, stem.name, stem.filePath, stem.mimeType, stem.duration);
        this.touch(stem.projectId);
        return this.getStemById(info.lastInsertRowid as number)!;
    }

    deleteStem(id: number): void {
        this.db.prepare("DELETE FROM collab_stems WHERE id = ?").run(id);
    }
}
