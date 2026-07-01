import type { Database as DatabaseType } from "better-sqlite3";
import type { Report } from "../core/database.types.js";

export class ReportsRepository {
    constructor(protected db: DatabaseType) {}

    createReport(report: Omit<Report, "id" | "created_at" | "status">): number {
        const stmt = this.db.prepare(`
            INSERT INTO reports (reporter_id, reporter_name, reporter_email, release_id, reason, details)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            report.reporter_id,
            report.reporter_name,
            report.reporter_email,
            report.release_id,
            report.reason,
            report.details
        );
        return result.lastInsertRowid as number;
    }

    getReports(): Report[] {
        return this.db.prepare(`
            SELECT 
                r.*,
                al.title AS release_title,
                al.slug AS release_slug,
                ar.name AS artist_name
            FROM reports r
            JOIN albums al ON r.release_id = al.id
            LEFT JOIN artists ar ON al.artist_id = ar.id
            ORDER BY r.created_at DESC
        `).all() as Report[];
    }

    deleteReport(id: number): void {
        this.db.prepare("DELETE FROM reports WHERE id = ?").run(id);
    }
}
