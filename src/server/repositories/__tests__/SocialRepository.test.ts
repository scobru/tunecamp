import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { SocialRepository } from '../social.repository.js';
import { ArtistRepository } from '../artist.repository.js';

describe('Followers', () => {
    let db: any;
    let repo: SocialRepository;
    let artists: ArtistRepository;
    let ARTIST_ID = 1;
    const ACTOR_URI = 'https://mastodon.social/users/alice';
    const INBOX_URI = 'https://mastodon.social/users/alice/inbox';

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new SocialRepository(db.db);
        artists = new ArtistRepository(db.db);
        ARTIST_ID = artists.create('Follow Artist');
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    test('addFollower, getPendingFollowers, acceptFollower, getFollowers', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        let pending = repo.getPendingFollowers(ARTIST_ID);
        expect(pending.length).toBe(1);
        expect(pending[0].actor_uri).toBe(ACTOR_URI);

        repo.acceptFollower(ARTIST_ID, ACTOR_URI);
        pending = repo.getPendingFollowers(ARTIST_ID);
        expect(pending.length).toBe(0);

        const followers = repo.getFollowers(ARTIST_ID);
        expect(followers.length).toBe(1);
        expect(followers[0].actor_uri).toBe(ACTOR_URI);
    });

    test('acceptPendingFollowers', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.addFollower(ARTIST_ID, 'other_uri', 'other_inbox');

        let pending = repo.getPendingFollowers(ARTIST_ID);
        expect(pending.length).toBe(2);

        repo.acceptPendingFollowers(ARTIST_ID);

        pending = repo.getPendingFollowers(ARTIST_ID);
        expect(pending.length).toBe(0);

        const followers = repo.getFollowers(ARTIST_ID);
        expect(followers.length).toBe(2);
    });

    test('rejectFollower', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.rejectFollower(ARTIST_ID, ACTOR_URI);

        const pending = repo.getPendingFollowers(ARTIST_ID);
        expect(pending.length).toBe(0);

        const followers = repo.getFollowers(ARTIST_ID);
        expect(followers.length).toBe(0);
    });

    test('removeFollower, removeAllFollowers', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.acceptFollower(ARTIST_ID, ACTOR_URI);

        repo.removeFollower(ARTIST_ID, ACTOR_URI);
        expect(repo.getFollowers(ARTIST_ID).length).toBe(0);

        const ARTIST_2 = artists.create('Follow Artist 2');
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.acceptFollower(ARTIST_ID, ACTOR_URI);
        repo.addFollower(ARTIST_2, ACTOR_URI, INBOX_URI);
        repo.acceptFollower(ARTIST_2, ACTOR_URI);

        repo.removeAllFollowers(ACTOR_URI);
        expect(repo.getFollowers(ARTIST_ID).length).toBe(0);
        expect(repo.getFollowers(ARTIST_2).length).toBe(0);
    });

    test('updateFollowerUri', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.acceptFollower(ARTIST_ID, ACTOR_URI);

        repo.updateFollowerUri(ACTOR_URI, 'new_actor_uri', 'new_inbox_uri', 'new_shared_inbox_uri');

        const followers = repo.getFollowers(ARTIST_ID);
        expect(followers.length).toBe(1);
        expect(followers[0].actor_uri).toBe('new_actor_uri');
        expect(followers[0].inbox_uri).toBe('new_inbox_uri');
        expect(followers[0].shared_inbox_uri).toBe('new_shared_inbox_uri');
    });

    test('getFollowerInboxes', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.acceptFollower(ARTIST_ID, ACTOR_URI);

        const inboxes = repo.getFollowerInboxes(ARTIST_ID);
        expect(inboxes.length).toBe(1);
        expect(inboxes[0]).toBe(INBOX_URI);
    });

    test('getFollower', () => {
        repo.addFollower(ARTIST_ID, ACTOR_URI, INBOX_URI);
        repo.acceptFollower(ARTIST_ID, ACTOR_URI);

        const follower = repo.getFollower(ARTIST_ID, ACTOR_URI);
        expect(follower).toBeDefined();
        expect(follower?.actor_uri).toBe(ACTOR_URI);

        const missing = repo.getFollower(ARTIST_ID, 'missing');
        expect(missing).toBeUndefined();
    });
});
