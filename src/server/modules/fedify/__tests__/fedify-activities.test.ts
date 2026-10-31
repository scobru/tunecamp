import { jest } from '@jest/globals';
import { Person, Service, Note, Article, Audio } from '@fedify/fedify';
import { handleDeleteObject, handleUpdateObject } from '../fedify.js';

const uri = (s: string) => new URL(s);

function makeDb() {
    return {
        getArtists: jest.fn().mockReturnValue([{ id: 1 }, { id: 2 }, { id: 7 }]),
        removeFollower: jest.fn(),
        removeAllFollowers: jest.fn(),
        deleteApReply: jest.fn().mockReturnValue(false),
        deleteRemoteContent: jest.fn(),
        upsertRemoteContent: jest.fn(),
        getRemoteContent: jest.fn().mockReturnValue({ ap_id: 'stored' }),
    } as any;
}

describe('handleDeleteObject', () => {
    test('no-op when objectId is missing', () => {
        const db = makeDb();
        handleDeleteObject(db, undefined, 'https://m.test/users/bob');
        expect(db.removeFollower).not.toHaveBeenCalled();
        expect(db.deleteApReply).not.toHaveBeenCalled();
        expect(db.deleteRemoteContent).not.toHaveBeenCalled();
    });

    test('account deletion (object === actor) removes follower from every artist + site (-1)', () => {
        const db = makeDb();
        const actor = 'https://m.test/users/bob';
        handleDeleteObject(db, actor, actor);

        expect(db.removeAllFollowers).toHaveBeenCalledTimes(1);
        expect(db.removeAllFollowers).toHaveBeenCalledWith(actor);
        // account-deletion branch returns early: no content/reply deletion
        expect(db.deleteApReply).not.toHaveBeenCalled();
        expect(db.deleteRemoteContent).not.toHaveBeenCalled();
    });

    test('object deletion (object !== actor) deletes reply + remote content by id', () => {
        const db = makeDb();
        const objectId = 'https://m.test/users/bob/statuses/99';
        handleDeleteObject(db, objectId, 'https://m.test/users/bob');

        expect(db.removeFollower).not.toHaveBeenCalled();
        // Scoped to the sender: the store only deletes what that actor wrote.
        expect(db.deleteApReply).toHaveBeenCalledWith(objectId, 'https://m.test/users/bob');
        expect(db.deleteRemoteContent).toHaveBeenCalledWith(objectId, 'https://m.test/users/bob');
    });

    test('object deletion without an actor deletes nothing', () => {
        const db = makeDb();
        handleDeleteObject(db, 'https://m.test/objects/1', undefined);
        expect(db.deleteRemoteContent).not.toHaveBeenCalled();
        expect(db.deleteApReply).not.toHaveBeenCalled();
    });
});

describe('handleUpdateObject', () => {
    test('Person update refreshes the cached actor and touches nothing else', async () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const person = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob', preferredUsername: 'bob' });

        await handleUpdateObject(db, person, 'https://m.test/users/bob', null, cacheActor);

        expect(cacheActor).toHaveBeenCalledWith(person);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Service update is treated as an actor refresh', async () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const svc = new Service({ id: uri('https://m.test/actor'), name: 'Inst' });
        await handleUpdateObject(db, svc, 'https://m.test/actor', null, cacheActor);
        expect(cacheActor).toHaveBeenCalledWith(svc);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Note edit upserts remote content as type "post"', async () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const note = new Note({ id: uri('https://m.test/notes/1'), content: 'edited body' });
        const author = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob' });

        await handleUpdateObject(db, note, 'https://m.test/users/bob', author, cacheActor);

        expect(cacheActor).not.toHaveBeenCalled();
        expect(db.upsertRemoteContent).toHaveBeenCalledTimes(1);
        const arg = db.upsertRemoteContent.mock.calls[0][0];
        expect(arg).toMatchObject({
            ap_id: 'https://m.test/notes/1',
            actor_uri: 'https://m.test/users/bob',
            type: 'post',
            content: 'edited body',
            artist_name: 'Bob',
        });
    });

    test('Audio edit upserts remote content as type "release"', async () => {
        const db = makeDb();
        const audio = new Audio({ id: uri('https://m.test/tracks/9'), name: 'Song' });
        await handleUpdateObject(db, audio, 'https://m.test/users/bob', null, jest.fn());

        const arg = db.upsertRemoteContent.mock.calls[0][0];
        expect(arg.type).toBe('release');
        expect(arg.ap_id).toBe('https://m.test/tracks/9');
        // no author resolved → falls back to the default label for releases
        expect(arg.artist_name).toBe('Unknown Artist');
    });

    test('Article edit is treated as content (type "post")', async () => {
        const db = makeDb();
        const art = new Article({ id: uri('https://m.test/articles/3'), name: 'Title', content: 'long' });
        await handleUpdateObject(db, art, 'https://m.test/users/bob', null, jest.fn());
        expect(db.upsertRemoteContent.mock.calls[0][0].type).toBe('post');
    });

    test('content update with no resolvable actor is a no-op', async () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://m.test/notes/1'), content: 'x' });
        // updateActorId undefined and Note has no attributedTo → actorUri unresolved
        await handleUpdateObject(db, note, undefined, null, jest.fn());
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('an Update for another server\'s object is ignored', async () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://victim.test/notes/2'), content: 'rewritten' });
        await handleUpdateObject(db, note, 'https://evil.test/users/mallory', null, jest.fn());
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('an Update for content we never stored creates nothing', async () => {
        const db = makeDb();
        db.getRemoteContent.mockReturnValue(undefined);
        const note = new Note({ id: uri('https://m.test/notes/new'), content: 'x' });
        await handleUpdateObject(db, note, 'https://m.test/users/bob', null, jest.fn());
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });
});
