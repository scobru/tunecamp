import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { SocialRepository } from '../social.repository.js';
import { TrackRepository } from '../track.repository.js';
import { ArtistRepository } from '../artist.repository.js';

describe('SocialRepository', () => {
    let db: any;
    let repo: SocialRepository;
    let tracks: TrackRepository;
    let artists: ArtistRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        db.db.exec(`CREATE TABLE IF NOT EXISTS likes (remote_actor_fid TEXT, object_type TEXT, object_id INTEGER, UNIQUE(remote_actor_fid, object_type, object_id))`)
        repo = new SocialRepository(db.db);
        tracks = new TrackRepository(db.db);
        artists = new ArtistRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('Following', () => {
        let ARTIST_ID = 1;
        const ACTOR_URI = 'https://mastodon.social/users/alice';

        beforeEach(() => {
            ARTIST_ID = artists.create('Follow Artist');
        });

        test('addFollowing, isFollowing, removeFollowing', () => {
            expect(repo.isFollowing(ARTIST_ID, ACTOR_URI)).toBe(false);

            repo.addFollowing(ARTIST_ID, ACTOR_URI);
            expect(repo.isFollowing(ARTIST_ID, ACTOR_URI)).toBe(true);

            repo.removeFollowing(ARTIST_ID, ACTOR_URI);
            expect(repo.isFollowing(ARTIST_ID, ACTOR_URI)).toBe(false);
        });
    });

    describe('Likes', () => {
        const ACTOR_URI = 'https://mastodon.social/users/bob';

        test('addLike, removeLike, hasLiked, getLikesCount', () => {
            expect(repo.hasLiked(ACTOR_URI, 'album', 10)).toBe(false);
            expect(repo.getLikesCount('album', 10)).toBe(0);

            repo.addLike(ACTOR_URI, 'album', 10);
            expect(repo.hasLiked(ACTOR_URI, 'album', 10)).toBe(true);
            expect(repo.getLikesCount('album', 10)).toBe(1);

            // Ignore duplicates
            repo.addLike(ACTOR_URI, 'album', 10);
            expect(repo.getLikesCount('album', 10)).toBe(1);

            repo.removeLike(ACTOR_URI, 'album', 10);
            expect(repo.hasLiked(ACTOR_URI, 'album', 10)).toBe(false);
            expect(repo.getLikesCount('album', 10)).toBe(0);
        });
    });

    describe('Local User Social (Stars/Ratings)', () => {
        const USERNAME = 'testuser';

        test('starItem, unstarItem, isStarred, getStarredItems', () => {
            expect(repo.isStarred(USERNAME, 'track', '100')).toBe(false);

            repo.starItem(USERNAME, 'track', '100');
            expect(repo.isStarred(USERNAME, 'track', '100')).toBe(true);

            const items = repo.getStarredItems(USERNAME, 'track');
            expect(items.length).toBe(1);
            expect(items[0].item_id).toBe('100');

            repo.unstarItem(USERNAME, 'track', '100');
            expect(repo.isStarred(USERNAME, 'track', '100')).toBe(false);
        });

        test('setItemRating, getItemRating, getItemRatings', () => {
            expect(repo.getItemRating(USERNAME, 'artist', '5')).toBe(0);

            repo.setItemRating(USERNAME, 'artist', '5', 4);
            expect(repo.getItemRating(USERNAME, 'artist', '5')).toBe(4);

            const ratings = repo.getItemRatings(USERNAME, 'artist');
            expect(ratings.get('5')).toBe(4);

            repo.setItemRating(USERNAME, 'artist', '5', 2);
            expect(repo.getItemRating(USERNAME, 'artist', '5')).toBe(2);
        });
    });

    describe('Comments', () => {
        const USERNAME = 'commenter';
        let TRACK_ID = 50;
        beforeEach(() => { TRACK_ID = tracks.create({ title: 'Comment Track' } as any); });

        test('addComment, getComments, deleteComment', () => {
            const comment = repo.addComment(TRACK_ID, USERNAME, 'Great track!');
            expect(comment.text).toBe('Great track!');
            expect(comment.username).toBe(USERNAME);
            expect(comment.track_id).toBe(TRACK_ID);

            const comments = repo.getComments(TRACK_ID);
            expect(comments.length).toBe(1);
            expect(comments[0].text).toBe('Great track!');

            // Non-admin can delete their own
            const deleted = repo.deleteComment(comment.id, USERNAME, false);
            expect(deleted).toBe(true);
            expect(repo.getComments(TRACK_ID).length).toBe(0);
        });

        test('admin can delete others comments, users cannot delete others', () => {
            const comment = repo.addComment(TRACK_ID, 'userA', 'Hello');

            // UserB fails
            expect(repo.deleteComment(comment.id, 'userB', false)).toBe(false);
            expect(repo.getComments(TRACK_ID).length).toBe(1);

            // Admin succeeds
            expect(repo.deleteComment(comment.id, 'userC', true)).toBe(true);
            expect(repo.getComments(TRACK_ID).length).toBe(0);
        });
    });

    describe('Stats', () => {
        const TRACK_ID = 101;
        const SLUG = 'cool-release';

        test('track play count', () => {
            expect(repo.getTrackPlayCount(TRACK_ID)).toBe(0);
            repo.incrementTrackPlayCount(TRACK_ID);
            expect(repo.getTrackPlayCount(TRACK_ID)).toBe(1);
            repo.incrementTrackPlayCount(TRACK_ID);
            expect(repo.getTrackPlayCount(TRACK_ID)).toBe(2);
        });

        test('track download count', () => {
            expect(repo.getTrackDownloadCount(TRACK_ID)).toBe(0);
            repo.incrementTrackDownloadCount(TRACK_ID);
            expect(repo.getTrackDownloadCount(TRACK_ID)).toBe(1);
        });

        test('release download count', () => {
            expect(repo.getReleaseDownloadCount(SLUG)).toBe(0);
            repo.incrementReleaseDownloadCount(SLUG);
            expect(repo.getReleaseDownloadCount(SLUG)).toBe(1);
        });

        test('track like count', () => {
            repo.starItem('user1', 'track', String(TRACK_ID));
            repo.starItem('user2', 'track', String(TRACK_ID));
            expect(repo.getTrackLikeCount(String(TRACK_ID) as any)).toBe(2);
        });
    });

    describe('Play History & Stats', () => {
        test('recordPlay, getRecentPlays, getTopTracks', () => {
            const artistId = artists.create('Play Artist');
            const trackId = tracks.create({
                title: 'Play Track',
                artist_id: artistId,
                artist_name: 'Play Artist',
                file_path: 'pt.mp3',
                format: 'mp3'
            } as any);

            repo.recordPlay(trackId);
            repo.recordPlay(trackId);

            const recent = repo.getRecentPlays(10);
            expect(recent.length).toBe(2);
            expect(recent[0].track_id).toBe(trackId);
            expect(recent[0].track_title).toBe('Play Track');

            const topTracks = repo.getTopTracks(10);
            expect(topTracks.length).toBe(1);
            expect(topTracks[0].play_count).toBe(2);
            expect(topTracks[0].id).toBe(trackId);

            const topArtists = repo.getTopArtists(10);
            expect(topArtists.length).toBe(1);
            expect(topArtists[0].play_count).toBe(2);
            expect(topArtists[0].id).toBe(artistId);
        });
    });
});
