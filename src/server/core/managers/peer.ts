import type { Database as DatabaseType } from "better-sqlite3";
import type { PeerManager, PeerSession, PeerTrack } from "../database.types.js";

export function createPeerManager(db: DatabaseType): PeerManager {
    return {
        createPeerSession(id: string, userId: number, ipAddress: string | null, allowDownloads: boolean): void {
            db.prepare(
                `INSERT OR REPLACE INTO peer_sessions (id, user_id, connected_at, last_seen, ip_address, allow_downloads) 
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).run(id, userId, Date.now(), Date.now(), ipAddress, allowDownloads ? 1 : 0);
        },
        updatePeerSessionHeartbeat(id: string): void {
            db.prepare("UPDATE peer_sessions SET last_seen = ? WHERE id = ?").run(Date.now(), id);
        },
        deletePeerSession(id: string): void {
            db.prepare("DELETE FROM peer_tracks WHERE session_id = ?").run(id);
            db.prepare("DELETE FROM peer_sessions WHERE id = ?").run(id);
        },
        deleteStaleSessionsForUser(userId: number): void {
            const staleIds = db.prepare("SELECT id FROM peer_sessions WHERE user_id = ?").all(userId) as { id: string }[];
            if (staleIds.length > 0) {
                const ids = staleIds.map(r => r.id);
                for (const id of ids) {
                    db.prepare("DELETE FROM peer_tracks WHERE session_id = ?").run(id);
                    db.prepare("DELETE FROM peer_sessions WHERE id = ?").run(id);
                }
            }
        },
        getPeerSession(id: string): PeerSession | undefined {
            const row = db.prepare(
                `SELECT ps.*, a.username 
                 FROM peer_sessions ps 
                 JOIN admin a ON ps.user_id = a.id 
                 WHERE ps.id = ?`
            ).get(id) as any;
            if (!row) return undefined;
            return {
                id: row.id,
                user_id: row.user_id,
                connected_at: row.connected_at,
                last_seen: row.last_seen,
                ip_address: row.ip_address,
                allow_downloads: !!row.allow_downloads,
                username: row.username
            };
        },
        getActivePeerSessions(): PeerSession[] {
            const rows = db.prepare(
                `SELECT ps.*, a.username, COUNT(pt.id) as trackCount 
                 FROM peer_sessions ps 
                 JOIN admin a ON ps.user_id = a.id 
                 LEFT JOIN peer_tracks pt ON ps.id = pt.session_id 
                 GROUP BY ps.id`
            ).all() as any[];
            return rows.map(row => ({
                id: row.id,
                user_id: row.user_id,
                connected_at: row.connected_at,
                last_seen: row.last_seen,
                ip_address: row.ip_address,
                allow_downloads: !!row.allow_downloads,
                username: row.username,
                trackCount: row.trackCount
            }));
        },
        replacePeerTracks(sessionId: string, tracks: Omit<PeerTrack, 'session_id' | 'created_at'>[]): void {
            db.transaction(() => {
                db.prepare("DELETE FROM peer_tracks WHERE session_id = ?").run(sessionId);
                const stmt = db.prepare(
                    `INSERT INTO peer_tracks (id, session_id, title, artist, album, duration, file_size, mime_type, allow_download, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );
                const now = Date.now();
                for (const t of tracks) {
                    stmt.run(
                        t.id,
                        sessionId,
                        t.title,
                        t.artist || null,
                        t.album || null,
                        t.duration || null,
                        t.file_size || null,
                        t.mime_type || null,
                        t.allow_download ? 1 : 0,
                        now
                    );
                }
            })();
        },
        getPeerTrack(sessionId: string, trackId: string): PeerTrack | undefined {
            const row = db.prepare("SELECT * FROM peer_tracks WHERE session_id = ? AND id = ?").get(sessionId, trackId) as any;
            if (!row) return undefined;
            return {
                id: row.id,
                session_id: row.session_id,
                title: row.title,
                artist: row.artist,
                album: row.album,
                duration: row.duration,
                file_size: row.file_size,
                mime_type: row.mime_type,
                allow_download: !!row.allow_download,
                created_at: row.created_at
            };
        },
        searchPeerTracks(query: string): PeerTrack[] {
            const formattedQuery = `%${query}%`;
            const rows = db.prepare(
                `SELECT pt.*, ps.user_id, a.username 
                 FROM peer_tracks pt 
                 JOIN peer_sessions ps ON pt.session_id = ps.id 
                 JOIN admin a ON ps.user_id = a.id 
                 WHERE pt.title LIKE ? OR pt.artist LIKE ? OR pt.album LIKE ? 
                 LIMIT 50`
            ).all(formattedQuery, formattedQuery, formattedQuery) as any[];
            return rows.map(row => ({
                id: row.id,
                session_id: row.session_id,
                title: row.title,
                artist: row.artist,
                album: row.album,
                duration: row.duration,
                file_size: row.file_size,
                mime_type: row.mime_type,
                allow_download: !!row.allow_download,
                created_at: row.created_at,
                username: row.username,
                user_id: row.user_id
            }));
        },
        getTracksByPeerSession(sessionId: string): PeerTrack[] {
            const rows = db.prepare("SELECT * FROM peer_tracks WHERE session_id = ?").all(sessionId) as any[];
            return rows.map(row => ({
                id: row.id,
                session_id: row.session_id,
                title: row.title,
                artist: row.artist,
                album: row.album,
                duration: row.duration,
                file_size: row.file_size,
                mime_type: row.mime_type,
                allow_download: !!row.allow_download,
                created_at: row.created_at
            }));
        },
        getTracksByPeerSessions(sessionIds: string[]): PeerTrack[] {
            if (sessionIds.length === 0) return [];

            const CHUNK_SIZE = 900;
            const results: PeerTrack[] = [];

            for (let i = 0; i < sessionIds.length; i += CHUNK_SIZE) {
                const chunk = sessionIds.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => "?").join(",");

                const rows = db.prepare(`SELECT * FROM peer_tracks WHERE session_id IN (${placeholders})`).all(chunk) as any[];

                results.push(...rows.map(row => ({
                    id: row.id,
                    session_id: row.session_id,
                    title: row.title,
                    artist: row.artist,
                    album: row.album,
                    duration: row.duration,
                    file_size: row.file_size,
                    mime_type: row.mime_type,
                    allow_download: !!row.allow_download,
                    created_at: row.created_at
                })));
            }

            return results;
        }
    };
}
