import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SocialRepository } from '../social.repository.js';

describe('SocialRepository.addFollower upsert semantics', () => {
    let db: DatabaseType;
    let repo: SocialRepository;
    const ARTIST_ID = -1; // site actor
    const ACTOR = "https://mastodon.social/users/francesco";
    const INBOX = "https://mastodon.social/users/francesco/inbox";

    beforeEach(() => {
        db = new Database(":memory:");
        // Schema mirroring the followers table (incl. the follow_id column).
        db.exec(`
            CREATE TABLE followers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artist_id INTEGER,
                actor_uri TEXT NOT NULL,
                inbox_uri TEXT NOT NULL,
                shared_inbox_uri TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending',
                follow_id TEXT,
                UNIQUE(artist_id, actor_uri)
            );
        `);
        repo = new SocialRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    const statusOf = (actor = ACTOR) =>
        (db.prepare("SELECT status FROM followers WHERE artist_id = ? AND actor_uri = ?").get(ARTIST_ID, actor) as any)?.status;
    const inboxOf = (actor = ACTOR) =>
        (db.prepare("SELECT inbox_uri FROM followers WHERE artist_id = ? AND actor_uri = ?").get(ARTIST_ID, actor) as any)?.inbox_uri;

    test('a re-delivered Follow does NOT downgrade an accepted follower back to pending', () => {
        repo.addFollower(ARTIST_ID, ACTOR, INBOX, undefined, 'follow-1');
        repo.acceptFollower(ARTIST_ID, ACTOR);
        expect(statusOf()).toBe('accepted');
        expect(repo.getFollowers(ARTIST_ID).length).toBe(1);

        // Duplicate / re-delivered Follow (e.g. Mastodon retry, or reprocessing after
        // an instance restart) must keep the follower accepted and visible.
        repo.addFollower(ARTIST_ID, ACTOR, INBOX, undefined, 'follow-2');
        expect(statusOf()).toBe('accepted');
        expect(repo.getFollowers(ARTIST_ID).length).toBe(1);
    });

    test('a later Follow with an empty inbox does not clobber a previously resolved inbox', () => {
        repo.addFollower(ARTIST_ID, ACTOR, INBOX);
        repo.acceptFollower(ARTIST_ID, ACTOR);

        // Inbox resolution failed this time -> empty string passed in.
        repo.addFollower(ARTIST_ID, ACTOR, '');
        expect(inboxOf()).toBe(INBOX);
        expect(statusOf()).toBe('accepted');
    });

    test('a follower stored without an inbox can later be repaired (Sync flow)', () => {
        // Stored with empty inbox because the remote actor could not be fetched.
        repo.addFollower(ARTIST_ID, ACTOR, '');
        repo.acceptFollower(ARTIST_ID, ACTOR);
        expect(inboxOf()).toBe('');
        expect(statusOf()).toBe('accepted');

        // Sync resolves and backfills the inbox; status stays accepted.
        repo.addFollower(ARTIST_ID, ACTOR, INBOX);
        expect(inboxOf()).toBe(INBOX);
        expect(statusOf()).toBe('accepted');
    });

    test('a rejected follower re-requesting returns to pending (existing behavior preserved)', () => {
        repo.addFollower(ARTIST_ID, ACTOR, INBOX);
        repo.rejectFollower(ARTIST_ID, ACTOR);
        expect(statusOf()).toBe('rejected');

        repo.addFollower(ARTIST_ID, ACTOR, INBOX);
        expect(statusOf()).toBe('pending');
    });
});
