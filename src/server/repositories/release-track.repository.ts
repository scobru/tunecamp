import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { ReleaseTrack, Track } from "../core/database.types.js";

export class ReleaseTrackRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    getByReleaseId(releaseId: number): ReleaseTrack[] {
        return this.db.prepare("SELECT * FROM release_tracks WHERE release_id = ? ORDER BY track_num").all(releaseId) as any[];
    }

    getById(id: number): ReleaseTrack | undefined {
        return this.db.prepare("SELECT * FROM release_tracks WHERE id = ?").get(id) as any;
    }

    getPriceFromRelease(releaseId: number, trackId: number): { price: number, price_usdc: number, currency: string, title: string } | undefined {
        // Check if trackId is actually a track_id or an rt.id
        const row = this.db.prepare(`
            SELECT price, price_usdc, currency, title 
            FROM release_tracks 
            WHERE release_id = ? AND (track_id = ? OR id = ?)
            LIMIT 1
        `).get(releaseId, trackId, trackId) as any;
        
        if (!row) return undefined;
        return {
            price: row.price || 0,
            price_usdc: row.price_usdc || 0,
            currency: row.currency || 'ETH',
            title: row.title
        };
    }

    add(releaseId: number, track: Partial<ReleaseTrack>): number {
        const title = track.title || "Unknown Track";
        const artistName = track.artist_name || null;
        const duration = track.duration || 0;
        const filePath = track.file_path || null;
        const price = track.price || 0;
        const priceUsdc = track.price_usdc || 0;
        const priceUsdt = track.price_usdt || 0;
        const currency = track.currency || 'ETH';
        const trackId = track.track_id || null;

        let trackNum = track.track_num;
        if (trackNum === undefined || trackNum === null) {
            const maxNum = this.db.prepare("SELECT MAX(track_num) as max FROM release_tracks WHERE release_id = ?").get(releaseId) as { max: number | null };
            trackNum = (maxNum.max || 0) + 1;
        }

        const result = this.db.prepare(`
            INSERT INTO release_tracks (release_id, track_id, title, artist_name, track_num, duration, file_path, price, price_usdc, price_usdt, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(releaseId, trackId, title, artistName, trackNum, duration, filePath, price, priceUsdc, priceUsdt, currency);

        return result.lastInsertRowid as number;
    }

    update(id: number, metadata: Partial<ReleaseTrack>): void {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (['id', 'release_id', 'created_at'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length === 0) return;
        values.push(id);
        this.db.prepare(`UPDATE release_tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    updateMetadata(releaseId: number, trackId: number, metadata: Partial<ReleaseTrack>): void {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (['id', 'release_id', 'created_at'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length === 0) return;
        values.push(releaseId, trackId);
        this.db.prepare(`UPDATE release_tracks SET ${fields.join(', ')} WHERE release_id = ? AND track_id = ?`).run(...values);
    }

    remove(releaseId: number, trackId: number): void {
        this.db.prepare("DELETE FROM release_tracks WHERE release_id = ? AND track_id = ?").run(releaseId, trackId);
    }

    removeBatch(releaseId: number, trackIds: number[]): void {
        if (trackIds.length === 0) return;
        const CHUNK_SIZE = 900;
        for (let i = 0; i < trackIds.length; i += CHUNK_SIZE) {
            const chunk = trackIds.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            this.db.prepare(`DELETE FROM release_tracks WHERE release_id = ? AND track_id IN (${placeholders})`).run(releaseId, ...chunk);
        }
    }

    delete(id: number): void {
        this.db.prepare("DELETE FROM release_tracks WHERE id = ?").run(id);
    }

    deleteByRelease(releaseId: number): void {
        this.db.prepare("DELETE FROM release_tracks WHERE release_id = ?").run(releaseId);
    }

    updateOrder(releaseId: number, trackIds: number[]): void {
        this.db.transaction(() => {
            const stmt = this.db.prepare("UPDATE release_tracks SET track_num = ? WHERE release_id = ? AND track_id = ?");
            trackIds.forEach((trackId, index) => {
                stmt.run(index + 1, releaseId, trackId);
            });
        });
    }

    sync(releaseId: number, trackIds: number[]): void {
        this.db.transaction(() => {
            // 1. Fetch existing tracks to preserve "ghost tracks" (those not in library)
            const existingTracks = this.db.prepare("SELECT * FROM release_tracks WHERE release_id = ?").all(releaseId) as any[];
            
            // 2. Delete all existing tracks for this release
            this.deleteByRelease(releaseId);
            
            // 3. Add them back in the new order
            const insertStmt = this.db.prepare(`
                INSERT INTO release_tracks (
                    release_id, track_id, title, artist_name, track_num, 
                    duration, file_path, price, price_usdc, price_usdt, currency
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const libraryStmt = this.db.prepare("SELECT * FROM tracks WHERE id = ?");
            
            trackIds.forEach((id, index) => {
                if (!id) return;

                // Try to find in library
                const libraryTrack = libraryStmt.get(id) as any;
                if (libraryTrack) {
                    insertStmt.run(
                        releaseId, libraryTrack.id, libraryTrack.title, libraryTrack.artist_name, index + 1,
                        libraryTrack.duration, libraryTrack.file_path, libraryTrack.price, 
                        libraryTrack.price_usdc, libraryTrack.price_usdt, libraryTrack.currency || 'ETH'
                    );
                } else {
                    // Not in library, maybe it's a ghost track that was already in this release?
                    // The 'id' provided might be the old release_track_id
                    const ghost = existingTracks.find(t => t.id === id && t.track_id === null);
                    if (ghost) {
                        insertStmt.run(
                            releaseId, null, ghost.title, ghost.artist_name, index + 1,
                            ghost.duration, ghost.file_path, ghost.price,
                            ghost.price_usdc, ghost.price_usdt, ghost.currency || 'ETH'
                        );
                    } else {
                        console.warn(`⚠️ [ReleaseTrackRepository] Track ID ${id} not found in library or existing release tracks. Skipping.`);
                    }
                }
            });
        });
    }

    cleanUpGhostTracks(releaseId: number): void {
        this.db.prepare("DELETE FROM release_tracks WHERE release_id = ? AND track_id IS NULL").run(releaseId);
    }
}
