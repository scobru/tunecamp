import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";

export interface DuplicatePath {
    file_path: string;
    count: number;
}

export interface BareTrack {
    id: number;
    norm_title: string;
}

export class MaintenanceRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    removePollutedImageTracks(): number {
        const res = this.db.prepare(`
            DELETE FROM tracks 
            WHERE file_path LIKE '%.png' 
               OR file_path LIKE '%.jpg' 
               OR file_path LIKE '%.jpeg'
               OR file_path LIKE '%.webp'
               OR file_path LIKE '%.gif'
               OR lossless_path LIKE '%.png'
               OR lossless_path LIKE '%.jpg'
               OR lossless_path LIKE '%.jpeg'
               OR lossless_path LIKE '%.webp'
               OR lossless_path LIKE '%.gif'
        `).run();
        return res.changes;
    }

    getPrimaryAdminId(): number | undefined {
        const admin = this.db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
        return admin?.id;
    }

    getAdminsWithoutArtist(): { id: number, username: string }[] {
        return this.db.prepare("SELECT id, username FROM admin WHERE artist_id IS NULL AND COALESCE(artist_unlinked, 0) = 0").all() as { id: number, username: string }[];
    }

    linkAdminToArtist(adminId: number, artistId: number): void {
        this.db.prepare("UPDATE admin SET artist_id = ? WHERE id = ?").run(artistId, adminId);
    }

    repairOwnershipGaps(adminId: number) {
        // Temporarily disable FK checks to fix legacy corrupted data or schema inconsistencies
        this.db.exec("PRAGMA foreign_keys = OFF");
        try {
            const trackFix = this.db.prepare("UPDATE tracks SET owner_id = ? WHERE owner_id IS NULL").run(adminId);
            const albumFix = this.db.prepare("UPDATE albums SET owner_id = ? WHERE owner_id IS NULL").run(adminId);
            
            const invalidTrackFix = this.db.prepare(`
                UPDATE tracks 
                SET owner_id = ? 
                WHERE owner_id NOT IN (SELECT id FROM admin)
            `).run(adminId);
            
            const invalidAlbumFix = this.db.prepare(`
                UPDATE albums 
                SET owner_id = ? 
                WHERE owner_id NOT IN (SELECT id FROM admin)
            `).run(adminId);

            const cleanTrackOwnership = this.db.prepare(`DELETE FROM track_ownership WHERE owner_id NOT IN (SELECT id FROM admin)`).run();
            const cleanAlbumOwnership = this.db.prepare(`DELETE FROM album_ownership WHERE owner_id NOT IN (SELECT id FROM admin)`).run();

            return {
                trackFix: trackFix.changes,
                invalidTrackFix: invalidTrackFix.changes,
                albumFix: albumFix.changes,
                invalidAlbumFix: invalidAlbumFix.changes,
                cleanTrackOwnership: cleanTrackOwnership.changes,
                cleanAlbumOwnership: cleanAlbumOwnership.changes
            };
        } finally {
            this.db.exec("PRAGMA foreign_keys = ON");
        }
    }

    fixOrphanedAlbums(): number {
        return this.db.prepare(`UPDATE albums SET is_release = 0 WHERE (is_release = 1 OR is_release IS NULL) AND id NOT IN (SELECT id FROM releases)`).run().changes;
    }

    fixPublicLeak(): { sealed: number, unsealed: number } {
        const fixPublicLeak = this.db.prepare(`UPDATE albums SET is_public = 0 WHERE is_public = 1 AND visibility NOT IN ('public', 'unlisted')`).run();
        const fixPublicMissing = this.db.prepare(`UPDATE albums SET is_public = 1 WHERE is_public = 0 AND visibility IN ('public', 'unlisted')`).run();
        return { sealed: fixPublicLeak.changes, unsealed: fixPublicMissing.changes };
    }

    getOrphanAlbumsWithTracks(): any[] {
        return this.db.prepare(`SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL AND artist_id IS NOT NULL`).all();
    }

    getTrackArtistsForAlbum(albumId: number): any[] {
        return this.db.prepare(`SELECT DISTINCT artist_id FROM tracks WHERE album_id = ? AND artist_id IS NOT NULL`).all(albumId);
    }

    getAlbumArtistId(albumId: number): number | null {
        const album = this.db.prepare(`SELECT artist_id FROM albums WHERE id = ?`).get(albumId) as any;
        return album?.artist_id;
    }

    setAlbumArtist(albumId: number, artistId: number): void {
        this.db.prepare(`UPDATE albums SET artist_id = ? WHERE id = ?`).run(artistId, albumId);
    }

    updateTrackPaths(repairs: { id: number, path: string, lossless: string | null }[]): number {
        let repairCount = 0;
        this.db.transaction(() => {
            const updateStmt = this.db.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?");
            for (const r of repairs) {
                updateStmt.run(r.path, r.lossless, r.id);
                repairCount++;
            }
        })();
        return repairCount;
    }

    getDuplicatePaths(): DuplicatePath[] {
        return this.db.prepare(`
            SELECT file_path, COUNT(*) as count
            FROM tracks
            WHERE file_path IS NOT NULL
            GROUP BY file_path
            HAVING count > 1
        `).all() as DuplicatePath[];
    }

    getTracksByPath(filePath: string): any[] {
        return this.db.prepare(`
            SELECT id, album_id, duration, fingerprint, external_id, lyrics, lossless_path
            FROM tracks WHERE file_path = ?
        `).all(filePath);
    }

    getBareTracks(): BareTrack[] {
        return this.db.prepare(`
            SELECT t.id, LOWER(TRIM(t.title)) as norm_title
            FROM tracks t
            WHERE (t.artist_id IS NULL OR t.artist_id = 0)
              AND (t.artist_name IS NULL OR t.artist_name = '')
              AND (t.album_id IS NULL OR t.album_id = 0)
              AND t.title IS NOT NULL AND TRIM(t.title) != ''
        `).all() as BareTrack[];
    }

    findRichMatchForBareTrack(normTitle: string, bareId: number): any {
        return this.db.prepare(`
            SELECT id, album_id, duration, fingerprint, external_id, lyrics, lossless_path, artist_id, artist_name
            FROM tracks
            WHERE LOWER(TRIM(title)) = ?
              AND id != ?
              AND (artist_id IS NOT NULL AND artist_id != 0 OR (artist_name IS NOT NULL AND artist_name != ''))
            ORDER BY
                (CASE WHEN album_id IS NOT NULL AND album_id != 0 THEN 8 ELSE 0 END) +
                (CASE WHEN duration IS NOT NULL AND duration != 0 THEN 4 ELSE 0 END) +
                (CASE WHEN fingerprint IS NOT NULL THEN 2 ELSE 0 END) +
                (CASE WHEN external_id IS NOT NULL THEN 1 ELSE 0 END) +
                (CASE WHEN lyrics IS NOT NULL THEN 1 ELSE 0 END) DESC
            LIMIT 1
        `).get(normTitle, bareId);
    }

    getAllTrackPaths(): { file_path: string | null, lossless_path: string | null }[] {
        return this.db.prepare("SELECT file_path, lossless_path FROM tracks WHERE file_path IS NOT NULL OR lossless_path IS NOT NULL").all() as any[];
    }

    repairArtistAssociations(): any {
        let trackFixCount = 0;
        const orphanTracks = this.db.prepare("SELECT DISTINCT artist_name FROM tracks WHERE artist_id IS NULL AND artist_name IS NOT NULL").all() as { artist_name: string }[];
        for (const ot of orphanTracks) {
            const artist = this.db.prepare("SELECT id FROM artists WHERE name = ? COLLATE NOCASE LIMIT 1").get(ot.artist_name) as { id: number } | undefined;
            if (artist) {
                const res = this.db.prepare("UPDATE tracks SET artist_id = ? WHERE artist_id IS NULL AND artist_name = ?").run(artist.id, ot.artist_name);
                trackFixCount += res.changes;
            }
        }

        let albumFixByNameCount = 0;
        const orphanAlbums = this.db.prepare("SELECT DISTINCT album_artist FROM albums WHERE artist_id IS NULL AND album_artist IS NOT NULL AND album_artist != ''").all() as { album_artist: string }[];
        for (const oa of orphanAlbums) {
            const artist = this.db.prepare("SELECT id FROM artists WHERE name = ? COLLATE NOCASE LIMIT 1").get(oa.album_artist) as { id: number } | undefined;
            if (artist) {
                const res = this.db.prepare("UPDATE albums SET artist_id = ? WHERE artist_id IS NULL AND album_artist = ?").run(artist.id, oa.album_artist);
                albumFixByNameCount += res.changes;
            }
        }

        const albumFix = this.db.prepare(`
            UPDATE albums 
            SET artist_id = (SELECT artist_id FROM tracks WHERE album_id = albums.id AND artist_id IS NOT NULL LIMIT 1)
            WHERE artist_id IS NULL AND id IN (SELECT DISTINCT album_id FROM tracks WHERE artist_id IS NOT NULL)
        `).run();

        return { trackFixCount, albumFixByNameCount, albumFixCount: albumFix.changes };
    }

    getAllArtists(): { id: number, name: string }[] {
        return this.db.prepare("SELECT id, name FROM artists").all() as { id: number, name: string }[];
    }

    getTablesWithArtistId(): string[] {
        return (this.db.prepare(
            "SELECT m.name as tbl FROM sqlite_master m WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'"
        ).all() as { tbl: string }[])
            .filter(r => {
                if (r.tbl === 'artists' || r.tbl === 'admin') return false;
                try {
                    const cols = this.db.prepare(`PRAGMA table_info(${r.tbl})`).all() as { name: string }[];
                    return cols.some(c => c.name === 'artist_id');
                } catch { return false; }
            })
            .map(r => r.tbl);
    }

    mergeArtists(fromId: number, keepId: number, tablesWithArtistId: string[]): void {
        this.db.transaction(() => {
            for (const tbl of tablesWithArtistId) {
                try {
                    this.db.prepare(`UPDATE OR IGNORE ${tbl} SET artist_id = ? WHERE artist_id = ?`).run(keepId, fromId);
                    this.db.prepare(`DELETE FROM ${tbl} WHERE artist_id = ?`).run(fromId);
                } catch (e) {
                    // Ignore missing tables or constraints during automated merge
                }
            }
            this.db.prepare("UPDATE admin SET artist_id = ? WHERE artist_id = ?").run(keepId, fromId);
            this.db.prepare("DELETE FROM artists WHERE id = ?").run(fromId);
        })();
    }
}
