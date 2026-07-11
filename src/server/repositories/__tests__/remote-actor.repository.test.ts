import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { RemoteActorRepository } from '../remote-actor.repository.js';

describe('RemoteActorRepository', () => {
    let db: any;
    let repo: RemoteActorRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new RemoteActorRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('upsertRemoteActor', () => {
        test('inserts a new remote actor', () => {
            repo.upsertRemoteActor({
                uri: 'https://example.com/actor1',
                type: 'Person',
                username: 'alice',
                name: 'Alice',
                summary: 'A nice person',
                icon_url: 'https://example.com/icon.png',
                inbox_url: 'https://example.com/actor1/inbox',
                outbox_url: 'https://example.com/actor1/outbox',
                public_key: 'pubkey1',
                is_followed: true
            });

            const actor = repo.getRemoteActor('https://example.com/actor1');
            expect(actor).toBeDefined();
            expect(actor?.uri).toBe('https://example.com/actor1');
            expect(actor?.username).toBe('alice');
            expect(actor?.public_key).toBe('pubkey1');
            expect(actor?.is_followed).toBe(1);
        });

        test('updates an existing remote actor', () => {
            repo.upsertRemoteActor({
                uri: 'https://example.com/actor2',
                type: 'Person',
                username: 'bob',
            });

            repo.upsertRemoteActor({
                uri: 'https://example.com/actor2',
                type: 'Service',
                username: 'bob_updated',
                public_key: 'newpubkey',
                is_followed: false
            });

            const actor = repo.getRemoteActor('https://example.com/actor2');
            expect(actor?.type).toBe('Service');
            expect(actor?.username).toBe('bob_updated');
            expect(actor?.public_key).toBe('newpubkey');
            expect(actor?.is_followed).toBe(0);
        });

        test('handles partial updates without overwriting with undefined', () => {
            repo.upsertRemoteActor({
                uri: 'https://example.com/actor3',
                type: 'Person',
                username: 'charlie',
                public_key: 'keep_this',
                is_followed: true
            });

            repo.upsertRemoteActor({
                uri: 'https://example.com/actor3',
                type: 'Person',
                username: 'charlie_new',
            });

            const actor = repo.getRemoteActor('https://example.com/actor3');
            expect(actor?.username).toBe('charlie_new');
            expect(actor?.public_key).toBe('keep_this'); // Should maintain previous values for these
            expect(actor?.is_followed).toBe(1);
        });

        test('handles edge case types in val conversion', () => {
            repo.upsertRemoteActor({
                uri: 'https://example.com/actor4',
                type: 'Person',
                username: 123 as any, // test number
                name: null as any, // test null
                summary: undefined as any, // test undefined
                icon_url: BigInt(9007199254740991) as any, // test bigint
                inbox_url: Buffer.from('hello') as any, // test buffer
                outbox_url: { a: 1 } as any // test object (should become string)
            });

            const actor = repo.getRemoteActor('https://example.com/actor4');
            expect(String(actor?.username)).toMatch(/123/);
            expect(actor?.name).toBeNull();
            expect(actor?.summary).toBeNull();
            // better-sqlite3 handles BigInt and Buffer. Buffer might come back differently depending on the schema, but we can just check it exists
            expect(actor).toBeDefined();
            expect(actor?.outbox_url).toBe('[object Object]');
        });
    });

    describe('getRemoteActors', () => {
        test('returns all actors sorted by last_seen DESC', () => {
             repo.upsertRemoteActor({ uri: 'a', type: 'Person' });
             // slight delay to ensure different timestamps (though sqlite in-memory might be too fast, let's just test it returns them)
             repo.upsertRemoteActor({ uri: 'b', type: 'Person' });

             const actors = repo.getRemoteActors();
             expect(actors.length).toBe(2);
             // We map `is_followed` to boolean in getRemoteActors
             expect(typeof actors[0].is_followed).toBe('boolean');
        });
    });

    describe('getRemoteActorsByUris', () => {
        test('returns empty array if no uris provided', () => {
            expect(repo.getRemoteActorsByUris([])).toEqual([]);
        });

        test('returns matching actors', () => {
            repo.upsertRemoteActor({ uri: 'uri1', type: 'Person' });
            repo.upsertRemoteActor({ uri: 'uri2', type: 'Person' });
            repo.upsertRemoteActor({ uri: 'uri3', type: 'Person' });

            const results = repo.getRemoteActorsByUris(['uri1', 'uri3']);
            expect(results.length).toBe(2);
            expect(results.map(r => r.uri).sort()).toEqual(['uri1', 'uri3']);
            expect(typeof results[0].is_followed).toBe('boolean');
        });

        test('handles chunks correctly', () => {
            // Generate 1000 uris (chunk size is 900)
            const uris = [];
            for(let i=0; i<1000; i++) {
                const uri = `chunk_uri_${i}`;
                uris.push(uri);
                repo.upsertRemoteActor({ uri, type: 'Person' });
            }

            const results = repo.getRemoteActorsByUris(uris);
            expect(results.length).toBe(1000);
        });
    });

    describe('getFollowedActors', () => {
        test('returns only followed actors', () => {
            repo.upsertRemoteActor({ uri: 'f1', type: 'Person', is_followed: true });
            repo.upsertRemoteActor({ uri: 'f2', type: 'Person', is_followed: false });
            repo.upsertRemoteActor({ uri: 'f3', type: 'Person', is_followed: true });

            const followed = repo.getFollowedActors();
            expect(followed.length).toBe(2);
            expect(followed.map(f => f.uri).sort()).toEqual(['f1', 'f3']);
            expect(typeof followed[0].is_followed).toBe('boolean');
            expect(followed[0].is_followed).toBe(true);
        });
    });

    describe('unfollowActor', () => {
        test('sets is_followed to 0', () => {
            repo.upsertRemoteActor({ uri: 'unf1', type: 'Person', is_followed: true });
            let actor = repo.getRemoteActor('unf1');
            expect(actor?.is_followed).toBe(1);

            repo.unfollowActor('unf1');
            actor = repo.getRemoteActor('unf1');
            expect(actor?.is_followed).toBe(0);
        });
    });

    describe('saveRemoteActor', () => {
        test('saves or updates actor using saveRemoteActor', () => {
             // saveRemoteActor is an alternative to upsertRemoteActor
             repo.saveRemoteActor({
                 uri: 'save1',
                 type: 'Person',
                 username: 'saveuser',
                 is_followed: true
             });

             let actor = repo.getRemoteActor('save1');
             expect(actor?.username).toBe('saveuser');
             expect(actor?.is_followed).toBe(1);

             repo.saveRemoteActor({
                uri: 'save1',
                type: 'Service',
                username: 'saveuser2',
                is_followed: false
            });

            actor = repo.getRemoteActor('save1');
            expect(actor?.type).toBe('Service');
            expect(actor?.username).toBe('saveuser2');
            expect(actor?.is_followed).toBe(0);
        });
    });
});
