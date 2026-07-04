import { describe, test, expect, beforeEach } from "@jest/globals";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { createPeerManager } from "../peer.js";
import type { PeerManager } from "../../database.types.js";

function setupDb(): DatabaseType {
    const db = new Database(":memory:");
    db.exec(`
        CREATE TABLE admin (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL
        );
        CREATE TABLE peer_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            connected_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            ip_address TEXT,
            allow_downloads INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE peer_tracks (
            id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            title TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            duration REAL,
            file_size INTEGER,
            mime_type TEXT,
            allow_download INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (id, session_id)
        );
    `);
    db.prepare("INSERT INTO admin (id, username) VALUES (1, 'homologo')").run();
    return db;
}

// Insert a session with an explicit last_seen so freshness can be exercised.
function seedSession(db: DatabaseType, id: string, lastSeen: number) {
    db.prepare(
        "INSERT INTO peer_sessions (id, user_id, connected_at, last_seen, ip_address, allow_downloads) VALUES (?, 1, ?, ?, '1.2.3.4', 1)"
    ).run(id, lastSeen, lastSeen);
    db.prepare(
        "INSERT INTO peer_tracks (id, session_id, title, created_at) VALUES (?, ?, 'Song', ?)"
    ).run(`trk-${id}`, id, lastSeen);
}

describe("PeerManager stale-session handling", () => {
    let db: DatabaseType;
    let manager: PeerManager;

    beforeEach(() => {
        db = setupDb();
        manager = createPeerManager(db);
    });

    test("getActivePeerSessions hides sessions older than the freshness threshold", () => {
        const now = Date.now();
        seedSession(db, "fresh", now - 10_000);      // 10s ago — live
        seedSession(db, "ghost", now - 17 * 3600_000); // 17h ago — dead

        const withThreshold = manager.getActivePeerSessions(90_000);
        expect(withThreshold.map(s => s.id)).toEqual(["fresh"]);

        // Without a threshold the legacy behaviour returns everything.
        const all = manager.getActivePeerSessions();
        expect(all.map(s => s.id).sort()).toEqual(["fresh", "ghost"]);
    });

    test("deleteStaleSessions purges dead rows and their tracks, keeping live ones", () => {
        const now = Date.now();
        seedSession(db, "fresh", now - 10_000);
        seedSession(db, "ghost", now - 17 * 3600_000);

        manager.deleteStaleSessions(90_000);

        const sessionIds = db.prepare("SELECT id FROM peer_sessions").all().map((r: any) => r.id);
        expect(sessionIds).toEqual(["fresh"]);

        const trackSessionIds = db.prepare("SELECT DISTINCT session_id FROM peer_tracks").all().map((r: any) => r.session_id);
        expect(trackSessionIds).toEqual(["fresh"]);
    });

    test("deletePeerSession removes an orphaned row that has no live socket (admin kick)", () => {
        const now = Date.now();
        seedSession(db, "orphan", now - 17 * 3600_000);

        manager.deletePeerSession("orphan");

        expect(db.prepare("SELECT COUNT(*) AS c FROM peer_sessions").get()).toEqual({ c: 0 });
        expect(db.prepare("SELECT COUNT(*) AS c FROM peer_tracks").get()).toEqual({ c: 0 });
    });
});
