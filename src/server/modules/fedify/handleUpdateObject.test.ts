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
    let consoleLogSpy: any;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('Person update refreshes the cached actor and touches nothing else', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const person = new Person({ id: uri('https://m.test/users/bob'), name: 'Bob', preferredUsername: 'bob' });

        handleUpdateObject(db, person, 'https://m.test/users/bob', null, cacheActor);

        expect(cacheActor).toHaveBeenCalledWith(person);
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Updated remote actor profile: https://m.test/users/bob`);
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
    });

    test('Service update is treated as an actor refresh', () => {
        const db = makeDb();
        const cacheActor = jest.fn();
        const svc = new Service({ id: uri('https://m.test/actor'), name: 'Inst' });
        handleUpdateObject(db, svc, 'https://m.test/actor', null, cacheActor);
        expect(cacheActor).toHaveBeenCalledWith(svc);
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Updated remote actor profile: https://m.test/actor`);
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
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Updated remote content: https://m.test/notes/1`);
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
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Updated remote content: https://m.test/tracks/9`);
    });

    test('Article edit is treated as content (type "post")', () => {
        const db = makeDb();
        const art = new Article({ id: uri('https://m.test/articles/3'), name: 'Title', content: 'long' });
        handleUpdateObject(db, art, 'https://m.test/users/bob', null, jest.fn());
        expect(db.upsertRemoteContent.mock.calls[0][0].type).toBe('post');
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Updated remote content: https://m.test/articles/3`);
    });

    test('content update with no resolvable actor is a no-op', () => {
        const db = makeDb();
        const note = new Note({ id: uri('https://m.test/notes/1'), content: 'x' });
        // updateActorId undefined and Note has no attributedTo → actorUri unresolved
        handleUpdateObject(db, note, undefined, null, jest.fn());
        expect(db.upsertRemoteContent).not.toHaveBeenCalled();
        expect(consoleLogSpy).not.toHaveBeenCalled();
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
        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Updated remote content: https://m.test/notes/2`);
    });
});
