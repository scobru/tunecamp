import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SocialRepository } from '../social.repository.js';

describe('SocialRepository per-artist following', () => {
    let db: DatabaseType;
    let repo: SocialRepository;
    const REMOTE_ACTOR = "https://mastodon.social/users/alice";

    beforeEach(() => {
        db = new Database(":memory:");
        // Minimal schema mirroring the ap_following + remote_actors migration
        db.exec(`
            CREATE TABLE ap_following (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist_id INTEGER NOT NULL,
                actor_uri TEXT NOT NULL,
                inbox_uri TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(artist_id, actor_uri)
            );
            CREATE TABLE remote_actors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uri TEXT UNIQUE NOT NULL,
                type TEXT,
                username TEXT,
                name TEXT,
                summary TEXT,
                icon_url TEXT,
                inbox_url TEXT,
                outbox_url TEXT,
                public_key TEXT,
                is_followed INTEGER DEFAULT 0,
                last_seen TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
        repo = new SocialRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    test('two artists following the same remote actor track follow-back independently', () => {
        // Artist 1 follows the remote actor; Artist 2 does not.
        repo.addFollowing(1, REMOTE_ACTOR, "https://mastodon.social/users/alice/inbox");

        expect(repo.isFollowing(1, REMOTE_ACTOR)).toBe(true);
        expect(repo.isFollowing(2, REMOTE_ACTOR)).toBe(false);

        // Artist 2 now also follows back the same actor.
        repo.addFollowing(2, REMOTE_ACTOR);
        expect(repo.isFollowing(1, REMOTE_ACTOR)).toBe(true);
        expect(repo.isFollowing(2, REMOTE_ACTOR)).toBe(true);

        // Artist 1 unfollows — Artist 2's state must be unaffected.
        repo.removeFollowing(1, REMOTE_ACTOR);
        expect(repo.isFollowing(1, REMOTE_ACTOR)).toBe(false);
        expect(repo.isFollowing(2, REMOTE_ACTOR)).toBe(true);
    });

    test('addFollowing is idempotent on (artist_id, actor_uri)', () => {
        repo.addFollowing(1, REMOTE_ACTOR);
        repo.addFollowing(1, REMOTE_ACTOR, "https://mastodon.social/users/alice/inbox");

        const rows = db.prepare("SELECT * FROM ap_following WHERE artist_id = ? AND actor_uri = ?").all(1, REMOTE_ACTOR);
        expect(rows.length).toBe(1);
        expect(repo.isFollowing(1, REMOTE_ACTOR)).toBe(true);
    });

    test('getFollowingActors joins remote_actors for the requesting artist only', () => {
        db.prepare("INSERT INTO remote_actors (uri, type, username, name) VALUES (?, 'Person', 'alice', 'Alice')").run(REMOTE_ACTOR);
        repo.addFollowing(1, REMOTE_ACTOR);

        const artist1 = repo.getFollowingActors(1);
        expect(artist1.length).toBe(1);
        expect(artist1[0].uri).toBe(REMOTE_ACTOR);
        expect(artist1[0].name).toBe('Alice');
        expect(artist1[0].is_followed).toBe(false); // global flag is independent of per-artist following

        expect(repo.getFollowingActors(2).length).toBe(0);
    });
});
