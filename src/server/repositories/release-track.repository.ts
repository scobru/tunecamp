import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { ReleaseTrack } from "../core/database.types.js";

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
        const trackId = track.track_id;
        const title = track.title || "Unknown Track";
        const artistName = track.artist_name || null;
        const duration = track.duration || 0;
        const filePath = track.file_path || null;
        const price = track.price || 0;
        const priceUsdc = track.price_usdc || 0;
        const priceUsdt = track.price_usdt || 0;
        const currency = track.currency || 'ETH';

        let trackNum = track.track_num;
        if (trackNum === undefined || trackNum === null) {
            const maxNum = this.db.prepare("SELECT MAX(track_num) as max FROM tracks WHERE album_id = ?").get(releaseId) as { max: number | null };
            trackNum = (maxNum.max || 0) + 1;
        }

        if (trackId) {
            this.db.prepare(`
                UPDATE tracks 
                SET album_id = ?, track_num = ?, price = ?, price_usdc = ?, price_usdt = ?, currency = ?
                WHERE id = ?
            `).run(releaseId, trackNum, price, priceUsdc, priceUsdt, currency, trackId);
            return trackId;
        } else {
            const result = this.db.prepare(`
                INSERT INTO tracks (title, album_id, artist_name, track_num, duration, file_path, price, price_usdc, price_usdt, currency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(title, releaseId, artistName, trackNum, duration, filePath, price, priceUsdc, priceUsdt, currency);
            return result.lastInsertRowid as number;
        }
    }

    update(id: number, metadata: Partial<ReleaseTrack>): void {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (['id', 'release_id', 'track_id', 'created_at'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length === 0) return;
        values.push(id);
        this.db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    updateMetadata(releaseId: number, trackId: number, metadata: Partial<ReleaseTrack>): void {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (['id', 'release_id', 'track_id', 'created_at'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length === 0) return;
        values.push(releaseId, trackId);
        this.db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE album_id = ? AND id = ?`).run(...values);
    }

    remove(releaseId: number, trackId: number): void {
        this.db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ? AND id = ?").run(releaseId, trackId);
    }

    removeBatch(releaseId: number, trackIds: number[]): void {
        if (trackIds.length === 0) return;
        const CHUNK_SIZE = 900;
        for (let i = 0; i < trackIds.length; i += CHUNK_SIZE) {
            const chunk = trackIds.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            this.db.prepare(`UPDATE tracks SET album_id = NULL WHERE album_id = ? AND id IN (${placeholders})`).run(releaseId, ...chunk);
        }
    }

    delete(id: number): void {
        this.db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
    }

    deleteByRelease(releaseId: number): void {
        this.db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ?").run(releaseId);
    }

    updateOrder(releaseId: number, trackIds: number[]): void {
        this.db.transaction(() => {
            const stmt = this.db.prepare("UPDATE tracks SET track_num = ? WHERE album_id = ? AND id = ?");
            trackIds.forEach((trackId, index) => {
                stmt.run(index + 1, releaseId, trackId);
            });
        })();
    }

    sync(releaseId: number, trackIds: number[]): void {
        this.db.transaction(() => {
            // 1. Unlink all existing tracks for this album
            this.db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ?").run(releaseId);
            
            // 2. Link and order the new trackIds
            const stmt = this.db.prepare("UPDATE tracks SET album_id = ?, track_num = ? WHERE id = ?");
            trackIds.forEach((id, index) => {
                if (id) {
                     stmt.run(releaseId, index + 1, id);
                }
            });
        })();
    }

    cleanUpGhostTracks(releaseId: number): void {
        this.db.prepare("DELETE FROM tracks WHERE album_id = ? AND file_path IS NULL").run(releaseId);
    }
}
