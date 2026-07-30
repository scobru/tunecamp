import { jest } from '@jest/globals';
import { Person, Service, Note, Article, Audio } from '@fedify/fedify';
import {
    handleFollowActivity,
    handleAcceptActivity,
    handleAnnounceBoost,
    handleAnnounceDiscovery,
    handleLikeActivity,
    handleUndoFollow,
    handleUndoLike,
    handleUndoAnnounce,
    handleCreateActivity,
    handleMoveActivity,
} from '../fedify.js';

const uri = (s: string) => new URL(s);

function makeDb(overrides: Record<string, any> = {}) {
    return {
        getArtistBySlug: jest.fn().mockReturnValue(null),
        getArtist: jest.fn().mockReturnValue(null),
        addFollower: jest.fn(),
        acceptFollower: jest.fn(),
        removeFollower: jest.fn(),
        upsertRemoteActor: jest.fn(),
        getApNote: jest.fn().mockReturnValue(null),
        getApReply: jest.fn().mockReturnValue(null),
        addApReply: jest.fn(),
        addApInteraction: jest.fn(),
        removeApInteraction: jest.fn(),
        addLike: jest.fn(),
        removeLike: jest.fn(),
        upsertRemoteContent: jest.fn(),
        updateFollowerUri: jest.fn(),
        getRemoteActor: jest.fn().mockReturnValue(null),
        unfollowActor: jest.fn(),
        ...overrides,
    } as any;
}

describe('handleFollowActivity', () => {
    test('site follow: persists + auto-accepts unconditionally', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const follower = new Person({ id: uri('https://m.test/users/alice'), name: 'Alice' });

        const outcome = handleFollowActivity(db, 'site', true, 'https://m.test/users/alice', 'https://m.test/users/alice/inbox', undefined, follower, cacheActor);

        expect(db.addFollower).toHaveBeenCalledWith(-1, 'https://m.test/users/alice', 'https://m.test/users/alice/inbox', undefined);
        expect(db.acceptFollower).toHaveBeenCalledWith(-1, 'https://m.test/users/alice');
        expect(cacheActor).toHaveBeenCalledWith(follower);
        expect(outcome).toEqual({ handle: 'site', autoAccept: true, follower });
    });

    test('artist follow: unknown artist slug is a no-op', () => {
        const db = makeDb();
        const outcome = handleFollowActivity(db, 'ghost', false, 'https://m.test/users/alice', '', undefined, null, jest.fn());
        expect(outcome).toBeNull();
        expect(db.addFollower).not.toHaveBeenCalled();
    });

    test('artist follow: auto-accepts when manual approval is not required', () => {
        const db = makeDb({ getArtistBySlug: jest.fn().mockReturnValue({ id: 5, name: 'Band', manually_approves_followers: false }) });
        const follower = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob' });

        const outcome = handleFollowActivity(db, 'band', false, 'https://m.test/users/bob', 'https://m.test/users/bob/inbox', undefined, follower, jest.fn());

        expect(db.addFollower).toHaveBeenCalledWith(5, 'https://m.test/users/bob', 'https://m.test/users/bob/inbox', undefined);
        expect(db.acceptFollower).toHaveBeenCalledWith(5, 'https://m.test/users/bob');
        expect(outcome).toEqual({ handle: 'band', autoAccept: true, follower });
    });

    test('artist follow: leaves request pending when manual approval is required', () => {
        const db = makeDb({ getArtistBySlug: jest.fn().mockReturnValue({ id: 5, name: 'Band', manually_approves_followers: true }) });
        const follower = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob' });

        const outcome = handleFollowActivity(db, 'band', false, 'https://m.test/users/bob', '', undefined, follower, jest.fn());

        expect(db.addFollower).toHaveBeenCalled();
        expect(db.acceptFollower).not.toHaveBeenCalled();
        expect(outcome).toEqual({ handle: 'band', autoAccept: false, follower });
    });

    test('persists the follower even when the actor document could not be resolved', () => {
        const db = makeDb({ getArtistBySlug: jest.fn().mockReturnValue({ id: 5, name: 'Band', manually_approves_followers: false }) });
        const outcome = handleFollowActivity(db, 'band', false, 'https://m.test/users/bob', '', undefined, null, jest.fn());
        expect(db.addFollower).toHaveBeenCalledWith(5, 'https://m.test/users/bob', '', undefined);
        expect(outcome?.follower).toBeNull();
    });
});

describe('handleAcceptActivity', () => {
    test('no-op when the actor could not be resolved', () => {
        const db = makeDb();
        handleAcceptActivity(db, null);
        expect(db.upsertRemoteActor).not.toHaveBeenCalled();
    });

    test('caches the accepting actor as a remote actor', () => {
        const db = makeDb();
        const actor = new Service({ id: uri('https://relay.test/actor'), name: 'Relay' });
        handleAcceptActivity(db, actor);
        expect(db.upsertRemoteActor).toHaveBeenCalledWith(expect.objectContaining({
            uri: 'https://relay.test/actor',
            type: 'Service',
            name: 'Relay',
        }));
    });
});

describe('handleAnnounceBoost', () => {
    test('no-op when the boosting actor could not be resolved', () => {
        const db = makeDb();
        handleAnnounceBoost(db, 'https://site.test/notes/1', 'https://m.test/announces/1', null);
        expect(db.addApInteraction).not.toHaveBeenCalled();
    });

    test('records the announce interaction and caches the actor', () => {
        const db = makeDb();
        const actor = new Person({ id: uri('https://m.test/users/carol'), name: 'Carol' });
        handleAnnounceBoost(db, 'https://site.test/notes/1', 'https://m.test/announces/1', actor);

        expect(db.addApInteraction).toHaveBeenCalledWith('https://site.test/notes/1', 'https://m.test/users/carol', 'announce', 'https://m.test/announces/1');
        expect(db.upsertRemoteActor).toHaveBeenCalledWith(expect.objectContaining({ uri: 'https://m.test/users/carol', type: 'Person' }));
    });
});

describe('handleAnnounceDiscovery', () => {
    test('ignores a Note with no audio attachment', async () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://m.test/notes/1'), content: 'just text' });
        const author = new Person({ id: uri('https://m.test/users/dave'), name: 'Dave' });
        await handleAnnounceDiscovery(db, note, author);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('stores a Note with an audio attachment as a release', async () => {
        const db = makeDb();
        const note = new Note({
            id: uri('https://m.test/notes/2'),
            content: 'new track!',
            attachments: [new Audio({ id: uri('https://m.test/media/1.mp3'), mediaType: 'audio/mpeg' })],
        });
        const author = new Person({ id: uri('https://m.test/users/dave'), name: 'Dave' });

        await handleAnnounceDiscovery(db, note, author);

        expect(db.upsertRemoteContent).toHaveBeenCalledWith(expect.objectContaining({
            ap_id: 'https://m.test/notes/2',
            actor_uri: 'https://m.test/users/dave',
            type: 'release',
            stream_url: 'https://m.test/media/1.mp3',
        }));
        expect(db.upsertRemoteActor).toHaveBeenCalledWith(expect.objectContaining({ uri: 'https://m.test/users/dave' }));
    });

    test('stores a standalone Audio object as a release', async () => {
        const db = makeDb();
        const audio = new Audio({ id: uri('https://m.test/tracks/1'), name: 'Song' });
        const author = new Person({ id: uri('https://m.test/users/erin'), name: 'Erin' });

        await handleAnnounceDiscovery(db, audio, author);

        expect(db.upsertRemoteContent).toHaveBeenCalledWith(expect.objectContaining({
            ap_id: 'https://m.test/tracks/1',
            type: 'release',
            title: 'Song',
            stream_url: 'https://m.test/tracks/1',
        }));
    });
});

describe('handleLikeActivity', () => {
    test('ignores a Like for an object we have no note record for', () => {
        const db = makeDb();
        const actor = new Person({ id: uri('https://m.test/users/frank'), name: 'Frank' });
        handleLikeActivity(db, 'https://site.test/notes/9', 'https://m.test/likes/1', actor);
        expect(db.addLike).not.toHaveBeenCalled();
    });

    test('no-op when the liking actor could not be resolved', () => {
        const db = makeDb({ getApNote: jest.fn().mockReturnValue({ note_type: 'track', content_id: 3, content_slug: 'song' }) });
        handleLikeActivity(db, 'https://site.test/notes/1', 'https://m.test/likes/1', null);
        expect(db.addLike).not.toHaveBeenCalled();
    });

    test('records the like and caches the actor', () => {
        const db = makeDb({ getApNote: jest.fn().mockReturnValue({ note_type: 'track', content_id: 3, content_slug: 'song' }) });
        const actor = new Person({ id: uri('https://m.test/users/frank'), name: 'Frank' });

        handleLikeActivity(db, 'https://site.test/notes/1', 'https://m.test/likes/1', actor);

        expect(db.addLike).toHaveBeenCalledWith('https://m.test/users/frank', 'track', 3);
        expect(db.addApInteraction).toHaveBeenCalledWith('https://site.test/notes/1', 'https://m.test/users/frank', 'like', 'https://m.test/likes/1');
        expect(db.upsertRemoteActor).toHaveBeenCalled();
    });
});

describe('handleUndoFollow', () => {
    test('no-op when the unfollower URI is unresolved', () => {
        const db = makeDb();
        handleUndoFollow(db, 'site', true, undefined);
        expect(db.removeFollower).not.toHaveBeenCalled();
    });

    test('site unfollow removes the site-wide follower record', () => {
        const db = makeDb();
        handleUndoFollow(db, 'site', true, 'https://m.test/users/alice');
        expect(db.removeFollower).toHaveBeenCalledWith(-1, 'https://m.test/users/alice');
    });

    test('artist unfollow is a no-op for an unknown slug', () => {
        const db = makeDb();
        handleUndoFollow(db, 'ghost', false, 'https://m.test/users/alice');
        expect(db.removeFollower).not.toHaveBeenCalled();
    });

    test('artist unfollow removes the per-artist follower record', () => {
        const db = makeDb({ getArtistBySlug: jest.fn().mockReturnValue({ id: 5, name: 'Band' }) });
        handleUndoFollow(db, 'band', false, 'https://m.test/users/bob');
        expect(db.removeFollower).toHaveBeenCalledWith(5, 'https://m.test/users/bob');
    });
});

describe('handleUndoLike', () => {
    test('no-op when the actor URI is unresolved', () => {
        const db = makeDb({ getApNote: jest.fn().mockReturnValue({ note_type: 'track', content_id: 3 }) });
        handleUndoLike(db, 'https://site.test/notes/1', undefined);
        expect(db.removeLike).not.toHaveBeenCalled();
    });

    test('no-op when the note is unknown', () => {
        const db = makeDb();
        handleUndoLike(db, 'https://site.test/notes/1', 'https://m.test/users/frank');
        expect(db.removeLike).not.toHaveBeenCalled();
    });

    test('removes the like and interaction', () => {
        const db = makeDb({ getApNote: jest.fn().mockReturnValue({ note_type: 'track', content_id: 3, content_slug: 'song' }) });
        handleUndoLike(db, 'https://site.test/notes/1', 'https://m.test/users/frank');
        expect(db.removeLike).toHaveBeenCalledWith('https://m.test/users/frank', 'track', 3);
        expect(db.removeApInteraction).toHaveBeenCalledWith('https://site.test/notes/1', 'https://m.test/users/frank', 'like');
    });
});

describe('handleUndoAnnounce', () => {
    test('no-op when the note is unknown', () => {
        const db = makeDb();
        handleUndoAnnounce(db, 'https://site.test/notes/1', 'https://m.test/users/carol');
        expect(db.removeApInteraction).not.toHaveBeenCalled();
    });

    test('removes the announce interaction', () => {
        const db = makeDb({ getApNote: jest.fn().mockReturnValue({ note_type: 'post', content_id: 1, content_slug: 'hello' }) });
        handleUndoAnnounce(db, 'https://site.test/notes/1', 'https://m.test/users/carol');
        expect(db.removeApInteraction).toHaveBeenCalledWith('https://site.test/notes/1', 'https://m.test/users/carol', 'announce');
    });
});

describe('handleCreateActivity', () => {
    test('stores a reply to one of our notes as a thread reply', async () => {
        const db = makeDb({ getApNote: jest.fn().mockReturnValue({ id: 1 }) });
        const cacheActor = jest.fn();
        const note = new Note({
            id: uri('https://m.test/notes/reply1'),
            content: 'nice track!',
            replyTarget: uri('https://site.test/notes/1'),
        });
        const actor = new Person({ id: uri('https://m.test/users/gina'), name: 'Gina' });

        await handleCreateActivity(db, note, 'https://m.test/users/gina', actor, undefined, cacheActor);

        expect(db.addApReply).toHaveBeenCalledWith('https://site.test/notes/1', 'https://m.test/notes/reply1', 'https://m.test/users/gina', 'nice track!', expect.any(String));
        expect(cacheActor).toHaveBeenCalledWith(actor);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('a reply to an unknown note is dropped (not a feed item)', async () => {
        const db = makeDb();
        const note = new Note({
            id: uri('https://m.test/notes/reply2'),
            content: 'x',
            replyTarget: uri('https://site.test/notes/unknown'),
        });
        await handleCreateActivity(db, note, 'https://m.test/users/gina', null, undefined, jest.fn());
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
        expect(db.addApReply).not.toHaveBeenCalled();
    });

    test('stores a plain Note as a post feed item', async () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://m.test/notes/3'), content: 'hello world' });
        const actor = new Person({ id: uri('https://m.test/users/hank'), name: 'Hank' });

        await handleCreateActivity(db, note, 'https://m.test/users/hank', actor, undefined, jest.fn());

        expect(db.upsertRemoteContent).toHaveBeenCalledWith(expect.objectContaining({
            ap_id: 'https://m.test/notes/3',
            type: 'post',
            content: 'hello world',
        }));
    });

    test('stores a Note with an audio attachment as a release feed item', async () => {
        const db = makeDb();
        const note = new Note({
            id: uri('https://m.test/notes/4'),
            content: 'new song',
            attachments: [new Audio({ id: uri('https://m.test/media/2.mp3'), mediaType: 'audio/mpeg' })],
        });
        const actor = new Person({ id: uri('https://m.test/users/hank'), name: 'Hank' });

        await handleCreateActivity(db, note, 'https://m.test/users/hank', actor, undefined, jest.fn());

        expect(db.upsertRemoteContent).toHaveBeenCalledWith(expect.objectContaining({
            ap_id: 'https://m.test/notes/4',
            type: 'release',
            stream_url: 'https://m.test/media/2.mp3',
        }));
    });

    test('stores an Article as a post feed item', async () => {
        const db = makeDb();
        const article = new Article({ id: uri('https://m.test/articles/1'), name: 'Title', content: 'long form' });
        await handleCreateActivity(db, article, 'https://m.test/users/ivy', null, undefined, jest.fn());

        expect(db.upsertRemoteContent).toHaveBeenCalledWith(expect.objectContaining({
            ap_id: 'https://m.test/articles/1',
            type: 'post',
            title: 'Title',
        }));
    });

    test('stores an Audio object as a release feed item', async () => {
        const db = makeDb();
        const audio = new Audio({ id: uri('https://m.test/tracks/5'), name: 'Track 5' });
        await handleCreateActivity(db, audio, 'https://m.test/users/jill', null, undefined, jest.fn());

        expect(db.upsertRemoteContent).toHaveBeenCalledWith(expect.objectContaining({
            ap_id: 'https://m.test/tracks/5',
            type: 'release',
            title: 'Track 5',
        }));
    });
});

describe('handleMoveActivity', () => {
    test('rejects a target actor that does not list the old actor as an alias', () => {
        const db = makeDb();
        const newActor = new Person({ id: uri('https://m.test/users/new'), name: 'New' });
        handleMoveActivity(db, 'https://old.test/users/bob', 'https://m.test/users/new', newActor, ['https://someone-else.test/users/x']);
        expect(db.updateFollowerUri).not.toHaveBeenCalled();
    });

    test('rejects when the verified target has no inbox', () => {
        const db = makeDb();
        const newActor = new Person({ id: uri('https://m.test/users/new'), name: 'New' });
        handleMoveActivity(db, 'https://old.test/users/bob', 'https://m.test/users/new', newActor, ['https://old.test/users/bob']);
        expect(db.updateFollowerUri).not.toHaveBeenCalled();
    });

    test('updates follower URIs once the alias backlink is verified', () => {
        const db = makeDb();
        const newActor = new Person({
            id: uri('https://m.test/users/new'),
            name: 'New',
            inbox: uri('https://m.test/users/new/inbox'),
        });
        handleMoveActivity(db, 'https://old.test/users/bob', 'https://m.test/users/new', newActor, ['https://old.test/users/bob']);

        expect(db.updateFollowerUri).toHaveBeenCalledWith('https://old.test/users/bob', 'https://m.test/users/new', 'https://m.test/users/new/inbox', undefined);
    });

    test('also refreshes and re-links the cached remote actor when one exists', () => {
        const db = makeDb({ getRemoteActor: jest.fn().mockReturnValue({ is_followed: true }) });
        const newActor = new Person({
            id: uri('https://m.test/users/new'),
            name: 'New',
            inbox: uri('https://m.test/users/new/inbox'),
        });
        handleMoveActivity(db, 'https://old.test/users/bob', 'https://m.test/users/new', newActor, ['https://old.test/users/bob']);

        expect(db.upsertRemoteActor).toHaveBeenCalledWith(expect.objectContaining({
            uri: 'https://m.test/users/new',
            is_followed: true,
        }));
        expect(db.unfollowActor).toHaveBeenCalledWith('https://old.test/users/bob');
    });
});
