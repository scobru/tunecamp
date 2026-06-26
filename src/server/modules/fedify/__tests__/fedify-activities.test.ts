import { jest } from '@jest/globals';
import { Person, Service, Note, Article, Audio } from '@fedify/fedify';
import { handleDeleteObject, handleUpdateObject } from '../fedify.js';

const uri = (s: string) => new URL(s);

function makeDb() {
    return {
        getArtists: jest.fn().mockReturnValue([{ id: 1 }, { id: 2 }, { id: 7 }]),
        removeFollower: jest.fn(),
        deleteApReply: jest.fn().mockReturnValue(false),
        deleteRemoteContent: jest.fn(),
        upsertRemoteContent: jest.fn(),
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

        // one removeFollower per artist, plus the site actor (-1)
        expect(db.removeFollower).toHaveBeenCalledTimes(4);
        expect(db.removeFollower).toHaveBeenCalledWith(1, actor);
        expect(db.removeFollower).toHaveBeenCalledWith(2, actor);
        expect(db.removeFollower).toHaveBeenCalledWith(7, actor);
        expect(db.removeFollower).toHaveBeenCalledWith(-1, actor);
        // account-deletion branch returns early: no content/reply deletion
        expect(db.deleteApReply).not.toHaveBeenCalled();
        expect(db.deleteRemoteContent).not.toHaveBeenCalled();
    });

    test('object deletion (object !== actor) deletes reply + remote content by id', () => {
        const db = makeDb();
        const objectId = 'https://m.test/users/bob/statuses/99';
        handleDeleteObject(db, objectId, 'https://m.test/users/bob');

        expect(db.removeFollower).not.toHaveBeenCalled();
        expect(db.deleteApReply).toHaveBeenCalledWith(objectId);
        expect(db.deleteRemoteContent).toHaveBeenCalledWith(objectId);
    });

    test('object deletion still removes remote content when no actor is present', () => {
        const db = makeDb();
        const objectId = 'https://m.test/objects/1';
        handleDeleteObject(db, objectId, undefined);
        expect(db.deleteRemoteContent).toHaveBeenCalledWith(objectId);
        expect(db.removeFollower).not.toHaveBeenCalled();
    });
});

describe('handleUpdateObject', () => {
    test('Person update refreshes the cached actor and touches nothing else', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const person = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob', preferredUsername: 'bob' });

        handleUpdateObject(db, person, 'https://m.test/users/bob', null, cacheActor);

        expect(cacheActor).toHaveBeenCalledWith(person);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Service update is treated as an actor refresh', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const svc = new Service({ id: uri('https://m.test/actor'), name: 'Inst' });
        handleUpdateObject(db, svc, 'https://m.test/actor', null, cacheActor);
        expect(cacheActor).toHaveBeenCalledWith(svc);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Note edit upserts remote content as type "post"', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const note = new Note({ id: uri('https://m.test/notes/1'), content: 'edited body' });
        const author = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob' });

        handleUpdateObject(db, note, 'https://m.test/users/bob', author, cacheActor);

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

    test('Audio edit upserts remote content as type "release"', () => {
        const db = makeDb();
        const audio = new Audio({ id: uri('https://m.test/tracks/9'), name: 'Song' });
        handleUpdateObject(db, audio, 'https://m.test/users/bob', null, jest.fn());

        const arg = db.upsertRemoteContent.mock.calls[0][0];
        expect(arg.type).toBe('release');
        expect(arg.ap_id).toBe('https://m.test/tracks/9');
        // no author resolved → falls back to default label
        expect(arg.artist_name).toBe('Remote Artist');
    });

    test('Article edit is treated as content (type "post")', () => {
        const db = makeDb();
        const art = new Article({ id: uri('https://m.test/articles/3'), name: 'Title', content: 'long' });
        handleUpdateObject(db, art, 'https://m.test/users/bob', null, jest.fn());
        expect(db.upsertRemoteContent.mock.calls[0][0].type).toBe('post');
    });

    test('content update with no resolvable actor is a no-op', () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://m.test/notes/1'), content: 'x' });
        // updateActorId undefined and Note has no attributedTo → actorUri unresolved
        handleUpdateObject(db, note, undefined, null, jest.fn());
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('falls back to the object\'s attributedTo when the Update has no actor', () => {
        const db = makeDb();
        const note = new Note({
            id: uri('https://m.test/notes/2'),
            content: 'x',
            attribution: uri('https://m.test/users/carol'),
        });
        handleUpdateObject(db, note, undefined, null, jest.fn());
        expect(db.upsertRemoteContent).toHaveBeenCalledTimes(1);
        expect(db.upsertRemoteContent.mock.calls[0][0].actor_uri).toBe('https://m.test/users/carol');
    });
});
