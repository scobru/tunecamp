import fs from "fs-extra";
import path from "path";
import type { Database as DatabaseType } from "better-sqlite3";

interface UserStorageRow {
    id: number;
    username: string;
    role: string;
    used: number;        // bytes attributed to this user (SUM of owned tracks' file_size)
    quota: number;       // storage_quota in bytes (0 = unlimited)
    trackCount: number;
}

export interface InstanceStorage {
    diskUsed: number;        // real bytes occupied on disk under musicDir
    dbTotal: number;         // SUM(file_size) across all tracks (logical)
    quotaAllocated: number;  // SUM(storage_quota) across users with a finite quota
    trackCount: number;
    byUser: UserStorageRow[];
}

export interface RecomputeResult {
    scanned: number;   // tracks inspected
    updated: number;   // tracks whose file_size changed
    missing: number;   // tracks whose file could not be found on disk
}

/**
 * Recursively sum the size of every file under `dir`. Symlinks are not
 * followed and unreadable entries are skipped so a single bad file cannot
 * abort the whole measurement.
 */
async function dirSize(dir: string): Promise<number> {
    let total = 0;
    let entries: fs.Dirent[];
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        try {
            if (entry.isDirectory()) {
                total += await dirSize(full);
            } else if (entry.isFile()) {
                const st = await fs.stat(full);
                total += st.size;
            }
        } catch {
            // Skip files that vanished or are unreadable mid-scan.
        }
    }
    return total;
}

/**
 * Resolve the on-disk size of a track's primary and lossless files.
 * Paths are stored relative to musicDir. Returns 0 when nothing is found.
 */
function trackDiskSize(musicDir: string, filePath?: string | null, losslessPath?: string | null): number {
    let size = 0;
    for (const rel of [filePath, losslessPath]) {
        if (!rel) continue;
        try {
            const st = fs.statSync(path.join(musicDir, rel));
            if (st.isFile()) size += st.size;
        } catch {
            // Missing/external file — contributes nothing.
        }
    }
    return size;
}

/**
 * Backfill tracks.file_size from the actual files on disk. Tracks imported via
 * library-sync historically stored 0, which made every storage metric read empty.
 */
export function recomputeFileSizes(db: DatabaseType, musicDir: string): RecomputeResult {
    const rows = db
        .prepare("SELECT id, file_path, lossless_path, file_size FROM tracks WHERE file_path IS NOT NULL")
        .all() as Array<{ id: number; file_path: string | null; lossless_path: string | null; file_size: number | null }>;

    let updated = 0;
    let missing = 0;

    const updates: Array<{ id: number; size: number }> = [];
    for (const row of rows) {
        try {
            const size = trackDiskSize(musicDir, row.file_path, row.lossless_path);
            if (size === 0) {
                missing++;
                continue;
            }
            if (size !== (row.file_size || 0)) {
                updates.push({ id: row.id, size });
                updated++;
            }
        } catch (err) {
            // Ignore
        }
    }

    if (updates.length > 0) {
        const BATCH_SIZE = 500;
        const updateQuery = db.prepare(`
            UPDATE tracks
            SET file_size = CAST(json_extract(value, '$.size') AS INTEGER)
            FROM (SELECT value FROM json_each(?)) as updates
            WHERE tracks.id = CAST(json_extract(updates.value, '$.id') AS INTEGER)
        `);

        const run = db.transaction(() => {
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                const batch = updates.slice(i, i + BATCH_SIZE);
                updateQuery.run(JSON.stringify(batch));
            }
        });
        run();
    }

    return { scanned: rows.length, updated, missing };
}

/**
 * Recompute every user's storage_used from the file_size of the tracks they own.
 * Keeps the quota gate (upload.ts) honest after backfills or bulk imports.
 */
export function recomputeUserStorage(db: DatabaseType): void {
    db.transaction(() => {
        db.prepare(`
            UPDATE admin SET storage_used = COALESCE((
                SELECT SUM(t.file_size) FROM tracks t WHERE t.owner_id = admin.id
            ), 0)
        `).run();
    })();
}

/** Build the instance-wide storage overview for the root admin dashboard. */
export async function getInstanceStorage(db: DatabaseType, musicDir: string): Promise<InstanceStorage> {
    const dbTotal = (db.prepare("SELECT COALESCE(SUM(file_size), 0) AS s FROM tracks").get() as any).s as number;
    const trackCount = (db.prepare("SELECT COUNT(*) AS c FROM tracks").get() as any).c as number;
    const quotaAllocated = (db.prepare("SELECT COALESCE(SUM(storage_quota), 0) AS s FROM admin WHERE storage_quota > 0").get() as any).s as number;

    const byUser = (db.prepare(`
        SELECT
            a.id AS id,
            a.username AS username,
            a.role AS role,
            a.storage_quota AS quota,
            COALESCE(SUM(t.file_size), 0) AS used,
            COUNT(t.id) AS trackCount
        FROM admin a
        LEFT JOIN tracks t ON t.owner_id = a.id
        GROUP BY a.id
        ORDER BY used DESC
    `).all() as Array<UserStorageRow>);

    const diskUsed = await dirSize(musicDir);

    return { diskUsed, dbTotal, quotaAllocated, trackCount, byUser };
}
