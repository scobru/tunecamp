import { jest } from '@jest/globals';
import { Person, Service, Note, Article, Audio } from '@fedify/fedify';
import { handleUpdateObject } from './fedify.js';

const uri = (s: string) => new URL(s);

function makeDb() {
    return {
        upsertRemoteContent: jest.fn(),
    } as any;
}

describe('handleUpdateObject', () => {
    test('Person update refreshes the cached actor', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const person = new Person({ id: uri('https://m.test/users/alice'), name: 'Alice', preferredUsername: 'alice' });

        handleUpdateObject(db, person, 'https://m.test/users/alice', null, cacheActor);

        expect(cacheActor).toHaveBeenCalledWith(person);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Service update refreshes the cached actor', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const svc = new Service({ id: uri('https://m.test/actor2'), name: 'Svc' });

        handleUpdateObject(db, svc, 'https://m.test/actor2', null, cacheActor);

        expect(cacheActor).toHaveBeenCalledWith(svc);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Note edit upserts remote content as type "post"', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const note = new Note({ id: uri('https://m.test/notes/2'), content: 'edited text' });
        const author = new Person({ id: uri('https://m.test/users/alice'), name: 'Alice' });

        handleUpdateObject(db, note, 'https://m.test/users/alice', author, cacheActor);

        expect(cacheActor).not.toHaveBeenCalled();
        expect(db.upsertRemoteContent).toHaveBeenCalledTimes(1);
        const arg = db.upsertRemoteContent.mock.calls[0][0];
        expect(arg).toMatchObject({
            ap_id: 'https://m.test/notes/2',
            actor_uri: 'https://m.test/users/alice',
            type: 'post',
            content: 'edited text',
            artist_name: 'Alice',
        });
    });

    test('Audio edit upserts remote content as type "release"', () => {
        const db = makeDb();
        const audio = new Audio({ id: uri('https://m.test/tracks/10'), name: 'New Song' });

        handleUpdateObject(db, audio, 'https://m.test/users/alice', null, jest.fn());

        const arg = db.upsertRemoteContent.mock.calls[0][0];
        expect(arg.type).toBe('release');
        expect(arg.ap_id).toBe('https://m.test/tracks/10');
        expect(arg.artist_name).toBe('Remote Artist');
    });

    test('Article edit is treated as type "post"', () => {
        const db = makeDb();
        const art = new Article({ id: uri('https://m.test/articles/4'), name: 'Article Title', content: 'Text body' });

        handleUpdateObject(db, art, 'https://m.test/users/alice', null, jest.fn());

        expect(db.upsertRemoteContent.mock.calls[0][0].type).toBe('post');
    });

    test('content update with no resolvable actor returns without upserting', () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://m.test/notes/3'), content: 'hello' });

        handleUpdateObject(db, note, undefined, null, jest.fn());

        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('falls back to the object attribution if Update has no actor', () => {
        const db = makeDb();
        const note = new Note({
            id: uri('https://m.test/notes/4'),
            content: 'hello',
            attribution: uri('https://m.test/users/bob'),
        });

        handleUpdateObject(db, note, undefined, null, jest.fn());

        expect(db.upsertRemoteContent).toHaveBeenCalledTimes(1);
        expect(db.upsertRemoteContent.mock.calls[0][0].actor_uri).toBe('https://m.test/users/bob');
    });
});
